/**
 * Download (or assemble) native ImageMagick builds for bundling into Electron.
 *
 * Canonical store: `tooling/imagemagick/<os>-<arch>/`
 *   - linux-x64 : official AppImage, extracted
 *   - win-x64   : official portable 7z, extracted
 *   - mac-arm64 / mac-x64 : official archive tarball, or a relocatable copy
 *     assembled from the Homebrew prefix via install_name_tool
 *
 * Usage:
 *   npx tsx tooling/setup-imagemagick.ts                  # current platform
 *   npx tsx tooling/setup-imagemagick.ts --all            # all four slugs
 *   npx tsx tooling/setup-imagemagick.ts --os mac --arch arm64
 *
 * The parity-test resolver (`tooling/magick-path.ts`) also understands the
 * legacy layouts (`squashfs-root/`, root-level `magick.exe`), so existing
 * checkouts keep working.
 */

import {
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
	copyFileSync,
	chmodSync,
	readdirSync,
	readFileSync,
	cpSync,
	statSync
} from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { join, dirname, basename, delimiter } from 'node:path';
import { tmpdir } from 'node:os';
import { describeRawCapability, isRawCapable } from './raw-support.js';

const IM_VERSION = '7.1.2-30';
const TOOL_DIR = join(import.meta.dirname, 'imagemagick');
const WEBP_VERSION = '1.6.0';
const WEBP_DIR = join(import.meta.dirname, 'webp');

const LINUX_APPIMAGE = `ImageMagick-${IM_VERSION}-gcc-x86_64.AppImage`;
const LINUX_URL = `https://github.com/ImageMagick/ImageMagick/releases/download/${IM_VERSION}/${LINUX_APPIMAGE}`;

const WIN_ARCHIVE = `ImageMagick-${IM_VERSION}-portable-Q16-x64.7z`;
const WIN_URL = `https://github.com/ImageMagick/ImageMagick/releases/download/${IM_VERSION}/${WIN_ARCHIVE}`;

const WEBP_URLS: Record<Slug, string> = {
	'linux-x64': `https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-${WEBP_VERSION}-linux-x86-64.tar.gz`,
	'win-x64': `https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-${WEBP_VERSION}-windows-x64.zip`,
	'mac-arm64': `https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-${WEBP_VERSION}-mac-arm64.tar.gz`,
	'mac-x64': `https://storage.googleapis.com/downloads.webmproject.org/releases/webp/libwebp-${WEBP_VERSION}-mac-x86-64.tar.gz`
};

// Official macOS archive tarballs (relocatable, @executable_path-linked).
const MAC_TARBALL_CANDIDATES: Record<string, string[]> = {
	x64: [
		`https://imagemagick.org/archive/binaries/ImageMagick-${IM_VERSION}-x86_64-apple-darwin20.1.0.tar.gz`,
		`https://imagemagick.org/archive/binaries/ImageMagick-x86_64-apple-darwin20.1.0.tar.gz`
	],
	arm64: [
		`https://imagemagick.org/archive/binaries/ImageMagick-${IM_VERSION}-arm64-apple-darwin20.1.0.tar.gz`,
		`https://imagemagick.org/archive/binaries/ImageMagick-arm64-apple-darwin20.1.0.tar.gz`
	]
};

const FONT_URL =
	'https://raw.githubusercontent.com/openmaptiles/fonts/master/roboto/Roboto-Regular.ttf';

type Slug = 'linux-x64' | 'win-x64' | 'mac-arm64' | 'mac-x64';

function slugFor(os: string, arch: string): Slug {
	if (os === 'win32') return 'win-x64';
	if (os === 'darwin') return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
	return 'linux-x64';
}

function slugBin(slug: Slug): string {
	const root = join(TOOL_DIR, slug);
	if (slug === 'win-x64') return join(root, 'magick.exe');
	return join(root, 'bin', 'magick');
}

/**
 * Verify the host build has the WebP ImageMagick coder available.
 *
 * The desktop app invokes `magick`, not the standalone libwebp tools
 * (`cwebp`/`dwebp`). ImageMagick needs its WebP coder module and libwebp
 * libraries in the bundle, so a real 1x1 encode catches an incomplete bundle
 * before electron-builder produces an installer.
 */
function verifyWebpSupport(slug: Slug): void {
	const slugDir = join(TOOL_DIR, slug);
	const bin = slugBin(slug);
	const env = { ...process.env };
	const libDir = join(slugDir, 'lib');
	const coderDir = join(slugDir, 'lib', 'ImageMagick', 'modules-Q16HDRI', 'coders');
	const filterDir = join(slugDir, 'lib', 'ImageMagick', 'modules-Q16HDRI', 'filters');
	const configDirs = [
		join(slugDir, 'etc', 'ImageMagick-7'),
		join(slugDir, 'lib', 'ImageMagick', 'config-Q16HDRI')
	];

	if (existsSync(libDir)) {
		const libraryKey = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
		env[libraryKey] = [libDir, env[libraryKey]].filter(Boolean).join(delimiter);
	}
	if (existsSync(coderDir)) env.MAGICK_CODER_MODULE_PATH = coderDir;
	if (existsSync(filterDir)) env.MAGICK_FILTER_MODULE_PATH = filterDir;
	env.MAGICK_CONFIGURE_PATH = configDirs.filter(existsSync).join(delimiter);
	if (slug === 'win-x64') env.MAGICK_HOME = slugDir;

	const result = spawnSync(bin, ['-list', 'format'], {
		cwd: slugDir,
		env,
		encoding: 'utf8'
	});
	const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
	const probe = join(tmpdir(), `wasmagick-webp-${slug}-${process.pid}.webp`);
	const probeResult = spawnSync(bin, ['-size', '1x1', 'xc:white', '-quality', '80', probe], {
		cwd: slugDir,
		env,
		encoding: 'utf8'
	});
	const probeOkay = !probeResult.error && probeResult.status === 0 && existsSync(probe);
	rmSync(probe, { force: true });
	if (result.error || result.status !== 0 || !probeOkay) {
		const detail =
			result.error?.message || probeResult.error?.message || output.trim().slice(-1200);
		throw new Error(
			`ImageMagick WebP support is unavailable for ${slug}.${detail ? ` ${detail}` : ''}`
		);
	}
	console.log(`Verified ImageMagick WebP support for ${slug}.`);
}

