/**
 * WASMagick Settings Types
 * Type definitions for all image processing settings
 */

/** Image export format options */
export type ImageFormat = 'WebP' | 'JPEG' | 'PNG' | 'AVIF' | 'JXL' | 'TIFF' | 'GIF';

/** Rotation angle options */
export type RotationAngle = '0' | '90' | '180' | '-90';

/** Color space options */
export type ColorSpaceOption = 'sRGB' | 'Lab' | 'Oklab' | 'RGB' | 'Gray' | 'CMYK' | 'HSL' | 'HSV';

/** Level channel options */
export type LevelChannel = 'All' | 'Red' | 'Green' | 'Blue';

/** Gravity position for canvas extent */
export type GravityPosition =
	| 'Center'
	| 'Northwest'
	| 'North'
	| 'Northeast'
	| 'West'
	| 'East'
	| 'Southwest'
	| 'South'
	| 'Southeast';

/** Image effect presets */
export type EffectPreset =
	| 'none'
	| 'grayscale'
	| 'sepia'
	| 'charcoal'
	| 'negate'
	| 'cannyEdge'
	| 'oilpaint'
	| 'solarize'
	| 'bilateralBlur';

/** Auto threshold method options */
export type AutoThresholdOption = 'Off' | 'Kapur' | 'OTSU' | 'Triangle';

/**
 * Noise type options for addNoise(). ImageMagick's `Random` noise type is
 * intentionally excluded: it replaces the whole image with static regardless of
 * attenuation, so it cannot produce a controllable film-grain effect.
 */
export type NoiseTypeOption =
	| 'Off'
	| 'Uniform'
	| 'Gaussian'
	| 'MultiplicativeGaussian'
	| 'Impulse'
	| 'Laplacian'
	| 'Poisson';

/** CLUT interpolation methods */
export type ClutInterpolation = 'catrom' | 'bilinear' | 'nearest' | 'spline' | 'average';

/** Dither method options for color quantization */
export type DitherMethodOption = 'Undefined' | 'No' | 'Riemersma' | 'FloydSteinberg';

/** Processing settings for the image editor */
export interface MagickSettings {
	// Export settings
	imageFormat: ImageFormat;
	quality: [number];
	stripMeta: boolean;

	// Geometry settings
	resizeW: number | null;
	resizeH: number | null;
	rotate: RotationAngle;
	flop: boolean;
	flip: boolean;
	borderColor: string;
	borderSize: [number];
	extentW: number | null;
	extentH: number | null;
	extentGravity: GravityPosition;
	extentBgColor: string;
	deskewThreshold: [number];
	deskewAutoCrop: boolean;
	cropW: number | null;
	cropH: number | null;
	cropGravity: GravityPosition;
	cropX: number | null;
	cropY: number | null;
	trimEdges: boolean;
	shaveX: number | null;
	shaveY: number | null;

	// Color adjustment settings
	brightness: [number];
	saturation: [number];
	hue: [number];
	contrast: [number];
	normalizeImage: boolean;
	autoLevel: boolean;
	autoOrient: boolean;
	levelBlackpoint: Record<LevelChannel, [number]>;
	levelWhitepoint: Record<LevelChannel, [number]>;
	levelGamma: Record<LevelChannel, [number]>;
	levelChannels: LevelChannel;
	levelColorsBlack: string;
	levelColorsWhite: string;
	levelColorsChannels: LevelChannel;
	levelColorsInverse: boolean;
	thresholdPercentage: [number];
	thresholdChannels: LevelChannel;
	sigmoidalContrast: [number];
	sigmoidalMidpoint: [number];
	sigmoidalChannels: LevelChannel;
	colorSpace: ColorSpaceOption;
	autoGamma: boolean;
	autoThreshold: AutoThresholdOption;
	blackThreshold: [number];
	whiteThreshold: [number];
	claheXTiles: [number];
	claheYTiles: [number];
	claheBins: [number];
	claheClipLimit: [number];

