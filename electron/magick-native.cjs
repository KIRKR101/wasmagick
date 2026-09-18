/**
 * Native ImageMagick runner for the Electron main process.
 *
 * The renderer builds the CLI argument list (see `src/lib/magick-args.ts`)
 * with `__INPUT__` / `__OUTPUT__` / `__CLUT__` / `__FONT__` placeholders and
 * sends it here over IPC together with the file bytes. This module writes
 * the bytes to temp files, substitutes the placeholders, and spawns the
 * fully-bundled `magick` binary (no shell, argv only).
 */

const { spawn, spawnSync } = require('node:child_process');
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
const EXIF_ORIENTATION_NAMES = {
	1: 'TopLeft',
	2: 'TopRight',
	3: 'BottomRight',
	4: 'BottomLeft',
	5: 'LeftTop',
	6: 'RightTop',
	7: 'RightBottom',
	8: 'LeftBottom'
};

const RAW_EXTENSIONS = new Set([
	'3fr',
	'arw',
	'cr2',
	'cr3',
	'crw',
	'dcr',
	'dng',
	'erf',
	'fff',
	'iiq',
	'k25',
	'kdc',
	'mef',
	'mos',
	'mrw',
	'nef',
	'nrw',
	'orf',
	'pef',
	'raf',
	'raw',
	'rmf',
	'rw2',
	'rwl',
	'sr2',
	'srf',
	'srw',
	'x3f'
]);

let cachedSource = null;

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

function getNativeVersion() {
	const magickBin = resolveMagickBin();
	if (!magickBin) return null;
	const result = spawnSync(magickBin, ['-version'], {
		cwd: path.dirname(magickBin),
		env: spawnEnv(magickBin),
		encoding: 'utf8',
		timeout: 5000
	});
	if (result.error || result.status !== 0) return null;
	return String(result.stdout || '').match(/^Version:\s*ImageMagick\s+([^\s]+)/m)?.[1] ?? null;
}

/** Parse the writable rows from `magick -list format`. */
function parseNativeFormatList(output) {
	const formats = [];
	for (const line of String(output || '').split('\n')) {
		const parts = line.trim().split(/\s+/);
		if (parts.length < 3) continue;
		const format = parts[0].replace(/[*!+]+$/, '').toUpperCase();
		const permissionIndex = parts.findIndex(
			(part, index) => index > 0 && /^[rw-][rw-][+!-]$/.test(part)
		);
		const moduleFormat = (permissionIndex === 2 ? parts[1] : format)
			.replace(/[*!+]+$/, '')
			.toUpperCase();
		const permissions = permissionIndex >= 0 ? parts[permissionIndex] : '';
		const description = parts.slice(permissionIndex + 1).join(' ');
		if (
			!format ||
			!/^[A-Z0-9][A-Z0-9_-]*$/.test(format) ||
			permissionIndex < 1 ||
			permissionIndex > 2 ||
			!description
		) {
			continue;
		}
		if (permissions[1] !== 'w') continue;
		formats.push({
			format,
			moduleFormat,
			supportsWriting: true,
			description
		});
	}
	return formats;
}

async function listNativeFormats() {
	const magickBin = resolveMagickBin();
	if (!magickBin) return [];
	const { stdout } = await runBinary(magickBin, ['-list', 'format']);
	const formats = parseNativeFormatList(stdout.toString('utf8'));
	// The bundled desktop build intentionally provides WebP through the
	// standalone cwebp delegate. Some ImageMagick builds omit WEBP from their
	// format table even though this export path is available.
	if (!formats.some(({ format }) => format === 'WEBP') && resolveWebpTool('cwebp')) {
		formats.push({
			format: 'WEBP',
			moduleFormat: 'WEBP',
			supportsWriting: true,
			mimeType: 'image/webp',
			description: 'WebP image'
		});
	}
	return formats;
}

/**
 * Return true only for a self-contained LibRaw build. The official Linux
 * AppImage and Windows portable archives list RAW formats but route them to
 * darktable-cli, so checking format names alone would report a false positive.
 */