/**
 * Keep the relocatable bundle's restrictive coder policy in sync with the
 * formats the app exposes as native exports. Homebrew's default policy can
 * omit TIFF even when libtiff and the TIFF coder module are bundled.
 */
function allowTiffCoder(slug: Slug): void {
	const slugDir = join(TOOL_DIR, slug);
	const configurePath = join(slugDir, 'lib', 'ImageMagick', 'config-Q16HDRI', 'configure.xml');
	if (existsSync(configurePath)) {
		const configure = readFileSync(configurePath, 'utf8');
		const portable = configure.replace(
			/^\s*<configure\s+name=["'](?:CODER_PATH|FILTER_PATH|CONFIGURE_PATH)["'][^>]*\/>\s*$/gim,
			''
		);
		if (portable !== configure) writeFileSync(configurePath, portable);
	}
	const policyPath = join(slugDir, 'etc', 'ImageMagick-7', 'policy.xml');
	if (!existsSync(policyPath)) return;
	const policy = readFileSync(policyPath, 'utf8');
	const updated = policy.replace(
		/(<policy\s+domain=["']coder["']\s+rights=["']read\|write["']\s+pattern=["']\{)GIF,JPEG,PNG,WEBP(\}["']\s*\/>)/i,
		'$1GIF,JPEG,PNG,TIFF,WEBP$2'
	);
	const withTiffModule = updated.includes('domain="module" rights="read" pattern="TIFF"')
		? updated
		: updated.replace(
				/(<policy\s+domain=["']coder["']\s+rights=["']read\|write["']\s+pattern=["']\{GIF,JPEG,PNG,TIFF,WEBP\}["']\s*\/>)/i,
				'$1\n  <policy domain="module" rights="read" pattern="TIFF" />'
			);
	if (withTiffModule !== policy) {
		writeFileSync(policyPath, withTiffModule);
		console.log(`Enabled TIFF coder in native security policy for ${slug}.`);
	}
}

function removeExternalRawDelegate(slug: Slug): void {
	const slugDir = join(TOOL_DIR, slug);
	const libDir = join(slugDir, 'lib');
	const coderDir = join(libDir, 'ImageMagick', 'modules-Q16HDRI', 'coders');
	const hasLibraw =
		existsSync(libDir) &&
		readdirSync(libDir).some((name) =>
			/^libraw(?:_r)?(?:[-.][\w-]+)*\.(?:dll|dylib|so(?:\.\d+)*)$/i.test(name)
		);
	const hasRawCoders = ['dng', 'raw'].every((name) =>
		['.so', '.dll'].some((suffix) => existsSync(join(coderDir, `${name}${suffix}`)))
	);
	if (!hasLibraw || !hasRawCoders) return;
	const delegatesPath = join(slugDir, 'etc', 'ImageMagick-7', 'delegates.xml');
	if (!existsSync(delegatesPath)) return;
	const delegates = readFileSync(delegatesPath, 'utf8');
	const sanitized = delegates.replace(
		/\s*<delegate\b(?=[^>]*\bdecode=["']dng:decode["'])[^>]*darktable-cli[^>]*\/>\s*/gi,
		'\n'
	);
	if (sanitized !== delegates) writeFileSync(delegatesPath, sanitized);
}

/** Verify that TIFF is not merely listed: encode a real TIFF and check its signature. */
function verifyTiffSupport(slug: Slug): void {
	const slugDir = join(TOOL_DIR, slug);
	const bin = slugBin(slug);
	const env = { ...process.env };
	const libDir = join(slugDir, 'lib');
	const coderDir = join(slugDir, 'lib', 'ImageMagick', 'modules-Q16HDRI', 'coders');
	const filterDir = join(slugDir, 'lib', 'ImageMagick', 'modules-Q16HDRI', 'filters');
	const configDirs = [
		join(slugDir, 'etc', 'ImageMagick-7'),
		join(slugDir, 'lib', 'ImageMagick', 'config-Q16HDRI')
	];

	if (existsSync(libDir)) {
		const libraryKey = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
		env[libraryKey] = [libDir, env[libraryKey]].filter(Boolean).join(delimiter);
	}
	if (existsSync(coderDir)) env.MAGICK_CODER_MODULE_PATH = coderDir;
	if (existsSync(filterDir)) env.MAGICK_FILTER_MODULE_PATH = filterDir;
	env.MAGICK_CONFIGURE_PATH = configDirs.filter(existsSync).join(delimiter);
	if (slug === 'win-x64') env.MAGICK_HOME = slugDir;

	const fixture = join(import.meta.dirname, '..', 'static', 'icons', 'icon-512.png');
	const input = existsSync(fixture) ? fixture : null;
	const probe = join(tmpdir(), `wasmagick-tiff-${slug}-${process.pid}.tiff`);
	try {
		const args = input ? [input, probe] : ['-size', '2x2', 'xc:white', probe];
		const result = spawnSync(bin, args, {
			cwd: slugDir,
			env,
			encoding: 'utf8'
		});
		const bytes = existsSync(probe) ? readFileSync(probe) : Buffer.alloc(0);
		const hasTiffSignature =
			(bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00]))) ||
			(bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a])));
		if (result.error || result.status !== 0 || !hasTiffSignature) {
			const detail = result.error?.message || result.stderr?.trim() || 'invalid TIFF signature';
			throw new Error(`ImageMagick TIFF support is unavailable for ${slug}: ${detail}`);
		}
		console.log(`Verified ImageMagick TIFF support for ${slug}.`);
	} finally {
		rmSync(probe, { force: true });
	}
}

