/**
 * Translate `MagickSettings` into native ImageMagick CLI arguments.
 *
 * This module is intentionally dependency-free (types only): the renderer
 * builds the argument list and sends it to the Electron main process, which
 * spawns the bundled `magick` binary without needing to understand settings.
 * Keeping arg construction in one place guarantees the WASM path
 * (`magick-process.ts`) and the native path apply operations in the same
 * order with the same values.
 *
 * Path placeholders: the renderer does not know the main-process temp dir,
 * so file operands use the `NATIVE_TOKENS` below and the main process
 * substitutes real paths before spawning:
 *
 *   magick __INPUT__ ...args... __OUTPUT__
 */

import type { MagickSettings } from './types';
import { interpolateCliKeyword } from './clut-data';
import { outputExtensionForFormat } from './export-formats';

export { outputExtensionForFormat } from './export-formats';

export const NATIVE_TOKENS = {
	INPUT: '__INPUT__',
	OUTPUT: '__OUTPUT__',
	CLUT: '__CLUT__',
	FONT: '__FONT__'
} as const;

export interface NativeArgsOptions {
	/** Source image dimensions; orientation is applied when inferring one side. */
	width?: number;
	height?: number;
	/** Source EXIF orientation, when auto-orient metadata was parsed. */
	orientation?: number | null;
}

export interface NativeArgsResult {
	/** Args between input and output (tokens included where needed). */
	args: string[];
	/** File extension (without dot) for the output temp file. */
	outputExtension: string;
	/** Set when the main process must be sent CLUT PNG bytes. */
	needsClut: string | null;
	/** Set when the main process must be sent font bytes for `-font`. */
	needsFont: string | null;
}

function fmtNum(v: number): string {
	return String(v);
}

/** Quote text for ImageMagick's MVG `-draw` syntax without using a shell. */
function drawTextLiteral(text: string): string {
	// MVG does not consistently honor backslash-escaped quote delimiters.
	// Encode syntax-sensitive characters as hex escapes inside a single-quoted
	// literal so arbitrary user text cannot terminate the drawing primitive.
	return `'${text
		.replace(/\\/g, '\\x5c')
		.replace(/'/g, '\\x27')
		.replace(/"/g, '\\x22')
		.replace(/\r/g, '\\x0d')
		.replace(/\n/g, '\\x0a')
		.replace(/\t/g, '\\x09')}'`;
}

/**
 * Mirror of `resolveNoiseAttenuate` in `magick-process.ts` (duplicated here
 * to stay dependency-free): ImageMagick's Poisson noise sigma is inversely
 * proportional to attenuate, so invert it to keep "higher = more noise".
 */
function resolveNoiseAttenuate(type: string, attenuate: number): number {
	return type === 'Poisson' ? 1 / Math.max(attenuate, 0.01) : attenuate;
}

/** CLI `-channel` selector for a UI level/threshold channel option. */
function channelFlag(ch: string): string {
	switch (ch) {
		case 'Red':
			return 'R';
		case 'Green':
			return 'G';
		case 'Blue':
			return 'B';
		default:
			return 'RGB';
	}
}

/**
 * Build the `magick __INPUT__ ... __OUTPUT__` argument list for the given
 * settings. The order mirrors `processImageSync` in `magick-process.ts` and
 * the golden fixtures in `test/golden-gen/generate.ts`.
 */
