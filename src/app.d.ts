// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
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
		hasUnsavedEdits: boolean;
		canUndo: boolean;
		canRedo: boolean;
	}

	interface WasmagickElectronApi {
		readonly platform: string;
		markReady(): Promise<void>;
		saveFile(payload: { name: string; data: Uint8Array<ArrayBuffer> }): Promise<boolean>;
		openImage(): Promise<void>;
		setTheme(dark: boolean): void;
		updateMenuState(state: WasmagickMenuState): void;
		minimizeWindow(): void;
		toggleMaximizeWindow(): void;
		closeWindow(): void;
		isMaximized(): Promise<boolean>;
		onMaximizeChange(callback: (maximized: boolean) => void): () => void;
		onOpenFile(callback: (payload: WasmagickFilePayload) => void): () => void;
		onMenuExport(callback: () => void): () => void;
		onMenuUndo(callback: () => void): () => void;
		onMenuRedo(callback: () => void): () => void;
		onMenuClose(callback: () => void): () => void;
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