/** Verify the host bundle can encode a real JPEG XL image. */
function verifyJxlSupport(slug: Slug): void {
	const slugDir = join(TOOL_DIR, slug);
	const bin = slugBin(slug);
	const env = { ...process.env };
	const libDir = join(slugDir, 'lib');
	const coderDir = join(libDir, 'ImageMagick', 'modules-Q16HDRI', 'coders');
	const filterDir = join(libDir, 'ImageMagick', 'modules-Q16HDRI', 'filters');
	const configDirs = [join(slugDir, 'etc', 'ImageMagick-7'), join(libDir, 'ImageMagick', 'config-Q16HDRI')];

	if (existsSync(libDir)) {
		env.DYLD_LIBRARY_PATH = [libDir, env.DYLD_LIBRARY_PATH].filter(Boolean).join(delimiter);
	}
	if (existsSync(coderDir)) env.MAGICK_CODER_MODULE_PATH = coderDir;
	if (existsSync(filterDir)) env.MAGICK_FILTER_MODULE_PATH = filterDir;
	env.MAGICK_CONFIGURE_PATH = configDirs.filter(existsSync).join(delimiter);
	env.MAGICK_HOME = slugDir;

	const probe = join(tmpdir(), `wasmagick-jxl-${slug}-${process.pid}.jxl`);
	try {
		const result = spawnSync(bin, ['-size', '1x1', 'xc:white', probe], {
			cwd: slugDir,
			env,
			encoding: 'utf8'
		});
		if (result.error || result.status !== 0 || !existsSync(probe)) {
			const detail = result.error?.message || result.stderr?.trim() || 'no JPEG XL output';
			throw new Error(`ImageMagick JPEG XL support is unavailable for ${slug}: ${detail}`);
		}
		console.log(`Verified ImageMagick JPEG XL support for ${slug}.`);
	} finally {
		rmSync(probe, { force: true });
	}
}

/**
 * Verify the host build decodes RAW camera formats (CR2, NEF, ARW, DNG, ...)
 * internally via libraw.
 *
 * `--with-raw=no` builds list the same formats but decode through an
 * external `darktable-cli` delegate that WASMagick does not bundle, so RAW
 * input fails with `darktable-cli: command not found` + `no images for
 * write`. Shared parsers live in `tooling/raw-support.ts` (unit-tested).
 *
 * On macOS this throws when RAW is missing (fix: `brew install
 * imagemagick-full` + re-run setup). On Linux/Windows the upstream
 * AppImage/portable builds also ship `--with-raw=no`; setup warns and the
 * Electron runtime routes RAW to the embedded WASM decoder instead of calling
 * their unbundled external delegate.
 */
function verifyRawSupport(slug: Slug): void {
	const slugDir = join(TOOL_DIR, slug);
	const bin = slugBin(slug);
	const env = { ...process.env };
	const libDir = join(slugDir, 'lib');
	const coderDir = join(slugDir, 'lib', 'ImageMagick', 'modules-Q16HDRI', 'coders');
	const filterDir = join(slugDir, 'lib', 'ImageMagick', 'modules-Q16HDRI', 'filters');
	const configDirs = [
		join(slugDir, 'etc', 'ImageMagick-7'),
		join(slugDir, 'lib', 'ImageMagick', 'config-Q16HDRI')
	];

	if (existsSync(libDir)) {
		const libraryKey = process.platform === 'darwin' ? 'DYLD_LIBRARY_PATH' : 'LD_LIBRARY_PATH';
		env[libraryKey] = [libDir, env[libraryKey]].filter(Boolean).join(delimiter);
	}
	if (existsSync(coderDir)) env.MAGICK_CODER_MODULE_PATH = coderDir;
	if (existsSync(filterDir)) env.MAGICK_FILTER_MODULE_PATH = filterDir;
	env.MAGICK_CONFIGURE_PATH = configDirs.filter(existsSync).join(delimiter);
	if (slug === 'win-x64') env.MAGICK_HOME = slugDir;

	const run = (args: string[]): string | null => {
		const result = spawnSync(bin, args, { cwd: slugDir, env, encoding: 'utf8' });
		if (result.error || result.status !== 0) return null;
		return String(result.stdout ?? '');
	};

	const configure = run(['-list', 'configure']);
	const format = run(['-list', 'format']);
	if (configure == null || format == null) {
		console.warn(`Could not probe RAW support for ${slug}; skipping RAW verification.`);
		return;
	}

	const capability = describeRawCapability(configure, format);
	const delegatesPath = join(slugDir, 'etc', 'ImageMagick-7', 'delegates.xml');
	const delegates = existsSync(delegatesPath) ? readFileSync(delegatesPath, 'utf8') : '';
	if (isRawCapable(capability) && !/darktable-cli/i.test(delegates)) {
		console.log(
			`Verified ImageMagick RAW support for ${slug} ` +
				`(${capability.formatCount} formats${capability.librawAnnotation ? ', libraw' : ''}).`
		);
		return;
	}

	const message =
		`ImageMagick RAW support is unavailable for ${slug}: ` +
		`RAW camera formats (CR2, NEF, ARW, DNG, ...) would fail via the external ` +
		`darktable-cli delegate. ` +
		(capability.missingFormats.length > 0
			? `Missing formats: ${capability.missingFormats.join(', ')}. `
			: '') +
		(slug.startsWith('mac')
			? `On macOS, install the RAW-capable formula and re-run setup: brew install imagemagick-full`
			: `Upstream ${slug} builds compile --with-raw=no; rebuild ImageMagick with libraw (--with-raw=yes).`);
	if (slug.startsWith('mac')) {
		throw new Error(message);
	}
	console.warn(message);
}

function findFile(root: string, names: Set<string>): string | null {
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const full = join(root, entry.name);
		if (entry.isFile() && names.has(entry.name.toLowerCase())) return full;
		if (entry.isDirectory()) {
			const found = findFile(full, names);
			if (found) return found;
		}
	}
	return null;
}

