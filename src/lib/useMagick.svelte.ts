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

import {
	ImageMagick,
	Magick,
	Drawables,
	initializeImageMagick,
	MagickFormat,
	Percentage,
	MagickColor,
	Gravity,
	Channels,
	ColorSpace,
	PixelIntensityMethod,
	QuantizeSettings,
	DitherMethod
} from '@imagemagick/magick-wasm';

import type { MagickSettings, AppliedOptions, LevelChannel } from './types';
import { ensureFont, DEFAULT_FONT, isLocalFont } from './fonts';
import { generateClutImage } from './luts';
import { applyCrop } from './magick-process';

const AUTO_PROCESS_DELAY = 300;

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
	'quantizeColors',
	'quantizeTreeDepth',
	'annotateFontSize',
	'annotateAngle',
	'annotateStrokeWidth'
]);

const PERSISTED_KEYS = new Set(['imageFormat', 'quality']);

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
	deskewAutoCrop: true,
	cropW: null,
	cropH: null,
	cropGravity: 'Center',
	cropX: null,
	cropY: null,
	trimEdges: false,
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
	effect: 'none',
	blur: [0],
	sharpen: [0],
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

const SUPPORTED_MIME_TYPES = [
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/tiff',
	'image/bmp',
	'image/avif'
];

const FORMAT_MAP: Record<string, keyof typeof MagickFormat> = {
	WEBP: 'WebP',
	JPEG: 'Jpeg',
	PNG: 'Png',
	AVIF: 'Avif',
	JXL: 'Jxl',
	TIFF: 'Tiff',
	GIF: 'Gif'
};

