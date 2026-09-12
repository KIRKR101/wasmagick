import { existsSync } from 'node:fs';
import path from 'node:path';

function slugFor(): string {
	if (process.platform === 'win32') return 'win-x64';
	if (process.platform === 'darwin') return process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
	return 'linux-x64';
}

export function magickCommand(): string {
	const candidates: string[] = [];
	if (process.platform === 'win32') {
		candidates.push(path.resolve('tooling/imagemagick/win-x64/magick.exe'));
		// Legacy setup-imagemagick.ts layout (root-level extract).
		candidates.push(path.resolve('tooling/imagemagick/magick.exe'));
	} else {
		const slug = slugFor();
		candidates.push(path.resolve(`tooling/imagemagick/${slug}/bin/magick`));
		if (slug === 'linux-x64') {
			// Legacy layout (pre-canonical extract).
			candidates.push(path.resolve('tooling/imagemagick/squashfs-root/usr/bin/magick'));
		}
	}

	for (const bin of candidates) {
		if (existsSync(bin)) return bin;
	}

	throw new Error(
		`ImageMagick not found (tried ${candidates.join(', ')}). Run: npm run setup:imagemagick`
	);
}
