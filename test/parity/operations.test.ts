import { describe, it, expect, beforeAll } from 'vitest';
import { initializeImageMagick, Magick } from '@imagemagick/magick-wasm';
import { PNG } from 'pngjs';
import fs from 'node:fs';
import path from 'node:path';
import { processImageSync } from '../../src/lib/magick-process';
import type { MagickSettings } from '../../src/lib/types';
import { DEFAULT_SETTINGS } from '../../src/lib/useMagick.svelte';
import { compareImages } from './compare';

const FIXTURES = 'test/fixtures';
const SOURCE = `${FIXTURES}/source`;
const GOLDEN = `${FIXTURES}/golden`;
const RESULTS = 'test-results';

const DEFAULT_FONT = 'Roboto-Regular';

const SOURCE_FILES = [
	'source-100x100.png',
	'source-101x99.png',
	'source-alpha-100x100.png',
	'source-icc-100x100.png',
	'source.jpg'
];

let wasmInitialized = false;
let fontLoaded = false;

beforeAll(async () => {
	if (!wasmInitialized) {
		const wasmPath = path.resolve('node_modules/@imagemagick/magick-wasm/dist/magick.wasm');
		const wasmBytes = fs.readFileSync(wasmPath);
		await initializeImageMagick(new Uint8Array(wasmBytes));
		wasmInitialized = true;
	}

	if (!fontLoaded) {
		const localFontPath = path.resolve(`${FIXTURES}/font.ttf`);
		if (fs.existsSync(localFontPath)) {
			const fontData = new Uint8Array(fs.readFileSync(localFontPath));
			Magick.addFont(DEFAULT_FONT, fontData);
			fontLoaded = true;
		} else {
			try {
				const url =
					'https://raw.githubusercontent.com/openmaptiles/fonts/master/roboto/Roboto-Regular.ttf';
				const response = await fetch(url);
				if (response.ok) {
					const fontData = new Uint8Array(await response.arrayBuffer());
					Magick.addFont(DEFAULT_FONT, fontData);
					fontLoaded = true;
				}
			} catch {
				console.warn('Could not load font for annotation parity tests. Skipping.');
			}
		}
	}
});

function skipIfNoFont(): boolean {
	return !fontLoaded;
}

function countUniqueColors(png: PNG): number {
	const set = new Set<number>();
	const data = new Uint8Array(png.data);
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i], g = data[i + 1], b = data[i + 2];
		set.add((r << 16) | (g << 8) | b);
	}
	return set.size;
}

function readSource(name: string): Uint8Array {
	return new Uint8Array(fs.readFileSync(path.resolve(`${SOURCE}/${name}`)));
}

function baseSettings(): MagickSettings {
	return { ...DEFAULT_SETTINGS, imageFormat: 'PNG', quality: [100] };
}

function goldenPath(operation: string, file: string): string {
	return path.resolve(`${GOLDEN}/${operation}/${file}`);
}

function testOperation(
	operation: string,
	sourceName: string,
	goldenName: string,
	settings: Partial<MagickSettings>,
	threshold = 0.05,
	maxDiffPixels = 0
) {
	const sourceBytes = readSource(sourceName);
	const merged: MagickSettings = { ...baseSettings(), ...settings };
	const result = processImageSync(sourceBytes, merged);

	const ext = path.extname(goldenName).toLowerCase();
	let actualBuffer: Uint8Array;
	let actualWidth: number;
	let actualHeight: number;

	if (ext === '.png') {
		const png = PNG.sync.read(Buffer.from(result.data));
		actualBuffer = new Uint8Array(png.data);
		actualWidth = png.width;
		actualHeight = png.height;
	} else {
		actualBuffer = result.data;
		actualWidth = 0;
		actualHeight = 0;
	}

	const outcome = compareImages(
		goldenPath(operation, goldenName),
		actualBuffer,
		actualWidth,
		actualHeight,
		{
			threshold,
			maxDiffPixels,
			resultsDir: RESULTS,
			label: `${operation}/${sourceName}`
		}
	);

	expect(
		outcome.pass,
		`${operation}/${sourceName}: ${outcome.diffPixels}/${outcome.totalPixels}px diff (${outcome.diffPercent.toFixed(2)}%)`
	).toBe(true);
}

function testAllSources(
	operation: string,
	goldenNamePattern: string,
	settings: Partial<MagickSettings>,
	threshold?: number,
	maxDiffPixels?: number
) {
	for (const src of SOURCE_FILES) {
		const base = path.parse(src).name;
		const goldenName = goldenNamePattern.replace('{base}', base);
		testOperation(operation, src, goldenName, settings, threshold, maxDiffPixels);
	}
}

