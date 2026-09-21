/**
 * WASMagick - WebAssembly ImageMagick for the Browser
 *
 * A Svelte-powered image editor that uses ImageMagick WASM to perform
 * client-side image processing including resizing, rotation, color
 * adjustments, filters, and format conversion.
 *
 * @module useMagick
 * @requires @imagemagick/magick-wasm
 */

import type { MagickSettings, AppliedOptions } from './types';
import {
	ensureFont,
	DEFAULT_FONT,
	isLocalFont,
	fetchFontBytes,
	getFontBytes,
	getFontFileName
} from './fonts';
import { renderClutPngBytes } from './clut-data';
import { buildNativeMagickArgs } from './magick-args';
import { buildNativeProcessingPlan } from './native-plan';
import { extractExif, parseExifOrientation, type ExifData } from './exif';
import { computeCropStepOffset, type CropRect } from './crop-utils';
import type { AnnotationTextMetrics } from './annotation-utils';
import {
	FALLBACK_EXPORT_FORMATS,
	getWasmExportFormats,
	orderExportFormats,
	mimeTypeForFormat,
	outputExtensionForFormat,
	type ExportFormat
} from './export-formats';
import { buildOutputFilename } from './settings';
import { BROWSER_RENDERABLE_FORMATS } from './image-capabilities';

const AUTO_PROCESS_DELAY = 300;
const EXIF_UNSUPPORTED_MESSAGE = 'Format probably not supported';
const STORAGE_KEY = 'wasmagick-settings';

const ARRAY_KEYS = new Set([
	'quality',
	'borderSize',
	'deskewThreshold',
	'brightness',
	'saturation',
	'hue',
	'contrast',

	'thresholdPercentage',
	'sigmoidalContrast',
	'sigmoidalMidpoint',
	'blur',
	'sharpen',
	'gaussianBlurRadius',
	'gaussianBlurSigma',
	'motionBlurRadius',
	'motionBlurSigma',
	'motionBlurAngle',
	'addNoiseAttenuate',
	'sepiaThreshold',
	'charcoalIntensity',
	'cannyEdgeStrength',
	'cannyEdgeLower',
	'cannyEdgeUpper',
	'oilpaintRadius',
	'solarizeFactor',
	'bilateralWidth',
	'bilateralHeight',
	'bilateralIntensitySigma',
	'bilateralSpatialSigma',
	'adaptiveSharpenRadius',
	'adaptiveSharpenSigma',
	'adaptiveBlurRadius',
	'adaptiveBlurSigma',
	'blackThreshold',
	'whiteThreshold',
	'claheXTiles',
	'claheYTiles',
	'claheBins',
	'claheClipLimit',
	'quantizeColors',
	'quantizeTreeDepth',
	'annotateFontSize',
	'annotateAngle',
	'annotateStrokeWidth'
]);

const PERSISTED_KEYS = new Set(['imageFormat', 'quality', 'stripMeta']);

function loadPersistedSettings(): Partial<MagickSettings> {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed: Record<string, unknown> = JSON.parse(raw);
		// Only load keys that persistSettings actually writes, so old/corrupt
		// entries (e.g. stripMeta: false from a prior version) can't override defaults.
		const result: Record<string, unknown> = {};
		for (const key of PERSISTED_KEYS) {
			if (key in parsed) {
				result[key] = parsed[key];
			}
		}
		// Normalize array values that may have been stored as plain numbers.
		for (const key of ARRAY_KEYS) {
			if (key in result && typeof result[key] === 'number') {
				result[key] = [result[key]];
			}
		}
		return result as Partial<MagickSettings>;
	} catch {
		return {};
	}
}

function persistSettings(s: MagickSettings): void {
	try {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({
				imageFormat: s.imageFormat,
				quality: s.quality
			})
		);
	} catch {
		// ignore
	}
}

export const DEFAULT_SETTINGS: MagickSettings = {
	imageFormat: 'WebP',
	quality: [85],
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
	autoOrient: true,
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

const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_FILE_SIZE_MB = MAX_FILE_SIZE / 1024 / 1024;

/** Details for the Electron-only large-file advisory (see `largeFileWarning`). */
export interface LargeFileWarning {
	fileName: string;
	sizeMB: number;
}

function isElectronEnv(): boolean {
	return typeof window !== 'undefined' && (window as Window).wasmagick != null;
}

const RAW_INPUT_EXTENSIONS = new Set([
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
	'rmf',
	'rw2',
	'rwl',
	'sr2',
	'srf',
	'srw',
	'x3f'
]);

function isRawInputName(filename: string): boolean {
	const extension = filename.toLowerCase().split('.').pop();
	return extension != null && RAW_INPUT_EXTENSIONS.has(extension);
}

function snapSettings(settings: MagickSettings): MagickSettings {
	return JSON.parse(JSON.stringify(settings));
}

const PREVIEW_MAX_EDGE = 2048;
const WEB_FULL_PREVIEW_MAX_EDGE = 4096;
const WEB_DIRECT_MAX_EDGE = 8192;
const WEB_DIRECT_MAX_PIXELS = 40_000_000;
const DESKTOP_DIRECT_MAX_EDGE = 16384;
const DESKTOP_DIRECT_MAX_PIXELS = 80_000_000;

function needsInteractivePreview(
	dimensions: { width: number; height: number } | null,
	desktop: boolean
): boolean {
	const maxEdge = desktop ? DESKTOP_DIRECT_MAX_EDGE : WEB_DIRECT_MAX_EDGE;
	const maxPixels = desktop ? DESKTOP_DIRECT_MAX_PIXELS : WEB_DIRECT_MAX_PIXELS;
	return (
		!!dimensions &&
		(Math.max(dimensions.width, dimensions.height) > maxEdge ||
			dimensions.width * dimensions.height > maxPixels)
	);
}

async function browserPreview(
	bytes: Uint8Array,
	dimensions: { width: number; height: number } | null,
	maxEdge = PREVIEW_MAX_EDGE
): Promise<{
	data: Uint8Array;
	width: number;
	height: number;
	sourceWidth: number;
	sourceHeight: number;
} | null> {
	let bitmap: ImageBitmap;
	try {
		const blob = new Blob([bytes as BlobPart]);
		const target = dimensions
			? Math.min(1, maxEdge / Math.max(dimensions.width, dimensions.height))
			: 1;
		bitmap = await createImageBitmap(
			blob,
			target < 1
				? {
						resizeWidth: Math.max(1, Math.round(dimensions!.width * target)),
						resizeHeight: Math.max(1, Math.round(dimensions!.height * target)),
						resizeQuality: 'high'
					}
				: undefined
		);
	} catch {
		return null;
	}

	try {
		const sourceWidth = dimensions?.width ?? bitmap.width;
		const sourceHeight = dimensions?.height ?? bitmap.height;
		const target = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
		const width = Math.max(1, Math.round(bitmap.width * target));
		const height = Math.max(1, Math.round(bitmap.height * target));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) return null;
		context.drawImage(bitmap, 0, 0, width, height);
		return {
			data: new Uint8Array(context.getImageData(0, 0, width, height).data),
			width,
			height,
			sourceWidth,
			sourceHeight
		};
	} finally {
		bitmap.close();
	}
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
	return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
	return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
	return (
		(bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]
	);
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
	return (
		bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
	);
}

function fastImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
	if (bytes.length < 16) return null;

	// JPEG: find SOF marker (0xFF 0xC0 or 0xFF 0xC2)
	if (bytes[0] === 0xff && bytes[1] === 0xd8) {
		let offset = 2;
		while (offset < bytes.length - 9) {
			if (bytes[offset] !== 0xff) return null;
			const marker = bytes[offset + 1];
			offset += 2;
			if (marker === 0xc0 || marker === 0xc2) {
				return {
					height: readUint16BE(bytes, offset + 3),
					width: readUint16BE(bytes, offset + 5)
				};
			}
			const segLen = readUint16BE(bytes, offset);
			offset += segLen;
		}
		return null;
	}

	// PNG: 8-byte signature, IHDR at offset 8
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
		return {
			width: readUint32BE(bytes, 16),
			height: readUint32BE(bytes, 20)
		};
	}

	// GIF: "GIF89a" or "GIF87a"
	if (
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61
	) {
		return {
			width: readUint16LE(bytes, 6),
			height: readUint16LE(bytes, 8)
		};
	}

	// WebP: RIFF container
	if (
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x20) {
			return {
				width: readUint16LE(bytes, 26) & 0x3fff,
				height: readUint16LE(bytes, 28) & 0x3fff
			};
		}
		if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x4c) {
			const b0 = bytes[21],
				b1 = bytes[22],
				b2 = bytes[23],
				b3 = bytes[24];
			return {
				width: ((b1 & 0x3f) << 8) | b0,
				height: ((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)
			};
		}
		if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58) {
			return {
				width: (readUint32LE(bytes, 24) & 0xffffff) + 1,
				height: (readUint32LE(bytes, 27) & 0xffffff) + 1
			};
		}
	}

	// BMP
	if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
		return {
			width: readUint32LE(bytes, 18),
			height: Math.abs(readUint32LE(bytes, 22))
		};
	}

	return null;
}

export class MagickState {
	wasmLoaded = $state(false);
	isLoading = $state(false);
	hasError = $state(false);
	errorMessage = $state<string | null>(null);
	statsMessage = $state('Ready');
	hasUnsavedEdits = $state(false);
	sourceBytes = $state<Uint8Array | null>(null);
	originalName = $state('image');
	originalImageSize = $state(0);
	originalImageUrl = $state<string | null>(null);
	originalPreviewData = $state<Uint8Array | null>(null);
	originalPreviewWidth = $state(0);
	originalPreviewHeight = $state(0);
	originalPreviewFull = $state(false);
	originalPreviewLoading = $state(false);
	originalImageFormat = $state<string | null>(null);
	processedImageUrl = $state<string | null>(null);
	processedPreviewUrl = $state<string | null>(null);
	processedPreviewData = $state<Uint8Array | null>(null);
	processedPreviewWidth = $state(0);
	processedPreviewHeight = $state(0);
	processedImageFormat = $state<string | null>(null);
	processedImageName = $state<string | null>(null);
	processedBy = $state<string | null>(null);
	processedImageTime = $state(0);
	processedImageDelta = $state('N/A');
	/**
	 * JSON signature of `settings` at the moment the visible preview was
	 * rendered. Compared against current settings to derive `isStale`.
	 */
	lastProcessedSignature = $state<string | null>(null);
	originalWidth = $state(0);
	originalHeight = $state(0);
	processedWidth = $state(0);
	processedHeight = $state(0);
	annotationTextMetrics = $state<AnnotationTextMetrics | null>(null);
	currentProcessingStep = $state<string | null>(null);
	exif = $state<ExifData | null>(null);
	exifLoading = $state(false);
	exifError = $state<string | null>(null);
	exifChecked = $state(false);
	/**
	 * True when the browser's own image pipeline cannot render the source file
	 * (e.g. raw camera formats like DNG). The image still processes fine in
	 * wasm; only the in-browser preview is unavailable until then.
	 */
	originalPreviewFailed = $state(false);
	/**
	 * Electron-only advisory for files over the 50MB limit. Null when the
	 * current source is within the limit (or when running on web, where the
	 * limit remains a hard error). The shell renders a dialog from this;
	 * dismissing keeps the loaded image, closing discards it.
	 */
	largeFileWarning = $state<LargeFileWarning | null>(null);
	private _wasmInitPromise: Promise<void> | null = null;
	settings = $state<MagickSettings>({
		...DEFAULT_SETTINGS,
		levelBlackpoint: {
			All: [...DEFAULT_SETTINGS.levelBlackpoint.All],
			Red: [...DEFAULT_SETTINGS.levelBlackpoint.Red],
			Green: [...DEFAULT_SETTINGS.levelBlackpoint.Green],
			Blue: [...DEFAULT_SETTINGS.levelBlackpoint.Blue]
		},
		levelWhitepoint: {
			All: [...DEFAULT_SETTINGS.levelWhitepoint.All],
			Red: [...DEFAULT_SETTINGS.levelWhitepoint.Red],
			Green: [...DEFAULT_SETTINGS.levelWhitepoint.Green],
			Blue: [...DEFAULT_SETTINGS.levelWhitepoint.Blue]
		},
		levelGamma: {
			All: [...DEFAULT_SETTINGS.levelGamma.All],
			Red: [...DEFAULT_SETTINGS.levelGamma.Red],
			Green: [...DEFAULT_SETTINGS.levelGamma.Green],
			Blue: [...DEFAULT_SETTINGS.levelGamma.Blue]
		},
		...loadPersistedSettings()
	});
	workerReady = $state(false);
	/**
	 * True once the Electron main process confirms a bundled native
	 * ImageMagick binary is available. RAW files additionally require
	 * `nativeRawAvailable`; otherwise `processImage()` routes them through WASM.
	 */
	nativeAvailable = $state(false);
	/** True when the native bundle has internal LibRaw support for camera RAW. */
	nativeRawAvailable = $state(false);
	nativeExportFormats = $state<ExportFormat[]>([]);
	wasmExportFormats = $state<ExportFormat[]>([]);

	/** Formats reported by the engine that will process the current source. */
	get exportFormats(): readonly ExportFormat[] {
		const formats = this.engine === 'native' ? this.nativeExportFormats : this.wasmExportFormats;
		return formats.length > 0 ? formats : FALLBACK_EXPORT_FORMATS;
	}

	ensureSelectedExportFormat(): void {
		const selected = this.settings.imageFormat.toUpperCase();
		const formats = this.exportFormats;
		if (formats.some((format) => format.value.toUpperCase() === selected)) return;
		const replacement = formats[0];
		if (!replacement) return;
		this.settings.imageFormat = replacement.value;
		persistSettings(this.settings);
	}

	/** Active engine for the current source; RAW can use WASM on native-only bundles. */
	get engine(): 'native' | 'wasm' {
		return this.nativeAvailable && (!isRawInputName(this.originalName) || this.nativeRawAvailable)
			? 'native'
			: 'wasm';
	}

	/**
	 * True when a processed preview exists but settings have changed since
	 * it was rendered. History navigation restores settings and preview
	 * together (and re-marks them fresh), so it never trips this — only
	 * real edits after a process do.
	 */
	get isStale(): boolean {
		if (!this.processedImageUrl || this.lastProcessedSignature == null) return false;
		return JSON.stringify(this.settings) !== this.lastProcessedSignature;
	}

	/** Snapshot current settings as the ones the visible preview was rendered from. */
	markPreviewFresh(): void {
		this.lastProcessedSignature = JSON.stringify(this.settings);
	}