function snapSettings(settings: MagickSettings): MagickSettings {
	return JSON.parse(JSON.stringify(settings));
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
	sourceBytes = $state<Uint8Array | null>(null);
	originalName = $state('image');
	originalImageSize = $state(0);
	originalImageUrl = $state<string | null>(null);
	originalImageFormat = $state<string | null>(null);
	processedImageUrl = $state<string | null>(null);
	processedImageFormat = $state<string | null>(null);
	processedImageName = $state<string | null>(null);
	processedImageTime = $state(0);
	processedImageDelta = $state('N/A');
	originalWidth = $state(0);
	originalHeight = $state(0);
	processedWidth = $state(0);
	processedHeight = $state(0);
	currentProcessingStep = $state<string | null>(null);
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

	private _worker: Worker | null = null;
	private _requestId = 0;
	cropMode = $state(false);
	cropAspectRatio = $state<string>('free');

	// Non-reactive internal request map (intentionally plain Map).
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private _pendingRequests = new Map<
		number,
		{ debugMode: boolean; onComplete?: () => void; startTime: number }
	>();
	private _processTimer: ReturnType<typeof setTimeout> | null = null;

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

	async initWasm(debugMode = false): Promise<void> {
		try {
			this.currentProcessingStep = 'Downloading WASM binary...';
			const response = await fetch('/magick.wasm');
			if (!response.ok) {
				throw new Error(`Failed to fetch WASM: ${response.status}`);
			}
			this.currentProcessingStep = 'Parsing WebAssembly module...';
			const wasmBytes = new Uint8Array(await response.arrayBuffer());
			this.currentProcessingStep = 'Initializing ImageMagick engine...';
			await initializeImageMagick(wasmBytes);
			this.currentProcessingStep = 'Loading fonts...';
			await ensureFont(DEFAULT_FONT);
			this.wasmLoaded = true;
			this.currentProcessingStep = null;

			if (debugMode) {
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
				try {
					const version = Magick.imageMagickVersion;
					if (!version) {
						this.wasmLoaded = false;
						this.initWasm(false).catch(() => {});
					}
				} catch {
					this.wasmLoaded = false;
					this.initWasm(false).catch(() => {});
				}
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
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			this._worker = new Worker(new URL('./magick.worker.ts', import.meta.url), {
				type: 'module'
			});

			this._worker.onmessage = (e: MessageEvent) => {
				const { id, result, error } = e.data;
				const pending = this._pendingRequests.get(id);
				if (!pending) return;
				this._pendingRequests.delete(id);

				if (error) {
					this.hasError = true;
					this.errorMessage = error;

					this.isLoading = false;
					return;
				}

				const { data, width, height, format } = result;
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

				this.handleDownload(data, format, elapsed, width, height, appliedOptions);

				if (pending.onComplete) pending.onComplete();
			};

			this._worker.onerror = (err) => {
				console.error('Worker error:', err);
				this._worker?.terminate();
				this._worker = null;
				this.workerReady = false;
				for (const [, _pending] of this._pendingRequests) {
					this.hasError = true;
					this.errorMessage = 'Worker crashed';
					this.isLoading = false;
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
			return {
				isValid: false,
				error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`
			};
		}

		if (!SUPPORTED_MIME_TYPES.includes(file.type)) {
			return {
				isValid: false,
				error: `Unsupported format: ${file.type || 'unknown'}. Supported: JPEG, PNG, GIF, WebP, TIFF, BMP, AVIF`
			};
		}

		return { isValid: true };
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
		this.settings.thresholdPercentage = [...DEFAULT_SETTINGS.thresholdPercentage];
		this.settings.thresholdChannels = DEFAULT_SETTINGS.thresholdChannels;
		this.settings.sigmoidalContrast = [...DEFAULT_SETTINGS.sigmoidalContrast];
		this.settings.sigmoidalMidpoint = [...DEFAULT_SETTINGS.sigmoidalMidpoint];
		this.settings.sigmoidalChannels = DEFAULT_SETTINGS.sigmoidalChannels;
	}

	resetFilters(): void {
		this.settings.effect = DEFAULT_SETTINGS.effect;
		this.settings.blur = [...DEFAULT_SETTINGS.blur];
		this.settings.sharpen = [...DEFAULT_SETTINGS.sharpen];
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

		const validation = this.validateFile(file);
		if (!validation.isValid) {
			return false;
		}

		this.originalName = file.name;

		let format: string | null = file.type ? file.type.split('/')[1] : null;
		if (!format) {
			const nameParts = file.name.split('.');
			format = nameParts.length > 1 ? (nameParts.pop() ?? null) : null;
		}
		this.originalImageFormat = format ? format.toLowerCase() : null;

		try {
			const buffer = await file.arrayBuffer();
			this.sourceBytes = new Uint8Array(buffer);
			this.originalImageSize = this.sourceBytes.length;

			const fastDims = fastImageDimensions(this.sourceBytes);
			if (fastDims) {
				this.originalWidth = fastDims.width;
				this.originalHeight = fastDims.height;
			} else {
				await this.getImageDimensions(this.sourceBytes).then((dims) => {
					this.originalWidth = dims.width;
					this.originalHeight = dims.height;
				});
			}

			this.revokeImageUrls();
			this.originalImageUrl = URL.createObjectURL(
				new Blob([this.sourceBytes as unknown as BlobPart])
			);

			this.processedImageFormat = null;
			this.processedImageName = null;
			this.processedWidth = 0;
			this.processedHeight = 0;

			this.statsMessage = 'Ready';
			return true;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to read file';
			this.statsMessage = message;
			return false;
		}
	}

	private async getImageDimensions(bytes: Uint8Array): Promise<{ width: number; height: number }> {
		return new Promise((resolve) => {
			const blob = new Blob([bytes as unknown as BlobPart]);
			const url = URL.createObjectURL(blob);
			const img = new Image();
			img.onload = () => {
				URL.revokeObjectURL(url);
				resolve({ width: img.width, height: img.height });
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				resolve({ width: 0, height: 0 });
			};
			img.src = url;
		});
	}

	clearSource(): void {
		this.sourceBytes = null;
		this.revokeImageUrls();
		this.originalName = 'image';
		this.originalImageSize = 0;
		this.originalImageUrl = null;
		this.originalImageFormat = null;
		this.originalWidth = 0;
		this.originalHeight = 0;
		this.processedImageUrl = null;
		this.processedImageFormat = null;
		this.processedImageName = null;
		this.processedImageTime = 0;
		this.processedImageDelta = 'N/A';
		this.processedWidth = 0;
		this.processedHeight = 0;
		this.statsMessage = 'Ready';
		this.currentProcessingStep = null;
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

	private _processViaWorker(debugMode = false, onComplete?: () => void): void {
		this.currentProcessingStep = 'Processing in worker...';
		const requestId = ++this._requestId;
		this._pendingRequests.set(requestId, {
			debugMode,
			onComplete,
			startTime: performance.now()
		});
		this._worker!.postMessage({
			id: requestId,
			sourceBytes: this.sourceBytes,
			settings: snapSettings(this.settings)
		});
	}

	private _processOnMainThread(debugMode = false, onComplete?: () => void): void {
		const runImageMagick = () => {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					const startTime = performance.now();
					const appliedOptions: AppliedOptions = {};

					try {
						ImageMagick.read(this.sourceBytes!, (image) => {
							try {
								if (image.format) {
									this.originalImageFormat = String(image.format).toLowerCase();
								}

								const resizeW = this.settings.resizeW ?? 0;
								const resizeH = this.settings.resizeH ?? 0;

								if (resizeW > 0 || resizeH > 0) {
									this.currentProcessingStep = 'Resizing';
									image.resize(resizeW, resizeH);
									appliedOptions.resize = { width: resizeW, height: resizeH };
								}

								if (parseInt(this.settings.rotate) !== 0) {
									this.currentProcessingStep = 'Rotating';
									image.rotate(parseInt(this.settings.rotate));
									appliedOptions.rotate = parseInt(this.settings.rotate);
								}

								if (this.settings.flop) {
									this.currentProcessingStep = 'Flopping';
									image.flop();
									appliedOptions.flop = true;
								}
								if (this.settings.flip) {
									this.currentProcessingStep = 'Flipping';
									image.flip();
									appliedOptions.flip = true;
								}

							if (applyCrop(image, this.settings)) {
									this.currentProcessingStep = 'Cropping';
									appliedOptions.crop = {
										x: this.settings.cropX,
										y: this.settings.cropY,
										width: this.settings.cropW,
										height: this.settings.cropH,
										gravity: this.settings.cropGravity
									};
								}

								if (this.settings.trimEdges) {
									this.currentProcessingStep = 'Trimming';
									image.trim();
									appliedOptions.trim = true;
								}

								if (this.settings.borderSize[0] > 0) {
									this.currentProcessingStep = 'Adding Border';
									const { r, g, b } = this.hexToRgb(this.settings.borderColor);
									image.borderColor = new MagickColor(r, g, b);
									image.border(this.settings.borderSize[0]);
									appliedOptions.border = {
										size: this.settings.borderSize[0],
										color: this.settings.borderColor
									};
								}

								if ((this.settings.extentW ?? 0) > 0 || (this.settings.extentH ?? 0) > 0) {
									this.currentProcessingStep = 'Adjusting Canvas';
									const { r, g, b } = this.hexToRgb(this.settings.extentBgColor);
									image.backgroundColor = new MagickColor(r, g, b);
									const gravityKey = this.settings.extentGravity as keyof typeof Gravity;
									image.extent(
										this.settings.extentW ?? image.width,
										this.settings.extentH ?? image.height,
										Gravity[gravityKey]
									);
									appliedOptions.extent = {
										width: this.settings.extentW,
										height: this.settings.extentH,
										gravity: this.settings.extentGravity,
										bg: this.settings.extentBgColor
									};
								}

								if (this.settings.deskewThreshold[0] > 0) {
									this.currentProcessingStep = 'Deskewing';
									image.deskew(
										new Percentage(this.settings.deskewThreshold[0]),
										this.settings.deskewAutoCrop
									);
									appliedOptions.deskew = {
										threshold: this.settings.deskewThreshold[0],
										autoCrop: this.settings.deskewAutoCrop
									};
								}

								if (
									this.settings.brightness[0] !== 100 ||
									this.settings.saturation[0] !== 100 ||
									this.settings.hue[0] !== 100
								) {
									this.currentProcessingStep = 'Adjusting Color';
									image.modulate(
										new Percentage(this.settings.brightness[0]),
										new Percentage(this.settings.saturation[0]),
										new Percentage(this.settings.hue[0])
									);
									appliedOptions.modulate = {
										brightness: this.settings.brightness[0],
										saturation: this.settings.saturation[0],
										hue: this.settings.hue[0]
									};
								}

								if (this.settings.contrast[0] !== 0) {
									this.currentProcessingStep = 'Adjusting Contrast';
									image.brightnessContrast(
										new Percentage(0),
										new Percentage(this.settings.contrast[0])
									);
									appliedOptions.contrast = this.settings.contrast[0];
								}

								if (this.settings.normalizeImage) {
									this.currentProcessingStep = 'Normalizing';
									image.normalize();
									appliedOptions.normalize = true;
								}

								if (this.settings.autoLevel) {
									this.currentProcessingStep = 'Auto-Leveling';
									image.autoLevel();
									appliedOptions.autoLevel = true;
								}

								if (this.settings.autoOrient) {
									this.currentProcessingStep = 'Auto-Orienting';
									image.autoOrient();
									appliedOptions.autoOrient = true;
								}

								{
									const levelChs: LevelChannel[] = ['All', 'Red', 'Green', 'Blue'];
									const levelApplied: {
										black: number;
										white: number;
										gamma: number;
										channels: string;
									}[] = [];
									for (const ch of levelChs) {
										const bp = this.settings.levelBlackpoint[ch][0];
										const wp = this.settings.levelWhitepoint[ch][0];
										const gm = this.settings.levelGamma[ch][0];
										if (bp !== 0 || wp !== 100 || gm !== 1.0) {
											const channel =
												ch === 'All' ? Channels.All : Channels[ch as keyof typeof Channels];
											image.level(new Percentage(bp), new Percentage(wp), gm, channel as Channels);
											levelApplied.push({ black: bp, white: wp, gamma: gm, channels: ch });
										}
									}
									if (levelApplied.length > 0) {
										appliedOptions.level = levelApplied;
									}
								}

								if (this.settings.thresholdPercentage[0] !== 50) {
									const thresholdChannels =
										this.settings.thresholdChannels === 'All'
											? Channels.All
											: Channels[this.settings.thresholdChannels as keyof typeof Channels];
									image.threshold(
										new Percentage(this.settings.thresholdPercentage[0]),
										thresholdChannels as Channels
									);
									appliedOptions.threshold = {
										percent: this.settings.thresholdPercentage[0],
										channels: this.settings.thresholdChannels
									};
								}

								if (this.settings.sigmoidalContrast[0] !== 0) {
									const sigmoidalChannels =
										this.settings.sigmoidalChannels === 'All'
											? Channels.All
											: Channels[this.settings.sigmoidalChannels as keyof typeof Channels];
									image.sigmoidalContrast(
										this.settings.sigmoidalContrast[0],
										this.settings.sigmoidalMidpoint[0] / 100,
										sigmoidalChannels as Channels
									);
									appliedOptions.sigmoidal = {
										contrast: this.settings.sigmoidalContrast[0],
										midpoint: this.settings.sigmoidalMidpoint[0]
									};
								}

								if (this.settings.colorSpace !== 'RGB') {
									const colorSpaceKey = this.settings.colorSpace as keyof typeof ColorSpace;
									image.colorSpace = ColorSpace[colorSpaceKey];
									appliedOptions.colorSpace = this.settings.colorSpace;
								}

								if (this.settings.blur[0] > 0) {
									this.currentProcessingStep = 'Blurring';
									image.blur(this.settings.blur[0], this.settings.blur[0] / 2);
									appliedOptions.blur = this.settings.blur[0];
								}

								if (this.settings.sharpen[0] > 0) {
									this.currentProcessingStep = 'Sharpening';
									const radius = this.settings.sharpen[0];
									const sigma = radius / 2;
									image.sharpen(radius, sigma);
									appliedOptions.sharpen = this.settings.sharpen[0];
								}

								if (this.settings.adaptiveSharpenRadius[0] > 0) {
									this.currentProcessingStep = 'Adaptive Sharpening';
									image.adaptiveSharpen(
										this.settings.adaptiveSharpenRadius[0],
										this.settings.adaptiveSharpenSigma[0]
									);
									appliedOptions.adaptiveSharpen = {
										radius: this.settings.adaptiveSharpenRadius[0],
										sigma: this.settings.adaptiveSharpenSigma[0]
									};
								}

								if (this.settings.adaptiveBlurRadius[0] > 0) {
									this.currentProcessingStep = 'Adaptive Blurring';
									image.adaptiveBlur(
										this.settings.adaptiveBlurRadius[0],
										this.settings.adaptiveBlurSigma[0]
									);
									appliedOptions.adaptiveBlur = {
										radius: this.settings.adaptiveBlurRadius[0],
										sigma: this.settings.adaptiveBlurSigma[0]
									};
								}

								if (this.settings.effect !== 'none') {
									appliedOptions.effect = this.settings.effect;
									switch (this.settings.effect) {
										case 'grayscale':
											this.currentProcessingStep = 'Applying Grayscale';
											image.grayscale(PixelIntensityMethod.Rec709Luminance);
											break;
										case 'sepia':
											this.currentProcessingStep = 'Applying Sepia';
											image.sepiaTone(new Percentage(this.settings.sepiaThreshold[0]));
											appliedOptions.sepiaThreshold = this.settings.sepiaThreshold[0];
											break;
										case 'charcoal': {
											this.currentProcessingStep = 'Applying Charcoal';
											const charcoalRadius = this.settings.charcoalIntensity[0];
											if (charcoalRadius > 0) {
												image.charcoal(charcoalRadius, charcoalRadius / 2);
												appliedOptions.charcoalIntensity = charcoalRadius;
											} else {
												image.charcoal();
											}
											break;
										}
										case 'negate':
											this.currentProcessingStep = 'Applying Negative';
											image.negate(Channels.RGB);
											break;
										case 'cannyEdge': {
											this.currentProcessingStep = 'Detecting Edges';
											const radius = (this.settings.cannyEdgeStrength[0] / 100) * 4;
											const sigma = (this.settings.cannyEdgeStrength[0] / 100) * 1.5;
											image.cannyEdge(
												radius,
												sigma,
												new Percentage(this.settings.cannyEdgeLower[0]),
												new Percentage(this.settings.cannyEdgeUpper[0])
											);
											appliedOptions.cannyEdge = {
												strength: this.settings.cannyEdgeStrength[0],
												lower: this.settings.cannyEdgeLower[0],
												upper: this.settings.cannyEdgeUpper[0]
											};
											break;
										}
										case 'oilpaint':
											this.currentProcessingStep = 'Applying Oil Paint';
											image.oilPaint(this.settings.oilpaintRadius[0]);
											appliedOptions.oilPaintRadius = this.settings.oilpaintRadius[0];
											break;
										case 'solarize':
											this.currentProcessingStep = 'Applying Solarize';
											image.solarize(new Percentage(this.settings.solarizeFactor[0]));
											appliedOptions.solarizeFactor = this.settings.solarizeFactor[0];
											break;
									case 'bilateralBlur': {
										this.currentProcessingStep = 'Applying Bilateral Blur';
										image.bilateralBlur(
											this.settings.bilateralWidth[0],
											this.settings.bilateralHeight[0],
											this.settings.bilateralIntensitySigma[0],
											this.settings.bilateralSpatialSigma[0]
										);
										appliedOptions.bilateral = {
											w: this.settings.bilateralWidth[0],
											h: this.settings.bilateralHeight[0],
											iSig: this.settings.bilateralIntensitySigma[0],
											sSig: this.settings.bilateralSpatialSigma[0]
										};
										break;
									}
								}
								}

							if (this.settings.clutMap !== 'identity') {
								this.currentProcessingStep = 'Applying CLUT';
								const lut = generateClutImage(
									this.settings.clutMap,
									this.settings.clutInterpolation
								);
								image.clut(lut, lut.interpolate, Channels.RGB);
								lut.dispose();
								appliedOptions.clutMap = this.settings.clutMap;
								appliedOptions.clutInterpolation = this.settings.clutInterpolation;
							}

								if (this.settings.quantizeColors[0] > 0) {
									this.currentProcessingStep = 'Quantizing Colors';
									const qs = new QuantizeSettings();
									qs.colors = this.settings.quantizeColors[0];
									qs.colorSpace =
										ColorSpace[
											this.settings.quantizeColorSpace as keyof typeof ColorSpace
										];
									qs.treeDepth = this.settings.quantizeTreeDepth[0];
									qs.measureErrors = this.settings.measureErrors;
									if (this.settings.ditherMethod !== 'Undefined') {
										qs.ditherMethod =
											DitherMethod[
												this.settings.ditherMethod as keyof typeof DitherMethod
											];
									}
									image.quantize(qs);
									appliedOptions.quantize = {
										colors: this.settings.quantizeColors[0],
										ditherMethod: this.settings.ditherMethod,
										colorSpace: this.settings.quantizeColorSpace,
										treeDepth: this.settings.quantizeTreeDepth[0]
									};
								}

								if (this.settings.annotateText?.trim().length > 0) {
									try {
										this.currentProcessingStep = 'Adding Text';
										const { r, g, b } = this.hexToRgb(this.settings.annotateFontColor);
										const draws = new Drawables();
										if (this.settings.annotateFontFamily?.trim().length > 0) {
											draws.font(this.settings.annotateFontFamily);
										}
										draws.fontPointSize(this.settings.annotateFontSize[0]);
										draws.fillColor(new MagickColor(r, g, b));
										if (this.settings.annotateStroke && this.settings.annotateStrokeWidth[0] > 0) {
											const sr = this.hexToRgb(this.settings.annotateStrokeColor);
											draws.strokeColor(new MagickColor(sr.r, sr.g, sr.b));
											draws.strokeWidth(this.settings.annotateStrokeWidth[0]);
										}
										const gravityKey = this.settings.annotateGravity as keyof typeof Gravity;
										draws.gravity(Gravity[gravityKey]);

										let ox = this.settings.annotateOffsetX;
										let oy = this.settings.annotateOffsetY;
										if (
											gravityKey === 'East' ||
											gravityKey === 'Northeast' ||
											gravityKey === 'Southeast'
										) {
											ox = -ox;
										}
										if (
											gravityKey === 'South' ||
											gravityKey === 'Southwest' ||
											gravityKey === 'Southeast'
										) {
											oy = -oy;
										}

										const angle = this.settings.annotateAngle[0];
										if (angle !== 0) {
											const rad = (angle * Math.PI) / 360;
											// magick-wasm's affine(scaleX, scaleY, shearX, shearY, tx, ty) maps to
											// ImageMagick's AffineMatrix { sx, rx, ry, sy, tx, ty }. ImageMagick's
											// -annotate uses a clockwise rotation for positive angles, so shearX
											// and shearY are swapped relative to the standard CCW matrix.
											draws.affine(
												Math.cos(rad),
												Math.cos(rad),
												Math.sin(rad),
												-Math.sin(rad),
												0,
												0
											);
										}

										draws.text(ox, oy, this.settings.annotateText);
										draws.draw(image);
										appliedOptions.annotate = {
											text: this.settings.annotateText,
											font: this.settings.annotateFontFamily,
											fontSize: this.settings.annotateFontSize[0],
											color: this.settings.annotateFontColor,
											gravity: this.settings.annotateGravity,
											offsetX: this.settings.annotateOffsetX,
											offsetY: this.settings.annotateOffsetY,
											angle: this.settings.annotateAngle[0]
										};
									} catch (e) {
										console.warn('Annotate failed:', e);
									}
								}

								if (this.settings.stripMeta) {
									image.strip();
									appliedOptions.stripMeta = true;
								}

								const formatKey = this.settings.imageFormat.toUpperCase();
								const magf = FORMAT_MAP[formatKey] || 'WebP';

								image.quality = this.settings.quality[0];
								appliedOptions.quality = this.settings.quality[0];
								appliedOptions.format = magf;

								const finalWidth = image.width;
								const finalHeight = image.height;

								image.write(MagickFormat[magf], (data) => {
									const endTime = performance.now();

									if (debugMode) {
										appliedOptions.outputDimensions = { width: finalWidth, height: finalHeight };
										appliedOptions.outputSize = data.length;
										appliedOptions.processTime = Math.round(endTime - startTime) + 'ms';
										console.log('ImageMagickSettings', appliedOptions);
									}

									this.handleDownload(
										data,
										this.settings.imageFormat,
										Math.round(endTime - startTime),
										finalWidth,
										finalHeight,
										appliedOptions
									);

									if (onComplete) onComplete();
								});
							} catch (err: unknown) {
								console.error('Image processing failed:', err);
								const message = err instanceof Error ? err.message : 'Unknown error';
								this.hasError = true;
								this.errorMessage = message;
								this.isLoading = false;
							}
						});
					} catch (err: unknown) {
						console.error('Image processing failed:', err);
						const message = err instanceof Error ? err.message : 'Unknown error';
						this.hasError = true;
						this.errorMessage = message;
						this.isLoading = false;
					}
				});
			});
		};

		const fontFamily = this.settings.annotateFontFamily?.trim();
		if (this.settings.annotateText?.trim().length > 0 && fontFamily?.length > 0) {
			ensureFont(fontFamily)
				.then((loaded) => {
					if (!loaded) {
						this.settings.annotateFontFamily = DEFAULT_FONT;
						return ensureFont(DEFAULT_FONT);
					}
					return true;
				})
				.then(runImageMagick)
				.catch((err) => {
					console.warn('Font load failed, continuing without:', err);
					runImageMagick();
				});
		} else {
			runImageMagick();
		}
	}

	handleDownload(
		data: Uint8Array,
		format: string,
		time: number,
		newWidth: number,
		newHeight: number,
		_appliedOptions: AppliedOptions
	): void {
		const mimeType = `image/${format.toLowerCase()}`;
		const blob = new Blob([data as unknown as BlobPart], { type: mimeType });

		if (this.processedImageUrl) {
			URL.revokeObjectURL(this.processedImageUrl);
		}

		this.processedImageUrl = URL.createObjectURL(blob);
		this.processedImageFormat = format.toLowerCase();
		this.processedWidth = newWidth;
		this.processedHeight = newHeight;

		const nameParts = this.originalName.split('.');
		if (nameParts.length > 1) nameParts.pop();
		const baseName = nameParts.join('.') || this.originalName;
		this.processedImageName = `${baseName}-edited.${this.processedImageFormat}`;

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

	downloadImage(): void {
		if (this.processedImageUrl && this.processedImageName) {
			const a = document.createElement('a');
			a.href = this.processedImageUrl;
			a.download = this.processedImageName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
		}
	}
}

export function useMagick(): MagickState {
	return new MagickState();
}