describe('Geometry operations', () => {
	it('resize', () => {
		testAllSources('resize', '{base}-50x50.png', { resizeW: 50, resizeH: 50 });
	});

	it('rotate 90', () => {
		testAllSources('rotate', '{base}-90.png', { rotate: '90' });
	});

	it('rotate 180', () => {
		testAllSources('rotate', '{base}-180.png', { rotate: '180' });
	});

	it('rotate -90', () => {
		testAllSources('rotate', '{base}-m90.png', { rotate: '-90' });
	});

	it('flip', () => {
		testAllSources('flip', '{base}.png', { flip: true });
	});

	it('flop', () => {
		testAllSources('flop', '{base}.png', { flop: true });
	});

	it('auto-orient', () => {
		testAllSources('auto-orient', '{base}.png', { autoOrient: true });
	});

	it('crop', () => {
		testAllSources('crop', '{base}.png', {
			cropW: 60,
			cropH: 60,
			cropGravity: 'Northwest'
		});
	});

	it('crop center', () => {
		testAllSources('crop-center', '{base}.png', {
			cropW: 60,
			cropH: 60,
			cropGravity: 'Center'
		});
	});

	it('crop northwest', () => {
		testAllSources('crop-northwest', '{base}.png', {
			cropW: 60,
			cropH: 60,
			cropGravity: 'Northwest'
		});
	});

	it('crop north', () => {
		testAllSources('crop-north', '{base}.png', {
			cropW: 60,
			cropH: 60,
			cropGravity: 'North'
		});
	});

	it('crop northeast', () => {
		testAllSources('crop-northeast', '{base}.png', {
			cropW: 60,
			cropH: 60,
			cropGravity: 'Northeast'
		});
	});

	it('crop west', () => {
		testAllSources('crop-west', '{base}.png', {
			cropW: 60,
			cropH: 60,
			cropGravity: 'West'
		});
	});

	it('crop east', () => {
		testAllSources('crop-east', '{base}.png', {
			cropW: 60,
			cropH: 60,
			cropGravity: 'East'
		});
	});

	it('crop southwest', () => {
		testAllSources('crop-southwest', '{base}.png', {
			cropW: 60,
			cropH: 60,
			cropGravity: 'Southwest'
		});
	});

	it('crop south', () => {
		testAllSources('crop-south', '{base}.png', {
			cropW: 60,
			cropH: 60,
			cropGravity: 'South'
		});
	});

	it('crop southeast', () => {
		testAllSources('crop-southeast', '{base}.png', {
			cropW: 60,
			cropH: 60,
			cropGravity: 'Southeast'
		});
	});

	it('trim', () => {
		testAllSources('trim', '{base}.png', { trimEdges: true });
	});

	it('deskew', () => {
		testAllSources('deskew', '{base}.png', { deskewThreshold: [20], deskewAutoCrop: false });
	});

	it('extent', () => {
		testAllSources('extent', '{base}-120x120-center-white.png', {
			extentW: 120,
			extentH: 120,
			extentGravity: 'Center',
			extentBgColor: '#ffffff'
		});
	});

	it('border', () => {
		testAllSources('border', '{base}-5px-red.png', {
			borderSize: [5],
			borderColor: '#e74c3c'
		});
	});
});

describe('Color operations', () => {
	it('modulate', () => {
		testAllSources('modulate', '{base}.png', {
			brightness: [120],
			saturation: [150],
			hue: [110]
		});
	});

	it('brightness-contrast', () => {
		testAllSources('brightness-contrast', '{base}.png', { contrast: [30] });
	});

	it('normalize', () => {
		testAllSources('normalize', '{base}.png', { normalizeImage: true });
	});

	it('auto-level', () => {
		testAllSources('auto-level', '{base}.png', { autoLevel: true });
	});

	it('levels (All)', () => {
		testAllSources(
			'levels',
			'{base}-all.png',
			{
				levelBlackpoint: { All: [10], Red: [0], Green: [0], Blue: [0] },
				levelWhitepoint: { All: [90], Red: [100], Green: [100], Blue: [100] },
				levelGamma: { All: [1.2], Red: [1.0], Green: [1.0], Blue: [1.0] },
				levelChannels: 'All'
			},
			0.05,
			1000
		);
	});

	it('threshold', () => {
		testAllSources('threshold', '{base}.png', { thresholdPercentage: [60] }, 0.05, 100);
	});

	it('sigmoidal-contrast', () => {
		testAllSources(
			'sigmoidal-contrast',
			'{base}.png',
			{
				sigmoidalContrast: [5],
				sigmoidalMidpoint: [50],
				sigmoidalChannels: 'All'
			},
			0.05,
			200
		);
	});

	it('color-space (Gray)', () => {
		testAllSources('color-space', '{base}-gray.png', { colorSpace: 'Gray' }, 0.05, 200);
	});

	it('color-space (HSL)', () => {
		testAllSources('color-space', '{base}-hsl.png', { colorSpace: 'HSL' }, 0.05, 200);
	});

	it('color-space (HSV)', () => {
		testAllSources('color-space', '{base}-hsv.png', { colorSpace: 'HSV' }, 0.05, 200);
	});

	it('color-space (Lab)', () => {
		testAllSources('color-space', '{base}-lab.png', { colorSpace: 'Lab' }, 0.05, 200);
	});
});

