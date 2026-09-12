import { describe, it, expect } from 'vitest';
import { buildNativeMagickArgs, outputExtensionForFormat, NATIVE_TOKENS } from './magick-args';
import type { MagickSettings } from './types';

// Full-settings baseline mirroring DEFAULT_SETTINGS (kept local so this test
// never initializes the WASM engine).
function baseSettings(): MagickSettings {
	return {
		imageFormat: 'PNG',
		quality: [100],
		stripMeta: false,
		resizeW: null,
		resizeH: null,
		rotate: '0',
		flop: false,
		flip: false,
		borderColor: '#ffffff',
		borderSize: [0],
		extentW: null,
		extentH: null,
		extentGravity: 'Center',
		extentBgColor: '#ffffff',
		deskewThreshold: [0],
		deskewAutoCrop: false,
		cropW: null,
		cropH: null,
		cropGravity: 'Center',
		cropX: null,
		cropY: null,
		trimEdges: false,
		shaveX: null,
		shaveY: null,
		brightness: [100],
		saturation: [100],
		hue: [100],
		contrast: [0],
		normalizeImage: false,
		autoLevel: false,
		autoOrient: false,
		levelBlackpoint: { All: [0], Red: [0], Green: [0], Blue: [0] },
		levelWhitepoint: { All: [100], Red: [100], Green: [100], Blue: [100] },
		levelGamma: { All: [1.0], Red: [1.0], Green: [1.0], Blue: [1.0] },
		levelChannels: 'All',
		levelColorsBlack: '#000000',
		levelColorsWhite: '#ffffff',
		levelColorsChannels: 'All',
		levelColorsInverse: false,
		thresholdPercentage: [50],
		thresholdChannels: 'All',
		sigmoidalContrast: [0],
		sigmoidalMidpoint: [50],
		sigmoidalChannels: 'All',
		colorSpace: 'RGB',
		autoGamma: false,
		autoThreshold: 'Off',
		blackThreshold: [0],
		whiteThreshold: [100],
		claheXTiles: [0],
		claheYTiles: [0],
		claheBins: [128],
		claheClipLimit: [2],
		effect: 'none',
		blur: [0],
		sharpen: [0],
		gaussianBlurRadius: [0],
		gaussianBlurSigma: [1],
		motionBlurRadius: [0],
		motionBlurSigma: [1],
		motionBlurAngle: [0],
		addNoiseType: 'Off',
		addNoiseAttenuate: [1],
		adaptiveSharpenRadius: [0],
		adaptiveSharpenSigma: [1],
		adaptiveBlurRadius: [0],
		adaptiveBlurSigma: [1],
		sepiaThreshold: [80],
		charcoalIntensity: [0],
		cannyEdgeStrength: [0],
		cannyEdgeLower: [10],
		cannyEdgeUpper: [30],
		oilpaintRadius: [0],
		solarizeFactor: [50],
		bilateralWidth: [0],
		bilateralHeight: [0],
		bilateralIntensitySigma: [1.5],
		bilateralSpatialSigma: [1],
		clutMap: 'identity',
		clutInterpolation: 'catrom',
		quantizeColors: [0],
		ditherMethod: 'Riemersma',
		quantizeColorSpace: 'sRGB',
		quantizeTreeDepth: [0],
		measureErrors: false,
		annotateText: '',
		annotateFontFamily: 'Roboto-Regular',
		annotateFontSize: [24],
		annotateFontColor: '#ffffff',
		annotateGravity: 'Center',
		annotateOffsetX: 0,
		annotateOffsetY: 0,
		annotateAngle: [0],
		annotateStroke: false,
		annotateStrokeColor: '#000000',
		annotateStrokeWidth: [1]
	};
}

function build(partial: Partial<MagickSettings>, dims = {}) {
	return buildNativeMagickArgs({ ...baseSettings(), ...partial }, dims);
}

