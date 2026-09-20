import type { MagickSettings } from './types';
import { buildNativeDocument, buildNativeSegments } from './native-recipe';

export type NativeProcessingPlan = {
	backend: 'vips' | 'magick';
	unsupported: string[];
	operations: NativePlanOperation[];
	output: {
		format: string;
		quality: number;
		stripMeta: boolean;
	};
	/** Recipe and segments are planning data; execution remains backwards-compatible. */
	recipe?: import('./native-recipe').NativeDocument;
	segments?: import('./native-recipe').NativeRenderSegment[];
};

export type NativePlanOperation =
	| { type: 'autoOrient' }
	| { type: 'resize'; width: number | null; height: number | null }
	| {
			type: 'crop';
			left: number | null;
			top: number | null;
			width: number | null;
			height: number | null;
			gravity: string;
	  }
	| { type: 'rotate'; angle: 90 | 180 | -90 }
	| { type: 'flip' }
	| { type: 'flop' }
	| { type: 'modulate'; brightness: number; saturation: number; hue: number }
	| { type: 'contrast'; value: number }
	| { type: 'normalize' }
	| { type: 'gamma'; value: number }
	| { type: 'blur'; sigma: number }
	| { type: 'sharpen'; sigma: number }
	| { type: 'grayscale' }
	| { type: 'negate' }
	| { type: 'threshold'; value: number }
	| { type: 'trim' }
	| { type: 'border'; size: number; color: string };

const VIPS_OUTPUT_FORMATS = new Set(['JPEG', 'PNG', 'WEBP', 'AVIF', 'TIFF']);
const RAW_EXTENSIONS = new Set([
	'3fr',
	'arw',
	'cr2',
	'cr3',
	'crw',
	'dcr',
	'dng',
	'erf',
	'fff',
	'iiq',
	'k25',
	'kdc',
	'mef',
	'mos',
	'mrw',
	'nef',
	'nrw',
	'orf',
	'pef',
	'raf',
	'raw',
	'rw2',
	'rwl',
	'sr2',
	'srf',
	'srw',
	'x3f'
]);

function isRawInput(name: string): boolean {
	const extension = name.split('.').pop()?.toLowerCase() ?? '';
	return RAW_EXTENSIONS.has(extension);
}

function hasPositive(value: number | null): value is number {
	return value != null && value > 0;
}

