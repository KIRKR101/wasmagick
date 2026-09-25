// @ts-nocheck

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
const MAX_PREVIEW_EDGE = 2048;
const MAX_INTERACTIVE_PREVIEW_EDGE = 8192;
const MAX_GPU_IMAGE_EDGE = 16384;
const MAX_GPU_IMAGE_PIXELS = 80_000_000;
const BROWSER_RENDERABLE_FORMATS = new Set([
	'AVIF',
	'BMP',
	'GIF',
	'JPEG',
	'JPG',
	'PNG',
	'SVG',
	'WEBP'
]);
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
let sharpModule = null;
/** Child processes currently running a native ImageMagick job. */
const activeChildren = new Set();
let nativeCancellationGeneration = 0;

/**
 * Best-effort cancellation for the in-flight native job. Kills every tracked
 * child with SIGKILL; the awaiting `runBinary` promise then rejects and the
 * renderer drops the run via its request-id guard.
 */
function cancelNativeProcess() {
	nativeCancellationGeneration++;
	for (const child of activeChildren) {
		try {
			child.kill('SIGKILL');
		} catch {
			// already exited; the close handler cleans up the set
		}
	}
}

function getSharp() {
	if (!sharpModule) sharpModule = require('sharp');
	return sharpModule;
}

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

