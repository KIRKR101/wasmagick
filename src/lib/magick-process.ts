import {
	ImageMagick,
	MagickFormat,
	MagickColor,
	Drawables,
	Percentage,
	MagickGeometry,
	Gravity,
	Channels,
	ColorSpace,
	PixelIntensityMethod,
	QuantizeSettings,
	DitherMethod,
	NoiseType,
	AutoThresholdMethod
} from '@imagemagick/magick-wasm';
import type { MagickSettings, LevelChannel } from './types';
import type { IMagickImage } from '@imagemagick/magick-wasm';
import { generateClutImage } from './luts';

const FORMAT_MAP: Record<string, keyof typeof MagickFormat> = {
	WEBP: 'WebP',
	JPEG: 'Jpeg',
	PNG: 'Png',
	AVIF: 'Avif',
	// JXL lossy quality is broken in the bundled ImageMagick 7.1.2-29
	// (magick-wasm 0.0.42): WriteJXLImage double-applies the quality-to-distance
	// conversion, so any quality 1-99 encodes at a catastrophic distance and only
	// lossless (quality 100) works. Kept as-is; tracked upstream at
	// https://github.com/ImageMagick/ImageMagick/issues/8901
	JXL: 'Jxl',
	TIFF: 'Tiff',
	GIF: 'Gif'
};

function hexToRgb(hex: string): { r: number; g: number; b: number } {
	let r = 0,
		g = 0,
		b = 0;
	if (hex.startsWith('#')) hex = hex.slice(1);
	const isValid = /^[0-9a-fA-F]+$/.test(hex) && (hex.length === 3 || hex.length === 6);
	if (!isValid) return { r, g, b };
	if (hex.length === 3) {
		r = parseInt(hex[0] + hex[0], 16);
		g = parseInt(hex[1] + hex[1], 16);
		b = parseInt(hex[2] + hex[2], 16);
	} else if (hex.length === 6) {
		r = parseInt(hex.substring(0, 2), 16);
		g = parseInt(hex.substring(2, 4), 16);
		b = parseInt(hex.substring(4, 6), 16);
	}
	return { r, g, b };
}

/**
 * Map the UI attenuate slider (higher = more noise) to the value ImageMagick's
 * addNoise expects. ImageMagick's Poisson noise sigma is inversely proportional
 * to attenuate, so invert it to keep the slider direction consistent across all
 * noise types.
 */
export function resolveNoiseAttenuate(type: string, attenuate: number): number {
	return type === 'Poisson' ? 1 / Math.max(attenuate, 0.01) : attenuate;
}

export function applyCrop(image: IMagickImage, settings: MagickSettings): boolean {
	const hasVisualCrop = settings.cropX != null || settings.cropY != null;

	if (hasVisualCrop) {
		const cx = Math.max(0, settings.cropX ?? 0);
		const cy = Math.max(0, settings.cropY ?? 0);
		// The crop region must lie at least partially inside the image.
		if (cx >= image.width || cy >= image.height) return false;
		const cw = Math.max(1, Math.min(settings.cropW ?? image.width - cx, image.width - cx));
		const ch = Math.max(1, Math.min(settings.cropH ?? image.height - cy, image.height - cy));
		image.crop(new MagickGeometry(cx, cy, cw, ch));
		// Match the CLI golden fixtures, which all use `-crop ... +repage`:
		// drop the virtual-canvas offset the geometry crop records.
		image.resetPage();
		return true;
	}

	const rawW = settings.cropW;
	const rawH = settings.cropH;

	if ((rawW == null || rawW <= 0) && (rawH == null || rawH <= 0)) {
		return false;
	}

	const cropW = Math.max(1, Math.min(rawW ?? image.width, image.width));
	const cropH = Math.max(1, Math.min(rawH ?? image.height, image.height));
	const gravityKey = settings.cropGravity as keyof typeof Gravity;
	image.crop(cropW, cropH, Gravity[gravityKey]);
	return true;
}