function webpToolNames(slug: Slug): { cwebp: string; dwebp: string } {
	const suffix = slug === 'win-x64' ? '.exe' : '';
	return { cwebp: `cwebp${suffix}`, dwebp: `dwebp${suffix}` };
}

function webpToolDir(slug: Slug): string {
	return join(WEBP_DIR, slug);
}

function webpToolPath(slug: Slug, tool: 'cwebp' | 'dwebp'): string | null {
	const names = webpToolNames(slug);
	const root = webpToolDir(slug);
	if (!existsSync(root)) return null;
	return findFile(root, new Set([names[tool].toLowerCase()]));
}

function ensureWebpTools(slug: Slug): void {
	const names = webpToolNames(slug);
	if (webpToolPath(slug, 'cwebp') && webpToolPath(slug, 'dwebp')) {
		console.log(`WebP tools ${WEBP_VERSION} (${slug}) already installed.`);
		return;
	}

	const destination = webpToolDir(slug);
	const archive = join(tmpdir(), `wasmagick-webp-${slug}.${slug === 'win-x64' ? 'zip' : 'tar.gz'}`);
	const extracted = join(tmpdir(), `wasmagick-webp-${slug}-extract`);
	rmSync(destination, { recursive: true, force: true });
	rmSync(extracted, { recursive: true, force: true });
	mkdirSync(extracted, { recursive: true });

	console.log(`Downloading WebP tools ${WEBP_VERSION} (${slug})...`);
	if (!download(WEBP_URLS[slug], archive)) {
		throw new Error(`Download failed: ${WEBP_URLS[slug]}`);
	}
	try {
		if (slug === 'win-x64') exec(`7z x "${archive}" -o"${extracted}" -y`);
		else exec(`tar -xzf "${archive}" -C "${extracted}"`);
		mkdirSync(destination, { recursive: true });
		const entries = readdirSync(extracted);
		const archiveRoot =
			entries.length === 1 && statSync(join(extracted, entries[0])).isDirectory()
				? join(extracted, entries[0])
				: extracted;
		cpSync(archiveRoot, destination, { recursive: true });
	} finally {
		rmSync(archive, { force: true });
		rmSync(extracted, { recursive: true, force: true });
	}

	if (!webpToolPath(slug, 'cwebp') || !webpToolPath(slug, 'dwebp')) {
		throw new Error(`WebP archive did not contain ${names.cwebp} and ${names.dwebp}`);
	}
	console.log(`WebP tools ready at ${destination}`);
}

function verifyWebpTools(slug: Slug): void {
	for (const tool of ['cwebp', 'dwebp'] as const) {
		const bin = webpToolPath(slug, tool);
		if (!bin) throw new Error(`Missing bundled WebP tool: ${tool}`);
		const result = spawnSync(bin, ['-version'], { encoding: 'utf8' });
		if (result.error || result.status !== 0) {
			throw new Error(`Bundled ${tool} could not start: ${result.error?.message ?? result.stderr}`);
		}
	}
	console.log(`Verified bundled cwebp and dwebp for ${slug}.`);
}

function exec(cmd: string, cwd?: string): void {
	execSync(cmd, { stdio: 'inherit', cwd });
}

function download(url: string, dest: string): boolean {
	try {
		execSync(`curl -fsSL -o "${dest}" "${url}"`, { stdio: 'inherit' });
		return true;
	} catch {
		return false;
	}
}

/**
 * True when an already-downloaded binary reports the pinned `IM_VERSION`.
 * The existence checks below must not trust a stale cache: bumping
 * `IM_VERSION` alone would otherwise keep shipping the old binary.
 */
function cachedVersionMatches(bin: string): boolean {
	try {
		const result = spawnSync(bin, ['-version'], { encoding: 'utf8' });
		if (result.error || result.status !== 0) return false;
		return (result.stdout ?? '').startsWith(`Version: ImageMagick ${IM_VERSION}`);
	} catch {
		return false;
	}
}

/** Drop a stale cache whose binary no longer matches `IM_VERSION`. */
function dropStaleCache(slugDir: string, bin: string): void {
	if (!existsSync(bin) || cachedVersionMatches(bin)) return;
	console.log(`Cached ImageMagick at ${slugDir} is not ${IM_VERSION}; re-downloading...`);
	rmSync(slugDir, { recursive: true, force: true });
}

function ensureLinux(slugDir: string): void {
	const bin = join(slugDir, 'bin', 'magick');
	dropStaleCache(slugDir, bin);
	if (existsSync(bin)) {
		console.log(`ImageMagick ${IM_VERSION} (${slugDir}) already installed.`);
		return;
	}
	if (process.platform !== 'linux') {
		throw new Error(
			`Cannot extract the Linux AppImage on ${process.platform}. ` +
				`Run setup on a Linux runner (CI) for slug linux-x64.`
		);
	}
	console.log(`Downloading ImageMagick ${IM_VERSION} AppImage...`);
	mkdirSync(slugDir, { recursive: true });
	const appimagePath = join(slugDir, LINUX_APPIMAGE);
	if (!download(LINUX_URL, appimagePath)) {
		throw new Error(`Download failed: ${LINUX_URL}`);
	}
	exec(`chmod +x "${appimagePath}"`);
	exec(`"${appimagePath}" --appimage-extract`, slugDir);
	rmSync(appimagePath);
	// Flatten squashfs-root/usr/{bin,lib,...} -> slugDir/{bin,lib,...}
	const root = join(slugDir, 'squashfs-root', 'usr');
	for (const entry of readdirSync(root)) {
		exec(`mv "${join(root, entry)}" "${join(slugDir, entry)}"`);
	}
	rmSync(join(slugDir, 'squashfs-root'), { recursive: true, force: true });
	console.log(`ImageMagick ready at ${bin}`);
}

