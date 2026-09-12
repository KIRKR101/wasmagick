/**
 * Native ImageMagick runner for the Electron main process.
 *
 * The renderer builds the CLI argument list (see `src/lib/magick-args.ts`)
 * with `__INPUT__` / `__OUTPUT__` / `__CLUT__` / `__FONT__` placeholders and
 * sends it here over IPC together with the file bytes. This module writes
 * the bytes to temp files, substitutes the placeholders, and spawns the
 * fully-bundled `magick` binary (no shell, argv only).
 */

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TOKENS = {
	INPUT: '__INPUT__',
	OUTPUT: '__OUTPUT__',
	CLUT: '__CLUT__',
	FONT: '__FONT__'
};

const PROCESS_TIMEOUT_MS = 120000;
const MAX_STDERR_BYTES = 64 * 1024;

function platformSlug() {
	const plat =
		process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
	const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
	return `${plat}-${arch}`;
}

function binName() {
	return process.platform === 'win32' ? 'magick.exe' : 'magick';
}

/**
 * Candidate locations for the bundled binary, in priority order:
 *  1. Packaged app: <resources>/magick-bundle/...
 *  2. Dev/staged:   <repo>/native-bundle/magick/...
 *  3. Dev/download: <repo>/tooling/imagemagick/<slug>/... + legacy paths
 */
function candidateBinDirs() {
	const dirs = [];
	try {
		const { app } = require('electron');
		if (app && app.isPackaged) {
			dirs.push(path.join(process.resourcesPath, 'magick-bundle'));
		}
	} catch {
		// electron not ready / running under plain node (tests)
	}
	const repoRoot = path.join(__dirname, '..');
	dirs.push(path.join(repoRoot, 'native-bundle', 'magick'));
	dirs.push(path.join(repoRoot, 'tooling', 'imagemagick', platformSlug()));
	// Legacy setup-imagemagick.ts layouts (kept for back-compat).
	if (process.platform === 'win32') {
		dirs.push(path.join(repoRoot, 'tooling', 'imagemagick'));
	} else {
		dirs.push(path.join(repoRoot, 'tooling', 'imagemagick', 'squashfs-root', 'usr', 'bin'));
	}
	return dirs;
}

/** Possible binary + lib layouts inside a bundle dir. */
function probeBundle(binDir) {
	const bin = binName();
	const candidates = [
		path.join(binDir, bin),
		path.join(binDir, 'bin', bin),
		path.join(binDir, 'usr', 'bin', bin)
	];
	for (const candidate of candidates) {
		try {
			if (fs.statSync(candidate).isFile()) return candidate;
		} catch {
			// try next
		}
	}
	return null;
}

function resolveMagickBin() {
	for (const dir of candidateBinDirs()) {
		const found = probeBundle(dir);
		if (found) return found;
	}
	return null;
}

function isNativeAvailable() {
	return resolveMagickBin() !== null;
}

function webpToolName(tool) {
	if (tool !== 'cwebp' && tool !== 'dwebp') throw new Error(`Unknown WebP tool: ${tool}`);
	return process.platform === 'win32' ? `${tool}.exe` : tool;
}

/**
 * Resolve a bundled standalone WebP utility. The setup script keeps the
 * archive's other files beside the tools because Windows builds may need
 * accompanying DLLs at runtime.
 */
function resolveWebpTool(tool) {
	const name = webpToolName(tool);
	const slug = platformSlug();
	const dirs = [];
	try {
		const { app } = require('electron');
		if (app && app.isPackaged) {
			dirs.push(path.join(process.resourcesPath, 'magick-bundle', 'webp-tools'));
		}
	} catch {
		// electron not ready / running under plain node (tests)
	}
	const repoRoot = path.join(__dirname, '..');
	dirs.push(path.join(repoRoot, 'native-bundle', 'magick', 'webp-tools'));
	dirs.push(path.join(repoRoot, 'tooling', 'webp', slug));

	for (const dir of dirs) {
		const candidates = [path.join(dir, 'bin', name), path.join(dir, name)];
		for (const candidate of candidates) {
			try {
				if (fs.statSync(candidate).isFile()) return candidate;
			} catch {
				// try next location
			}
		}
	}
	return null;
}