describe('Filter / Effect operations', () => {
	it('grayscale', () => {
		testAllSources('grayscale', '{base}.png', { effect: 'grayscale' }, 0.05, 200);
	});

	it('sepia-tone', () => {
		testAllSources('sepia-tone', '{base}.png', {
			effect: 'sepia',
			sepiaThreshold: [80]
		});
	});

	it('charcoal', () => {
		testAllSources(
			'charcoal',
			'{base}-radius2.png',
			{
				effect: 'charcoal',
				charcoalIntensity: [2]
			},
			0.05,
			5200
		);
	});

	it('negate', () => {
		testAllSources('negate', '{base}.png', { effect: 'negate' }, 0.05, 200);
	});

	it('canny-edge', () => {
		testAllSources(
			'canny-edge',
			'{base}.png',
			{
				effect: 'cannyEdge',
				cannyEdgeStrength: [50],
				cannyEdgeLower: [10],
				cannyEdgeUpper: [30]
			},
			0.05,
			200
		);
	});

	it('oil-paint', () => {
		testAllSources(
			'oil-paint',
			'{base}.png',
			{
				effect: 'oilpaint',
				oilpaintRadius: [3]
			},
			0.05,
			500
		);
	});

	it('solarize', () => {
		testAllSources(
			'solarize',
			'{base}.png',
			{
				effect: 'solarize',
				solarizeFactor: [50]
			},
			0.05,
			200
		);
	});

	it('bilateral-blur', () => {
		testAllSources('bilateral-blur', '{base}.png', {
			effect: 'bilateralBlur',
			bilateralWidth: [5],
			bilateralHeight: [5],
			bilateralIntensitySigma: [1.5],
			bilateralSpatialSigma: [1.0]
		});
	});

	it('clut (warm)', () => {
		testAllSources('clut', '{base}-warm.png', {
			clutMap: 'warm',
			clutInterpolation: 'catrom'
		});
	});

	it('clut (vintage)', () => {
		testAllSources('clut', '{base}-vintage.png', {
			clutMap: 'vintage',
			clutInterpolation: 'bilinear'
		});
	});

	it('blur', () => {
		testAllSources('blur', '{base}.png', { blur: [3] });
	});

	it('sharpen', () => {
		testAllSources('sharpen', '{base}.png', { sharpen: [2] });
	});

	it('adaptive-sharpen', () => {
		testAllSources('adaptive-sharpen', '{base}.png', {
			adaptiveSharpenRadius: [2],
			adaptiveSharpenSigma: [1]
		}, 0.05, 100);
	});

	it('adaptive-blur', () => {
		testAllSources('adaptive-blur', '{base}.png', {
			adaptiveBlurRadius: [2],
			adaptiveBlurSigma: [1]
		}, 0.05, 200);
	});
});

describe('Quantize / Dithering operations', () => {
	it('reduces colors to <= target with default dither', () => {
		for (const src of SOURCE_FILES) {
			const sourceBytes = readSource(src);
			const merged: MagickSettings = {
				...baseSettings(),
				quantizeColors: [16]
			};
			const result = processImageSync(sourceBytes, merged);
			const png = PNG.sync.read(Buffer.from(result.data));
			const colors = countUniqueColors(png);
			expect(colors, `${src}: expected <= 16 colors, got ${colors}`).toBeLessThanOrEqual(16);
		}
	});

	it('reduces colors to <= target with no dither', () => {
		for (const src of SOURCE_FILES) {
			const sourceBytes = readSource(src);
			const merged: MagickSettings = {
				...baseSettings(),
				quantizeColors: [16],
				ditherMethod: 'No'
			};
			const result = processImageSync(sourceBytes, merged);
			const png = PNG.sync.read(Buffer.from(result.data));
			const colors = countUniqueColors(png);
			expect(colors, `${src}: expected <= 16 colors, got ${colors}`).toBeLessThanOrEqual(16);
		}
	});

	it('preserves image dimensions after quantize', () => {
		for (const src of SOURCE_FILES) {
			const sourceBytes = readSource(src);
			const merged: MagickSettings = {
				...baseSettings(),
				quantizeColors: [16],
				ditherMethod: 'FloydSteinberg'
			};
			const result = processImageSync(sourceBytes, merged);
			const png = PNG.sync.read(Buffer.from(result.data));
			expect(png.width, `${src}: width mismatch`).toBe(result.width);
			expect(png.height, `${src}: height mismatch`).toBe(result.height);
		}
	});

	it('reduces to 8 colors with Riemersma dither', () => {
		for (const src of SOURCE_FILES) {
			const sourceBytes = readSource(src);
			const merged: MagickSettings = {
				...baseSettings(),
				quantizeColors: [8],
				ditherMethod: 'Riemersma'
			};
			const result = processImageSync(sourceBytes, merged);
			const png = PNG.sync.read(Buffer.from(result.data));
			const colors = countUniqueColors(png);
			expect(colors, `${src}: expected <= 8 colors, got ${colors}`).toBeLessThanOrEqual(8);
		}
	});
});

