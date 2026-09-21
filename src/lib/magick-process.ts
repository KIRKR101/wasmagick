import {
	ImageMagick,
	MagickFormat,
	MagickColor,
	MagickImage,
	CompositeOperator,
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
import type { IMagickImage, IMagickImageCollection } from '@imagemagick/magick-wasm';
import { generateClutImage } from './luts';
import {
	magickFormatForName,
	isSequenceOutputFormat,
	isOpaqueOutputFormat
} from './export-formats';
import { BROWSER_RENDERABLE_FORMATS } from './image-capabilities';

/**
 * Camera RAW extensions need an explicit format when read from a byte array.
 * Several RAW containers begin with a TIFF header, so ImageMagick's automatic
 * sniffing can select TIFF before the DNG/LibRaw coder sees the input. This is
 * especially visible with CR2 files, which then fail with a TIFF directory
 * error even though the WASM binary contains the RAW coder.
 */
const RAW_READ_FORMATS: Record<string, MagickFormat> = {
	'3fr': MagickFormat.ThreeFr,
	arw: MagickFormat.Arw,
	cr2: MagickFormat.Cr2,
	cr3: MagickFormat.Cr3,
	crw: MagickFormat.Crw,
	dcr: MagickFormat.Dcr,
	dng: MagickFormat.Dng,
	erf: MagickFormat.Erf,
	fff: MagickFormat.Fff,
	iiq: MagickFormat.Iiq,
	k25: MagickFormat.K25,
	kdc: MagickFormat.Kdc,
	mef: MagickFormat.Mef,
	mos: MagickFormat.Mos,
	mrw: MagickFormat.Mrw,
	nef: MagickFormat.Nef,
	nrw: MagickFormat.Nrw,
	orf: MagickFormat.Orf,
	pef: MagickFormat.Pef,
	raf: MagickFormat.Raf,
	raw: MagickFormat.Raw,
	rmf: MagickFormat.Rmf,
	rw2: MagickFormat.Rw2,
	rwl: MagickFormat.Rwl,
	sr2: MagickFormat.Sr2,
	srf: MagickFormat.Srf,
	srw: MagickFormat.Srw,
	x3f: MagickFormat.X3f
};

export function rawReadFormatForFilename(filename?: string): MagickFormat | null {
	const extension = String(filename ?? '')
		.toLowerCase()
		.match(/\.([^.]+)$/)?.[1];
	return extension ? (RAW_READ_FORMATS[extension] ?? null) : null;
}

export function readImageWithFilename<T>(
	sourceBytes: Uint8Array,
	inputName: string | undefined,
	callback: (image: IMagickImage) => T
): T {
	const format = rawReadFormatForFilename(inputName);
	return format
		? ImageMagick.read(sourceBytes, format, callback)
		: ImageMagick.read(sourceBytes, callback);
}

/**
 * Still-frame selection for static outputs. Returns the last frame when the
 * output format cannot hold an image sequence and the collection has more
 * than one frame, otherwise null (meaning: write the whole collection).
 *
 * The last coalesced frame is the representative still: disposal-optimized
 * animations often start with a blank transparent frame (cumulative drawing
 * GIFs render nothing at t=0), so exporting the first frame produces an
 * empty white canvas — or an empty transparent canvas where supported.
 */
export function stillFrameForOutput(
	collection: IMagickImageCollection,
	formatName: string
): IMagickImage | null {
	if (collection.length > 1 && !isSequenceOutputFormat(formatName)) {
		return collection[collection.length - 1];
	}
	return null;
}

/**
 * Composite a still frame over an opaque white canvas for output formats
 * without alpha support (JPEG), mirroring the native VIPS `flatten` step.
 * Returns a new image the caller must dispose, unless the format supports
 * alpha — then the input image itself is returned and must NOT be disposed.
 */
export function flattenStillForOutput(image: IMagickImage, formatName: string): IMagickImage {
	if (!isOpaqueOutputFormat(formatName)) return image;
	const canvas = MagickImage.create(new MagickColor(255, 255, 255, 255), image.width, image.height);
	canvas.composite(image, CompositeOperator.Over);
	return canvas;
}

/**
 * Collection variant of `readImageWithFilename`: multi-image inputs (animated
 * GIF/WebP frames, TIFF pages, PSD layers) arrive as one element per
 * frame/layer instead of silently dropping everything after the first.
 */
export function readCollectionWithFilename<T>(
	sourceBytes: Uint8Array,
	inputName: string | undefined,
	callback: (images: IMagickImageCollection) => T
): T {
	const format = rawReadFormatForFilename(inputName);
	return format
		? ImageMagick.readCollection(sourceBytes, format, callback)
		: ImageMagick.readCollection(sourceBytes, callback);
}

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

export function applyCrop(image: IMagickImage, settings: MagickSettings, scale = 1): boolean {
	const hasVisualCrop = settings.cropX != null || settings.cropY != null;

	if (hasVisualCrop) {
		const cx = Math.max(0, Math.round((settings.cropX ?? 0) * scale));
		const cy = Math.max(0, Math.round((settings.cropY ?? 0) * scale));
		// The crop region must lie at least partially inside the image.
		if (cx >= image.width || cy >= image.height) return false;
		const cw = Math.max(
			1,
			Math.min(
				Math.round((settings.cropW ?? image.width / scale - (settings.cropX ?? 0)) * scale),
				image.width - cx
			)
		);
		const ch = Math.max(
			1,
			Math.min(
				Math.round((settings.cropH ?? image.height / scale - (settings.cropY ?? 0)) * scale),
				image.height - cy
			)
		);
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

	const cropW = Math.max(
		1,
		Math.min(rawW == null ? image.width : Math.round(rawW * scale), image.width)
	);
	const cropH = Math.max(
		1,
		Math.min(rawH == null ? image.height : Math.round(rawH * scale), image.height)
	);
	const gravityKey = settings.cropGravity as keyof typeof Gravity;
	image.crop(cropW, cropH, Gravity[gravityKey]);
	return true;
}

export interface ProcessResult {
	data: Uint8Array;
	previewData: Uint8Array;
	previewWidth: number;
	previewHeight: number;
	width: number;
	height: number;
	format: string;
}

export function processImageSync(
	sourceBytes: Uint8Array,
	settings: MagickSettings,
	inputName?: string
): ProcessResult {
	let result: ProcessResult = {
		data: new Uint8Array(),
		previewData: new Uint8Array(),
		previewWidth: 0,
		previewHeight: 0,
		width: 0,
		height: 0,
		format: ''
	};

	readCollectionWithFilename(sourceBytes, inputName, (collection) => {
		// Disposal-based animations (GIF/WebP) store partial frame updates, so
		// coalesce to full frames before geometry; other multi-image inputs
		// (TIFF pages, PSD layers) are already full images and must not be.
		if (collection.length > 1) {
			const firstFormat = String(collection[0].format ?? '').toUpperCase();
			if (firstFormat === 'GIF' || firstFormat === 'GIF87' || firstFormat === 'WEBP') {
				collection.coalesce();
			}
		}
		for (const image of collection) {
			// Normalize EXIF orientation before geometry. Some ImageMagick builds
			// clear or expose the orientation attribute differently after resize/crop,
			// which otherwise makes native and WASM disagree for camera images.
			if (settings.autoOrient) image.autoOrient();

			const resizeW = settings.resizeW ?? 0;
			const resizeH = settings.resizeH ?? 0;

			applyCrop(image, settings);

			if (resizeW > 0 || resizeH > 0) {
				image.resize(resizeW, resizeH);
			}

			if (parseInt(settings.rotate) !== 0) {
				image.rotate(parseInt(settings.rotate));
			}

			if (settings.flop) image.flop();
			if (settings.flip) image.flip();

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

					const angle = settings.annotateAngle[0];
					if (angle !== 0) {
						const rad = (angle * Math.PI) / 360;
						// magick-wasm's affine(scaleX, scaleY, shearX, shearY, tx, ty) maps to
						// ImageMagick's AffineMatrix { sx, rx, ry, sy, tx, ty }. ImageMagick's
						// -annotate uses a clockwise rotation for positive angles, so shearX
						// and shearY are swapped relative to the standard CCW matrix.
						draws.affine(Math.cos(rad), Math.cos(rad), Math.sin(rad), -Math.sin(rad), 0, 0);
					}

					draws.text(settings.annotateOffsetX, settings.annotateOffsetY, settings.annotateText);
					draws.draw(image);
				} catch (e) {
					console.warn('Annotate failed:', e);
				}
			}

			if (settings.stripMeta) {
				image.strip();
			}
		}

		// The frame loop above leaves per-frame state on each image. Sequence
		// outputs keep every frame; static outputs export the last coalesced
		// frame as the representative still (see `stillFrameForOutput`).
		const still = stillFrameForOutput(collection, settings.imageFormat);
		const representative = still ?? collection[0];
		const magf = magickFormatForName(settings.imageFormat) ?? MagickFormat.WebP;

		const finalWidth = representative.width;
		const finalHeight = representative.height;
		const needsPreview = !BROWSER_RENDERABLE_FORMATS.has(settings.imageFormat.toUpperCase());
		const previewData = needsPreview
			? representative.getPixels(
					(pixels) => pixels.toByteArray(0, 0, finalWidth, finalHeight, 'RGBA') ?? new Uint8Array()
				)
			: new Uint8Array();

		// magick-wasm's AVIF/AOM build rejects the lossless settings it derives
		// from quality 100 (chroma delta-q is left enabled). Keep the UI's
		// maximum slider usable by selecting the nearest supported AVIF quality;
		// native ImageMagick still receives the requested value unchanged.
		const outputQuality =
			settings.imageFormat.toUpperCase() === 'AVIF' && settings.quality[0] >= 100
				? 99
				: settings.quality[0];
		for (const frame of collection) frame.quality = outputQuality;

		const writeOutput = (onData: (data: Uint8Array) => void): void => {
			if (!still) {
				collection.write(magf, onData);
				return;
			}
			const flattened = flattenStillForOutput(still, settings.imageFormat);
			try {
				flattened.quality = outputQuality;
				flattened.write(magf, onData);
			} finally {
				if (flattened !== still) flattened.dispose();
			}
		};

		writeOutput((data) => {
			const outputData = new Uint8Array(data);
			let outputWidth = finalWidth;
			let outputHeight = finalHeight;
			try {
				// Some output coders (notably AVIF/HEIC) materialize the source
				// orientation while encoding. Re-read the bytes so the dimensions
				// reported by WASM describe the file that was actually produced,
				// matching the native path's post-write identify call.
				ImageMagick.read(outputData, magf, (written) => {
					outputWidth = written.width;
					outputHeight = written.height;
				});
			} catch {
				// Keep the in-memory dimensions for formats that cannot be decoded
				// again by the WASM build.
			}
			result = {
				data: outputData,
				previewData,
				previewWidth: needsPreview ? finalWidth : 0,
				previewHeight: needsPreview ? finalHeight : 0,
				width: outputWidth,
				height: outputHeight,
				format: settings.imageFormat
			};
		});
	});

	return result;
}