/** Library search paths bundled next to the binary (Linux AppImage layout). */
function bundledLibDirs(magickBin) {
	const root = path.dirname(magickBin);
	const parents = [root, path.dirname(root), path.dirname(path.dirname(root))];
	const libNames = ['lib', path.join('usr', 'lib'), path.join('usr', 'lib', 'x86_64-linux-gnu')];
	const dirs = [];
	for (const parent of parents) {
		for (const lib of libNames) {
			const dir = path.join(parent, lib);
			try {
				if (fs.statSync(dir).isDirectory()) dirs.push(dir);
			} catch {
				// ignore
			}
		}
	}
	return dirs;
}

/** First existing dir among candidates, else null. */
function firstDir(candidates) {
	for (const dir of candidates) {
		try {
			if (fs.statSync(dir).isDirectory()) return dir;
		} catch {
			// ignore
		}
	}
	return null;
}

function spawnEnv(magickBin) {
	const env = { ...process.env };
	if (process.platform === 'linux') {
		const libDirs = bundledLibDirs(magickBin);
		if (libDirs.length > 0) {
			const prev = env.LD_LIBRARY_PATH ? `:${env.LD_LIBRARY_PATH}` : '';
			env.LD_LIBRARY_PATH = `${libDirs.join(':')}${prev}`;
		}
	}
	// Point ImageMagick at the bundled coder modules + XML configs when they
	// exist (macOS brew-assembled bundles; harmless otherwise).
	const root = path.dirname(magickBin);
	const parents = [root, path.dirname(root), path.dirname(path.dirname(root))];
	const flat = (sub) => parents.map((p) => path.join(p, sub));
	const coderDir = firstDir(flat(path.join('lib', 'ImageMagick', 'modules-Q16HDRI', 'coders')));
	const filterDir = firstDir(flat(path.join('lib', 'ImageMagick', 'modules-Q16HDRI', 'filters')));
	const configDir = firstDir([
		...flat(path.join('etc', 'ImageMagick-7')),
		...flat(path.join('lib', 'ImageMagick', 'config-Q16HDRI'))
	]);
	if (coderDir && !env.MAGICK_CODER_MODULE_PATH) env.MAGICK_CODER_MODULE_PATH = coderDir;
	if (filterDir && !env.MAGICK_FILTER_MODULE_PATH) env.MAGICK_FILTER_MODULE_PATH = filterDir;
	if (configDir && !env.MAGICK_CONFIGURE_PATH) env.MAGICK_CONFIGURE_PATH = configDir;
	return env;
}

function runBinary(bin, args, { timeout = PROCESS_TIMEOUT_MS } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(bin, args, { env: spawnEnv(bin), stdio: ['ignore', 'pipe', 'pipe'] });
		let stdout = Buffer.alloc(0);
		let stderr = Buffer.alloc(0);
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, timeout);

		child.stdout.on('data', (chunk) => {
			if (stdout.length < MAX_STDERR_BYTES) stdout = Buffer.concat([stdout, chunk]);
		});
		child.stderr.on('data', (chunk) => {
			if (stderr.length < MAX_STDERR_BYTES) stderr = Buffer.concat([stderr, chunk]);
		});
		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			if (timedOut) {
				reject(new Error(`ImageMagick timed out after ${timeout}ms`));
			} else if (code !== 0) {
				const detail = stderr.toString('utf-8').trim().slice(0, 2000);
				reject(new Error(`ImageMagick exited with code ${code}${detail ? `: ${detail}` : ''}`));
			} else {
				resolve({ stdout, stderr });
			}
		});
	});
}

function sanitizeExtension(ext) {
	const clean = String(ext || 'png')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
	return clean || 'png';
}