	/** Forget the preview snapshot (new/closed image, or reverted to original). */
	clearPreviewSnapshot(): void {
		this.lastProcessedSignature = null;
	}

	private _worker: Worker | null = null;
	private _workerSourceRevision: number | null = null;
	private _nativeSourceRevision: number | null = null;
	private _nativeRequestId = 0;
	private _sourceRevision = 0;
	private _previewRequestId = 0;
	private _requestId = 0;
	private _latestWorkerRequestId = 0;
	cropMode = $state(false);
	cropAspectRatio = $state<string>('free');
	// The in-progress visual crop selection, kept outside the overlay so it
	// survives viewport remounts (e.g. crossing the mobile breakpoint).
	cropSelection = $state<CropRect | null>(null);

	toggleCropMode(): void {
		this.cropMode = !this.cropMode;
		if (!this.cropMode) this.cropSelection = null;
	}

	cancelCrop(): void {
		this.cropMode = false;
		this.cropSelection = null;
	}

	confirmCrop(rect: CropRect): void {
		const { offsetX, offsetY } = computeCropStepOffset(this.settings);
		this.settings.cropX = offsetX + rect.x;
		this.settings.cropY = offsetY + rect.y;
		this.settings.cropW = rect.w;
		this.settings.cropH = rect.h;
		this.cropSelection = null;
		this.cropMode = false;
	}

	// Non-reactive internal request map (intentionally plain Map).
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private _pendingRequests = new Map<
		number,
		{ debugMode: boolean; onComplete?: () => void; startTime: number; sourceRevision: number }
	>();
	private _processTimer: ReturnType<typeof setTimeout> | null = null;
	// In-flight EXIF extraction. Extractions are chained behind this so two
	// runs never interleave on the shared ExifTool wasm engine (its output
	// buffers are module-scoped; concurrent runs corrupt each other).
	private _exifPromise: Promise<void> | null = null;
	private _annotationMetricsKey = '';
	private _annotationMetricsRequest = 0;

	private async sourceExifOrientation(): Promise<ReturnType<typeof parseExifOrientation>> {
		if (!this.sourceBytes) return null;
		await this.ensureExif();
		if (!this.exif) return null;
		const entry = this.exif.all.find((item) => item.label === 'Orientation');
		return parseExifOrientation(entry?.value);
	}

