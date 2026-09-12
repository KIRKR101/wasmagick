/**
 * Stage the native ImageMagick bundle for electron-builder.
 *
 * Copies the current platform's canonical build
 * (`tooling/imagemagick/<os>-<arch>/`, with legacy fallbacks) into
 * `native-bundle/magick/`, which `package.json`'s `extraResources` picks up
 * as `<resources>/magick-bundle` (see `electron/magick-native.cjs`).
 *
 * Usage: npx tsx tooling/stage-native-bundle.ts
 * Runs automatically as part of `npm run build:electron`.
 */

import { existsSync, mkdirSync, rmSync, cpSync, readdirSync, statSync } from 'node:fs';
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

const source = findSource();
console.log(`Staging native bundle for ${slugFor()} from ${source} ...`);
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

console.log(`Staged to ${STAGE_DIR}`);