describe('outputExtensionForFormat', () => {
	it('maps export formats to file extensions', () => {
		expect(outputExtensionForFormat('WebP')).toBe('webp');
		expect(outputExtensionForFormat('JPEG')).toBe('jpg');
		expect(outputExtensionForFormat('PNG')).toBe('png');
		expect(outputExtensionForFormat('AVIF')).toBe('avif');
		expect(outputExtensionForFormat('JXL')).toBe('jxl');
		expect(outputExtensionForFormat('TIFF')).toBe('tiff');
		expect(outputExtensionForFormat('GIF')).toBe('gif');
	});
});

describe('buildNativeMagickArgs', () => {
	it('emits nothing but quality for default settings', () => {
		const result = build({});
		expect(result.args).toEqual(['-quality', '100']);
		expect(result.needsClut).toBeNull();
		expect(result.needsFont).toBeNull();
		expect(result.outputExtension).toBe('png');
	});

	it('matches golden resize/rotate/flip/flop flags', () => {
		expect(build({ resizeW: 50, resizeH: 50 }).args).toContain('-resize');
		expect(build({ resizeW: 50, resizeH: 50 }).args).toContain('50x50');
		expect(build({ resizeW: 50, resizeH: null }).args).toContain('50x');
		expect(build({ rotate: '90' }).args).toEqual(
			expect.arrayContaining(['-rotate', '90', '-quality', '100'])
		);
		expect(build({ flip: true }).args).toContain('-flip');
		expect(build({ flop: true }).args).toContain('-flop');
	});

	it('matches golden crop flags', () => {
		const r = build({ cropW: 60, cropH: 60, cropGravity: 'Northwest' });
		expect(r.args).toEqual(
			expect.arrayContaining(['-gravity', 'Northwest', '-crop', '60x60+0+0', '+repage'])
		);
		const visual = build({ cropX: 10, cropY: 20, cropW: 60, cropH: 60 });
		expect(visual.args).toContain('-crop');
		expect(visual.args).toContain('60x60+10+20');
	});

	it('matches golden trim/shave/extent/border/deskew flags', () => {
		expect(build({ trimEdges: true }).args).toContain('-trim');
		expect(build({ shaveX: 10, shaveY: 5 }).args).toEqual(
			expect.arrayContaining(['-shave', '10x5'])
		);
		expect(
			build({ extentW: 120, extentH: 120, extentGravity: 'Center', extentBgColor: '#ffffff' }).args
		).toEqual(
			expect.arrayContaining(['-gravity', 'Center', '-background', '#ffffff', '-extent', '120x120'])
		);
		expect(build({ borderSize: [5], borderColor: '#e74c3c' }).args).toEqual(
			expect.arrayContaining(['-bordercolor', '#e74c3c', '-border', '5x5'])
		);
		expect(build({ deskewThreshold: [20] }).args).toEqual(
			expect.arrayContaining(['-deskew', '20%'])
		);
	});

	it('matches golden color flags', () => {
		expect(build({ brightness: [120], saturation: [150], hue: [110] }).args).toEqual(
			expect.arrayContaining(['-modulate', '120,150,110'])
		);
		expect(build({ contrast: [30] }).args).toEqual(
			expect.arrayContaining(['-brightness-contrast', '0,30'])
		);
		expect(build({ normalizeImage: true }).args).toContain('-normalize');
		expect(build({ autoLevel: true }).args).toContain('-auto-level');
		expect(build({ autoOrient: true }).args).toContain('-auto-orient');
		expect(build({ autoGamma: true }).args).toEqual(
			expect.arrayContaining(['-channel', 'RGB', '-auto-gamma', '+channel'])
		);
	});

	it('emits level and level-colors with channel handling', () => {
		const level = build({
			levelBlackpoint: { All: [10], Red: [0], Green: [0], Blue: [0] },
			levelWhitepoint: { All: [90], Red: [100], Green: [100], Blue: [100] },
			levelGamma: { All: [1.2], Red: [1.0], Green: [1.0], Blue: [1.0] }
		});
		expect(level.args).toEqual(expect.arrayContaining(['-level', '10%,90%,1.2']));

		const lc = build({ levelColorsBlack: '#e74c3c', levelColorsWhite: '#3498db' });
		expect(lc.args).toEqual(
			expect.arrayContaining(['-channel', 'RGB', '-level-colors', '#e74c3c,#3498db', '+channel'])
		);
		const inv = build({
			levelColorsBlack: '#e74c3c',
			levelColorsWhite: '#3498db',
			levelColorsInverse: true
		});
		expect(inv.args).toContain('+level-colors');
	});

	it('matches golden threshold/sigmoidal/colorspace flags', () => {
		expect(build({ thresholdPercentage: [60] }).args).toEqual(
			expect.arrayContaining(['-threshold', '60%'])
		);
		expect(build({ sigmoidalContrast: [5], sigmoidalMidpoint: [50] }).args).toEqual(
			expect.arrayContaining(['-sigmoidal-contrast', '5,50'])
		);
		expect(build({ colorSpace: 'Gray' }).args).toEqual(
			expect.arrayContaining(['-colorspace', 'Gray'])
		);
		expect(build({ blackThreshold: [20] }).args).toEqual(
			expect.arrayContaining(['-channel', 'RGB', '-black-threshold', '20%', '+channel'])
		);
		expect(build({ whiteThreshold: [80] }).args).toEqual(
			expect.arrayContaining(['-channel', 'RGB', '-white-threshold', '80%', '+channel'])
		);
		expect(build({ autoThreshold: 'Kapur' }).args).toEqual(
			expect.arrayContaining(['-auto-threshold', 'Kapur'])
		);
		expect(
			build({ claheXTiles: [8], claheYTiles: [8], claheBins: [128], claheClipLimit: [2] }).args
		).toEqual(expect.arrayContaining(['-clahe', '8x8+128+2']));
	});

	it('matches golden effect flags (incl. -paint for oilpaint)', () => {
		expect(build({ effect: 'grayscale' }).args).toEqual(
			expect.arrayContaining(['-grayscale', 'Rec709Luminance'])
		);
		expect(build({ effect: 'sepia', sepiaThreshold: [80] }).args).toEqual(
			expect.arrayContaining(['-sepia-tone', '80%'])
		);
		expect(build({ effect: 'charcoal', charcoalIntensity: [2] }).args).toEqual(
			expect.arrayContaining(['-charcoal', '2'])
		);
		expect(build({ effect: 'negate' }).args).toEqual(
			expect.arrayContaining(['-channel', 'RGB', '-negate', '+channel'])
		);
		expect(
			build({
				effect: 'cannyEdge',
				cannyEdgeStrength: [50],
				cannyEdgeLower: [10],
				cannyEdgeUpper: [30]
			}).args
		).toEqual(expect.arrayContaining(['-canny', '2x0.75+10%+30%']));
		expect(build({ effect: 'oilpaint', oilpaintRadius: [3] }).args).toEqual(
			expect.arrayContaining(['-paint', '3'])
		);
		expect(build({ effect: 'solarize', solarizeFactor: [50] }).args).toEqual(
			expect.arrayContaining(['-channel', 'RGB', '-solarize', '50%', '+channel'])
		);
		expect(
			build({
				effect: 'bilateralBlur',
				bilateralWidth: [5],
				bilateralHeight: [5],
				bilateralIntensitySigma: [1.5],
				bilateralSpatialSigma: [1]
			}).args
		).toEqual(expect.arrayContaining(['-bilateral-blur', '5x5+1.5+1']));
	});

	it('matches golden blur/sharpen/noise flags', () => {
		expect(build({ blur: [3] }).args).toEqual(expect.arrayContaining(['-blur', '3x1.5']));
		expect(build({ sharpen: [2] }).args).toEqual(expect.arrayContaining(['-sharpen', '2x1']));
		expect(build({ adaptiveSharpenRadius: [2], adaptiveSharpenSigma: [1] }).args).toEqual(
			expect.arrayContaining(['-adaptive-sharpen', '2x1'])
		);
		expect(build({ adaptiveBlurRadius: [2], adaptiveBlurSigma: [1] }).args).toEqual(
			expect.arrayContaining(['-adaptive-blur', '2x1'])
		);
		expect(build({ gaussianBlurRadius: [3], gaussianBlurSigma: [1.5] }).args).toEqual(
			expect.arrayContaining(['-gaussian-blur', '3x1.5'])
		);
		expect(
			build({ motionBlurRadius: [3], motionBlurSigma: [1.5], motionBlurAngle: [45] }).args
		).toEqual(expect.arrayContaining(['-motion-blur', '3x1.5+45']));
		expect(build({ addNoiseType: 'Gaussian', addNoiseAttenuate: [1] }).args).toEqual(
			expect.arrayContaining(['-attenuate', '1', '+noise', 'Gaussian'])
		);
		// Poisson slider is inverted (higher slider = more noise).
		expect(build({ addNoiseType: 'Poisson', addNoiseAttenuate: [0.5] }).args).toEqual(
			expect.arrayContaining(['-attenuate', '2', '+noise', 'Poisson'])
		);
		// CLI spells MultiplicativeGaussian as Multiplicative.
		expect(build({ addNoiseType: 'MultiplicativeGaussian', addNoiseAttenuate: [1] }).args).toEqual(
			expect.arrayContaining(['+noise', 'Multiplicative'])
		);
	});

	it('requests CLUT bytes and emits the CLUT token', () => {
		const r = build({ clutMap: 'warm', clutInterpolation: 'catrom' });
		expect(r.needsClut).toBe('warm');
		expect(r.args).toEqual(
			expect.arrayContaining([NATIVE_TOKENS.CLUT, '-clut', '-interpolate', 'Catrom'])
		);
		expect(r.args.indexOf('-interpolate')).toBeLessThan(r.args.indexOf('-clut'));
	});

	it('preserves the selected level-colors channel', () => {
		const r = build({
			levelColorsChannels: 'Red',
			levelColorsBlack: '#e74c3c',
			levelColorsWhite: '#3498db'
		});
		expect(r.args).toEqual(
			expect.arrayContaining(['-channel', 'R', '-level-colors', '#e74c3c,#3498db', '+channel'])
		);
	});

	it('emits quantize flags', () => {
		const r = build({ quantizeColors: [16] });
		expect(r.args).toEqual(expect.arrayContaining(['-dither', 'Riemersma', '-colors', '16']));
		expect(build({ quantizeColors: [16], ditherMethod: 'No' }).args).toContain('None');
		expect(build({ quantizeColors: [8], quantizeTreeDepth: [4] }).args).toEqual(
			expect.arrayContaining(['-treedepth', '4'])
		);
	});

	it('matches golden annotate flags and requests font bytes', () => {
		const r = build({ annotateText: 'Hello' });
		expect(r.needsFont).toBe('Roboto-Regular');
		expect(r.args).toEqual(
			expect.arrayContaining([
				'-font',
				NATIVE_TOKENS.FONT,
				'-pointsize',
				'24',
				'-fill',
				'#ffffff',
				'-gravity',
				'Center',
				'-annotate',
				'0',
				'Hello'
			])
		);
		const angled = build({
			annotateText: 'Rotated',
			annotateFontSize: [36],
			annotateFontColor: '#e74c3c',
			annotateAngle: [45]
		});
		expect(angled.args).toContain('45');
		const stroked = build({
			annotateText: 'Outline',
			annotateStroke: true,
			annotateStrokeColor: '#000000',
			annotateStrokeWidth: [2]
		});
		expect(stroked.args).toEqual(
			expect.arrayContaining(['-stroke', '#000000', '-strokewidth', '2'])
		);
		const offset = build({
			annotateText: 'Offset',
			annotateOffsetX: 30,
			annotateOffsetY: 20
		});
		expect(offset.args).toContain('+30+20');
	});

	it('emits strip and quality last', () => {
		const r = build({ stripMeta: true, quality: [85], imageFormat: 'WebP' });
		expect(r.args).toContain('-strip');
		expect(r.args.slice(-2)).toEqual(['-quality', '85']);
		expect(r.outputExtension).toBe('webp');
	});

	it('keeps operation order: resize before modulate before blur', () => {
		const r = build({
			resizeW: 50,
			resizeH: 50,
			brightness: [120],
			saturation: [150],
			hue: [110],
			blur: [3]
		});
		const order = ['-resize', '-modulate', '-blur'].map((flag) => r.args.indexOf(flag));
		expect(order).toEqual([...order].sort((a, b) => a - b));
		expect(order.every((i) => i >= 0)).toBe(true);
	});
});