describe('Combined operations', () => {
	it('resize + rotate + sepia', () => {
		testOperation(
			'combined',
			'source-100x100.png',
			'source-100x100-resize50-rotate90-sepia80.png',
			{
				resizeW: 50,
				resizeH: 50,
				rotate: '90',
				effect: 'sepia',
				sepiaThreshold: [80]
			}
		);
	});
});

describe('Annotation operations', () => {
	it('annotate default (Center, white 24pt)', () => {
		if (skipIfNoFont()) return;
		testAllSources(
			'annotate',
			'{base}-default.png',
			{
				annotateFontFamily: DEFAULT_FONT,
				annotateText: 'Hello',
				annotateFontSize: [24],
				annotateFontColor: '#ffffff',
				annotateGravity: 'Center',
				annotateAngle: [0]
			},
			0.1,
			5000
		);
	});

	it('annotate with angle', () => {
		if (skipIfNoFont()) return;
		testAllSources(
			'annotate',
			'{base}-angle.png',
			{
				annotateFontFamily: DEFAULT_FONT,
				annotateText: 'Rotated',
				annotateFontSize: [36],
				annotateFontColor: '#e74c3c',
				annotateGravity: 'Center',
				annotateAngle: [45]
			},
			0.1,
			8000
		);
	});

	it('annotate with stroke', () => {
		if (skipIfNoFont()) return;
		testAllSources(
			'annotate',
			'{base}-stroke.png',
			{
				annotateFontFamily: DEFAULT_FONT,
				annotateText: 'Outline',
				annotateFontSize: [48],
				annotateFontColor: '#3498db',
				annotateStroke: true,
				annotateStrokeColor: '#000000',
				annotateStrokeWidth: [2],
				annotateGravity: 'Center',
				annotateAngle: [0]
			},
			0.1,
			8000
		);
	});

	it('annotate northwest position', () => {
		if (skipIfNoFont()) return;
		testAllSources(
			'annotate',
			'{base}-northwest.png',
			{
				annotateFontFamily: DEFAULT_FONT,
				annotateText: 'Top Left',
				annotateFontSize: [20],
				annotateFontColor: '#2ecc71',
				annotateGravity: 'Northwest',
				annotateAngle: [0]
			},
			0.1,
			8000
		);
	});

	it('annotate center with offset', () => {
		if (skipIfNoFont()) return;
		testAllSources(
			'annotate',
			'{base}-center-offset.png',
			{
				annotateFontFamily: DEFAULT_FONT,
				annotateText: 'Offset',
				annotateFontSize: [24],
				annotateFontColor: '#f39c12',
				annotateGravity: 'Center',
				annotateOffsetX: 30,
				annotateOffsetY: 20,
				annotateAngle: [0]
			},
			0.1,
			8000
		);
	});

	it('annotate northwest with offset', () => {
		if (skipIfNoFont()) return;
		testAllSources(
			'annotate',
			'{base}-northwest-offset.png',
			{
				annotateFontFamily: DEFAULT_FONT,
				annotateText: 'NW Offset',
				annotateFontSize: [20],
				annotateFontColor: '#9b59b6',
				annotateGravity: 'Northwest',
				annotateOffsetX: 10,
				annotateOffsetY: 10,
				annotateAngle: [0]
			},
			0.1,
			8000
		);
	});
});

describe('Export operations', () => {
	it('strip metadata', () => {
		testAllSources('strip', '{base}.png', { stripMeta: true });
	});

	it('format conversion (PNG to WebP)', () => {
		testAllSources(
			'format-conversion',
			'{base}-to-webp.webp',
			{
				imageFormat: 'WebP',
				quality: [85]
			},
			0.05,
			5
		);
	});

	it('format conversion (PNG to JPEG)', () => {
		testAllSources(
			'format-conversion',
			'{base}-to-jpeg.jpg',
			{
				imageFormat: 'JPEG',
				quality: [85]
			},
			0.05,
			0
		);
	});

	it('quality', () => {
		testAllSources(
			'quality',
			'{base}-q75.jpg',
			{
				imageFormat: 'JPEG',
				quality: [75]
			},
			0.05,
			50
		);
	});
});
