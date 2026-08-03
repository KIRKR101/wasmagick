import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const IM_VERSION = '7.1.2-29';
const TOOL_DIR = join(import.meta.dirname, 'imagemagick');

const LINUX_APPIMAGE = 'ImageMagick-7.1.2-29-gcc-x86_64.AppImage';
const LINUX_URL = `https://github.com/ImageMagick/ImageMagick/releases/download/${IM_VERSION}/${LINUX_APPIMAGE}`;
const LINUX_BIN = join(TOOL_DIR, 'squashfs-root', 'usr', 'bin', 'magick');

const WIN_ARCHIVE = `ImageMagick-${IM_VERSION}-portable-Q16-x64.7z`;
const WIN_URL = `https://github.com/ImageMagick/ImageMagick/releases/download/${IM_VERSION}/${WIN_ARCHIVE}`;
const WIN_BIN = join(TOOL_DIR, 'magick.exe');

const FONT_URL =
	'https://raw.githubusercontent.com/openmaptiles/fonts/master/roboto/Roboto-Regular.ttf';

const isWindows = process.platform === 'win32';
const magickBin = isWindows ? WIN_BIN : LINUX_BIN;

if (existsSync(magickBin)) {
	console.log(`ImageMagick ${IM_VERSION} already installed.`);
} else {
	console.log(`ImageMagick ${IM_VERSION} not found. Downloading for ${process.platform}...`);
	mkdirSync(TOOL_DIR, { recursive: true });

	try {
		if (isWindows) {
			const archivePath = join(TOOL_DIR, WIN_ARCHIVE);
			execSync(`curl -fsSL -o "${archivePath}" "${WIN_URL}"`, { stdio: 'inherit' });
			try {
				execSync(`7z x "${archivePath}" -o"${TOOL_DIR}" -y`, { stdio: 'inherit' });
			} catch {
				console.error(
					'Error: 7z not found. Install 7-Zip (https://7-zip.org/) and ensure 7z is in PATH.'
				);
				process.exit(1);
			}
			rmSync(archivePath);
		} else {
			const appimagePath = join(TOOL_DIR, LINUX_APPIMAGE);
			execSync(`curl -fsSL -o "${appimagePath}" "${LINUX_URL}"`, { stdio: 'inherit' });
			execSync(`chmod +x "${appimagePath}"`, { stdio: 'inherit' });
			execSync(`"${appimagePath}" --appimage-extract`, { cwd: TOOL_DIR, stdio: 'inherit' });
			rmSync(appimagePath);
		}
		console.log(`ImageMagick ${IM_VERSION} ready at ${magickBin}`);
	} catch (err) {
		console.error('Failed to set up ImageMagick:', err instanceof Error ? err.message : err);
		process.exit(1);
	}
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
	mkdirSync(join(REPO_ROOT, 'test', 'fixtures'), { recursive: true });
	writeFileSync(FONT_PATH, fontData);
	console.log(`Font saved to ${FONT_PATH}`);
}

try {
	await downloadFont();
} catch (err) {
	console.error('Failed to download font:', err instanceof Error ? err.message : err);
	process.exit(1);
}