function ensureWindows(slugDir: string): void {
	const bin = join(slugDir, 'magick.exe');
	dropStaleCache(slugDir, bin);
	if (existsSync(bin)) {
		console.log(`ImageMagick ${IM_VERSION} (${slugDir}) already installed.`);
		return;
	}
	console.log(`Downloading ImageMagick ${IM_VERSION} portable (Windows)...`);
	mkdirSync(slugDir, { recursive: true });
	const archivePath = join(slugDir, WIN_ARCHIVE);
	if (!download(WIN_URL, archivePath)) {
		throw new Error(`Download failed: ${WIN_URL}`);
	}
	try {
		exec(`7z x "${archivePath}" -o"${slugDir}" -y`);
	} catch {
		rmSync(archivePath, { force: true });
		throw new Error('7z not found. Install 7-Zip (https://7-zip.org/) with 7z on PATH.');
	}
	rmSync(archivePath);
	console.log(`ImageMagick ready at ${bin}`);
}

/**
 * Resolve the RAW-capable Homebrew ImageMagick prefix. The regular formula
 * deliberately omits libraw and must never be used to assemble a desktop
 * bundle that advertises camera RAW input.
 */
function resolveBrewPrefix(): { prefix: string; formula: 'imagemagick-full' } {
	try {
		const prefix = execSync('brew --prefix imagemagick-full', { encoding: 'utf-8' }).trim();
		if (prefix && existsSync(join(prefix, 'bin', 'magick'))) {
			return { prefix, formula: 'imagemagick-full' };
		}
	} catch {
		// report the actionable installation command below
	}
	throw new Error(
		'RAW-capable Homebrew ImageMagick not found. Install it with: brew install imagemagick-full'
	);
}

