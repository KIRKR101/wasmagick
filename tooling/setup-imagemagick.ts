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

import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';

const IM_VERSION = '7.1.2-29';
const TOOL_DIR = join(import.meta.dirname, 'imagemagick');

const LINUX_APPIMAGE = `ImageMagick-${IM_VERSION}-gcc-x86_64.AppImage`;
const LINUX_URL = `https://github.com/ImageMagick/ImageMagick/releases/download/${IM_VERSION}/${LINUX_APPIMAGE}`;

const WIN_ARCHIVE = `ImageMagick-${IM_VERSION}-portable-Q16-x64.7z`;
const WIN_URL = `https://github.com/ImageMagick/ImageMagick/releases/download/${IM_VERSION}/${WIN_ARCHIVE}`;

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

function ensureLinux(slugDir: string): void {
	const bin = join(slugDir, 'bin', 'magick');
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

/** Copy a Homebrew-installed magick into a relocatable dir via install_name_tool. */
function bundleFromBrew(slugDir: string): void {
	const brewPrefix = execSync('brew --prefix imagemagick', { encoding: 'utf-8' }).trim();
	const brewBin = join(brewPrefix, 'bin', 'magick');
	if (!existsSync(brewBin)) throw new Error(`No magick at ${brewBin}`);
	console.log(`Assembling relocatable bundle from Homebrew prefix ${brewPrefix}...`);

	const binDir = join(slugDir, 'bin');
	const libDir = join(slugDir, 'lib');
	mkdirSync(binDir, { recursive: true });
	mkdirSync(libDir, { recursive: true });

	const destBin = join(binDir, 'magick');
	copyFileSync(brewBin, destBin);

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
			if (!isBrewLib(dep)) continue;
			const real = realpath(dep);
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
		// The libtool `.la` files embed the build-time `libdir` (the brew
		// Cellar). ImageMagick resolves the module .so through it, which
		// would load the Cellar build and register coders against the wrong
		// libMagickCore instance ("no decode delegate" everywhere, even for
		// built-ins like xc:). Neuter it: with an invalid libdir,
		// ImageMagick falls back to the .la file's own directory, which is
		// correct both in tooling/ and in the packaged Resources dir.
		for (const la of execSync(`find "${join(libDir, 'ImageMagick')}" -name '*.la'`, {
			encoding: 'utf-8'
		})
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean)) {
			execSync(`sed -i '' "s|^libdir='.*'|libdir='/nonexistent-wasmagick'|" "${la}"`);
		}
	}
	if (existsSync(brewEtcIM)) {
		mkdirSync(join(slugDir, 'etc'), { recursive: true });
		execSync(`cp -R "${brewEtcIM}" "${join(slugDir, 'etc', 'ImageMagick-7')}"`);
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
		for (const dep of otool(scanned)) {
			if (!isBrewLib(dep)) continue;
			const real = realpath(dep);
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
		return [...nameMap].find(([dest]) => basename(dest) === basename(orig))?.[0] ?? null;
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
			if (!dest || dep.startsWith('@')) continue;
			execSync(`install_name_tool -change "${dep}" "${prefix}${basename(dest)}" "${file}"`);
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
	console.log(`ImageMagick ready at ${destBin} (${needed.size} bundled dylibs)`);
}

function ensureMac(slugDir: string, arch: 'x64' | 'arm64'): void {
	const bin = join(slugDir, 'bin', 'magick');
	if (existsSync(bin)) {
		console.log(`ImageMagick ${IM_VERSION} (${slugDir}) already installed.`);
		return;
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
			`On a Mac, install Homebrew ImageMagick (brew install imagemagick) and re-run.`
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

try {
	await downloadFont();
} catch (err) {
	console.error('Failed to download font:', err instanceof Error ? err.message : err);
	process.exit(1);
}
