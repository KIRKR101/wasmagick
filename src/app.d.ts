// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { NativeProcessingPlan } from '$lib/native-plan';

declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface FontData {
		family: string;
		fullName: string;
		postscriptName: string;
		style: string;
		blob(): Promise<Blob>;
	}

	interface Window {
		queryLocalFonts?(options?: { postscriptNames?: string[] }): Promise<FontData[]>;
		wasmagick?: WasmagickElectronApi;
	}

	interface WasmagickFilePayload {
		name: string;
		type: string;
		data: Uint8Array<ArrayBuffer>;
	}

	interface WasmagickMenuState {
		hasImage: boolean;
		hasProcessedImage?: boolean;
		hasUnsavedEdits: boolean;
		canUndo: boolean;
		canRedo: boolean;
		fileName?: string;
	}

	interface WasmagickNativeProcessPayload {
		inputName: string;
		sourceRevision?: number;
		inputData?: Uint8Array;
		/** Middle args from buildNativeMagickArgs (no shell involved). */
		args: string[];
		outputExtension: string;
		outputFormat: string;
		/** Return a raw RGBA preview even when outputFormat is browser-renderable. */
		previewOnly?: boolean;
		previewMaxEdge?: number;
		/** ExifTool orientation used only if native ImageMagick reports Undefined. */
		orientation?: number | null;
		clutData?: Uint8Array | null;
		fontData?: Uint8Array | null;
		fontFileName?: string | null;
		plan?: NativeProcessingPlan;
	}

	interface WasmagickNativeProcessResult {
		data: Uint8Array;
		previewData?: Uint8Array;
		previewWidth?: number;
		previewHeight?: number;
		previewImageData?: Uint8Array;
		previewImageFormat?: string;
		width: number;
		height: number;
		logicalWidth?: number;
		logicalHeight?: number;
		format: string;
		backend?: 'vips' | 'magick';
	}

	interface WasmagickNativeFormatInfo {
		format: string;
		supportsWriting: boolean;
		moduleFormat?: string;
		mimeType?: string | null;
		description?: string;
	}

	interface WasmagickNativeFontMetricsPayload {
		text: string;
		fontSize: number;
		fontData: Uint8Array;
		fontFileName?: string | null;
	}

	interface WasmagickNativeFontMetrics {
		advanceWidth: number;
		layoutHeight: number;
		inkWidth: number;
		inkHeight: number;
		inkOffsetX: number;
		inkOffsetYNorth: number;
		inkOffsetYCenter: number;
		inkOffsetYSouth: number;
	}

	interface WasmagickSystemFont {
		family: string;
		fullName: string;
		postscriptName: string;
		style: string;
		fileName: string;
	}

	interface WasmagickSystemFontData {
		fileName: string;
		data: Uint8Array;
	}

	interface WasmagickElectronApi {
		readonly platform: string;
		readonly electronVersion: string;
		markReady(): Promise<void>;
		listSystemFonts(): Promise<WasmagickSystemFont[]>;
		readSystemFont(postscriptName: string): Promise<WasmagickSystemFontData | null>;
		isNativeAvailable(): Promise<boolean>;
		getNativeVersion(): Promise<string | null>;
		isNativeRawAvailable?(): Promise<boolean>;
		listNativeFormats?(): Promise<WasmagickNativeFormatInfo[]>;
		processNativeImage(
			payload: WasmagickNativeProcessPayload
		): Promise<WasmagickNativeProcessResult>;
		getNativeFontMetrics(
			payload: WasmagickNativeFontMetricsPayload
		): Promise<WasmagickNativeFontMetrics>;
		saveFile(payload: { name: string; data: Uint8Array<ArrayBuffer> }): Promise<boolean>;
		revealSavedFile(): void;
		openImage(): Promise<void>;
		setTheme(dark: boolean): void;
		updateMenuState(state: WasmagickMenuState): void;
		minimizeWindow(): void;
		toggleMaximizeWindow(): void;
		closeWindow(): void;
		isMaximized(): Promise<boolean>;
		onMaximizeChange(callback: (maximized: boolean) => void): () => void;
		onOpenFile(callback: (payload: WasmagickFilePayload) => void): () => void;
	}

	interface BeforeInstallPromptEvent extends Event {
		readonly platforms: string[];
		readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
		prompt(): Promise<void>;
	}

	interface WindowEventMap {
		beforeinstallprompt: BeforeInstallPromptEvent;
	}
}

export {};