/** Versions backing Settings → Build on Electron (magick CLI + sharp/libvips). */
function getNativeVersions() {
	let sharp = null;
	let vips = null;
	try {
		const versions = getSharp()?.versions;
		if (versions) {
			if (typeof versions.sharp === 'string') sharp = versions.sharp;
			if (typeof versions.vips === 'string') vips = versions.vips;
		}
	} catch {
		// sharp unavailable, leave nulls
	}
	return { magick: getNativeVersion(), sharp, vips };
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
	if (/--with-(?:lib)?raw=no/i.test(configure)) return false;
	const binDir = path.dirname(magickBin);
	const root = path.basename(binDir).toLowerCase() === 'bin' ? path.dirname(binDir) : binDir;
	const libDir = path.join(root, 'lib');
	const coderDir = path.join(libDir, 'ImageMagick', 'modules-Q16HDRI', 'coders');
	let hasLibraw;
	try {
		hasLibraw = fs
			.readdirSync(libDir)
			.some((name) => /^libraw(?:_r)?(?:[-.][\w-]+)*\.(?:dll|dylib|so(?:\.\d+)*)$/i.test(name));
	} catch {
		hasLibraw = false;
	}
	const rawModuleSuffix = process.platform === 'win32' ? '.dll' : '.so';
	if (
		!hasLibraw ||
		!['dng', 'raw'].every((name) => fs.existsSync(path.join(coderDir, `${name}${rawModuleSuffix}`)))
	) {
		return false;
	}
	if (
		!/--with-(?:lib)?raw=yes/i.test(configure) &&
		!/(^|\s)raw(\s|$)/im.test(configure) &&
		!/\(\d+\.\d+.*\)/.test(formats)
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
		activeChildren.add(child);
		const untrack = () => activeChildren.delete(child);
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
			untrack();
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			untrack();
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

/**
 * Resolve the file ImageMagick actually wrote. Multi-image sequences saved
 * to a single-image format land as numbered siblings (`output-0.jpg`, ...)
 * instead of `outputPath`; the first sibling holds frame 0. Falls back to
 * `outputPath` itself so callers still surface the original ENOENT.
 */
async function resolveOutputFile(outputPath) {
	try {
		await fs.promises.access(outputPath);
		return outputPath;
	} catch {
		// try the first numbered sibling below
	}
	const ext = path.extname(outputPath);
	const numbered = path.join(path.dirname(outputPath), `${path.basename(outputPath, ext)}-0${ext}`);
	try {
		await fs.promises.access(numbered);
		return numbered;
	} catch {
		return outputPath;
	}
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
		// First scene only: multi-image outputs print one `%w %h` per scene
		// with no separator, which naive parsing would merge into a bogus
		// geometry (e.g. `10 1010 10` for two 10x10 frames).
		const { stdout } = await runBinary(magickBin, [
			'identify',
			'-format',
			'%w %h',
			`${filePath}[0]`
		]);
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
			`${filePath}[0]`
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
async function processNativeVips(payload) {
	const canUseCache = Number.isFinite(payload.sourceRevision);
	const hasCachedSource =
		canUseCache && cachedSource && cachedSource.revision === payload.sourceRevision;
	const sourceData =
		payload.inputData instanceof Uint8Array
			? payload.inputData
			: hasCachedSource
				? cachedSource.data
				: undefined;
	if (!(sourceData instanceof Uint8Array)) {
		throw new Error('Native source image is unavailable');
	}
	if (!payload.plan || payload.plan.backend !== 'vips') {
		throw new Error('Invalid VIPS processing plan');
	}

	if (canUseCache && payload.inputData instanceof Uint8Array) {
		cachedSource = { revision: payload.sourceRevision, data: payload.inputData };
	}

	const sharp = getSharp();
	// sharp sustains animation for GIF/WebP outputs only; decoding a full
	// sequence into a static encoder stacks every frame vertically, so static
	// outputs decode a single representative frame instead. The last frame is
	// the still: disposal-optimized animations often start with a blank
	// transparent frame, so the first frame renders as an empty canvas.
	const vipsOutputFormat = String(
		payload.plan.output.format || payload.outputFormat || 'PNG'
	).toLowerCase();
	const vipsAnimatedOutput = vipsOutputFormat === 'gif' || vipsOutputFormat === 'webp';
	const inputOptions = { animated: vipsAnimatedOutput };
	if (!vipsAnimatedOutput) {
		try {
			const probe = await sharp(Buffer.from(sourceData)).metadata();
			if ((probe.pages ?? 1) > 1) inputOptions.page = probe.pages - 1;
		} catch {
			// fall through to the default (first) frame
		}
	}
	let pipeline = sharp(Buffer.from(sourceData), inputOptions);
	let width;
	let height;
	const gravityOffset = (space, gravity, axis) => {
		gravity ||= 'Center';
		if (gravity.includes(axis === 'x' ? 'East' : 'South')) return space;
		if (gravity === 'Center' || gravity === 'centre') return Math.floor(space / 2);
		if (gravity.includes(axis === 'x' ? 'West' : 'North')) return 0;
		return Math.floor(space / 2);
	};
	const updateDimensions = async (operation) => {
		if (width == null || height == null) {
			const metadata = await pipeline.metadata();
			width = metadata.width;
			height = metadata.height;
		}
		if (operation.type === 'resize') {
			const scale = Math.min(
				operation.width ? operation.width / width : Infinity,
				operation.height ? operation.height / height : Infinity
			);
			if (Number.isFinite(scale)) {
				width = Math.round(width * scale);
				height = Math.round(height * scale);
			}
		} else if (operation.type === 'autoOrient') {
			const metadata = await pipeline.metadata();
			width = metadata.autoOrient?.width ?? width;
			height = metadata.autoOrient?.height ?? height;
		} else if (operation.type === 'rotate' && Math.abs(operation.angle) === 90) {
			[width, height] = [height, width];
		}
	};
	for (const operation of payload.plan.operations || []) {
		await updateDimensions(operation);
		switch (operation.type) {
			case 'autoOrient':
				pipeline = pipeline.rotate();
				break;
			case 'resize':
				pipeline = pipeline.resize({
					width: operation.width ?? null,
					height: operation.height ?? null,
					fit: 'inside'
				});
				break;
			case 'crop':
				{
					const requestedWidth = Math.max(1, Math.min(operation.width ?? width, width));
					const requestedHeight = Math.max(1, Math.min(operation.height ?? height, height));
					const left =
						operation.left == null
							? gravityOffset(width - requestedWidth, operation.gravity, 'x')
							: operation.left;
					const top =
						operation.top == null
							? gravityOffset(height - requestedHeight, operation.gravity, 'y')
							: operation.top;
					const cropWidth = Math.max(1, Math.min(operation.width ?? width - left, width - left));
					const cropHeight = Math.max(1, Math.min(operation.height ?? height - top, height - top));
					if (left >= width || top >= height) break;
					pipeline = pipeline.extract({
						left,
						top,
						width: cropWidth,
						height: cropHeight
					});
					width = cropWidth;
					height = cropHeight;
				}
				break;
			case 'rotate':
				pipeline = pipeline.rotate(operation.angle);
				break;
			case 'flip':
				pipeline = pipeline.flip();
				break;
			case 'flop':
				pipeline = pipeline.flop();
				break;
			case 'modulate':
				pipeline = pipeline.modulate({
					brightness: operation.brightness,
					saturation: operation.saturation,
					hue: operation.hue
				});
				break;
			case 'contrast':
				{
					const factor = 1 + operation.value / 100;
					pipeline = pipeline.linear(factor, 128 * (1 - factor));
				}
				break;
			case 'normalize':
				pipeline = pipeline.normalise();
				break;
			case 'gamma':
				pipeline = pipeline.gamma(operation.value);
				break;
			case 'blur':
				pipeline = pipeline.blur(operation.sigma);
				break;
			case 'sharpen':
				pipeline = pipeline.sharpen({ sigma: operation.sigma });
				break;
			case 'grayscale':
				pipeline = pipeline.grayscale();
				break;
			case 'negate':
				pipeline = pipeline.negate({ alpha: false });
				break;
			case 'threshold':
				pipeline = pipeline.threshold(operation.value);
				break;
			case 'trim':
				pipeline = pipeline.trim();
				break;
			case 'border':
				pipeline = pipeline.extend({
					top: operation.size,
					bottom: operation.size,
					left: operation.size,
					right: operation.size,
					background: operation.color
				});
				break;
			default:
				throw new Error(`Unsupported VIPS operation: ${operation.type}`);
		}
	}
	const format = String(payload.plan.output.format || payload.outputFormat || 'PNG').toLowerCase();
	const quality = Math.max(1, Math.min(100, Number(payload.plan.output.quality) || 85));
	const outputOptions = { quality };
	let outputPipeline = pipeline.clone();
	if (format === 'jpeg') outputPipeline = outputPipeline.flatten({ background: '#ffffff' });
	if (!payload.plan.output.stripMeta) outputPipeline = outputPipeline.withMetadata();
	outputPipeline = outputPipeline.toFormat(format, outputOptions);

	const needsPreview = !BROWSER_RENDERABLE_FORMATS.has(
		String(payload.plan.output.format || payload.outputFormat || '').toUpperCase()
	);
	const pipelineInfo = await pipeline.metadata();
	const needsInteractivePreview =
		BROWSER_RENDERABLE_FORMATS.has(
			String(payload.plan.output.format || payload.outputFormat || '').toUpperCase()
		) &&
		(pipelineInfo.width > MAX_GPU_IMAGE_EDGE ||
			pipelineInfo.height > MAX_GPU_IMAGE_EDGE ||
			pipelineInfo.width * pipelineInfo.height > MAX_GPU_IMAGE_PIXELS);
	let previewPipeline = pipeline.clone();
	if (format === 'jpeg') previewPipeline = previewPipeline.flatten({ background: '#ffffff' });
	const [{ data, info }, previewResult] = await Promise.all([
		outputPipeline.toBuffer({ resolveWithObject: true }),
		needsInteractivePreview
			? previewPipeline
					.clone()
					.resize({
						width: MAX_INTERACTIVE_PREVIEW_EDGE,
						height: MAX_INTERACTIVE_PREVIEW_EDGE,
						fit: 'inside'
					})
					.toFormat('webp', { quality: 90 })
					.toBuffer()
					.then((/** @type {Buffer} */ data) => ({
						data,
						info: { width: 0, height: 0, channels: 0 }
					}))
			: needsPreview
				? pipeline
						.clone()
						.resize({ width: MAX_PREVIEW_EDGE, height: MAX_PREVIEW_EDGE, fit: 'inside' })
						.toColourspace('srgb')
						.ensureAlpha()
						.raw()
						.toBuffer({ resolveWithObject: true })
				: Promise.resolve({ data: Buffer.alloc(0), info: { width: 0, height: 0, channels: 4 } })
	]);
	const { data: rawPreview, info: previewInfo } = previewResult;
	const previewImageData = needsInteractivePreview ? new Uint8Array(rawPreview) : new Uint8Array();
	let previewData = needsInteractivePreview ? new Uint8Array() : new Uint8Array(rawPreview);
	if (!needsInteractivePreview && previewInfo.channels !== 4) {
		const rgba = new Uint8Array(previewInfo.width * previewInfo.height * 4);
		for (
			let source = 0, target = 0;
			target < rgba.length;
			source += previewInfo.channels, target += 4
		) {
			const gray = rawPreview[source] ?? 0;
			rgba[target] = rawPreview[source] ?? gray;
			rgba[target + 1] =
				previewInfo.channels === 1 || previewInfo.channels === 2
					? gray
					: (rawPreview[source + 1] ?? 0);
			rgba[target + 2] =
				previewInfo.channels === 1 || previewInfo.channels === 2
					? gray
					: (rawPreview[source + 2] ?? 0);
			rgba[target + 3] = previewInfo.channels === 2 ? (rawPreview[source + 1] ?? 255) : 255;
		}
		previewData = rgba;
	}
	// Animated outputs report the stacked strip height; the per-frame height
	// is what the UI and filenames should use.
	const frameHeight = info.pages > 1 && info.pageHeight > 0 ? info.pageHeight : info.height;
	return {
		data: new Uint8Array(data),
		previewData: needsPreview ? new Uint8Array(previewData) : new Uint8Array(),
		previewWidth: needsInteractivePreview ? 0 : previewInfo.width,
		previewHeight: needsInteractivePreview ? 0 : previewInfo.height,
		previewImageData,
		previewImageFormat: needsInteractivePreview ? 'WEBP' : undefined,
		width: info.width,
		height: frameHeight,
		format: String(payload.outputFormat || format).toUpperCase(),
		backend: 'vips'
	};
}

/** Execute the existing ImageMagick native process request. */
async function processNativeMagick(payload) {
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
	await fs.promises.writeFile(
		inputPath,
		payload.inputData instanceof Uint8Array ? payload.inputData : cachedSource.data
	);
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
		// Process the full image sequence so animations (GIF/WebP) and
		// multi-page/layer inputs (TIFF/PSD) survive. Single-image outputs of
		// a sequence land as numbered siblings; those resolve to the first
		// frame below. A no-op for single-image inputs.
		const inputSpecifier = inputPath;
		const substituted = payload.args.map((arg) => {
			switch (arg) {
				case TOKENS.CLUT:
					return clutPath;
				case TOKENS.FONT:
					return fontPath.replaceAll('\\', '/');
				case TOKENS.INPUT:
					return inputSpecifier;
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
			...(hasInput ? [] : [inputSpecifier]),
			...substituted,
			...(hasOutput ? [] : [outputSpecifier])
		];
		const needsPreview =
			payload.previewOnly ||
			!BROWSER_RENDERABLE_FORMATS.has(String(payload.outputFormat || '').toUpperCase());
		const previewMaxEdge = Math.max(1, Number(payload.previewMaxEdge) || MAX_PREVIEW_EDGE);

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
		if (isRawInputName(payload.inputName)) {
			const inputIndex = hasInput ? finalArgs.indexOf(inputSpecifier) : 0;
			finalArgs.splice(
				inputIndex + 1,
				0,
				'-bordercolor',
				'none',
				'-border',
				'1x1',
				'-trim',
				'+repage'
			);
		}
		let logicalDimensions = null;
		if (payload.previewOnly && !hasOutput) {
			const dimensionArgs = finalArgs.slice(0, -1);
			const resizeIndex = dimensionArgs.indexOf('-resize');
			if (resizeIndex >= 0) dimensionArgs.splice(resizeIndex, 2);
			const { stdout } = await runBinary(
				magickBin,
				[...dimensionArgs, '-format', '%w %h\\n', 'info:'],
				{ inputName: payload.inputName }
			);
			// One line per scene; the first line is the first frame.
			const [logicalWidth, logicalHeight] = stdout
				.toString('utf-8')
				.split('\n')[0]
				.trim()
				.split(/\s+/)
				.map(Number);
			if (logicalWidth > 0 && logicalHeight > 0) {
				logicalDimensions = { width: logicalWidth, height: logicalHeight };
			}
		}

		await runBinary(magickBin, finalArgs, { inputName: payload.inputName });

		// Formats without multi-image support (e.g. JPEG from an animated
		// GIF) write numbered siblings (`output-0.jpg`, ...); use the first
		// frame there, matching the WASM collection write.
		const resolvedOutput = await resolveOutputFile(outputPath);
		const data = new Uint8Array(await fs.promises.readFile(resolvedOutput));
		const { width, height } = await identifyDimensions(magickBin, resolvedOutput);
		let previewData = new Uint8Array();
		let previewWidth = 0;
		let previewHeight = 0;
		let previewImageData = new Uint8Array();
		if (needsPreview) {
			const scale = Math.min(1, previewMaxEdge / Math.max(width, height));
			previewWidth = Math.max(1, Math.round(width * scale));
			previewHeight = Math.max(1, Math.round(height * scale));
			await runBinary(
				magickBin,
				[
					resolvedOutput,
					'-resize',
					`${previewMaxEdge}x${previewMaxEdge}>`,
					'-depth',
					'8',
					`rgba:${previewPath}`
				],
				{ inputName: payload.inputName }
			);
			const rawPreviewData = new Uint8Array(await fs.promises.readFile(previewPath));
			const previewBytes = previewWidth * previewHeight * 4;
			if (rawPreviewData.length < previewBytes) {
				throw new Error('Native preview data is shorter than the reported preview dimensions');
			}
			previewData = rawPreviewData.slice(0, previewBytes);
		} else if (
			width > MAX_GPU_IMAGE_EDGE ||
			height > MAX_GPU_IMAGE_EDGE ||
			width * height > MAX_GPU_IMAGE_PIXELS
		) {
			const previewImagePath = path.join(tmpDir, 'preview.webp');
			await runBinary(
				magickBin,
				[
					resolvedOutput,
					'-resize',
					`${MAX_INTERACTIVE_PREVIEW_EDGE}x${MAX_INTERACTIVE_PREVIEW_EDGE}>`,
					'-quality',
					'90',
					`webp:${previewImagePath}`
				],
				{ inputName: payload.inputName }
			);
			previewImageData = new Uint8Array(await fs.promises.readFile(previewImagePath));
		}
		return {
			data,
			previewData,
			previewWidth,
			previewHeight,
			previewImageData,
			previewImageFormat: previewImageData.length ? 'WEBP' : undefined,
			width,
			height,
			logicalWidth: logicalDimensions?.width ?? width,
			logicalHeight: logicalDimensions?.height ?? height,
			format: String(payload.outputFormat || 'png'),
			backend: 'magick'
		};
	} finally {
		await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
	}
}

/** Source bytes for a payload, honoring the main-process source cache. */
function peekPayloadSource(payload) {
	const canUseCache = Number.isFinite(payload.sourceRevision);
	if (canUseCache && cachedSource && cachedSource.revision === payload.sourceRevision) {
		return cachedSource.data;
	}
	return payload.inputData instanceof Uint8Array ? payload.inputData : null;
}

/**
 * True when a VIPS-planned request carries a multi-frame input (animation,
 * multi-page TIFF, layered PSD) into a sequence output (GIF/WebP animation,
 * TIFF pages). sharp would apply geometry to the stacked page strip
 * (per-frame crop/rotate/flip land in the wrong places, blur bleeds across
 * frame boundaries) and reads the strip height for the oversize check, which
 * triggers a hugely upscaled second animated encode. The ImageMagick backend
 * processes each frame correctly, so those requests belong there; static
 * outputs keep the fast VIPS last-frame path.
 */
async function shouldRouteSequenceToMagick(payload) {
	const outputFormat = String(
		payload.plan?.output?.format || payload.outputFormat || ''
	).toLowerCase();
	const sequenceOutputs = new Set(['gif', 'webp', 'tiff', 'tif', 'tiff64', 'ptif']);
	if (!sequenceOutputs.has(outputFormat)) return false;
	const sourceData = peekPayloadSource(payload);
	if (!sourceData) return false;
	try {
		const metadata = await getSharp()(Buffer.from(sourceData)).metadata();
		return (metadata.pages ?? 1) > 1;
	} catch {
		return false;
	}
}

async function processNative(payload) {
	const cancellationGeneration = nativeCancellationGeneration;
	const isCancelled = () => cancellationGeneration !== nativeCancellationGeneration;
	if (!payload || !Array.isArray(payload.args)) {
		throw new Error('Invalid native process request');
	}
	if (payload.plan?.backend === 'vips') {
		try {
			const routeToMagick = await shouldRouteSequenceToMagick(payload);
			if (isCancelled()) throw new Error('Native image processing cancelled');
			if (routeToMagick) {
				return await processNativeMagick(payload);
			}
			const result = await processNativeVips(payload);
			if (isCancelled()) throw new Error('Native image processing cancelled');
			return result;
		} catch (error) {
			// Cancellation kills the active child, which rejects its promise.
			// Do not interpret that rejection as a VIPS failure and launch a
			// second ImageMagick job after the user has canceled.
			if (isCancelled()) throw error;
			console.warn('Native VIPS processing failed; falling back to ImageMagick:', error);
			return processNativeMagick(payload);
		}
	}
	return processNativeMagick(payload);
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
		const baseArgs = [
			'-font',
			fontPath.replaceAll('\\', '/'),
			'-pointsize',
			String(payload.fontSize),
			'-fill',
			'white'
		];
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
	ipcMain.handle('magick:native-versions', () => getNativeVersions());
	ipcMain.handle('magick:native-raw-available', () => isNativeRawAvailable());
	ipcMain.handle('magick:native-formats', () => listNativeFormats());
	ipcMain.handle('magick:process-native', async (_event, payload) => processNative(payload));
	ipcMain.handle('magick:cancel-native', () => cancelNativeProcess());
	ipcMain.handle('magick:font-metrics', async (_event, payload) => getNativeFontMetrics(payload));
}

module.exports = {
	TOKENS,
	resolveMagickBin,
	resolveWebpTool,
	isNativeAvailable,
	getNativeVersion,
	getNativeVersions,
	isNativeRawAvailable,
	parseNativeFormatList,
	listNativeFormats,
	outputSpecifierFor,
	resolveOutputFile,
	processNative,
	getNativeFontMetrics,
	registerMagickNative,
	formatNativeError,
	cancelNativeProcess
};