export function buildNativeMagickArgs(
	settings: MagickSettings,
	opts: NativeArgsOptions = {}
): NativeArgsResult {
	const args: string[] = [];
	let needsClut: string | null = null;
	let needsFont: string | null = null;
	const orientation = opts.orientation;
	const swapsDimensions =
		settings.autoOrient &&
		typeof orientation === 'number' &&
		Number.isInteger(orientation) &&
		orientation >= 5 &&
		orientation <= 8;
	const imageWidth = swapsDimensions ? opts.height : opts.width;
	const imageHeight = swapsDimensions ? opts.width : opts.height;

	// Normalize EXIF orientation immediately after reading the input. The
	// native runner adds a fallback only after probing the native decoder, so
	// already-normalized formats are never rotated twice.
	if (settings.autoOrient) args.push('-auto-orient');

	// -- Geometry --
	const resizeW = settings.resizeW ?? 0;
	const resizeH = settings.resizeH ?? 0;
	if (resizeW > 0 || resizeH > 0) {
		args.push('-resize', `${resizeW > 0 ? resizeW : ''}x${resizeH > 0 ? resizeH : ''}`);
	}

	if (parseInt(settings.rotate) !== 0) {
		args.push('-rotate', String(parseInt(settings.rotate)));
	}

	if (settings.flop) args.push('-flop');
	if (settings.flip) args.push('-flip');

	const hasVisualCrop = settings.cropX != null || settings.cropY != null;
	if (hasVisualCrop) {
		const w = Math.max(1, settings.cropW ?? 0);
		const h = Math.max(1, settings.cropH ?? 0);
		const x = Math.max(0, settings.cropX ?? 0);
		const y = Math.max(0, settings.cropY ?? 0);
		args.push('-crop', `${w}x${h}+${x}+${y}`, '+repage');
	} else {
		const rawW = settings.cropW;
		const rawH = settings.cropH;
		if ((rawW != null && rawW > 0) || (rawH != null && rawH > 0)) {
			const imgW = imageWidth ?? 0;
			const imgH = imageHeight ?? 0;
			const cw = rawW != null && rawW > 0 ? rawW : imgW > 0 ? imgW : (rawH ?? 0);
			const ch = rawH != null && rawH > 0 ? rawH : imgH > 0 ? imgH : (rawW ?? 0);
			args.push('-gravity', settings.cropGravity, '-crop', `${cw}x${ch}+0+0`, '+repage');
		}
	}

	if (settings.trimEdges) args.push('-trim', '+repage');

	const shaveX = settings.shaveX ?? 0;
	const shaveY = settings.shaveY ?? 0;
	if (shaveX > 0 || shaveY > 0) {
		args.push('-shave', `${shaveX}x${shaveY}`);
	}

	if (settings.borderSize[0] > 0) {
		args.push(
			'-bordercolor',
			settings.borderColor,
			'-border',
			`${settings.borderSize[0]}x${settings.borderSize[0]}`
		);
	}

	if ((settings.extentW ?? 0) > 0 || (settings.extentH ?? 0) > 0) {
		const ew = (settings.extentW ?? 0) > 0 ? settings.extentW : (imageWidth ?? 0);
		const eh = (settings.extentH ?? 0) > 0 ? settings.extentH : (imageHeight ?? 0);
		args.push(
			'-gravity',
			settings.extentGravity,
			'-background',
			settings.extentBgColor,
			'-extent',
			`${ew}x${eh}`
		);
	}

	if (settings.deskewThreshold[0] > 0) {
		args.push('-deskew', `${fmtNum(settings.deskewThreshold[0])}%`);
		// The CLI has no deskew auto-crop flag; drop the virtual canvas offset
		// the same way the WASM path does with resetPage().
		if (settings.deskewAutoCrop) args.push('+repage');
	}

	// -- Color --
	if (settings.brightness[0] !== 100 || settings.saturation[0] !== 100 || settings.hue[0] !== 100) {
		args.push(
			'-modulate',
			`${fmtNum(settings.brightness[0])},${fmtNum(settings.saturation[0])},${fmtNum(settings.hue[0])}`
		);
	}

	if (settings.contrast[0] !== 0) {
		args.push('-brightness-contrast', `0,${fmtNum(settings.contrast[0])}`);
	}

	if (settings.normalizeImage) args.push('-normalize');
	if (settings.autoLevel) args.push('-auto-level');
	// magick-wasm autoGamma() defaults to Composite (RGB) channels; force RGB
	// for parity (see golden-gen).
	if (settings.autoGamma) args.push('-channel', 'RGB', '-auto-gamma', '+channel');

	for (const ch of ['All', 'Red', 'Green', 'Blue'] as const) {
		const bp = settings.levelBlackpoint[ch][0];
		const wp = settings.levelWhitepoint[ch][0];
		const gm = settings.levelGamma[ch][0];
		if (bp !== 0 || wp !== 100 || gm !== 1.0) {
			if (ch === 'All') {
				args.push('-level', `${fmtNum(bp)}%,${fmtNum(wp)}%,${fmtNum(gm)}`);
			} else {
				args.push(
					'-channel',
					channelFlag(ch),
					'-level',
					`${fmtNum(bp)}%,${fmtNum(wp)}%,${fmtNum(gm)}`,
					'+channel'
				);
			}
		}
	}

	if (
		settings.levelColorsBlack !== '#000000' ||
		settings.levelColorsWhite !== '#ffffff' ||
		settings.levelColorsInverse
	) {
		const op = settings.levelColorsInverse ? '+level-colors' : '-level-colors';
		const channel =
			settings.levelColorsChannels === 'All' ? 'RGB' : channelFlag(settings.levelColorsChannels);
		args.push(
			'-channel',
			channel,
			op,
			`${settings.levelColorsBlack},${settings.levelColorsWhite}`,
			'+channel'
		);
	}

	if (settings.thresholdPercentage[0] !== 50) {
		if (settings.thresholdChannels === 'All') {
			args.push('-threshold', `${fmtNum(settings.thresholdPercentage[0])}%`);
		} else {
			args.push(
				'-channel',
				channelFlag(settings.thresholdChannels),
				'-threshold',
				`${fmtNum(settings.thresholdPercentage[0])}%`,
				'+channel'
			);
		}
	}

	if (settings.blackThreshold[0] > 0) {
		args.push(
			'-channel',
			'RGB',
			'-black-threshold',
			`${fmtNum(settings.blackThreshold[0])}%`,
			'+channel'
		);
	}

	if (settings.whiteThreshold[0] < 100) {
		args.push(
			'-channel',
			'RGB',
			'-white-threshold',
			`${fmtNum(settings.whiteThreshold[0])}%`,
			'+channel'
		);
	}

	if (settings.sigmoidalContrast[0] !== 0) {
		const value = `${fmtNum(settings.sigmoidalContrast[0])},${fmtNum(settings.sigmoidalMidpoint[0])}`;
		if (settings.sigmoidalChannels === 'All') {
			args.push('-sigmoidal-contrast', value);
		} else {
			args.push(
				'-channel',
				channelFlag(settings.sigmoidalChannels),
				'-sigmoidal-contrast',
				value,
				'+channel'
			);
		}
	}

	if (settings.autoThreshold !== 'Off') {
		args.push('-auto-threshold', settings.autoThreshold);
	}

	if (settings.colorSpace !== 'RGB') {
		args.push('-colorspace', settings.colorSpace);
	}

	if (settings.claheXTiles[0] > 0) {
		args.push(
			'-clahe',
			`${fmtNum(settings.claheXTiles[0])}x${fmtNum(settings.claheYTiles[0])}+${fmtNum(settings.claheBins[0])}+${fmtNum(settings.claheClipLimit[0])}`
		);
	}

	// -- Blur / sharpen --
	if (settings.blur[0] > 0) {
		args.push('-blur', `${fmtNum(settings.blur[0])}x${fmtNum(settings.blur[0] / 2)}`);
	}

	if (settings.gaussianBlurRadius[0] > 0) {
		args.push(
			'-gaussian-blur',
			`${fmtNum(settings.gaussianBlurRadius[0])}x${fmtNum(settings.gaussianBlurSigma[0])}`
		);
	}

	if (settings.sharpen[0] > 0) {
		args.push('-sharpen', `${fmtNum(settings.sharpen[0])}x${fmtNum(settings.sharpen[0] / 2)}`);
	}

	if (settings.adaptiveSharpenRadius[0] > 0) {
		args.push(
			'-adaptive-sharpen',
			`${fmtNum(settings.adaptiveSharpenRadius[0])}x${fmtNum(settings.adaptiveSharpenSigma[0])}`
		);
	}

	if (settings.adaptiveBlurRadius[0] > 0) {
		args.push(
			'-adaptive-blur',
			`${fmtNum(settings.adaptiveBlurRadius[0])}x${fmtNum(settings.adaptiveBlurSigma[0])}`
		);
	}

	if (settings.motionBlurRadius[0] > 0) {
		args.push(
			'-motion-blur',
			`${fmtNum(settings.motionBlurRadius[0])}x${fmtNum(settings.motionBlurSigma[0])}+${fmtNum(settings.motionBlurAngle[0])}`
		);
	}

	if (settings.addNoiseType !== 'Off') {
		const attenuate = resolveNoiseAttenuate(settings.addNoiseType, settings.addNoiseAttenuate[0]);
		// The CLI spells MultiplicativeGaussian as Multiplicative.
		const cliType =
			settings.addNoiseType === 'MultiplicativeGaussian' ? 'Multiplicative' : settings.addNoiseType;
		args.push('-attenuate', fmtNum(attenuate), '+noise', cliType);
	}

	// -- Effects --
	if (settings.effect !== 'none') {
		switch (settings.effect) {
			case 'grayscale':
				args.push('-grayscale', 'Rec709Luminance');
				break;
			case 'sepia':
				args.push('-sepia-tone', `${fmtNum(settings.sepiaThreshold[0])}%`);
				break;
			case 'charcoal':
				args.push('-charcoal', fmtNum(settings.charcoalIntensity[0]));
				break;
			case 'negate':
				args.push('-channel', 'RGB', '-negate', '+channel');
				break;
			case 'cannyEdge': {
				const radius = (settings.cannyEdgeStrength[0] / 100) * 4;
				const sigma = (settings.cannyEdgeStrength[0] / 100) * 1.5;
				args.push(
					'-canny',
					`${fmtNum(radius)}x${fmtNum(sigma)}+${fmtNum(settings.cannyEdgeLower[0])}%+${fmtNum(settings.cannyEdgeUpper[0])}%`
				);
				break;
			}
			case 'oilpaint':
				// The CLI verb is -paint (see golden-gen).
				args.push('-paint', fmtNum(settings.oilpaintRadius[0]));
				break;
			case 'solarize':
				args.push(
					'-channel',
					'RGB',
					'-solarize',
					`${fmtNum(settings.solarizeFactor[0])}%`,
					'+channel'
				);
				break;
			case 'bilateralBlur':
				args.push(
					'-bilateral-blur',
					`${fmtNum(settings.bilateralWidth[0])}x${fmtNum(settings.bilateralHeight[0])}+${fmtNum(settings.bilateralIntensitySigma[0])}+${fmtNum(settings.bilateralSpatialSigma[0])}`
				);
				break;
		}
	}

	// -- CLUT (needs the CLUT PNG supplied by the renderer) --
	if (settings.clutMap !== 'identity') {
		needsClut = settings.clutMap;
		args.push(
			NATIVE_TOKENS.CLUT,
			'-interpolate',
			interpolateCliKeyword(settings.clutInterpolation),
			'-clut'
		);
	}

	// -- Quantize --
	if (settings.quantizeColors[0] > 0) {
		// The WASM quantize colorSpace only affects quantization, but the CLI
		// has no such scoped option: only emit when it differs from the sRGB
		// default to avoid clobbering an earlier -colorspace op.
		if (settings.quantizeColorSpace !== 'sRGB') {
			args.push('-colorspace', settings.quantizeColorSpace);
		}
		if (settings.ditherMethod === 'No') {
			args.push('-dither', 'None');
		} else if (settings.ditherMethod !== 'Undefined') {
			args.push('-dither', settings.ditherMethod);
		}
		if (settings.quantizeTreeDepth[0] > 0) {
			args.push('-treedepth', fmtNum(settings.quantizeTreeDepth[0]));
		}
		args.push('-colors', fmtNum(settings.quantizeColors[0]));
	}

	// -- Annotate (needs font bytes for -font) --
	if (settings.annotateText?.trim().length > 0) {
		const family = settings.annotateFontFamily?.trim();
		needsFont = family && family.length > 0 ? family : null;
		args.push('-font', NATIVE_TOKENS.FONT, '-pointsize', fmtNum(settings.annotateFontSize[0]));
		args.push('-fill', settings.annotateFontColor);
		if (settings.annotateStroke && settings.annotateStrokeWidth[0] > 0) {
			args.push(
				'-stroke',
				settings.annotateStrokeColor,
				'-strokewidth',
				fmtNum(settings.annotateStrokeWidth[0])
			);
		}
		args.push('-gravity', settings.annotateGravity);

		const ox = settings.annotateOffsetX;
		const oy = settings.annotateOffsetY;

		const angle = settings.annotateAngle[0];
		if (angle !== 0) {
			// `-annotate` accepts either an angle or an offset geometry, but not
			// both in the same argument (e.g. `45+10+20` is invalid). Use the
			// equivalent affine + text drawable sequence as the WASM path instead.
			// ImageMagick's CLI affine fields are ordered as sx, rx, ry, sy;
			// passing the shear terms in the wrong slots creates a reflection.
			const rad = (angle * Math.PI) / 180;
			args.push(
				'-draw',
				`affine ${fmtNum(Math.cos(rad))},${fmtNum(-Math.sin(rad))},${fmtNum(Math.sin(rad))},${fmtNum(Math.cos(rad))},0,0 text ${fmtNum(ox)},${fmtNum(oy)} ${drawTextLiteral(settings.annotateText)}`
			);
		} else {
			let geometry = '';
			if (ox !== 0 || oy !== 0) {
				geometry = `${ox >= 0 ? '+' : ''}${ox}${oy >= 0 ? '+' : ''}${oy}`;
			}
			if (geometry === '') geometry = '0';
			args.push('-annotate', geometry, settings.annotateText);
		}
	}

	if (settings.stripMeta) args.push('-strip');

	args.push('-quality', fmtNum(settings.quality[0]));

	return {
		args,
		outputExtension: outputExtensionForFormat(settings.imageFormat),
		needsClut,
		needsFont
	};
}