function inputExtensionFor(name) {
	const ext = path
		.extname(String(name || ''))
		.replace('.', '')
		.toLowerCase();
	return sanitizeExtension(ext || 'png');
}

async function identifyDimensions(magickBin, filePath) {
	try {
		const { stdout } = await runBinary(magickBin, ['identify', '-format', '%w %h', filePath]);
		const [w, h] = stdout.toString('utf-8').trim().split(/\s+/).map(Number);
		if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
			return { width: w, height: h };
		}
	} catch {
		// fall through to zeros
	}
	return { width: 0, height: 0 };
}

/**
 * Execute a native process request.
 * payload: {
 *   inputName: string, inputData: Uint8Array,
 *   args: string[], outputExtension: string, outputFormat: string,
 *   clutData?: Uint8Array | null, fontData?: Uint8Array | null,
 *   fontFileName?: string | null
 * }
 */
async function processNative(payload) {
	if (!payload || !(payload.inputData instanceof Uint8Array) || !Array.isArray(payload.args)) {
		throw new Error('Invalid native process request');
	}
	for (const arg of payload.args) {
		if (typeof arg !== 'string' || arg.length > 4096) {
			throw new Error('Invalid argument in native process request');
		}
	}

	const magickBin = resolveMagickBin();
	if (!magickBin) {
		throw new Error(
			'Native ImageMagick binary not found. Run: npm run setup:imagemagick && npm run stage:native'
		);
	}
	try {
		if (process.platform !== 'win32') fs.chmodSync(magickBin, 0o755);
	} catch {
		// best effort; spawn will surface real permission errors
	}

	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wasmagick-'));
	const inputPath = path.join(tmpDir, `input.${inputExtensionFor(payload.inputName)}`);
	const outputPath = path.join(tmpDir, `output.${sanitizeExtension(payload.outputExtension)}`);
	const clutPath = path.join(tmpDir, 'clut.png');
	const fontPath = path.join(
		tmpDir,
		path.basename(String(payload.fontFileName || 'font.ttf')).replace(/[^a-zA-Z0-9._-]/g, '_') ||
			'font.ttf'
	);

	try {
		await fs.promises.writeFile(inputPath, payload.inputData);
		if (payload.clutData instanceof Uint8Array) {
			await fs.promises.writeFile(clutPath, payload.clutData);
		}
		if (payload.fontData instanceof Uint8Array) {
			await fs.promises.writeFile(fontPath, payload.fontData);
		}

		const substituted = payload.args.map((arg) => {
			switch (arg) {
				case TOKENS.CLUT:
					return clutPath;
				case TOKENS.FONT:
					return fontPath;
				case TOKENS.INPUT:
					return inputPath;
				case TOKENS.OUTPUT:
					return outputPath;
				default:
					return arg;
			}
		});
		// The renderer builds the middle args (`magick-args.ts`); honor
		// explicit __INPUT__/__OUTPUT__ tokens if present, otherwise wrap.
		const hasInput = payload.args.includes(TOKENS.INPUT);
		const hasOutput = payload.args.includes(TOKENS.OUTPUT);
		const finalArgs = [
			...(hasInput ? [] : [inputPath]),
			...substituted,
			...(hasOutput ? [] : [outputPath])
		];

		await runBinary(magickBin, finalArgs);

		const data = new Uint8Array(await fs.promises.readFile(outputPath));
		const { width, height } = await identifyDimensions(magickBin, outputPath);
		return {
			data,
			width,
			height,
			format: String(payload.outputFormat || 'png')
		};
	} finally {
		await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
	}
}

function registerMagickNative(ipcMain) {
	ipcMain.handle('magick:native-available', () => isNativeAvailable());
	ipcMain.handle('magick:process-native', async (_event, payload) => processNative(payload));
}

module.exports = {
	TOKENS,
	resolveMagickBin,
	resolveWebpTool,
	isNativeAvailable,
	processNative,
	registerMagickNative
};