/** Copy a Homebrew-installed magick into a relocatable dir via install_name_tool. */
function bundleFromBrew(slugDir: string): void {
	const { prefix: brewPrefix, formula } = resolveBrewPrefix();
	const brewBin = join(brewPrefix, 'bin', 'magick');
	if (!existsSync(brewBin)) throw new Error(`No magick at ${brewBin}`);
	console.log(`Assembling relocatable bundle from Homebrew ${formula} prefix ${brewPrefix}...`);

	const binDir = join(slugDir, 'bin');
	const libDir = join(slugDir, 'lib');
	mkdirSync(binDir, { recursive: true });
	mkdirSync(libDir, { recursive: true });

	const destBin = join(binDir, 'magick');
	copyFileSync(brewBin, destBin);
	chmodSync(destBin, 0o755);

	const otool = (file: string): string[] => {
		try {
			return execSync(`otool -L "${file}" 2>/dev/null`, { encoding: 'utf-8' })
				.split('\n')
				.slice(1)
				.map((l) => l.trim().split(' ')[0])
				.filter(Boolean);
		} catch {
			return [];
		}
	};
	const otoolRpaths = (file: string): string[] => {
		try {
			const output = execSync(`otool -l "${file}" 2>/dev/null`, { encoding: 'utf-8' });
			return [...output.matchAll(/cmd LC_RPATH[\s\S]*?\n\s*path (.+?) \(offset \d+\)/g)].map(
				(match) => match[1]
			);
		} catch {
			return [];
		}
	};
	const resolveDependency = (dep: string, file: string): string | null => {
		if (!dep.startsWith('@')) return dep;
		const candidates: string[] = [];
		if (dep.startsWith('@loader_path/')) {
			candidates.push(join(dirname(file), dep.slice('@loader_path/'.length)));
		} else if (dep.startsWith('@executable_path/')) {
			candidates.push(join(dirname(brewBin), dep.slice('@executable_path/'.length)));
		} else if (dep.startsWith('@rpath/')) {
			const relativeDep = dep.slice('@rpath/'.length);
			for (const rpath of otoolRpaths(file)) {
				const expanded = rpath.startsWith('@loader_path/')
					? join(dirname(file), rpath.slice('@loader_path/'.length))
					: rpath.startsWith('@executable_path/')
						? join(dirname(brewBin), rpath.slice('@executable_path/'.length))
						: rpath;
				candidates.push(join(expanded, relativeDep));
			}
		}
		return candidates.find(existsSync) ?? null;
	};
	const realpath = (p: string): string => {
		try {
			return execSync(`realpath "${p}"`, { encoding: 'utf-8' }).trim() || p;
		} catch {
			return p;
		}
	};
	const isBrewLib = (p: string): boolean =>
		(p.startsWith('/opt/homebrew/') || p.startsWith('/usr/local/')) &&
		(p.endsWith('.dylib') || p.endsWith('.so'));

	// dest path -> original path, for every bundled Mach-O file.
	const nameMap = new Map<string, string>();
	const addFile = (orig: string, dest: string): void => {
		// otool can list dangling references (e.g. an .so built against a
		// since-upgraded brew package). Those modules fail at dlopen time
		// anyway; skip them instead of aborting the whole bundle.
		if (!existsSync(orig)) {
			console.warn(`Skipping missing dependency: ${orig}`);
			return;
		}
		if (!existsSync(dest)) copyFileSync(orig, dest);
		nameMap.set(dest, orig);
	};

	// Seed with the transitive dylib closure of the binary. Dedupe by real
	// path: brew prefixes are full of symlinks to the same file.
	const needed = new Set<string>();
	const queue: string[] = [brewBin];
	while (queue.length > 0) {
		const scanned = queue.pop()!;
		if (!existsSync(scanned)) continue;
		for (const dep of otool(scanned)) {
			const resolved = resolveDependency(dep, scanned);
			if (!resolved || !isBrewLib(resolved)) continue;
			const real = realpath(resolved);
			if (!existsSync(real)) {
				console.warn(`Skipping missing dependency: ${real}`);
				continue;
			}
			if (!needed.has(real)) {
				needed.add(real);
				queue.push(real);
			}
		}
	}
	for (const dep of needed) {
		addFile(dep, join(libDir, basename(dep)));
	}

	// Coder/filter modules (*.so, dlopen'd at runtime) plus XML configs.
	// Without these: "no decode delegate for this image format".
	const brewLibIM = join(dirname(dirname(brewBin)), 'lib', 'ImageMagick');
	const brewEtcIM = join(dirname(dirname(brewBin)), 'etc', 'ImageMagick-7');
	if (existsSync(brewLibIM)) {
		execSync(`cp -R "${brewLibIM}" "${join(libDir, 'ImageMagick')}"`);
		execSync(`chmod -R u+rwX "${join(libDir, 'ImageMagick')}"`);
		// The libtool `.la` files embed the build-time `libdir` (the brew
		// Cellar). ImageMagick resolves the module .so through it, which
		// would load the Cellar build and register coders against the wrong
		// libMagickCore instance ("no decode delegate" everywhere, even for
		// built-ins like xc:). Keep the metadata's `libdir` empty so libltdl
		// resolves the module beside the `.la` file in the relocatable bundle.
		for (const la of execSync(`find "${join(libDir, 'ImageMagick')}" -name '*.la'`, {
			encoding: 'utf-8'
		})
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean)) {
			execSync(`sed -i '' "s|^libdir='.*'|libdir=''|" "${la}"`);
		}
	}
	if (existsSync(brewEtcIM)) {
		mkdirSync(join(slugDir, 'etc'), { recursive: true });
		execSync(`cp -R "${brewEtcIM}" "${join(slugDir, 'etc', 'ImageMagick-7')}"`);
		execSync(`chmod -R u+rwX "${join(slugDir, 'etc', 'ImageMagick-7')}"`);
		// Some Homebrew installations retain the generic dng delegate even in
		// imagemagick-full. Once the libraw-backed DNG coder is present that
		// delegate is both unnecessary and dangerous: it makes ImageMagick try
		// darktable-cli before the bundled coder can handle CR2/NEF/etc.
		const delegatesPath = join(slugDir, 'etc', 'ImageMagick-7', 'delegates.xml');
		if (existsSync(delegatesPath)) {
			const delegates = readFileSync(delegatesPath, 'utf8');
			const sanitized = delegates.replace(
				/\s*<delegate\b(?=[^>]*\bdecode=["']dng:decode["'])[^>]*\/>\s*/gi,
				'\n'
			);
			if (sanitized !== delegates) writeFileSync(delegatesPath, sanitized);
		}
		const configurePath = join(slugDir, 'lib', 'ImageMagick', 'config-Q16HDRI', 'configure.xml');
		if (existsSync(configurePath)) {
			// The copied Homebrew XML records absolute Cellar module paths. Remove
			// those build-host overrides so the Electron runner's MAGICK_* paths
			// select the files inside the relocatable bundle.
			const configure = readFileSync(configurePath, 'utf8');
			const portable = configure.replace(
				/^\s*<configure\s+name=["'](?:CODER_PATH|FILTER_PATH|CONFIGURE_PATH)["'][^>]*\/?>\s*$/gim,
				''
			);
			if (portable !== configure) writeFileSync(configurePath, portable);
		}
	}

	// Fold in the modules' own brew dylib deps (e.g. libpng via png.so).
	const modulesRoot = join(libDir, 'ImageMagick');
	const extraQueue: string[] = [];
	if (existsSync(modulesRoot)) {
		const sos = execSync(`find "${modulesRoot}" -name '*.so'`, { encoding: 'utf-8' })
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
		extraQueue.push(...sos);
	}
	while (extraQueue.length > 0) {
		const scanned = extraQueue.pop()!;
		if (!existsSync(scanned)) continue;
		const original = nameMap.get(scanned) ?? scanned;
		for (const dep of otool(original)) {
			const resolved = resolveDependency(dep, original);
			if (!resolved || !isBrewLib(resolved)) continue;
			const real = realpath(resolved);
			if (!existsSync(real)) {
				console.warn(`Skipping missing dependency: ${real}`);
				continue;
			}
			const dest = join(libDir, basename(real));
			if (!nameMap.has(dest)) {
				addFile(real, dest);
				extraQueue.push(dest);
			}
		}
	}

	const destFor = (orig: string): string | null => {
		const direct = [...nameMap].find(([, src]) => src === orig)?.[0];
		if (direct) return direct;
		// Brew links dylibs via versioned symlinks (libjpeg.8.dylib ->
		// libjpeg.8.3.2.dylib): resolve to the real file we bundled.
		if (!orig.startsWith('@')) {
			const real = realpath(orig);
			if (real !== orig) {
				const viaReal = [...nameMap].find(([, src]) => src === real)?.[0];
				if (viaReal) return viaReal;
			}
		}
		// Same basename under a different brew prefix path (symlink twin).
		const wanted = basename(orig).replace(/\.dylib$/, '');
		return (
			[...nameMap].find(([dest]) => {
				const candidate = basename(dest).replace(/\.dylib$/, '');
				return (
					candidate === wanted ||
					candidate.startsWith(`${wanted}.`) ||
					wanted.startsWith(`${candidate}.`)
				);
			})?.[0] ?? null
		);
	};

	/**
	 * Rewrite absolute brew paths to bundle-relative ones.
	 * - bin/magick and lib/*.dylib: @executable_path/../lib/...
	 * - coder/filter modules (*.so three levels under lib/): @executable_path
	 *   would resolve against the module instead of the binary, so use
	 *   @loader_path/../../../... (coders/ -> modules-Q16HDRI/ ->
	 *   ImageMagick/ -> lib/).
	 */
	const rewrite = (file: string) => {
		const inModules = file.includes(`${'/lib/ImageMagick/'}`);
		const prefix = inModules ? '@loader_path/../../../' : '@executable_path/../lib/';
		for (const dep of otool(file)) {
			const dest = destFor(dep);
			if (!dest) continue;
			const replacement = `${prefix}${basename(dest)}`;
			if (dep === replacement) continue;
			execSync(`install_name_tool -change "${dep}" "${replacement}" "${file}"`);
		}
	};
	const allMachO = [destBin, ...[...nameMap].map(([dest]) => dest)];
	for (const file of allMachO) {
		if (file.endsWith('.dylib') || file.endsWith('.so')) {
			try {
				execSync(`install_name_tool -id "@executable_path/../lib/${basename(file)}" "${file}"`);
			} catch {
				// non-critical; -change below is what matters
			}
		}
	}
	for (const file of allMachO) rewrite(file);
	// Modules reference each other/siblings via @executable_path-relative ids.
	if (existsSync(modulesRoot)) {
		for (const file of execSync(`find "${modulesRoot}" -name '*.so'`, { encoding: 'utf-8' })
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean)) {
			rewrite(file);
		}
	}
	execSync(`chmod +x "${destBin}"`);
	// install_name_tool invalidates code signatures; re-sign ad-hoc so the
	// kernel (and later, electron-builder/Developer-ID signing) accepts the
	// bundle. Broken signatures surface as instant SIGKILL (exit 137).
	try {
		execSync(
			`codesign --force --sign - "${destBin}" "${libDir}"/*.dylib "${modulesRoot}"/modules-*/*/*.so`,
			{ stdio: 'pipe' }
		);
	} catch {
		console.warn('codesign failed; the bundled binary may be killed on launch.');
	}

	// Sanity: the bundled binary must report a version.
	const version = execSync(`"${destBin}" -version`, { encoding: 'utf-8' });
	console.log(version.split('\n')[0]);
	const rawModules = ['dng.so', 'raw.so'].map((name) =>
		join(modulesRoot, 'modules-Q16HDRI', 'coders', name)
	);
	const hasLibraw = readdirSync(libDir).some((file) =>
		/^libraw(?:_r)?(?:[-.][\w-]+)*\.(?:dll|dylib|so(?:\.\d+)*)$/i.test(file)
	);
	const missingRawModules = rawModules.filter((file) => !existsSync(file));
	if (!hasLibraw || missingRawModules.length > 0) {
		throw new Error(
			'Homebrew bundle is missing libraw-backed RAW coders. ' +
				'Install imagemagick-full and re-run setup.'
		);
	}
	console.log('Bundled ImageMagick includes libraw RAW support.');
	console.log(`ImageMagick ready at ${destBin} (${needed.size} bundled dylibs)`);
}

/**
 * File-based RAW check for an already-assembled macOS bundle (avoids
 * spawning the binary): true when `lib/libraw*` is staged and the bundled
 * `configure.xml` claims a `raw` delegate / `--with-raw=yes`.
 */
function existingBundleHasRaw(slugDir: string): boolean {
	try {
		const libDir = join(slugDir, 'lib');
		const modulesRoot = join(libDir, 'ImageMagick', 'modules-Q16HDRI', 'coders');
		const hasLibraw =
			existsSync(libDir) &&
			readdirSync(libDir).some((f) =>
				/^libraw(?:_r)?(?:[-.][\w-]+)*\.(?:dll|dylib|so(?:\.\d+)*)$/i.test(f)
			);
		const hasRawModules = ['dng.so', 'raw.so'].every((name) => existsSync(join(modulesRoot, name)));
		const delegatesPath = join(slugDir, 'etc', 'ImageMagick-7', 'delegates.xml');
		const delegates = existsSync(delegatesPath) ? readFileSync(delegatesPath, 'utf8') : '';
		const configurePath = join(slugDir, 'lib', 'ImageMagick', 'config-Q16HDRI', 'configure.xml');
		const configure = existsSync(configurePath) ? readFileSync(configurePath, 'utf8') : '';
		if (/darktable-cli/i.test(delegates)) return false;
		if (/name=["']CONFIGURE_PATH["']/i.test(configure)) return false;
		if (hasLibraw && hasRawModules) return true;
	} catch {
		// treat as missing; verifyRawSupport() reports definitively
	}
	return false;
}

function ensureMac(slugDir: string, arch: 'x64' | 'arm64'): void {
	const bin = join(slugDir, 'bin', 'magick');
	const hostArchMatches =
		process.platform === 'darwin' && (arch === 'x64') === (process.arch !== 'arm64');
	if (existsSync(bin)) {
		if (existingBundleHasRaw(slugDir)) {
			if (!hostArchMatches) {
				console.log(`ImageMagick ${IM_VERSION} (${slugDir}) already installed.`);
				return;
			}
			try {
				verifyJxlSupport(slug);
				console.log(`ImageMagick ${IM_VERSION} (${slugDir}) already installed.`);
				return;
			} catch {
				console.log(`Existing bundle at ${slugDir} lacks working JPEG XL support; rebuilding from Homebrew...`);
			}
		}
		if (hostArchMatches) {
			console.log(
				`Existing bundle at ${slugDir} lacks libraw RAW support; rebuilding from Homebrew...`
			);
			rmSync(slugDir, { recursive: true, force: true });
		} else {
			console.log(`ImageMagick ${IM_VERSION} (${slugDir}) already installed.`);
			return;
		}
	}
	// On a matching host, prefer a Homebrew bundle: `imagemagick-full` is
	// built --with-raw=yes (libraw), while the official tarballs are
	// --with-raw=no (RAW fails via darktable-cli). Fall through to the
	// tarball only when Homebrew bundling is unavailable.
	if (hostArchMatches) {
		try {
			bundleFromBrew(slugDir);
			return;
		} catch (err) {
			console.warn(
				`Homebrew bundle failed (${err instanceof Error ? err.message : err}); ` +
					`trying official tarball (note: tarballs lack libraw RAW support)...`
			);
		}
	}
	mkdirSync(slugDir, { recursive: true });
	for (const url of MAC_TARBALL_CANDIDATES[arch]) {
		console.log(`Trying ${url} ...`);
		const tmp = join(tmpdir(), `imagemagick-mac-${arch}.tar.gz`);
		if (!download(url, tmp)) continue;
		try {
			exec(`tar -xzf "${tmp}" -C "${slugDir}"`);
			rmSync(tmp, { force: true });
			// Normalize: tarball may contain a single top-level dir.
			if (!existsSync(bin)) {
				for (const entry of readdirSync(slugDir)) {
					const nested = join(slugDir, entry, 'bin', 'magick');
					if (existsSync(nested)) {
						exec(`mv "${join(slugDir, entry)}"/* "${slugDir}"/`);
						rmSync(join(slugDir, entry), { recursive: true, force: true });
						break;
					}
				}
			}
			if (existsSync(bin)) {
				console.log(`ImageMagick ready at ${bin}`);
				return;
			}
			console.log(`Archive did not contain bin/magick, trying next candidate...`);
		} catch {
			console.log(`Failed to extract ${url}, trying next candidate...`);
		}
	}
	// Fallback: assemble from Homebrew (macOS host only).
	if (process.platform === 'darwin' && (arch === 'x64') === (process.arch !== 'arm64')) {
		console.log('Official tarball unavailable; falling back to Homebrew bundle...');
		bundleFromBrew(slugDir);
		return;
	}
	throw new Error(
		`Could not download a macOS ${arch} build. ` +
			`On a Mac, install the RAW-capable formula (brew install imagemagick-full) and re-run.`
	);
}

/** Move the legacy Linux extract into the canonical slug dir (one-time). */
function migrateLegacyLinux(): void {
	const legacy = join(TOOL_DIR, 'squashfs-root');
	const canonical = join(TOOL_DIR, 'linux-x64');
	if (existsSync(join(canonical, 'bin', 'magick')) || !existsSync(legacy)) return;
	console.log(`Migrating legacy ${legacy} -> ${canonical} ...`);
	mkdirSync(TOOL_DIR, { recursive: true });
	exec(`mv "${legacy}" "${join(TOOL_DIR, 'linux-x64-legacy-tmp')}"`);
	mkdirSync(canonical, { recursive: true });
	const usr = join(TOOL_DIR, 'linux-x64-legacy-tmp', 'usr');
	if (existsSync(usr)) {
		for (const entry of readdirSync(usr)) {
			exec(`mv "${join(usr, entry)}" "${join(canonical, entry)}"`);
		}
	} else {
		for (const entry of readdirSync(join(TOOL_DIR, 'linux-x64-legacy-tmp'))) {
			exec(`mv "${join(TOOL_DIR, 'linux-x64-legacy-tmp', entry)}" "${join(canonical, entry)}"`);
		}
	}
	rmSync(join(TOOL_DIR, 'linux-x64-legacy-tmp'), { recursive: true, force: true });
}

async function downloadFont(): Promise<void> {
	const REPO_ROOT = join(import.meta.dirname, '..');
	const FONT_PATH = join(REPO_ROOT, 'test', 'fixtures', 'font.ttf');

	if (existsSync(FONT_PATH)) {
		console.log('Test font already downloaded.');
		return;
	}

	console.log('Downloading test font...');
	const response = await fetch(FONT_URL);
	if (!response.ok) throw new Error(`Font download failed: ${response.status}`);
	const fontData = new Uint8Array(await response.arrayBuffer());
	mkdirSync(dirname(FONT_PATH), { recursive: true });
	writeFileSync(FONT_PATH, fontData);
	console.log(`Font saved to ${FONT_PATH}`);
}

function ensureSlug(slug: Slug): void {
	const slugDir = join(TOOL_DIR, slug);
	if (slug === 'linux-x64') ensureLinux(slugDir);
	else if (slug === 'win-x64') ensureWindows(slugDir);
	else ensureMac(slugDir, slug === 'mac-arm64' ? 'arm64' : 'x64');
	if (!existsSync(slugBin(slug))) {
		throw new Error(`Setup finished but no binary at ${slugBin(slug)}`);
	}
	allowTiffCoder(slug);
	removeExternalRawDelegate(slug);
	ensureWebpTools(slug);
}

function parseArgs(): { slugs: Slug[] } {
	const args = process.argv.slice(2);
	const get = (name: string): string | null => {
		const flag = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
		if (!flag) return null;
		const eq = flag.indexOf('=');
		return eq >= 0 ? flag.slice(eq + 1) : (args[args.indexOf(flag) + 1] ?? null);
	};
	if (args.includes('--all')) {
		return { slugs: ['linux-x64', 'win-x64', 'mac-arm64', 'mac-x64'] };
	}
	const osArg = get('os');
	const archArg = get('arch');
	if (!osArg && !archArg) {
		return { slugs: [slugFor(process.platform, process.arch)] };
	}
	const os =
		osArg ??
		(process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux');
	const arch =
		archArg ??
		(os === 'win' || os === 'linux' ? 'x64' : process.arch === 'arm64' ? 'arm64' : 'x64');
	const slug = `${os}-${arch}` as Slug;
	if (!['linux-x64', 'win-x64', 'mac-arm64', 'mac-x64'].includes(slug)) {
		throw new Error(`Unknown slug: ${slug}`);
	}
	return { slugs: [slug] };
}

migrateLegacyLinux();

const { slugs } = parseArgs();
for (const slug of slugs) {
	console.log(`\n=== ImageMagick ${IM_VERSION} [${slug}] ===`);
	try {
		ensureSlug(slug);
	} catch (err) {
		console.error(`Failed to set up ${slug}:`, err instanceof Error ? err.message : err);
		process.exit(1);
	}
}

// `--all` prepares foreign-platform bundles that cannot be executed on the
// current host. Verify the host bundle only; each release runner verifies its
// own platform before packaging.
const hostSlug = slugFor(process.platform, process.arch);
if (slugs.includes(hostSlug)) {
	verifyWebpSupport(hostSlug);
	verifyTiffSupport(hostSlug);
	if (hostSlug.startsWith('mac-')) verifyJxlSupport(hostSlug);
	verifyWebpTools(hostSlug);
	verifyRawSupport(hostSlug);
}

try {
	await downloadFont();
} catch (err) {
	console.error('Failed to download font:', err instanceof Error ? err.message : err);
	process.exit(1);
}
