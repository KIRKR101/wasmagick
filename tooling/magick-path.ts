import { existsSync } from 'node:fs';
import path, { delimiter } from 'node:path';

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

/** Environment needed to keep a bundled ImageMagick from using host config/modules. */
export function magickEnvironment(): NodeJS.ProcessEnv {
	const command = magickCommand();
	const slugDir =
		process.platform === 'win32' ? path.dirname(command) : path.dirname(path.dirname(command));
	const coderDir = path.join(slugDir, 'lib', 'ImageMagick', 'modules-Q16HDRI', 'coders');
	const filterDir = path.join(slugDir, 'lib', 'ImageMagick', 'modules-Q16HDRI', 'filters');
	const configDirs = [
		path.join(slugDir, 'etc', 'ImageMagick-7'),
		path.join(slugDir, 'lib', 'ImageMagick', 'config-Q16HDRI')
	];
	const env: NodeJS.ProcessEnv = { ...process.env };
	const libDir = path.join(slugDir, 'lib');
	if (process.platform === 'linux' && existsSync(libDir)) {
		env.LD_LIBRARY_PATH = [libDir, env.LD_LIBRARY_PATH].filter(Boolean).join(delimiter);
	}
	if (existsSync(coderDir)) env.MAGICK_CODER_MODULE_PATH = coderDir;
	if (existsSync(filterDir)) env.MAGICK_FILTER_MODULE_PATH = filterDir;
	const existingConfigDirs = configDirs.filter(existsSync);
	if (existingConfigDirs.length) env.MAGICK_CONFIGURE_PATH = existingConfigDirs.join(delimiter);
	if (process.platform === 'win32') env.MAGICK_HOME = slugDir;
	return env;
}
