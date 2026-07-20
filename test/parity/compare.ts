import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { magickCommand } from '../../tooling/magick-path';

const MAGICK = magickCommand();

export interface CompareOptions {
	threshold?: number;
	maxDiffPixels?: number;
	resultsDir?: string;
	label?: string;
}

export interface CompareResult {
	pass: boolean;
	diffPixels: number;
	totalPixels: number;
	diffPercent: number;
}

export function compareImages(
	expectedPath: string,
	actualBuffer: Uint8Array,
	actualWidth: number,
	actualHeight: number,
	options: CompareOptions = {}
): CompareResult {
	const ext = path.extname(expectedPath).toLowerCase();

	if (ext === '.png') {
		return comparePng(expectedPath, actualBuffer, actualWidth, actualHeight, options);
	}

	return compareViaMagick(expectedPath, actualBuffer, ext, options);
}

function comparePng(
	expectedPath: string,
	actualBuffer: Uint8Array,
	actualWidth: number,
	actualHeight: number,
	options: CompareOptions
): CompareResult {
	const { threshold = 0.05, maxDiffPixels = 0, resultsDir = 'test-results', label = '' } = options;

	const expectedData = fs.readFileSync(expectedPath);
	const expected = PNG.sync.read(expectedData);

	const width = expected.width;
	const height = expected.height;

	if (width !== actualWidth || height !== actualHeight) {
		return {
			pass: false,
			diffPixels: width * height,
			totalPixels: width * height,
			diffPercent: 100
		};
	}

	const diff = new PNG({ width, height });
	const expectedRgba = new Uint8Array(expected.data);
	const actualRgba = new Uint8Array(actualBuffer);
	for (let i = 3; i < expectedRgba.length; i += 4) expectedRgba[i] = 255;
	for (let i = 3; i < actualRgba.length; i += 4) actualRgba[i] = 255;
	const diffPixels = pixelmatch(expectedRgba, actualRgba, diff.data, width, height, { threshold });
	const totalPixels = width * height;
	const diffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;
	const pass = diffPixels <= maxDiffPixels;

	if (!pass) {
		writeDiffArtifacts(resultsDir, label, diff, expectedData, Buffer.from(actualBuffer));
	}

	return { pass, diffPixels, totalPixels, diffPercent };
}

function compareViaMagick(
	expectedPath: string,
	actualBuffer: Uint8Array,
	ext: string,
	options: CompareOptions
): CompareResult {
	const { threshold = 0.05, maxDiffPixels = 0, resultsDir = 'test-results', label = '' } = options;

	fs.mkdirSync(resultsDir, { recursive: true });
	const tmpDir = fs.mkdtempSync(path.join(resultsDir, 'tmp-'));
	const tmpActual = path.join(tmpDir, `actual${ext}`);
	fs.writeFileSync(tmpActual, Buffer.from(actualBuffer));

	const aeThreshold = Math.ceil(threshold * 100);
	let diffPixels = 999999;
	try {
		const stderr = execSync(
			`"${MAGICK}" compare -metric AE -fuzz ${aeThreshold}% "${expectedPath}" "${tmpActual}" "null:"`,
			{ encoding: 'utf-8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'] }
		);

		const match = /(\d+)/.exec(stderr);
		diffPixels = match ? parseInt(match[1], 10) : 0;
	} catch (e: unknown) {
		if (e instanceof Error && 'stderr' in e) {
			const stderrStr = String((e as { stderr: Buffer }).stderr);
			const match = /(\d+)/.exec(stderrStr);
			diffPixels = match ? parseInt(match[1], 10) : 999999;
		}
	}

	const totalPixels = estimateTotalPixels(expectedPath);
	const diffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;
	const pass = diffPixels <= maxDiffPixels;

	if (!pass) {
		try {
			const diffOut = path.join(tmpDir, 'diff.png');
			execSync(`"${MAGICK}" compare "${expectedPath}" "${tmpActual}" "${diffOut}"`, {
				encoding: 'utf-8',
				timeout: 30000
			});
			const diffData = fs.readFileSync(diffOut);
			const diff = PNG.sync.read(diffData);
			const expectedData = fs.readFileSync(expectedPath);
			const actualData = fs.readFileSync(tmpActual);
			writeDiffArtifacts(resultsDir, label, diff, expectedData, actualData, ext);
		} catch {
			/* ignore diff image errors */
		}
	}

	cleanupTmp(tmpDir);
	return { pass, diffPixels, totalPixels, diffPercent };
}

function estimateTotalPixels(imagePath: string): number {
	try {
		const info = execSync(`"${MAGICK}" identify -format "%wx%h" "${imagePath}"`, {
			encoding: 'utf-8',
			timeout: 10000
		}).trim();
		const [w, h] = info.split('x').map(Number);
		return w * h;
	} catch {
		return 1;
	}
}

function writeDiffArtifacts(
	resultsDir: string,
	label: string,
	diff: PNG,
	expectedData: Buffer,
	actualData: Buffer,
	ext: string = '.png'
) {
	const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '_');
	const outDir = path.join(resultsDir, safeLabel);
	fs.mkdirSync(outDir, { recursive: true });
	fs.writeFileSync(path.join(outDir, 'diff.png'), PNG.sync.write(diff));
	fs.writeFileSync(path.join(outDir, `expected${ext}`), expectedData);
	fs.writeFileSync(path.join(outDir, `actual${ext}`), actualData);
}

function cleanupTmp(dir: string) {
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		/* ignore */
	}
}