	hexToRgb(hex: string): { r: number; g: number; b: number } {
		let r = 0,
			g = 0,
			b = 0;
		if (hex.startsWith('#')) hex = hex.slice(1);
		const isValid = /^[0-9a-fA-F]+$/.test(hex) && (hex.length === 3 || hex.length === 6);
		if (!isValid) return { r: 0, g: 0, b: 0 };
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
	 * Probe for a bundled native ImageMagick binary (Electron only). Returns
	 * true when the native engine should be used; the caller should then skip
	 * `initWasm()`/`initWorker()` entirely.
	 *
	 * On success `wasmLoaded` is also set: it is the app-wide "engine ready"
	 * flag that the viewport and panels gate on. Without it the UI would sit
	 * on the loading screen forever despite the native engine being ready.
	 */
	async initNative(): Promise<boolean> {
		try {
			if (typeof window === 'undefined' || !window.wasmagick?.isNativeAvailable) {
				return false;
			}
			this.nativeAvailable = await window.wasmagick.isNativeAvailable();
			if (this.nativeAvailable) {
				if (window.wasmagick.listNativeFormats) {
					try {
						const nativeFormats = await window.wasmagick.listNativeFormats();
						this.nativeExportFormats = orderExportFormats(nativeFormats);
						this.ensureSelectedExportFormat();
					} catch (error) {
						console.warn('Could not query native export formats:', error);
					}
				}
				this.nativeRawAvailable = window.wasmagick.isNativeRawAvailable
					? await window.wasmagick.isNativeRawAvailable()
					: true;
				// A native-only bundle is ready for ordinary images, but RAW files
				// need the WASM engine unless the native probe found LibRaw.
				this.wasmLoaded = this.nativeRawAvailable;
				this.statsMessage = 'Ready (native ImageMagick)';
			}
			return this.nativeAvailable;
		} catch {
			this.nativeAvailable = false;
			return false;
		}
	}

	/** Refresh the preview metrics from the active ImageMagick engine. */
	async refreshAnnotationTextMetrics(keyOverride?: string): Promise<void> {
		const text = this.settings.annotateText;
		const font = this.settings.annotateFontFamily;
		const fontSize = this.settings.annotateFontSize[0];
		const angle = this.settings.annotateAngle[0];
		const key =
			keyOverride ?? `${this.engine}\u0000${font}\u0000${fontSize}\u0000${angle}\u0000${text}`;
		if (key === this._annotationMetricsKey) return;
		this._annotationMetricsKey = key;
		const request = ++this._annotationMetricsRequest;

		if (!text.trim() || angle !== 0) {
			this.annotationTextMetrics = null;
			return;
		}

		try {
			if (this.nativeAvailable && window.wasmagick?.getNativeFontMetrics) {
				const fontData = getFontBytes(font) ?? (await fetchFontBytes(font));
				if (fontData) {
					const metrics = await window.wasmagick.getNativeFontMetrics({
						text,
						fontSize,
						fontData,
						fontFileName: getFontFileName(font) ?? `${font}.ttf`
					});
					if (request === this._annotationMetricsRequest) {
						this.annotationTextMetrics = metrics;
					}
				}
			}
		} catch (err) {
			console.warn('Could not load ImageMagick annotation metrics:', err);
			if (request === this._annotationMetricsRequest) this.annotationTextMetrics = null;
		}
	}

	async initWasm(debugMode = false): Promise<void> {
		if (this.wasmLoaded) return;
		if (this._wasmInitPromise) return this._wasmInitPromise;
		const promise = this.initializeWasm(debugMode);
		this._wasmInitPromise = promise;
		try {
			await promise;
		} finally {
			if (this._wasmInitPromise === promise) this._wasmInitPromise = null;
		}
	}

	private async initializeWasm(debugMode = false): Promise<void> {
		try {
			this.currentProcessingStep = 'Downloading WASM binary...';
			const response = await fetch('/magick.wasm');
			if (!response.ok) {
				throw new Error(`Failed to fetch WASM: ${response.status}`);
			}
			this.currentProcessingStep = 'Parsing WebAssembly module...';
			const wasmBytes = new Uint8Array(await response.arrayBuffer());
			this.currentProcessingStep = 'Initializing ImageMagick engine...';
			// Dynamically imported so the engine stays out of the initial chunk;
			// the worker bundle and the lazy main-thread fallback each load
			// their own copy on demand.
			const { initializeImageMagick } = await import('@imagemagick/magick-wasm');
			await initializeImageMagick(wasmBytes);
			this.currentProcessingStep = 'Loading fonts...';
			await ensureFont(DEFAULT_FONT);
			this.wasmExportFormats = await getWasmExportFormats();
			this.ensureSelectedExportFormat();
			this.wasmLoaded = true;
			this.currentProcessingStep = null;
			await this.renderOriginalPreview();

			if (debugMode) {
				const { Magick } = await import('@imagemagick/magick-wasm');
				console.log('ImageMagick WASM loaded, Version:', Magick.imageMagickVersion);
			}

			this._setupResumeDetection();
		} catch (e) {
			this.statsMessage = 'Error Loading WASM';
			this.hasError = true;
			this.currentProcessingStep = null;
			const message = e instanceof Error ? e.message : 'Unknown error';
			this.errorMessage = message;
			console.error('WASM initialization failed:', message);

			throw e;
		}
	}

	private _resumeTeardown: (() => void) | null = null;

	private _setupResumeDetection(): void {
		if (this._resumeTeardown) this._resumeTeardown();
		const cleanupFns: (() => void)[] = [];

		const handlePageshow = (e: PageTransitionEvent) => {
			if (e.persisted && !this.wasmLoaded) {
				this.wasmLoaded = false;
				this.initWasm(false).catch(() => {});
			}
		};
		window.addEventListener('pageshow', handlePageshow);
		cleanupFns.push(() => window.removeEventListener('pageshow', handlePageshow));

		const handleVisibility = () => {
			if (document.visibilityState === 'visible' && this.wasmLoaded) {
				void (async () => {
					try {
						const { Magick } = await import('@imagemagick/magick-wasm');
						const version = Magick.imageMagickVersion;
						if (!version) {
							this.wasmLoaded = false;
							this.initWasm(false).catch(() => {});
						}
					} catch {
						this.wasmLoaded = false;
						this.initWasm(false).catch(() => {});
					}
				})();
			}
		};
		document.addEventListener('visibilitychange', handleVisibility);
		cleanupFns.push(() => document.removeEventListener('visibilitychange', handleVisibility));

		this._resumeTeardown = () => {
			for (const fn of cleanupFns) fn();
		};
	}

	initWorker(): void {
		if (typeof Worker === 'undefined') return;
		if (this._worker) return;

		try {
			this._workerSourceRevision = null;
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			this._worker = new Worker(new URL('./magick.worker.ts', import.meta.url), {
				type: 'module'
			});

			this._worker.onmessage = (e: MessageEvent) => {
				const { id, sourceRevision, result, error } = e.data;
				const pending = this._pendingRequests.get(id);
				if (!pending) return;
				this._pendingRequests.delete(id);
				if (
					sourceRevision !== this._sourceRevision ||
					pending.sourceRevision !== sourceRevision ||
					id !== this._latestWorkerRequestId
				) {
					return;
				}

				if (error) {
					this.hasError = true;
					this.errorMessage = error;

					this.isLoading = false;
					this.currentProcessingStep = null;
					return;
				}

				const { data, previewData, previewWidth, previewHeight, width, height, format } = result;
				const elapsed = Math.round(performance.now() - pending.startTime);

				const appliedOptions: AppliedOptions = {};
				if (pending.debugMode) {
					appliedOptions.outputDimensions = { width, height };
					appliedOptions.outputSize = data.length;
					appliedOptions.processTime = elapsed + 'ms';
					console.log('ImageMagickSettings', {
						...this.settings,
						...appliedOptions
					});
				}

				this.handleDownload(
					data,
					format,
					elapsed,
					width,
					height,
					appliedOptions,
					previewData,
					previewWidth,
					previewHeight
				);

				if (pending.onComplete) pending.onComplete();
			};

			this._worker.onerror = (err) => {
				console.error('Worker error:', err);
				this._worker?.terminate();
				this._worker = null;
				this._workerSourceRevision = null;
				this.workerReady = false;
				for (const [, _pending] of this._pendingRequests) {
					this.hasError = true;
					this.errorMessage = 'Worker crashed';
					this.isLoading = false;
					this.currentProcessingStep = null;
				}
				this._pendingRequests.clear();
			};

			this.workerReady = true;
		} catch (err) {
			console.warn('Could not initialize Web Worker. Falling back to main thread.', err);
		}
	}

	private validateFile(file: File): { isValid: boolean; error?: string } {
		if (!file) {
			return { isValid: false, error: 'No file provided' };
		}

		if (file.size > MAX_FILE_SIZE) {
			// Electron routes large files through the native engine, so the
			// limit is advisory there (surfaced via `largeFileWarning` after
			// load). Web keeps the hard block.
			if (isElectronEnv()) return { isValid: true };
			return {
				isValid: false,
				error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
			};
		}

		// No format gate here: any file the magick-wasm build can read (see
		// `IMAGE_FILE_ACCEPT`) is allowed through; unreadable content surfaces
		// as a load/process error instead.
		return { isValid: true };
	}

	/** Dismiss the large-file advisory and keep the loaded image. */
	dismissLargeFileWarning(): void {
		this.largeFileWarning = null;
	}

	resetGeometry(): void {
		this.settings.resizeW = DEFAULT_SETTINGS.resizeW;
		this.settings.resizeH = DEFAULT_SETTINGS.resizeH;
		this.settings.rotate = DEFAULT_SETTINGS.rotate;
		this.settings.flop = DEFAULT_SETTINGS.flop;
		this.settings.flip = DEFAULT_SETTINGS.flip;
		this.settings.borderColor = DEFAULT_SETTINGS.borderColor;
		this.settings.borderSize = [...DEFAULT_SETTINGS.borderSize];
		this.settings.extentW = DEFAULT_SETTINGS.extentW;
		this.settings.extentH = DEFAULT_SETTINGS.extentH;
		this.settings.extentGravity = DEFAULT_SETTINGS.extentGravity;
		this.settings.extentBgColor = DEFAULT_SETTINGS.extentBgColor;
		this.settings.deskewThreshold = [...DEFAULT_SETTINGS.deskewThreshold];
		this.settings.deskewAutoCrop = DEFAULT_SETTINGS.deskewAutoCrop;
		this.settings.cropW = DEFAULT_SETTINGS.cropW;
		this.settings.cropH = DEFAULT_SETTINGS.cropH;
		this.settings.cropGravity = DEFAULT_SETTINGS.cropGravity;
		this.settings.cropX = DEFAULT_SETTINGS.cropX;
		this.settings.cropY = DEFAULT_SETTINGS.cropY;
		this.settings.trimEdges = DEFAULT_SETTINGS.trimEdges;
		this.settings.autoOrient = DEFAULT_SETTINGS.autoOrient;
		this.settings.shaveX = DEFAULT_SETTINGS.shaveX;
		this.settings.shaveY = DEFAULT_SETTINGS.shaveY;
	}

	resetColor(): void {
		this.settings.brightness = [...DEFAULT_SETTINGS.brightness];
		this.settings.saturation = [...DEFAULT_SETTINGS.saturation];
		this.settings.hue = [...DEFAULT_SETTINGS.hue];
		this.settings.contrast = [...DEFAULT_SETTINGS.contrast];
		this.settings.colorSpace = DEFAULT_SETTINGS.colorSpace;
		this.settings.normalizeImage = DEFAULT_SETTINGS.normalizeImage;
		this.settings.autoLevel = DEFAULT_SETTINGS.autoLevel;
		this.settings.levelBlackpoint = { All: [0], Red: [0], Green: [0], Blue: [0] };
		this.settings.levelWhitepoint = { All: [100], Red: [100], Green: [100], Blue: [100] };
		this.settings.levelGamma = { All: [1.0], Red: [1.0], Green: [1.0], Blue: [1.0] };
		this.settings.levelChannels = DEFAULT_SETTINGS.levelChannels;
		this.settings.levelColorsBlack = DEFAULT_SETTINGS.levelColorsBlack;
		this.settings.levelColorsWhite = DEFAULT_SETTINGS.levelColorsWhite;
		this.settings.levelColorsChannels = DEFAULT_SETTINGS.levelColorsChannels;
		this.settings.levelColorsInverse = DEFAULT_SETTINGS.levelColorsInverse;
		this.settings.thresholdPercentage = [...DEFAULT_SETTINGS.thresholdPercentage];
		this.settings.thresholdChannels = DEFAULT_SETTINGS.thresholdChannels;
		this.settings.sigmoidalContrast = [...DEFAULT_SETTINGS.sigmoidalContrast];
		this.settings.sigmoidalMidpoint = [...DEFAULT_SETTINGS.sigmoidalMidpoint];
		this.settings.sigmoidalChannels = DEFAULT_SETTINGS.sigmoidalChannels;
		this.settings.autoGamma = DEFAULT_SETTINGS.autoGamma;
		this.settings.autoThreshold = DEFAULT_SETTINGS.autoThreshold;
		this.settings.blackThreshold = [...DEFAULT_SETTINGS.blackThreshold];
		this.settings.whiteThreshold = [...DEFAULT_SETTINGS.whiteThreshold];
		this.settings.claheXTiles = [...DEFAULT_SETTINGS.claheXTiles];
		this.settings.claheYTiles = [...DEFAULT_SETTINGS.claheYTiles];
		this.settings.claheBins = [...DEFAULT_SETTINGS.claheBins];
		this.settings.claheClipLimit = [...DEFAULT_SETTINGS.claheClipLimit];
	}

	resetFilters(): void {
		this.settings.effect = DEFAULT_SETTINGS.effect;
		this.settings.blur = [...DEFAULT_SETTINGS.blur];
		this.settings.sharpen = [...DEFAULT_SETTINGS.sharpen];
		this.settings.gaussianBlurRadius = [...DEFAULT_SETTINGS.gaussianBlurRadius];
		this.settings.gaussianBlurSigma = [...DEFAULT_SETTINGS.gaussianBlurSigma];
		this.settings.motionBlurRadius = [...DEFAULT_SETTINGS.motionBlurRadius];
		this.settings.motionBlurSigma = [...DEFAULT_SETTINGS.motionBlurSigma];
		this.settings.motionBlurAngle = [...DEFAULT_SETTINGS.motionBlurAngle];
		this.settings.addNoiseType = DEFAULT_SETTINGS.addNoiseType;
		this.settings.addNoiseAttenuate = [...DEFAULT_SETTINGS.addNoiseAttenuate];
		this.settings.adaptiveSharpenRadius = [...DEFAULT_SETTINGS.adaptiveSharpenRadius];
		this.settings.adaptiveSharpenSigma = [...DEFAULT_SETTINGS.adaptiveSharpenSigma];
		this.settings.adaptiveBlurRadius = [...DEFAULT_SETTINGS.adaptiveBlurRadius];
		this.settings.adaptiveBlurSigma = [...DEFAULT_SETTINGS.adaptiveBlurSigma];
		this.settings.sepiaThreshold = [...DEFAULT_SETTINGS.sepiaThreshold];
		this.settings.charcoalIntensity = [...DEFAULT_SETTINGS.charcoalIntensity];
		this.settings.cannyEdgeStrength = [...DEFAULT_SETTINGS.cannyEdgeStrength];
		this.settings.cannyEdgeLower = [...DEFAULT_SETTINGS.cannyEdgeLower];
		this.settings.cannyEdgeUpper = [...DEFAULT_SETTINGS.cannyEdgeUpper];
		this.settings.oilpaintRadius = [...DEFAULT_SETTINGS.oilpaintRadius];
		this.settings.solarizeFactor = [...DEFAULT_SETTINGS.solarizeFactor];
		this.settings.bilateralWidth = [...DEFAULT_SETTINGS.bilateralWidth];
		this.settings.bilateralHeight = [...DEFAULT_SETTINGS.bilateralHeight];
		this.settings.bilateralIntensitySigma = [...DEFAULT_SETTINGS.bilateralIntensitySigma];
		this.settings.bilateralSpatialSigma = [...DEFAULT_SETTINGS.bilateralSpatialSigma];
		this.settings.clutMap = DEFAULT_SETTINGS.clutMap;
		this.settings.clutInterpolation = DEFAULT_SETTINGS.clutInterpolation;
		this.resetQuantize();
	}

	resetQuantize(): void {
		this.settings.quantizeColors = [...DEFAULT_SETTINGS.quantizeColors];
		this.settings.ditherMethod = DEFAULT_SETTINGS.ditherMethod;
		this.settings.quantizeColorSpace = DEFAULT_SETTINGS.quantizeColorSpace;
		this.settings.quantizeTreeDepth = [...DEFAULT_SETTINGS.quantizeTreeDepth];
		this.settings.measureErrors = DEFAULT_SETTINGS.measureErrors;
	}

	resetExport(): void {
		this.settings.imageFormat = DEFAULT_SETTINGS.imageFormat;
		this.ensureSelectedExportFormat();
		this.settings.quality = [...DEFAULT_SETTINGS.quality];
		this.settings.stripMeta = DEFAULT_SETTINGS.stripMeta;
		persistSettings(this.settings);
	}

	resetAnnotate(): void {
		this.settings.annotateText = DEFAULT_SETTINGS.annotateText;
		this.settings.annotateFontFamily = DEFAULT_SETTINGS.annotateFontFamily;
		this.settings.annotateFontSize = [...DEFAULT_SETTINGS.annotateFontSize];
		this.settings.annotateFontColor = DEFAULT_SETTINGS.annotateFontColor;
		this.settings.annotateGravity = DEFAULT_SETTINGS.annotateGravity;
		this.settings.annotateOffsetX = DEFAULT_SETTINGS.annotateOffsetX;
		this.settings.annotateOffsetY = DEFAULT_SETTINGS.annotateOffsetY;
		this.settings.annotateAngle = [...DEFAULT_SETTINGS.annotateAngle];
		this.settings.annotateStroke = DEFAULT_SETTINGS.annotateStroke;
		this.settings.annotateStrokeColor = DEFAULT_SETTINGS.annotateStrokeColor;
		this.settings.annotateStrokeWidth = [...DEFAULT_SETTINGS.annotateStrokeWidth];
	}

	resetSettings(): void {
		this.resetExport();
		this.resetGeometry();
		this.resetColor();
		this.resetFilters();
		this.resetAnnotate();
	}

	debouncedProcess(debugMode = false, onComplete?: () => void): void {
		if (this._processTimer) clearTimeout(this._processTimer);
		this._processTimer = setTimeout(() => {
			this.processImage(debugMode, onComplete);
		}, AUTO_PROCESS_DELAY);
	}

	async setSourceFile(file: File): Promise<boolean> {
		this.hasError = false;
		this.errorMessage = null;
		this.largeFileWarning = null;

		const validation = this.validateFile(file);
		if (!validation.isValid) {
			this.hasError = true;
			this.errorMessage = validation.error ?? 'Invalid file';
			return false;
		}

		this.originalName = file.name;

		let format: string | null = file.type ? file.type.split('/')[1] : null;
		if (!format) {
			const nameParts = file.name.split('.');
			format = nameParts.length > 1 ? (nameParts.pop() ?? null) : null;
		}
		this.originalImageFormat = format ? format.toLowerCase() : null;
		this.ensureSelectedExportFormat();

		try {
			const buffer = await file.arrayBuffer();
			this.sourceBytes = new Uint8Array(buffer);
			this._sourceRevision++;
			this._previewRequestId++;
			const source = this.sourceBytes;
			const sourceRevision = this._sourceRevision;
			this._nativeSourceRevision = null;
			this.originalImageSize = this.sourceBytes.length;

			const fastDims = fastImageDimensions(this.sourceBytes);
			if (fastDims) {
				this.originalWidth = fastDims.width;
				this.originalHeight = fastDims.height;
			}

			this.revokeImageUrls();
			this.originalImageUrl = URL.createObjectURL(
				new Blob([this.sourceBytes as unknown as BlobPart])
			);
			this.originalPreviewData = null;
			this.originalPreviewWidth = 0;
			this.originalPreviewHeight = 0;
			this.originalPreviewFull = false;
			this.originalPreviewLoading = false;
			this.originalPreviewFailed = false;
			this.clearPreviewSnapshot();

			this.processedImageFormat = null;
			this.processedPreviewData = null;
			this.processedPreviewWidth = 0;
			this.processedPreviewHeight = 0;
			this.processedImageName = null;
			this.processedWidth = 0;
			this.processedHeight = 0;

			this.exif = null;
			this.exifLoading = false;
			this.exifError = null;
			this.exifChecked = false;

			this.statsMessage = 'Ready';
			this.hasUnsavedEdits = false;
			if (file.size > MAX_FILE_SIZE && isElectronEnv()) {
				this.largeFileWarning = {
					fileName: file.name,
					sizeMB: Math.round((file.size / 1024 / 1024) * 10) / 10
				};
			}
			void this.prepareOriginalPreview(source, sourceRevision, fastDims);
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to read file';
			this.statsMessage = message;
			this.hasError = true;
			this.errorMessage = message;
			return false;
		}
	}

	clearSource(): void {
		this.sourceBytes = null;
		this._nativeSourceRevision = null;
		this.revokeImageUrls();
		this.originalName = 'image';
		this.originalImageSize = 0;
		this.originalImageUrl = null;
		this.originalPreviewData = null;
		this.originalPreviewWidth = 0;
		this.originalPreviewHeight = 0;
		this.originalPreviewFull = false;
		this.originalPreviewLoading = false;
		this.originalImageFormat = null;
		this.originalWidth = 0;
		this.originalHeight = 0;
		this.processedImageUrl = null;
		this.processedPreviewData = null;
		this.processedImageFormat = null;
		this.processedImageName = null;
		this.processedImageTime = 0;
		this.processedImageDelta = 'N/A';
		this.processedWidth = 0;
		this.processedHeight = 0;
		this.statsMessage = 'Ready';
		this.hasUnsavedEdits = false;
		this.currentProcessingStep = null;
		this.clearPreviewSnapshot();
		this.exif = null;
		this.exifLoading = false;
		this.exifError = null;
		this.exifChecked = false;
		this.originalPreviewFailed = false;
		this.largeFileWarning = null;
	}

	private async prepareOriginalPreview(
		source: Uint8Array,
		sourceRevision: number,
		dimensions: { width: number; height: number } | null
	): Promise<void> {
		const previewRequestId = this._previewRequestId;
		this.originalPreviewLoading = true;
		try {
			const format = this.originalImageFormat?.toUpperCase();
			const browserRenderable = !!format && BROWSER_RENDERABLE_FORMATS.has(format);
			const oversized = needsInteractivePreview(dimensions, this.nativeAvailable);
			if (browserRenderable && !oversized) {
				this.originalPreviewFailed = false;
				return;
			}
			if (
				this.nativeAvailable &&
				(await this.renderNativeOriginalPreview(source, false, previewRequestId))
			)
				return;
			const preview = browserRenderable ? await browserPreview(source, dimensions) : null;
			if (
				this.sourceBytes !== source ||
				this._sourceRevision !== sourceRevision ||
				this._previewRequestId !== previewRequestId
			)
				return;
			if (preview) {
				this.originalPreviewData = preview.data;
				this.originalPreviewWidth = preview.width;
				this.originalPreviewHeight = preview.height;
				this.originalPreviewFailed = false;
				if (!dimensions) {
					this.originalWidth = preview.sourceWidth;
					this.originalHeight = preview.sourceHeight;
				}
				return;
			}

			this.originalPreviewFailed = true;
			if (
				this.nativeAvailable &&
				(await this.renderNativeOriginalPreview(source, false, previewRequestId))
			)
				return;
			if (this.wasmLoaded) await this.renderOriginalPreview();
			else await this.initWasm();
		} finally {
			if (this.sourceBytes === source && this._sourceRevision === sourceRevision) {
				this.originalPreviewLoading = false;
			}
		}
	}

	async renderOriginalPreview(fullResolution = false): Promise<void> {
		const source = this.sourceBytes;
		const previewRequestId = this._previewRequestId;
		if (this.isLoading) return;
		if (!source || (this.originalPreviewData && (!fullResolution || this.originalPreviewFull)))
			return;
		this.originalPreviewLoading = true;
		try {
			if (
				fullResolution &&
				this.nativeAvailable &&
				(await this.renderNativeOriginalPreview(source, true, previewRequestId))
			)
				return;
			if (fullResolution) {
				const preview = await browserPreview(
					source,
					this.originalWidth && this.originalHeight
						? { width: this.originalWidth, height: this.originalHeight }
						: null,
					WEB_FULL_PREVIEW_MAX_EDGE
				);
				if (this.sourceBytes !== source || this._previewRequestId !== previewRequestId) return;
				if (preview) {
					this.originalPreviewData = preview.data;
					this.originalPreviewWidth = preview.width;
					this.originalPreviewHeight = preview.height;
					this.originalPreviewFailed = false;
					this.originalPreviewFull = true;
					return;
				}
			}
			try {
				const { readImageWithFilename } = await import('./magick-process');
				readImageWithFilename(source, this.originalName, (image) => {
					if (this.settings.autoOrient) image.autoOrient();
					const sourceWidth = image.width;
					const sourceHeight = image.height;
					const maxEdge = fullResolution ? WEB_FULL_PREVIEW_MAX_EDGE : PREVIEW_MAX_EDGE;
					{
						const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
						if (scale < 1)
							image.resize(
								Math.max(1, Math.round(image.width * scale)),
								Math.max(1, Math.round(image.height * scale))
							);
					}
					const width = image.width;
					const height = image.height;
					const data = image.getPixels(
						(pixels) => pixels.toByteArray(0, 0, width, height, 'RGBA') ?? new Uint8Array()
					);
					if (
						this.sourceBytes === source &&
						this._previewRequestId === previewRequestId &&
						data.length === width * height * 4
					) {
						this.originalWidth = sourceWidth;
						this.originalHeight = sourceHeight;
						this.originalPreviewData = data;
						this.originalPreviewWidth = width;
						this.originalPreviewHeight = height;
						this.originalPreviewFailed = false;
						this.originalPreviewFull = fullResolution;
					}
				});
			} catch (error) {
				if (await this.renderNativeOriginalPreview(source, fullResolution, previewRequestId))
					return;
				console.warn('Could not render imported image preview:', error);
			}
		} finally {
			if (this.sourceBytes === source) this.originalPreviewLoading = false;
		}
	}

	handleOriginalImageError(): void {
		if (this.originalPreviewData || this.originalPreviewLoading) return;
		this.originalPreviewFailed = true;
		void this.renderOriginalPreview();
	}

	private async renderNativeOriginalPreview(
		source: Uint8Array,
		fullResolution: boolean,
		previewRequestId = this._previewRequestId
	): Promise<boolean> {
		if (!window.wasmagick?.processNativeImage) return false;
		try {
			const result = await window.wasmagick.processNativeImage({
				inputName: this.originalName,
				inputData: source,
				sourceRevision: this._sourceRevision,
				args: fullResolution ? ['-auto-orient'] : ['-auto-orient', '-resize', '2048x2048>'],
				outputExtension: 'png',
				outputFormat: 'PNG',
				previewOnly: true,
				previewMaxEdge: fullResolution ? WEB_FULL_PREVIEW_MAX_EDGE : PREVIEW_MAX_EDGE
			});
			if (
				this.sourceBytes !== source ||
				this._previewRequestId !== previewRequestId ||
				!result.previewData?.length
			)
				return false;
			this.originalPreviewData = result.previewData;
			this.originalPreviewWidth = result.previewWidth ?? result.width;
			this.originalPreviewHeight = result.previewHeight ?? result.height;
			this.originalWidth = result.logicalWidth ?? result.width;
			this.originalHeight = result.logicalHeight ?? result.height;
			this.originalPreviewFailed = false;
			this.originalPreviewFull = fullResolution;
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Lazily extract the source file's EXIF for the Export section. The heavy
	 * ExifTool wasm engine is only fetched/started on the first open, and the
	 * result is cached until a new file is loaded.
	 */
	async ensureExif(): Promise<void> {
		if (this.exifLoading || this.exifChecked || !this.sourceBytes) return;
		const bytes = this.sourceBytes;
		const previous = this._exifPromise;
		this.exifLoading = true;
		this.exifError = null;
		this._exifPromise = (async () => {
			// Wait for any earlier run (it belongs to an older file; its
			// result is discarded by the identity guard below) before
			// starting this one, so parseMetadata never runs concurrently.
			if (previous) {
				await previous.catch(() => {});
			}
			try {
				const summary = await extractExif(bytes, this.originalName);
				if (this.sourceBytes === bytes) {
					this.exif = summary;
				}
			} catch {
				if (this.sourceBytes === bytes) {
					this.exifError = EXIF_UNSUPPORTED_MESSAGE;
				}
			} finally {
				if (this.sourceBytes === bytes) {
					this.exifChecked = true;
					this.exifLoading = false;
				}
			}
		})();
		await this._exifPromise;
	}

	private revokeImageUrls(): void {
		if (this.originalImageUrl) {
			URL.revokeObjectURL(this.originalImageUrl);
			this.originalImageUrl = null;
		}
		if (this.processedImageUrl) {
			URL.revokeObjectURL(this.processedImageUrl);
			this.processedImageUrl = null;
		}
		if (this.processedPreviewUrl) {
			URL.revokeObjectURL(this.processedPreviewUrl);
			this.processedPreviewUrl = null;
		}
	}

	// NOTE: Sending font data over postMessage causes OOM errors.
	// Kept as reference for future font-registration via the worker.
	syncFontsToWorker(fonts: { name: string; data: Uint8Array }[]): void {
		if (!this._worker || !this.workerReady) return;
		this._worker.postMessage({
			type: 'registerFonts',
			fonts: fonts.map((f) => ({ name: f.name, data: Array.from(f.data) }))
		});
	}

	processImage(debugMode = false, onComplete?: () => void): void {
		this.hasError = false;
		this.errorMessage = null;

		if (!this.sourceBytes) {
			this.statsMessage = 'No Image';
			return;
		}

		const useNative =
			this.nativeAvailable &&
			window.wasmagick?.processNativeImage &&
			(!isRawInputName(this.originalName) || this.nativeRawAvailable);
		if (useNative) {
			this._processViaNative(debugMode, onComplete);
			return;
		}

		if (!this.wasmLoaded) {
			this.statsMessage = 'WASM Not Ready';
			return;
		}

		this.isLoading = true;

		if (this._worker && this.workerReady && !isLocalFont(this.settings.annotateFontFamily)) {
			this._processViaWorker(debugMode, onComplete);
		} else {
			this._processOnMainThread(debugMode, onComplete);
		}
	}

	private async _processViaNative(debugMode = false, onComplete?: () => void): Promise<void> {
		const requestId = ++this._nativeRequestId;
		const sourceRevision = this._sourceRevision;
		this.hasError = false;
		this.errorMessage = null;
		this.isLoading = true;
		this.currentProcessingStep = 'Processing with native engine...';
		const startTime = performance.now();

		try {
			const settings = snapSettings(this.settings);
			const plan = buildNativeProcessingPlan(settings, this.originalName);
			this.currentProcessingStep =
				plan.backend === 'magick'
					? 'Processing with native ImageMagick...'
					: 'Processing with native engine...';
			const orientation = settings.autoOrient ? await this.sourceExifOrientation() : null;
			const built = buildNativeMagickArgs(settings, {
				width: this.originalWidth,
				height: this.originalHeight,
				orientation,
				inputName: this.originalName
			});
			const args = [...built.args];

			let clutData: Uint8Array | null = null;
			if (built.needsClut) {
				clutData = await renderClutPngBytes(built.needsClut);
			}

			let fontData: Uint8Array | null = null;
			let fontFileName: string | null = null;
			if (built.needsFont) {
				fontData = getFontBytes(built.needsFont) ?? (await fetchFontBytes(built.needsFont));
				fontFileName = getFontFileName(built.needsFont) ?? `${built.needsFont}.ttf`;
				if (!fontData) {
					// No font bytes (e.g. unregistered local font): drop the
					// -font flag and let ImageMagick fall back to its default.
					const fontFlag = args.indexOf('-font');
					if (fontFlag >= 0) args.splice(fontFlag, 2);
				}
			}

			if (debugMode) {
				console.log('NativeProcessingPlan', plan);
				console.log('NativeImageMagick', { args, format: settings.imageFormat });
			}

			const result = await window.wasmagick!.processNativeImage({
				inputName: this.originalName,
				inputData:
					this._nativeSourceRevision === this._sourceRevision ? undefined : this.sourceBytes!,
				sourceRevision: this._sourceRevision,
				args,
				outputExtension: built.outputExtension,
				outputFormat: settings.imageFormat,
				plan,
				orientation,
				clutData,
				fontData,
				fontFileName
			});
			if (requestId !== this._nativeRequestId || sourceRevision !== this._sourceRevision) return;
			this._nativeSourceRevision = this._sourceRevision;

			const elapsed = Math.round(performance.now() - startTime);
			const appliedOptions: AppliedOptions = {};
			if (debugMode) {
				appliedOptions.outputDimensions = { width: result.width, height: result.height };
				appliedOptions.outputSize = result.data.length;
				appliedOptions.processTime = elapsed + 'ms';
				console.log('ImageMagickSettings', { ...this.settings, ...appliedOptions });
			}
			this.handleDownload(
				result.data,
				result.format,
				elapsed,
				result.width,
				result.height,
				appliedOptions,
				result.previewData,
				result.previewWidth,
				result.previewHeight,
				result.previewImageData,
				result.previewImageFormat,
				result.backend
			);
			if (onComplete) onComplete();
		} catch (err: unknown) {
			console.error('Native image processing failed:', err);
			let message = err instanceof Error ? err.message : 'Unknown error';
			// Older or manually assembled desktop bundles can still lack LibRaw.
			// Keep RAW usable there by loading the embedded WASM engine on demand;
			// the native error mapper remains the final actionable diagnostic if
			// that fallback cannot initialize.
			if (
				isRawInputName(this.originalName) &&
				/bundled ImageMagick build has no libraw support/i.test(message)
			) {
				try {
					this.nativeAvailable = false;
					await this.initWasm(debugMode);
					this.processImage(debugMode, onComplete);
					return;
				} catch (fallbackError: unknown) {
					const fallbackMessage =
						fallbackError instanceof Error ? fallbackError.message : 'Unknown WASM error';
					message = `${message} WASM fallback failed: ${fallbackMessage}`;
				}
			}
			this.hasError = true;
			this.errorMessage = message;
			this.isLoading = false;
			this.currentProcessingStep = null;
		}
	}

	private _processViaWorker(debugMode = false, onComplete?: () => void): void {
		this.currentProcessingStep = 'Processing in worker...';
		const requestId = ++this._requestId;
		this._pendingRequests.set(requestId, {
			debugMode,
			onComplete,
			startTime: performance.now(),
			sourceRevision: this._sourceRevision
		});
		this._latestWorkerRequestId = requestId;
		const message: {
			id: number;
			sourceRevision: number;
			sourceBytes?: Uint8Array;
			inputName: string;
			settings: MagickSettings;
		} = {
			id: requestId,
			sourceRevision: this._sourceRevision,
			inputName: this.originalName,
			settings: snapSettings(this.settings)
		};
		if (this._workerSourceRevision !== this._sourceRevision) {
			message.sourceBytes = this.sourceBytes!;
			this._workerSourceRevision = this._sourceRevision;
		}
		this._worker!.postMessage(message);
	}

	private _processOnMainThread(debugMode = false, onComplete?: () => void): void {
		// Main-thread fallback for local fonts (the worker cannot receive them
		// without OOM-prone postMessage copies). Delegates to the same
		// `processImageSync` pipeline the worker runs, loaded lazily so the
		// engine stays out of the initial chunk.
		const startTime = performance.now();
		const settings = snapSettings(this.settings);
		const sourceBytes = this.sourceBytes;
		if (!sourceBytes) {
			this.statsMessage = 'No Image';
			return;
		}
		const inputName = this.originalName;

		const runImageMagick = async (): Promise<void> => {
			this.currentProcessingStep = 'Processing...';
			try {
				const { processImageSync } = await import('./magick-process');
				const result = processImageSync(sourceBytes, settings, inputName);
				if (this.sourceBytes !== sourceBytes) {
					this.isLoading = false;
					this.currentProcessingStep = null;
					return;
				}
				const elapsed = Math.round(performance.now() - startTime);
				const appliedOptions: AppliedOptions = {};
				if (debugMode) {
					appliedOptions.outputDimensions = { width: result.width, height: result.height };
					appliedOptions.outputSize = result.data.length;
					appliedOptions.processTime = elapsed + 'ms';
					console.log('ImageMagickSettings', { ...settings, ...appliedOptions });
				}
				this.handleDownload(
					result.data,
					result.format,
					elapsed,
					result.width,
					result.height,
					appliedOptions,
					result.previewData,
					result.previewWidth,
					result.previewHeight
				);
				if (onComplete) onComplete();
			} catch (err: unknown) {
				console.error('Image processing failed:', err);
				const message = err instanceof Error ? err.message : 'Unknown error';
				this.hasError = true;
				this.errorMessage = message;
				this.isLoading = false;
				this.currentProcessingStep = null;
			}
		};

		const fontFamily = settings.annotateFontFamily?.trim();
		if (settings.annotateText?.trim().length > 0 && fontFamily?.length > 0) {
			ensureFont(fontFamily)
				.then((loaded) => {
					if (!loaded) {
						settings.annotateFontFamily = DEFAULT_FONT;
						return ensureFont(DEFAULT_FONT);
					}
					return true;
				})
				.then(() => runImageMagick())
				.catch((err) => {
					console.warn('Font load failed, continuing without:', err);
					void runImageMagick();
				});
		} else {
			void runImageMagick();
		}
	}

	handleDownload(
		data: Uint8Array,
		format: string,
		time: number,
		newWidth: number,
		newHeight: number,
		_appliedOptions: AppliedOptions,
		previewData?: Uint8Array,
		previewWidth?: number,
		previewHeight?: number,
		previewImageData?: Uint8Array,
		previewImageFormat?: string,
		processedBy = 'wasm'
	): void {
		const formatInfo = this.exportFormats.find(
			(candidate) => candidate.value.toUpperCase() === format.toUpperCase()
		);
		const outputExtension = formatInfo?.extension ?? outputExtensionForFormat(format);
		const mimeType = formatInfo?.mimeType ?? mimeTypeForFormat(format, outputExtension);
		const blob = new Blob([data as unknown as BlobPart], { type: mimeType });

		if (this.processedImageUrl) {
			URL.revokeObjectURL(this.processedImageUrl);
		}
		if (this.processedPreviewUrl) URL.revokeObjectURL(this.processedPreviewUrl);

		this.processedImageUrl = URL.createObjectURL(blob);
		this.processedPreviewUrl = previewImageData?.length
			? URL.createObjectURL(
					new Blob([previewImageData as unknown as BlobPart], {
						type: mimeTypeForFormat(previewImageFormat ?? 'JPEG', 'jpg')
					})
				)
			: null;
		this.processedPreviewData = previewData ?? null;
		this.processedPreviewWidth = previewWidth ?? newWidth;
		this.processedPreviewHeight = previewHeight ?? newHeight;
		this.processedImageFormat = format.toLowerCase();
		this.processedWidth = newWidth;
		this.processedHeight = newHeight;
		this.hasUnsavedEdits = true;
		this.markPreviewFresh();

		const nameParts = this.originalName.split('.');
		if (nameParts.length > 1) nameParts.pop();
		const baseName = nameParts.join('.') || this.originalName;
		this.processedImageName = buildOutputFilename({
			name: baseName,
			ext: outputExtension,
			format: format.toLowerCase(),
			width: newWidth,
			height: newHeight
		});
		this.processedBy = processedBy;

		this.isLoading = false;
		this.currentProcessingStep = null;

		persistSettings(this.settings);

		const newSizeKB = (blob.size / 1024).toFixed(1);
		const percentageChange =
			this.originalImageSize > 0
				? (((blob.size - this.originalImageSize) / this.originalImageSize) * 100).toFixed(1)
				: 'N/A';
		const sizeChangeStr =
			this.originalImageSize > 0
				? `${newSizeKB} KB (${Number(percentageChange) > 0 ? '+' : ''}${percentageChange}%)`
				: `${newSizeKB} KB`;

		const statsStr = `Processed in ${time}ms, New Size: ${sizeChangeStr}`;
		this.statsMessage = statsStr;
		this.processedImageTime = time;
		this.processedImageDelta = sizeChangeStr;
	}

	async downloadImage(): Promise<boolean> {
		if (!this.processedImageUrl || !this.processedImageName) return false;

		if (window.wasmagick) {
			try {
				const response = await fetch(this.processedImageUrl);
				const data = new Uint8Array(await response.arrayBuffer());
				const saved = await window.wasmagick.saveFile({ name: this.processedImageName, data });
				if (saved) this.hasUnsavedEdits = false;
				return saved;
			} catch (err) {
				console.error('Export failed:', err);
				return false;
			}
		}

		const a = document.createElement('a');
		a.href = this.processedImageUrl;
		a.download = this.processedImageName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		this.hasUnsavedEdits = false;
		return true;
	}
}

export function useMagick(): MagickState {
	return new MagickState();
}
