import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { magickCommand, magickEnvironment } from '../../tooling/magick-path';

const MAGICK = magickCommand();
const MAGICK_ENV = magickEnvironment();

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
	try {
		const comparison = spawnSync(
			MAGICK,
			['compare', '-metric', 'AE', '-fuzz', `${aeThreshold}%`, expectedPath, tmpActual, 'null:'],
			{ encoding: 'utf8', timeout: 30000, env: MAGICK_ENV }
		);
		const metricOutput = `${comparison.stdout ?? ''}\n${comparison.stderr ?? ''}`;
		// ImageMagick prints its AE metric as a standalone number, sometimes
		// followed by a normalized value in parentheses. Ignore unrelated digits.
		const metric = /^\s*(\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?:\s+\([^)]*\))?\s*$/im.exec(metricOutput);
		if (comparison.error || comparison.signal || comparison.status === null) {
			throw new Error(
				`ImageMagick compare failed: ${comparison.error?.message ?? comparison.signal}`
			);
		}
		if ((comparison.status !== 0 && comparison.status !== 1) || !metric) {
			const detail = metricOutput.trim() || `exit code ${comparison.status}`;
			throw new Error(`ImageMagick compare failed: ${detail}`);
		}

		const diffPixels = Number(metric[1]);
		const totalPixels = estimateTotalPixels(expectedPath);
		const diffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;
		const pass = diffPixels <= maxDiffPixels;

		if (!pass) {
			try {
				const diffOut = path.join(tmpDir, 'diff.png');
				const diffResult = spawnSync(MAGICK, ['compare', expectedPath, tmpActual, diffOut], {
					encoding: 'utf8',
					timeout: 30000,
					env: MAGICK_ENV
				});
				if (diffResult.error || diffResult.status !== 0)
					throw diffResult.error ?? new Error('diff generation failed');
				const diffData = fs.readFileSync(diffOut);
				const diff = PNG.sync.read(diffData);
				const expectedData = fs.readFileSync(expectedPath);
				const actualData = fs.readFileSync(tmpActual);
				writeDiffArtifacts(resultsDir, label, diff, expectedData, actualData, ext);
			} catch {
				/* ignore diff image errors */
			}
		}

		return { pass, diffPixels, totalPixels, diffPercent };
	} finally {
		cleanupTmp(tmpDir);
	}
}

function estimateTotalPixels(imagePath: string): number {
	const result = spawnSync(MAGICK, ['identify', '-format', '%wx%h', imagePath], {
		encoding: 'utf8',
		timeout: 10000,
		env: MAGICK_ENV
	});
	const dimensions = result.stdout?.trim().match(/^(\d+)x(\d+)$/);
	if (result.error || result.status !== 0 || !dimensions) {
		const detail = result.stderr?.trim() || result.error?.message || `exit code ${result.status}`;
		throw new Error(`ImageMagick identify failed for ${imagePath}: ${detail}`);
	}
	return Number(dimensions[1]) * Number(dimensions[2]);
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