function isNativeRawAvailable() {
	const magickBin = resolveMagickBin();
	if (!magickBin) return false;
	const env = spawnEnv(magickBin);
	const run = (args) => {
		const result = spawnSync(magickBin, args, {
			cwd: path.dirname(magickBin),
			env,
			encoding: 'utf8',
			maxBuffer: 1024 * 1024,
			timeout: 15000
		});
		return result.error || result.status !== 0
			? null
			: `${result.stdout || ''}\n${result.stderr || ''}`;
	};
	const configure = run(['-list', 'configure']);
	const formats = run(['-list', 'format']);
	if (!configure || !formats) return false;
	if (!/--with-(?:lib)?raw=yes/i.test(configure)) return false;
	if (!/(^|\s)raw(\s|$)/im.test(configure)) return false;
	const binDir = path.dirname(magickBin);
	const root = path.basename(binDir).toLowerCase() === 'bin' ? path.dirname(binDir) : binDir;
	const libDir = path.join(root, 'lib');
	const coderDir = path.join(libDir, 'ImageMagick', 'modules-Q16HDRI', 'coders');
	let hasLibraw;
	try {
		hasLibraw = fs.readdirSync(libDir).some((name) => /^libraw(?:_r)?[.]/i.test(name));
	} catch {
		hasLibraw = false;
	}
	if (
		!hasLibraw ||
		!['dng.so', 'raw.so'].every((name) => fs.existsSync(path.join(coderDir, name)))
	) {
		return false;
	}
	return ['CR2', 'CR3', 'NEF', 'ARW', 'DNG', 'RW2', 'ORF', 'RAF'].every((format) =>
		new RegExp(`^\\s*${format}[*!+]?\\s+.*\\br--(?:\\s|$)`, 'im').test(formats)
	);
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
	const bundleRoot = path.basename(root).toLowerCase() === 'bin' ? path.dirname(root) : root;
	if (!env.MAGICK_HOME) env.MAGICK_HOME = bundleRoot;
	const bundleLibDir = path.join(bundleRoot, 'lib');
	if (process.platform === 'darwin' && fs.existsSync(bundleLibDir)) {
		// Homebrew's ImageMagick modules and the copied binary can otherwise
		// load two libomp instances through different dependency paths.
		env.KMP_DUPLICATE_LIB_OK = 'TRUE';
		env.DYLD_LIBRARY_PATH = [bundleLibDir, env.DYLD_LIBRARY_PATH]
			.filter(Boolean)
			.join(path.delimiter);
	}
	const bundledWebpTool = resolveWebpTool('cwebp');
	if (bundledWebpTool) {
		const webpBinDir = path.dirname(bundledWebpTool);
		const pathEntries = String(env.PATH || '')
			.split(path.delimiter)
			.filter(Boolean);
		if (!pathEntries.includes(webpBinDir)) {
			env.PATH = [webpBinDir, ...pathEntries].join(path.delimiter);
		}
	}
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

function isRawInputName(inputName) {
	const extension = path
		.extname(String(inputName || ''))
		.slice(1)
		.toLowerCase();
	return RAW_EXTENSIONS.has(extension);
}

/**
 * Convert the known missing-RAW delegate failure into an actionable message.
 * Keep every other ImageMagick diagnostic byte-for-byte compatible with the
 * previous error so callers still get the original detail for unrelated
 * failures.
 */
function formatNativeError(code, detail, inputName) {
	const normalized = String(detail || '');
	if (
		isRawInputName(inputName) &&
		/darktable-cli/i.test(normalized) &&
		/(command not found|not found|enoent|no such file)/i.test(normalized)
	) {
		const extension = path.extname(String(inputName || '')).toLowerCase() || 'RAW';
		return (
			`RAW input (${extension}) could not be decoded because the bundled ImageMagick ` +
			`build has no libraw support. Reinstall the latest WASMagick desktop build ` +
			`or use the web app, which includes a RAW-capable fallback.`
		);
	}
	return `ImageMagick exited with code ${code}${normalized ? `: ${normalized}` : ''}`;
}

function runBinary(bin, args, { timeout = PROCESS_TIMEOUT_MS, inputName } = {}) {
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
				reject(new Error(formatNativeError(code, detail, inputName)));
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

function outputSpecifierFor(format, outputPath) {
	const cleanFormat = String(format || 'PNG')
		.toUpperCase()
		.replace(/[^A-Z0-9_-]/g, '');
	return `${cleanFormat || 'PNG'}:${outputPath}`;
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

async function identifyOrientation(magickBin, filePath) {
	try {
		const { stdout } = await runBinary(magickBin, [
			'identify',
			'-format',
			'%[orientation]',
			filePath
		]);
		return stdout.toString('utf-8').trim();
	} catch {
		return null;
	}
}

/**
 * Execute a native process request.
 * payload: {
 *   inputName: string, inputData: Uint8Array,
 *   orientation?: number | null,
 *   args: string[], outputExtension: string, outputFormat: string,
 *   clutData?: Uint8Array | null, fontData?: Uint8Array | null,
 *   fontFileName?: string | null
 * }
 */
async function processNative(payload) {
	if (!payload || !Array.isArray(payload.args)) {
		throw new Error('Invalid native process request');
	}
	const canUseCache = Number.isFinite(payload.sourceRevision);
	const hasCachedSource =
		canUseCache && cachedSource && cachedSource.revision === payload.sourceRevision;
	if (!(payload.inputData instanceof Uint8Array) && !hasCachedSource) {
		throw new Error('Native source image is unavailable');
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
	await fs.promises.writeFile(inputPath, hasCachedSource ? cachedSource.data : payload.inputData);
	if (canUseCache && payload.inputData instanceof Uint8Array) {
		cachedSource = { revision: payload.sourceRevision, data: payload.inputData };
	}
	const outputPath = path.join(tmpDir, `output.${sanitizeExtension(payload.outputExtension)}`);
	const previewPath = path.join(tmpDir, 'preview.rgba');
	const clutPath = path.join(tmpDir, 'clut.png');
	const fontPath = path.join(
		tmpDir,
		path.basename(String(payload.fontFileName || 'font.ttf')).replace(/[^a-zA-Z0-9._-]/g, '_') ||
			'font.ttf'
	);

	try {
		if (payload.clutData instanceof Uint8Array) {
			await fs.promises.writeFile(clutPath, payload.clutData);
		}
		if (payload.fontData instanceof Uint8Array) {
			await fs.promises.writeFile(fontPath, payload.fontData);
		}

		const outputSpecifier = outputSpecifierFor(payload.outputFormat, outputPath);
		const substituted = payload.args.map((arg) => {
			switch (arg) {
				case TOKENS.CLUT:
					return clutPath;
				case TOKENS.FONT:
					return fontPath;
				case TOKENS.INPUT:
					return inputPath;
				case TOKENS.OUTPUT:
					return outputSpecifier;
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
			...(hasOutput ? [] : [outputSpecifier])
		];
		const outputIndex = finalArgs.lastIndexOf(outputSpecifier);
		finalArgs.splice(outputIndex, 0, '-write', `rgba:${previewPath}`);

		// Some coders leave the source EXIF orientation unavailable to
		// ImageMagick even though the renderer's metadata parser found it.
		// Preserve native -auto-orient by default, and seed the missing value
		// only when this exact input probes as Undefined. This avoids applying
		// an explicit transform twice to formats already normalized by native
		// decoding.
		const orientation = Number(payload.orientation);
		if (
			Number.isInteger(orientation) &&
			orientation >= 2 &&
			orientation <= 8 &&
			finalArgs.includes('-auto-orient')
		) {
			const nativeOrientation = await identifyOrientation(magickBin, inputPath);
			const orientationName = EXIF_ORIENTATION_NAMES[orientation];
			if (orientationName && (!nativeOrientation || /^undefined$/i.test(nativeOrientation))) {
				const autoOrientIndex = finalArgs.indexOf('-auto-orient');
				finalArgs.splice(autoOrientIndex, 1, '-orient', orientationName, '-auto-orient');
			}
		}

		await runBinary(magickBin, finalArgs, { inputName: payload.inputName });

		const data = new Uint8Array(await fs.promises.readFile(outputPath));
		const { width, height } = await identifyDimensions(magickBin, outputPath);
		const rawPreviewData = new Uint8Array(await fs.promises.readFile(previewPath));
		const firstFrameBytes = width * height * 4;
		if (rawPreviewData.length < firstFrameBytes) {
			throw new Error('Native preview data is shorter than the reported image dimensions');
		}
		// The renderer currently displays one bitmap. Keep the first frame when
		// ImageMagick writes a multi-frame image to the raw RGBA stream.
		const previewData = rawPreviewData.slice(0, firstFrameBytes);
		return {
			data,
			previewData,
			previewWidth: width,
			previewHeight: height,
			width,
			height,
			format: String(payload.outputFormat || 'png')
		};
	} finally {
		await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
	}
}

function parseMetricGeometry(output) {
	const match = String(output)
		.trim()
		.match(/^(\d+)\s+(\d+)\s+([+-]?\d+)\s+([+-]?\d+)$/);
	if (!match) throw new Error(`Could not parse ImageMagick text bounds: ${String(output).trim()}`);
	return {
		width: Number(match[1]),
		height: Number(match[2]),
		x: Number(match[3]),
		y: Number(match[4])
	};
}

/**
 * Query the same ImageMagick font metrics used by -annotate. The renderer
 * needs both the logical advance box and the visible ink box: gravity aligns
 * the former, while the marker represents the latter.
 */
async function getNativeFontMetrics(payload) {
	if (
		!payload ||
		typeof payload.text !== 'string' ||
		!payload.text ||
		!Number.isFinite(payload.fontSize) ||
		payload.fontSize <= 0 ||
		!(payload.fontData instanceof Uint8Array)
	) {
		throw new Error('Invalid native font metrics request');
	}

	const magickBin = resolveMagickBin();
	if (!magickBin) throw new Error('Native ImageMagick binary not found');
	const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'wasmagick-metrics-'));
	const fontPath = path.join(
		tmpDir,
		path.basename(String(payload.fontFileName || 'font.ttf')).replace(/[^a-zA-Z0-9._-]/g, '_') ||
			'font.ttf'
	);

	try {
		await fs.promises.writeFile(fontPath, payload.fontData);
		const baseArgs = ['-font', fontPath, '-pointsize', String(payload.fontSize), '-fill', 'white'];
		const metricRun = await runBinary(magickBin, [
			'-size',
			'1x1',
			'xc:none',
			...baseArgs,
			'-debug',
			'annotate',
			'-annotate',
			'0',
			payload.text,
			'null:'
		]);
		const metricMatch = metricRun.stderr
			.toString('utf-8')
			.match(/Metrics:[\s\S]*?width:\s*([+-]?\d+(?:\.\d+)?); height:\s*([+-]?\d+(?:\.\d+)?);/);
		if (!metricMatch) throw new Error('Could not parse ImageMagick font metrics');
		const advanceWidth = Number(metricMatch[1]);
		const layoutHeight = Number(metricMatch[2]);

		const render = async (gravity, annotateArgs) => {
			const result = await runBinary(magickBin, [
				'-size',
				'1500x1200',
				'xc:none',
				...baseArgs,
				'-gravity',
				gravity,
				'-annotate',
				...annotateArgs,
				'-trim',
				'-format',
				'%w %h %X %Y',
				'info:'
			]);
			return parseMetricGeometry(result.stdout.toString('utf-8'));
		};

		const northwest = await render('Northwest', ['+100+100', payload.text]);
		const center = await render('Center', ['0', payload.text]);
		const centerAnchorY = 1200 / 2;
		return {
			advanceWidth,
			layoutHeight,
			inkWidth: northwest.width,
			inkHeight: northwest.height,
			inkOffsetX: northwest.x - 100,
			inkOffsetYNorth: northwest.y - 100,
			inkOffsetYCenter: center.y - (centerAnchorY - layoutHeight / 2),
			inkOffsetYSouth: center.y - (centerAnchorY - layoutHeight / 2)
		};
	} finally {
		await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
	}
}

function registerMagickNative(ipcMain) {
	ipcMain.handle('magick:native-available', () => isNativeAvailable());
	ipcMain.handle('magick:native-version', () => getNativeVersion());
	ipcMain.handle('magick:native-raw-available', () => isNativeRawAvailable());
	ipcMain.handle('magick:native-formats', () => listNativeFormats());
	ipcMain.handle('magick:process-native', async (_event, payload) => processNative(payload));
	ipcMain.handle('magick:font-metrics', async (_event, payload) => getNativeFontMetrics(payload));
}

module.exports = {
	TOKENS,
	resolveMagickBin,
	resolveWebpTool,
	isNativeAvailable,
	getNativeVersion,
	isNativeRawAvailable,
	parseNativeFormatList,
	listNativeFormats,
	outputSpecifierFor,
	processNative,
	getNativeFontMetrics,
	registerMagickNative,
	formatNativeError
};
