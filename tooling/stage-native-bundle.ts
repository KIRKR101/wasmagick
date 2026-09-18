/**
 * Stage the native ImageMagick and WebP tool bundles for electron-builder.
 *
 * Copies the current platform's canonical build
 * (`tooling/imagemagick/<os>-<arch>/`, with legacy fallbacks) and the
 * matching `tooling/webp/<os>-<arch>/` tool bundle into
 * `native-bundle/magick/`, which `package.json`'s `extraResources` picks up
 * as `<resources>/magick-bundle` (see `electron/magick-native.cjs`).
 *
 * Usage: npx tsx tooling/stage-native-bundle.ts
 * Runs automatically as part of `npm run build:electron`.
 */

import {
	existsSync,
	mkdirSync,
	rmSync,
	cpSync,
	readdirSync,
	statSync,
	readFileSync
} from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const STAGE_DIR = join(REPO_ROOT, 'native-bundle', 'magick');

function slugFor(): string {
	if (process.platform === 'win32') return 'win-x64';
	if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
	return 'linux-x64';
}

function findSource(): string {
	const slug = slugFor();
	const canonical = join(REPO_ROOT, 'tooling', 'imagemagick', slug);
	const hasBin =
		existsSync(join(canonical, 'bin', 'magick')) || existsSync(join(canonical, 'magick.exe'));
	if (hasBin) return canonical;

	// Legacy fallbacks (see tooling/magick-path.ts).
	if (process.platform === 'win32') {
		const legacy = join(REPO_ROOT, 'tooling', 'imagemagick');
		if (existsSync(join(legacy, 'magick.exe'))) return legacy;
	} else if (slug === 'linux-x64') {
		const legacy = join(REPO_ROOT, 'tooling', 'imagemagick', 'squashfs-root');
		if (existsSync(join(legacy, 'usr', 'bin', 'magick'))) return legacy;
	}

	throw new Error(`No native ImageMagick build found for ${slug}. Run: npm run setup:imagemagick`);
}

function verifyRawBundle(source: string): void {
	const libDir = join(source, 'lib');
	const coderDir = join(libDir, 'ImageMagick', 'modules-Q16HDRI', 'coders');
	const hasLibraw =
		existsSync(libDir) &&
		readdirSync(libDir).some((entry) =>
			/^libraw(?:_r)?(?:[-.][\w-]+)*\.(?:dll|dylib|so(?:\.\d+)*)$/i.test(entry)
		);
	const hasRawCoders = ['dng', 'raw'].every((name) =>
		['.so', '.dll'].some((suffix) => existsSync(join(coderDir, `${name}${suffix}`)))
	);
	const delegatesPath = join(source, 'etc', 'ImageMagick-7', 'delegates.xml');
	const delegates = existsSync(delegatesPath) ? readFileSync(delegatesPath, 'utf8') : '';

	if (hasLibraw && hasRawCoders && /darktable-cli/i.test(delegates)) {
		throw new Error(
			`Native bundle ${source} contains LibRaw but still references darktable-cli. ` +
				'Run setup:imagemagick again before staging.'
		);
	}
	if (!hasLibraw || !hasRawCoders) {
		console.warn(
			`Native bundle ${source} has no LibRaw coder; RAW files will use the embedded WASM fallback.`
		);
		return;
	}
	console.log('Verified staged native bundle contains LibRaw RAW coders.');
}

const source = findSource();
console.log(`Staging native bundle for ${slugFor()} from ${source} ...`);
verifyRawBundle(source);
rmSync(join(REPO_ROOT, 'native-bundle'), { recursive: true, force: true });
mkdirSync(STAGE_DIR, { recursive: true });

if (process.platform === 'win32' && source.endsWith('imagemagick')) {
	// Legacy root-level Windows extract: copy binaries/DLLs, skipping the
	// canonical slug dirs and the script-owned subdirs.
	for (const entry of readdirSync(source)) {
		if (['win-x64', 'linux-x64', 'mac-arm64', 'mac-x64'].includes(entry)) continue;
		const full = join(source, entry);
		cpSync(full, join(STAGE_DIR, entry), {
			recursive: statSync(full).isDirectory()
		});
	}
} else {
	cpSync(source, STAGE_DIR, { recursive: true });
}

const webpSource = join(REPO_ROOT, 'tooling', 'webp', slugFor());
if (!existsSync(webpSource)) {
	throw new Error(`No bundled WebP tools found at ${webpSource}. Run: npm run setup:imagemagick`);
}
cpSync(webpSource, join(STAGE_DIR, 'webp-tools'), { recursive: true });

console.log(`Staged to ${STAGE_DIR}`);
