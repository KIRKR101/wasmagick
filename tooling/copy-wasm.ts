import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(import.meta.dirname, '..');
const STATIC_DIR = join(REPO_ROOT, 'static');

/**
 * The wasm engines that run in the browser are fetched from `/` (see
 * `initWasm` and the `exif.ts` fetch remap), so `static/` must hold copies of
 * the engine binaries from node_modules. Copying them at build/dev time keeps
 * the copies in lockstep with the installed dependency versions
 */
const SOURCES = [
	{
		from: join(REPO_ROOT, 'node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm'),
		to: join(STATIC_DIR, 'magick.wasm')
	},
	{
		from: join(REPO_ROOT, 'node_modules/@6over3/zeroperl-ts/dist/esm/zeroperl.wasm'),
		to: join(STATIC_DIR, 'zeroperl.wasm')
	}
];

mkdirSync(STATIC_DIR, { recursive: true });

for (const { from, to } of SOURCES) {
	if (!existsSync(from)) {
		console.error(
			`Error: ${from} not found. Run \`npm install\` first; the engine binary comes from a package dependency.`
		);
		process.exit(1);
	}
	copyFileSync(from, to);
}

console.log(`Copied ${SOURCES.length} WASM engine binaries to ${STATIC_DIR}`);
