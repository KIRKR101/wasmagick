import { describe, it, expect, beforeEach } from 'vitest';
import { useMagick, type MagickState } from './useMagick.svelte';
import type { MagickSettings } from './types';
import { isColorDirty } from './utils';

describe('MagickState', () => {
	let magick: MagickState;

	beforeEach(() => {
		magick = useMagick();
	});

	describe('hexToRgb', () => {
		it('should convert 6-digit hex to RGB', () => {
			const result = magick.hexToRgb('#ff0000');
			expect(result).toEqual({ r: 255, g: 0, b: 0 });
		});

		it('should convert 3-digit hex to RGB', () => {
			const result = magick.hexToRgb('#fff');
			expect(result).toEqual({ r: 255, g: 255, b: 255 });
		});

		it('should convert hex without hash to RGB', () => {
			const result = magick.hexToRgb('00ff00');
			expect(result).toEqual({ r: 0, g: 255, b: 0 });
		});

		it('should handle black color', () => {
			const result = magick.hexToRgb('#000000');
			expect(result).toEqual({ r: 0, g: 0, b: 0 });
		});

		it('should handle white color without hash', () => {
			const result = magick.hexToRgb('ffffff');
			expect(result).toEqual({ r: 255, g: 255, b: 255 });
		});

		it('should handle blue color', () => {
			const result = magick.hexToRgb('#0000ff');
			expect(result).toEqual({ r: 0, g: 0, b: 255 });
		});

		it('should handle gray color', () => {
			const result = magick.hexToRgb('#808080');
			expect(result).toEqual({ r: 128, g: 128, b: 128 });
		});
	});

	describe('resetExport', () => {
		it('should reset export settings', () => {
			magick.settings.imageFormat = 'PNG';
			magick.settings.quality = [50];
			magick.settings.stripMeta = false;

			magick.resetExport();

			expect(magick.settings.imageFormat).toBe('WebP');
			expect(magick.settings.quality).toEqual([85]);
			expect(magick.settings.stripMeta).toBe(true);
		});
	});

	describe('hexToRgb edge cases', () => {
		it('should handle invalid hex without crashing', () => {
			const result = magick.hexToRgb('#xyz');
			expect(Number.isNaN(result.r) || result.r === 0).toBe(true);
		});

		it('should handle empty string edge case', () => {
			const result = magick.hexToRgb('');
			expect(result.r).toBeLessThanOrEqual(0);
		});
	});

	describe('clearSource', () => {
		it('should clear source bytes and URLs', () => {
			magick.sourceBytes = new Uint8Array([1, 2, 3]);
			magick.originalImageUrl = 'blob:http://test';

			magick.clearSource();

			expect(magick.sourceBytes).toBeNull();
			expect(magick.originalImageUrl).toBeNull();
		});
	});

	describe('resetGeometry', () => {
		it('should reset all geometry settings', () => {
			magick.settings.resizeW = 800;
			magick.settings.resizeH = 600;
			magick.settings.rotate = '90';
			magick.settings.flip = true;
			magick.settings.flop = true;

			magick.resetGeometry();

			expect(magick.settings.resizeW).toBeNull();
			expect(magick.settings.resizeH).toBeNull();
			expect(magick.settings.rotate).toBe('0');
			expect(magick.settings.flip).toBe(false);
			expect(magick.settings.flop).toBe(false);
		});
	});

	describe('resetColor', () => {
		it('should reset all color settings', () => {
			magick.settings.brightness = [150];
			magick.settings.saturation = [200];
			magick.settings.hue = [50];
			magick.settings.contrast = [25];
			magick.settings.normalizeImage = true;
			magick.settings.colorSpace = 'Gray';
			magick.settings.levelBlackpoint = { All: [10], Red: [20], Green: [30], Blue: [40] };
			magick.settings.levelWhitepoint = { All: [90], Red: [80], Green: [70], Blue: [60] };
			magick.settings.levelGamma = { All: [1.2], Red: [1.3], Green: [1.4], Blue: [1.5] };

			magick.resetColor();

			expect(magick.settings.brightness).toEqual([100]);
			expect(magick.settings.saturation).toEqual([100]);
			expect(magick.settings.hue).toEqual([100]);
			expect(magick.settings.contrast).toEqual([0]);
			expect(magick.settings.normalizeImage).toBe(false);
			expect(magick.settings.colorSpace).toBe('RGB');
			expect(magick.settings.levelBlackpoint).toEqual({
				All: [0],
				Red: [0],
				Green: [0],
				Blue: [0]
			});
			expect(magick.settings.levelWhitepoint).toEqual({
				All: [100],
				Red: [100],
				Green: [100],
				Blue: [100]
			});
			expect(magick.settings.levelGamma).toEqual({
				All: [1.0],
				Red: [1.0],
				Green: [1.0],
				Blue: [1.0]
			});
		});
	});
	describe('resetSettings', () => {
		it('should reset all settings', () => {
			magick.settings.resizeW = 800;
			magick.settings.imageFormat = 'PNG';
			magick.settings.brightness = [150];
			magick.settings.effect = 'grayscale';

			magick.resetSettings();

			expect(magick.settings.resizeW).toBeNull();
			expect(magick.settings.imageFormat).toBe('WebP');
			expect(magick.settings.brightness).toEqual([100]);
			expect(magick.settings.effect).toBe('none');
		});
	});

	describe('state initialization', () => {
		it('should initialize with correct default values', () => {
			expect(magick.wasmLoaded).toBe(false);
			expect(magick.isLoading).toBe(false);
			expect(magick.statsMessage).toBe('Ready');
			expect(magick.sourceBytes).toBeNull();
			expect(magick.originalImageUrl).toBeNull();
			expect(magick.processedImageUrl).toBeNull();
		});

		it('should have correct default settings', () => {
			expect(magick.settings.imageFormat).toBe('WebP');
			expect(magick.settings.quality).toEqual([85]);
			expect(magick.settings.stripMeta).toBe(true);
			expect(magick.settings.rotate).toBe('0');
			expect(magick.settings.effect).toBe('none');
		});

		it('should have per-channel level defaults', () => {
			expect(magick.settings.levelBlackpoint).toEqual({
				All: [0],
				Red: [0],
				Green: [0],
				Blue: [0]
			});
			expect(magick.settings.levelWhitepoint).toEqual({
				All: [100],
				Red: [100],
				Green: [100],
				Blue: [100]
			});
			expect(magick.settings.levelGamma).toEqual({
				All: [1.0],
				Red: [1.0],
				Green: [1.0],
				Blue: [1.0]
			});
		});
	});

	describe('per-channel level settings', () => {
		it('should allow independent per-channel level values', () => {
			magick.settings.levelBlackpoint.Red = [25];
			magick.settings.levelWhitepoint.Red = [75];
			magick.settings.levelGamma.Red = [1.5];

			expect(magick.settings.levelBlackpoint.All).toEqual([0]);
			expect(magick.settings.levelBlackpoint.Green).toEqual([0]);
			expect(magick.settings.levelBlackpoint.Blue).toEqual([0]);
			expect(magick.settings.levelBlackpoint.Red).toEqual([25]);

			expect(magick.settings.levelWhitepoint.Red).toEqual([75]);
			expect(magick.settings.levelGamma.Red).toEqual([1.5]);
		});

		it('should allow all channels to be set independently', () => {
			magick.settings.levelBlackpoint = {
				All: [5],
				Red: [10],
				Green: [15],
				Blue: [20]
			};
			magick.settings.levelWhitepoint = {
				All: [95],
				Red: [90],
				Green: [85],
				Blue: [80]
			};
			magick.settings.levelGamma = {
				All: [1.1],
				Red: [1.2],
				Green: [1.3],
				Blue: [1.4]
			};

			expect(magick.settings.levelBlackpoint.All[0]).toBe(5);
			expect(magick.settings.levelBlackpoint.Red[0]).toBe(10);
			expect(magick.settings.levelBlackpoint.Green[0]).toBe(15);
			expect(magick.settings.levelBlackpoint.Blue[0]).toBe(20);
			expect(magick.settings.levelWhitepoint.All[0]).toBe(95);
			expect(magick.settings.levelWhitepoint.Red[0]).toBe(90);
			expect(magick.settings.levelGamma.All[0]).toBe(1.1);
			expect(magick.settings.levelGamma.Blue[0]).toBe(1.4);
		});
	});

	describe('isColorDirty with per-channel levels', () => {
		it('should return false when all level channels are at defaults', () => {
			expect(isColorDirty(magick.settings)).toBe(false);
		});

		it('should return true when All channel blackpoint is changed', () => {
			magick.settings.levelBlackpoint.All = [5];
			expect(isColorDirty(magick.settings)).toBe(true);
		});

		it('should return true when Red channel whitepoint is changed', () => {
			magick.settings.levelWhitepoint.Red = [90];
			expect(isColorDirty(magick.settings)).toBe(true);
		});

		it('should return true when Green channel gamma is changed', () => {
			magick.settings.levelGamma.Green = [1.5];
			expect(isColorDirty(magick.settings)).toBe(true);
		});

		it('should return true when Blue channel blackpoint is changed', () => {
			magick.settings.levelBlackpoint.Blue = [50];
			expect(isColorDirty(magick.settings)).toBe(true);
		});

		it('should become false after resetting per-channel values', () => {
			magick.settings.levelBlackpoint.Red = [25];
			expect(isColorDirty(magick.settings)).toBe(true);
			magick.settings.levelBlackpoint.Red = [0];
			expect(isColorDirty(magick.settings)).toBe(false);
		});
	});

	describe('new feature defaults', () => {
		it('should have correct crop defaults', () => {
			expect(magick.settings.cropW).toBeNull();
			expect(magick.settings.cropH).toBeNull();
			expect(magick.settings.cropGravity).toBe('Center');
			expect(magick.settings.trimEdges).toBe(false);
		});

		it('should have correct shave defaults', () => {
			expect(magick.settings.shaveX).toBeNull();
			expect(magick.settings.shaveY).toBeNull();
		});

		it('should have correct adaptive sharpen/blur defaults', () => {
			expect(magick.settings.adaptiveSharpenRadius).toEqual([0]);
			expect(magick.settings.adaptiveSharpenSigma).toEqual([1]);
			expect(magick.settings.adaptiveBlurRadius).toEqual([0]);
			expect(magick.settings.adaptiveBlurSigma).toEqual([1]);
		});

		it('should have correct auto gamma/threshold defaults', () => {
			expect(magick.settings.autoGamma).toBe(false);
			expect(magick.settings.autoThreshold).toBe('Off');
			expect(magick.settings.blackThreshold).toEqual([0]);
			expect(magick.settings.whiteThreshold).toEqual([100]);
		});

		it('should have correct CLAHE defaults', () => {
			expect(magick.settings.claheXTiles).toEqual([0]);
			expect(magick.settings.claheYTiles).toEqual([0]);
			expect(magick.settings.claheBins).toEqual([128]);
			expect(magick.settings.claheClipLimit).toEqual([2]);
		});

		it('should have correct advanced blur/noise defaults', () => {
			expect(magick.settings.gaussianBlurRadius).toEqual([0]);
			expect(magick.settings.gaussianBlurSigma).toEqual([1]);
			expect(magick.settings.motionBlurRadius).toEqual([0]);
			expect(magick.settings.motionBlurSigma).toEqual([1]);
			expect(magick.settings.motionBlurAngle).toEqual([0]);
			expect(magick.settings.addNoiseType).toBe('Off');
			expect(magick.settings.addNoiseAttenuate).toEqual([1]);
		});
	});

	describe('resetGeometry with crop/trim', () => {
		it('should reset crop and trim settings', () => {
			magick.settings.cropW = 100;
			magick.settings.cropH = 100;
			magick.settings.cropGravity = 'Northwest';
			magick.settings.trimEdges = true;
			magick.settings.shaveX = 10;
			magick.settings.shaveY = 5;

			magick.resetGeometry();

			expect(magick.settings.cropW).toBeNull();
			expect(magick.settings.cropH).toBeNull();
			expect(magick.settings.cropGravity).toBe('Center');
			expect(magick.settings.trimEdges).toBe(false);
			expect(magick.settings.shaveX).toBeNull();
			expect(magick.settings.shaveY).toBeNull();
		});
	});

	describe('resetFilters with adaptive sharpen/blur', () => {
		it('should reset adaptive sharpen and blur settings', () => {
			magick.settings.adaptiveSharpenRadius = [3];
			magick.settings.adaptiveSharpenSigma = [2];
			magick.settings.adaptiveBlurRadius = [4];
			magick.settings.adaptiveBlurSigma = [1.5];

			magick.resetFilters();

			expect(magick.settings.adaptiveSharpenRadius).toEqual([0]);
			expect(magick.settings.adaptiveSharpenSigma).toEqual([1]);
			expect(magick.settings.adaptiveBlurRadius).toEqual([0]);
			expect(magick.settings.adaptiveBlurSigma).toEqual([1]);
		});
	});

	describe('resetColor with auto/threshold/CLAHE settings', () => {
		it('should reset auto gamma/threshold settings', () => {
			magick.settings.autoGamma = true;
			magick.settings.autoThreshold = 'OTSU';
			magick.settings.blackThreshold = [20];
			magick.settings.whiteThreshold = [80];

			magick.resetColor();

			expect(magick.settings.autoGamma).toBe(false);
			expect(magick.settings.autoThreshold).toBe('Off');
			expect(magick.settings.blackThreshold).toEqual([0]);
			expect(magick.settings.whiteThreshold).toEqual([100]);
		});

		it('should reset CLAHE settings', () => {
			magick.settings.claheXTiles = [8];
			magick.settings.claheYTiles = [8];
			magick.settings.claheBins = [256];
			magick.settings.claheClipLimit = [4];

			magick.resetColor();

			expect(magick.settings.claheXTiles).toEqual([0]);
			expect(magick.settings.claheYTiles).toEqual([0]);
			expect(magick.settings.claheBins).toEqual([128]);
			expect(magick.settings.claheClipLimit).toEqual([2]);
		});
	});

	describe('resetFilters with advanced blur/noise settings', () => {
		it('should reset gaussian/motion blur and noise settings', () => {
			magick.settings.gaussianBlurRadius = [3];
			magick.settings.gaussianBlurSigma = [2];
			magick.settings.motionBlurRadius = [4];
			magick.settings.motionBlurSigma = [1.5];
			magick.settings.motionBlurAngle = [45];
			magick.settings.addNoiseType = 'Gaussian';
			magick.settings.addNoiseAttenuate = [0.5];

			magick.resetFilters();

			expect(magick.settings.gaussianBlurRadius).toEqual([0]);
			expect(magick.settings.gaussianBlurSigma).toEqual([1]);
			expect(magick.settings.motionBlurRadius).toEqual([0]);
			expect(magick.settings.motionBlurSigma).toEqual([1]);
			expect(magick.settings.motionBlurAngle).toEqual([0]);
			expect(magick.settings.addNoiseType).toBe('Off');
			expect(magick.settings.addNoiseAttenuate).toEqual([1]);
		});
	});
});

describe('MagickSettings type', () => {
	it('should have all required properties', () => {
		const settings: MagickSettings = {
			imageFormat: 'WebP',
			quality: [85],
			stripMeta: true,
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

		expect(settings.imageFormat).toBe('WebP');
		expect(settings.quality[0]).toBe(85);
	});
});