/** Build the native backend-neutral plan. Keep this conservative until parity exists. */
export function buildNativeProcessingPlan(
	settings: MagickSettings,
	inputName = ''
): NativeProcessingPlan {
	const unsupported: string[] = [];
	const operations: NativePlanOperation[] = [];
	const format = settings.imageFormat.toUpperCase();

	if (isRawInput(inputName)) unsupported.push('RAW input');
	if (!VIPS_OUTPUT_FORMATS.has(format)) unsupported.push(`output format ${format}`);

	if (settings.autoOrient) operations.push({ type: 'autoOrient' });
	const hasCrop =
		settings.cropX != null ||
		settings.cropY != null ||
		hasPositive(settings.cropW) ||
		hasPositive(settings.cropH);
	if (hasCrop) {
		operations.push({
			type: 'crop',
			left: settings.cropX == null ? null : Math.max(0, Math.round(settings.cropX)),
			top: settings.cropY == null ? null : Math.max(0, Math.round(settings.cropY)),
			width: hasPositive(settings.cropW) ? Math.round(settings.cropW) : null,
			height: hasPositive(settings.cropH) ? Math.round(settings.cropH) : null,
			gravity: settings.cropGravity
		});
	}
	if (settings.resizeW != null || settings.resizeH != null) {
		if (hasPositive(settings.resizeW) || hasPositive(settings.resizeH)) {
			operations.push({ type: 'resize', width: settings.resizeW, height: settings.resizeH });
		}
	}

	const angle = Number.parseInt(settings.rotate, 10);
	if (angle !== 0) {
		if (angle === 90 || angle === 180 || angle === -90) {
			operations.push({ type: 'rotate', angle });
		} else {
			unsupported.push('arbitrary rotation');
		}
	}
	if (settings.flip) operations.push({ type: 'flip' });
	if (settings.flop) operations.push({ type: 'flop' });

	if (settings.shaveX != null || settings.shaveY != null) unsupported.push('shave');
	if (settings.trimEdges) operations.push({ type: 'trim' });
	if (settings.borderSize[0] > 0) {
		operations.push({
			type: 'border',
			size: Math.round(settings.borderSize[0]),
			color: settings.borderColor
		});
	}
	if (settings.extentW != null || settings.extentH != null) unsupported.push('canvas extent');
	if (settings.deskewThreshold[0] > 0) unsupported.push('deskew');

	if (settings.brightness[0] !== 100 || settings.saturation[0] !== 100 || settings.hue[0] !== 100) {
		operations.push({
			type: 'modulate',
			brightness: settings.brightness[0] / 100,
			saturation: settings.saturation[0] / 100,
			// ImageMagick's hue value is percentage-based; Sharp expects degrees.
			hue: (settings.hue[0] - 100) * 1.8
		});
	}
	if (settings.contrast[0] !== 0)
		operations.push({ type: 'contrast', value: settings.contrast[0] });
	if (settings.normalizeImage) operations.push({ type: 'normalize' });
	if (
		settings.levelGamma.All[0] !== 1 &&
		settings.levelBlackpoint.All[0] === 0 &&
		settings.levelWhitepoint.All[0] === 100
	) {
		operations.push({ type: 'gamma', value: settings.levelGamma.All[0] });
		if (settings.levelGamma.All[0] < 1) unsupported.push('gamma below VIPS range');
	}
	if (settings.thresholdPercentage[0] !== 50) {
		operations.push({ type: 'threshold', value: (settings.thresholdPercentage[0] / 100) * 255 });
	}
	if (settings.effect === 'grayscale') operations.push({ type: 'grayscale' });
	if (settings.effect === 'negate') operations.push({ type: 'negate' });
	if (settings.blur[0] > 0)
		operations.push({ type: 'blur', sigma: Math.max(0.3, settings.blur[0] / 2) });
	if (settings.gaussianBlurRadius[0] > 0) {
		operations.push({ type: 'blur', sigma: Math.max(0.3, settings.gaussianBlurSigma[0]) });
	}
	if (settings.sharpen[0] > 0) {
		operations.push({ type: 'sharpen', sigma: Math.max(0.000001, settings.sharpen[0] / 2) });
	}

	if (
		settings.autoLevel ||
		settings.autoGamma ||
		settings.colorSpace !== 'RGB' ||
		settings.levelColorsBlack !== '#000000' ||
		settings.levelColorsWhite !== '#ffffff' ||
		settings.levelColorsInverse ||
		(['Red', 'Green', 'Blue'] as const).some(
			(channel) =>
				settings.levelBlackpoint[channel][0] !== 0 ||
				settings.levelWhitepoint[channel][0] !== 100 ||
				settings.levelGamma[channel][0] !== 1
		) ||
		settings.autoThreshold !== 'Off' ||
		settings.thresholdChannels !== 'All' ||
		settings.blackThreshold[0] > 0 ||
		settings.whiteThreshold[0] < 100 ||
		settings.claheXTiles[0] > 0 ||
		settings.sigmoidalContrast[0] !== 0
	) {
		unsupported.push('color operation');
	}

	if (
		(settings.effect !== 'none' &&
			settings.effect !== 'grayscale' &&
			settings.effect !== 'negate') ||
		settings.motionBlurRadius[0] > 0 ||
		settings.addNoiseType !== 'Off' ||
		settings.adaptiveSharpenRadius[0] > 0 ||
		settings.adaptiveBlurRadius[0] > 0 ||
		(settings.levelGamma.All[0] !== 1 &&
			(settings.levelBlackpoint.All[0] !== 0 || settings.levelWhitepoint.All[0] !== 100)) ||
		settings.clutMap !== 'identity' ||
		settings.quantizeColors[0] > 0
	) {
		unsupported.push('filter operation');
	}

	if (settings.annotateText.trim()) unsupported.push('annotation');

	const plan: NativeProcessingPlan = {
		backend: unsupported.length === 0 ? 'vips' : 'magick',
		unsupported: [...new Set(unsupported)],
		operations,
		output: {
			format,
			quality: settings.quality[0],
			stripMeta: settings.stripMeta
		}
	};
	plan.recipe = buildNativeDocument(plan, inputName);
	plan.segments = buildNativeSegments(plan);
	return plan;
}