	// Filter & effect settings
	effect: EffectPreset;
	blur: [number];
	sharpen: [number];
	gaussianBlurRadius: [number];
	gaussianBlurSigma: [number];
	motionBlurRadius: [number];
	motionBlurSigma: [number];
	motionBlurAngle: [number];
	addNoiseType: NoiseTypeOption;
	addNoiseAttenuate: [number];
	adaptiveSharpenRadius: [number];
	adaptiveSharpenSigma: [number];
	adaptiveBlurRadius: [number];
	adaptiveBlurSigma: [number];
	sepiaThreshold: [number];
	charcoalIntensity: [number];
	cannyEdgeStrength: [number];
	cannyEdgeLower: [number];
	cannyEdgeUpper: [number];
	oilpaintRadius: [number];
	solarizeFactor: [number];
	bilateralWidth: [number];
	bilateralHeight: [number];
	bilateralIntensitySigma: [number];
	bilateralSpatialSigma: [number];
	clutMap: string;
	clutInterpolation: ClutInterpolation;

	// Quantize / dithering settings
	quantizeColors: [number];
	ditherMethod: DitherMethodOption;
	quantizeColorSpace: ColorSpaceOption;
	quantizeTreeDepth: [number];
	measureErrors: boolean;

	// Annotate / text settings
	annotateText: string;
	annotateFontFamily: string;
	annotateFontSize: [number];
	annotateFontColor: string;
	annotateGravity: GravityPosition;
	annotateOffsetX: number;
	annotateOffsetY: number;
	annotateAngle: [number];
	annotateStroke: boolean;
	annotateStrokeColor: string;
	annotateStrokeWidth: [number];
}

/** Options applied during image processing (for debug output) */
export interface AppliedOptions {
	resize?: { width: number | null; height: number | null };
	rotate?: number;
	flop?: boolean;
	flip?: boolean;
	crop?: {
		x: number | null;
		y: number | null;
		width: number | null;
		height: number | null;
		gravity: string;
	};
	trim?: boolean;
	shave?: { x: number | null; y: number | null };
	border?: { size: number; color: string };
	extent?: {
		width: number | null;
		height: number | null;
		gravity: string;
		bg: string;
	};
	deskew?: { threshold: number; autoCrop: boolean };
	modulate?: { brightness: number; saturation: number; hue: number };
	contrast?: number;
	normalize?: boolean;
	autoLevel?: boolean;
	autoOrient?: boolean;
	level?: { black: number; white: number; gamma: number; channels: string }[];
	levelColors?: { black: string; white: string; channels: string; inverse: boolean };
	threshold?: { percent: number; channels: string };
	autoGamma?: boolean;
	autoThreshold?: string;
	blackThreshold?: number;
	whiteThreshold?: number;
	clahe?: { xTiles: number; yTiles: number; bins: number; clipLimit: number };
	sigmoidal?: { contrast: number; midpoint: number };
	colorSpace?: string;
	quantize?: {
		colors: number;
		ditherMethod: string;
		colorSpace: string;
		treeDepth: number;
	};
	blur?: number;
	sharpen?: number;
	gaussianBlur?: { radius: number; sigma: number };
	motionBlur?: { radius: number; sigma: number; angle: number };
	addNoise?: { type: string; attenuate: number };
	adaptiveSharpen?: { radius: number; sigma: number };
	adaptiveBlur?: { radius: number; sigma: number };
	effect?: string;
	sepiaThreshold?: number;
	charcoalIntensity?: number;
	cannyEdge?: { strength: number; lower: number; upper: number };
	oilPaintRadius?: number;
	solarizeFactor?: number;
	bilateral?: { w: number; h: number; iSig: number; sSig: number };
	clutMap?: string;
	clutInterpolation?: string;
	stripMeta?: boolean;
	quality?: number;
	format?: string;
	outputDimensions?: { width: number; height: number };
	outputSize?: number;
	processTime?: string;
	annotate?: {
		text: string;
		font: string;
		fontSize: number;
		color: string;
		gravity: string;
		offsetX: number;
		offsetY: number;
		angle: number;
	};
}
