import { existsSync } from 'node:fs';
import path from 'node:path';

const isWindows = process.platform === 'win32';

export function magickCommand(): string {
	const bin = isWindows
		? path.resolve('tooling/imagemagick/magick.exe')
		: path.resolve('tooling/imagemagick/squashfs-root/usr/bin/magick');

	if (!existsSync(bin)) {
		throw new Error(`ImageMagick not found at ${bin}. Run: npm run setup:imagemagick`);
	}

	return bin;
}