export interface ProcessResult {
	data: Uint8Array;
	width: number;
	height: number;
	format: string;
}

export function processImageSync(sourceBytes: Uint8Array, settings: MagickSettings): ProcessResult {
	let result: ProcessResult = { data: new Uint8Array(), width: 0, height: 0, format: '' };

	ImageMagick.read(sourceBytes, (image) => {
		const resizeW = settings.resizeW ?? 0;
		const resizeH = settings.resizeH ?? 0;

		if (resizeW > 0 || resizeH > 0) {
			image.resize(resizeW, resizeH);
		}

		if (parseInt(settings.rotate) !== 0) {
			image.rotate(parseInt(settings.rotate));
		}

		if (settings.flop) image.flop();
		if (settings.flip) image.flip();

		applyCrop(image, settings);

		if (settings.trimEdges) image.trim();

		const shaveX = Math.min(settings.shaveX ?? 0, Math.floor((image.width - 1) / 2));
		const shaveY = Math.min(settings.shaveY ?? 0, Math.floor((image.height - 1) / 2));
		if (shaveX > 0 || shaveY > 0) {
			image.shave(shaveX, shaveY);
		}

		if (settings.borderSize[0] > 0) {
			const { r, g, b } = hexToRgb(settings.borderColor);
			image.borderColor = new MagickColor(r, g, b);
			image.border(settings.borderSize[0]);
		}

		if ((settings.extentW ?? 0) > 0 || (settings.extentH ?? 0) > 0) {
			const { r, g, b } = hexToRgb(settings.extentBgColor);
			image.backgroundColor = new MagickColor(r, g, b);
			const gravityKey = settings.extentGravity as keyof typeof Gravity;
			image.extent(
				settings.extentW ?? image.width,
				settings.extentH ?? image.height,
				Gravity[gravityKey]
			);
		}

		if (settings.deskewThreshold[0] > 0) {
			image.deskew(new Percentage(settings.deskewThreshold[0]), settings.deskewAutoCrop);
		}

		if (
			settings.brightness[0] !== 100 ||
			settings.saturation[0] !== 100 ||
			settings.hue[0] !== 100
		) {
			image.modulate(
				new Percentage(settings.brightness[0]),
				new Percentage(settings.saturation[0]),
				new Percentage(settings.hue[0])
			);
		}

		if (settings.contrast[0] !== 0) {
			image.brightnessContrast(new Percentage(0), new Percentage(settings.contrast[0]));
		}

		if (settings.normalizeImage) image.normalize();
		if (settings.autoLevel) image.autoLevel();
		if (settings.autoOrient) image.autoOrient();
		if (settings.autoGamma) image.autoGamma();

		{
			const levelChs: LevelChannel[] = ['All', 'Red', 'Green', 'Blue'];
			for (const ch of levelChs) {
				const bp = settings.levelBlackpoint[ch][0];
				const wp = settings.levelWhitepoint[ch][0];
				const gm = settings.levelGamma[ch][0];
				if (bp !== 0 || wp !== 100 || gm !== 1.0) {
					const channel = ch === 'All' ? Channels.All : Channels[ch as keyof typeof Channels];
					image.level(new Percentage(bp), new Percentage(wp), gm, channel as Channels);
				}
			}
		}

		if (
			settings.levelColorsBlack !== '#000000' ||
			settings.levelColorsWhite !== '#ffffff' ||
			settings.levelColorsInverse
		) {
			// Map the 'All' option to the RGB composite (matching the golden
			// fixtures, which use `-channel RGB`): leveling the alpha channel with
			// opaque endpoint colors hits a divide-by-zero edge in the wasm.
			const channel =
				settings.levelColorsChannels === 'All'
					? Channels.RGB
					: Channels[settings.levelColorsChannels as keyof typeof Channels];
			const black = hexToRgb(settings.levelColorsBlack);
			const white = hexToRgb(settings.levelColorsWhite);
			const blackColor = new MagickColor(black.r, black.g, black.b);
			const whiteColor = new MagickColor(white.r, white.g, white.b);
			if (settings.levelColorsInverse) {
				image.inverseLevelColors(blackColor, whiteColor, channel as Channels);
			} else {
				image.levelColors(blackColor, whiteColor, channel as Channels);
			}
		}

		if (settings.thresholdPercentage[0] !== 50) {
			const thresholdChannels =
				settings.thresholdChannels === 'All'
					? Channels.All
					: Channels[settings.thresholdChannels as keyof typeof Channels];
			image.threshold(
				new Percentage(settings.thresholdPercentage[0]),
				thresholdChannels as Channels
			);
		}

		if (settings.blackThreshold[0] > 0) {
			image.blackThreshold(new Percentage(settings.blackThreshold[0]));
		}

		if (settings.whiteThreshold[0] < 100) {
			image.whiteThreshold(new Percentage(settings.whiteThreshold[0]));
		}

		if (settings.sigmoidalContrast[0] !== 0) {
			const sigmoidalChannels =
				settings.sigmoidalChannels === 'All'
					? Channels.All
					: Channels[settings.sigmoidalChannels as keyof typeof Channels];
			const midpoint = settings.sigmoidalMidpoint[0] / 100;
			image.sigmoidalContrast(
				settings.sigmoidalContrast[0],
				midpoint,
				sigmoidalChannels as Channels
			);
		}

		if (settings.colorSpace !== 'RGB') {
			const colorSpaceKey = settings.colorSpace as keyof typeof ColorSpace;
			image.colorSpace = ColorSpace[colorSpaceKey];
		}

		if (settings.autoThreshold !== 'Off') {
			image.autoThreshold(AutoThresholdMethod[settings.autoThreshold]);
		}

		if (settings.claheXTiles[0] > 0) {
			image.clahe(
				settings.claheXTiles[0],
				settings.claheYTiles[0],
				settings.claheBins[0],
				settings.claheClipLimit[0]
			);
		}

		if (settings.blur[0] > 0) {
			image.blur(settings.blur[0], settings.blur[0] / 2);
		}

		if (settings.gaussianBlurRadius[0] > 0) {
			image.gaussianBlur(settings.gaussianBlurRadius[0], settings.gaussianBlurSigma[0]);
		}

		if (settings.sharpen[0] > 0) {
			const radius = settings.sharpen[0];
			image.sharpen(radius, radius / 2);
		}

		if (settings.adaptiveSharpenRadius[0] > 0) {
			image.adaptiveSharpen(settings.adaptiveSharpenRadius[0], settings.adaptiveSharpenSigma[0]);
		}

		if (settings.adaptiveBlurRadius[0] > 0) {
			image.adaptiveBlur(settings.adaptiveBlurRadius[0], settings.adaptiveBlurSigma[0]);
		}

		if (settings.motionBlurRadius[0] > 0) {
			image.motionBlur(
				settings.motionBlurRadius[0],
				settings.motionBlurSigma[0],
				settings.motionBlurAngle[0]
			);
		}

		if (settings.addNoiseType !== 'Off') {
			image.addNoise(
				NoiseType[settings.addNoiseType],
				resolveNoiseAttenuate(settings.addNoiseType, settings.addNoiseAttenuate[0]),
				Channels.All
			);
		}

		if (settings.effect !== 'none') {
			switch (settings.effect) {
				case 'grayscale':
					image.grayscale(PixelIntensityMethod.Rec709Luminance);
					break;
				case 'sepia':
					image.sepiaTone(new Percentage(settings.sepiaThreshold[0]));
					break;
				case 'charcoal': {
					const charcoalRadius = settings.charcoalIntensity[0];
					if (charcoalRadius > 0) {
						image.charcoal(charcoalRadius, charcoalRadius / 2);
					} else {
						image.charcoal();
					}
					break;
				}
				case 'negate':
					image.negate(Channels.RGB);
					break;
				case 'cannyEdge': {
					const radius = (settings.cannyEdgeStrength[0] / 100) * 4;
					const sigma = (settings.cannyEdgeStrength[0] / 100) * 1.5;
					image.cannyEdge(
						radius,
						sigma,
						new Percentage(settings.cannyEdgeLower[0]),
						new Percentage(settings.cannyEdgeUpper[0])
					);
					break;
				}
				case 'oilpaint':
					image.oilPaint(settings.oilpaintRadius[0]);
					break;
				case 'solarize':
					image.solarize(new Percentage(settings.solarizeFactor[0]));
					break;
				case 'bilateralBlur':
					image.bilateralBlur(
						settings.bilateralWidth[0],
						settings.bilateralHeight[0],
						settings.bilateralIntensitySigma[0],
						settings.bilateralSpatialSigma[0]
					);
					break;
			}
		}

		if (settings.clutMap !== 'identity') {
			const lut = generateClutImage(settings.clutMap, settings.clutInterpolation);
			image.clut(lut, lut.interpolate, Channels.RGB);
			lut.dispose();
		}

		if (settings.quantizeColors[0] > 0) {
			const qs = new QuantizeSettings();
			qs.colors = settings.quantizeColors[0];
			qs.colorSpace = ColorSpace[settings.quantizeColorSpace as keyof typeof ColorSpace];
			qs.treeDepth = settings.quantizeTreeDepth[0];
			qs.measureErrors = settings.measureErrors;
			if (settings.ditherMethod !== 'Undefined') {
				qs.ditherMethod = DitherMethod[settings.ditherMethod as keyof typeof DitherMethod];
			}
			image.quantize(qs);
		}

		if (settings.annotateText?.trim().length > 0) {
			try {
				const { r, g, b } = hexToRgb(settings.annotateFontColor);
				const draws = new Drawables();
				if (settings.annotateFontFamily?.trim().length > 0) {
					draws.font(settings.annotateFontFamily);
				}
				draws.fontPointSize(settings.annotateFontSize[0]);
				draws.fillColor(new MagickColor(r, g, b));
				if (settings.annotateStroke && settings.annotateStrokeWidth[0] > 0) {
					const sr = hexToRgb(settings.annotateStrokeColor);
					draws.strokeColor(new MagickColor(sr.r, sr.g, sr.b));
					draws.strokeWidth(settings.annotateStrokeWidth[0]);
				}
				const gravityKey = settings.annotateGravity as keyof typeof Gravity;
				draws.gravity(Gravity[gravityKey]);

				let ox = settings.annotateOffsetX;
				let oy = settings.annotateOffsetY;
				if (gravityKey === 'East' || gravityKey === 'Northeast' || gravityKey === 'Southeast') {
					ox = -ox;
				}
				if (gravityKey === 'South' || gravityKey === 'Southwest' || gravityKey === 'Southeast') {
					oy = -oy;
				}

				const angle = settings.annotateAngle[0];
				if (angle !== 0) {
					const rad = (angle * Math.PI) / 360;
					// magick-wasm's affine(scaleX, scaleY, shearX, shearY, tx, ty) maps to
					// ImageMagick's AffineMatrix { sx, rx, ry, sy, tx, ty }. ImageMagick's
					// -annotate uses a clockwise rotation for positive angles, so shearX
					// and shearY are swapped relative to the standard CCW matrix.
					draws.affine(Math.cos(rad), Math.cos(rad), Math.sin(rad), -Math.sin(rad), 0, 0);
				}

				draws.text(ox, oy, settings.annotateText);
				draws.draw(image);
			} catch (e) {
				console.warn('Annotate failed:', e);
			}
		}

		if (settings.stripMeta) {
			image.strip();
		}

		const formatKey = settings.imageFormat.toUpperCase();
		const magf = FORMAT_MAP[formatKey] || 'WebP';
		image.quality = settings.quality[0];

		const finalWidth = image.width;
		const finalHeight = image.height;

		image.write(MagickFormat[magf], (data) => {
			result = {
				data: new Uint8Array(data),
				width: finalWidth,
				height: finalHeight,
				format: settings.imageFormat
			};
		});
	});

	return result;
}
