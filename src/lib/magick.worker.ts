import { initializeImageMagick, Magick } from '@imagemagick/magick-wasm';
import { processImageSync, type ProcessResult } from './magick-process';
import type { MagickSettings } from './types';
import { ensureFont, DEFAULT_FONT } from './fonts';

let ready = false;
let initPromise: Promise<void> | null = null;
let cachedSourceRevision: number | null = null;
let cachedSourceBytes: Uint8Array | null = null;

async function ensureReady() {
	if (ready) return;
	if (!initPromise) {
		initPromise = fetch('/magick.wasm')
			.then((r) => {
				if (!r.ok) throw new Error(`Failed to fetch WASM: ${r.status}`);
				return r.arrayBuffer();
			})
			.then((buf) => initializeImageMagick(new Uint8Array(buf)))
			.then(() => ensureFont(DEFAULT_FONT))
			.then(() => {
				ready = true;
			});
	}
	return initPromise;
}

interface WorkerRequest {
	id: number;
	sourceRevision: number;
	sourceBytes?: Uint8Array;
	inputName?: string;
	settings: MagickSettings;
}

interface FontSyncMessage {
	type: 'registerFonts';
	fonts: { name: string; data: number[] }[];
}

self.onmessage = async (e: MessageEvent<WorkerRequest | FontSyncMessage>) => {
	const msg = e.data;

	if ('type' in msg && msg.type === 'registerFonts') {
		await ensureReady();
		const syncMsg = msg as FontSyncMessage;
		for (const { name, data } of syncMsg.fonts) {
			try {
				Magick.addFont(name, new Uint8Array(data));
			} catch (err) {
				console.warn(`Worker: failed to register font "${name}":`, err);
			}
		}
		return;
	}

	const {
		id,
		sourceRevision,
		sourceBytes: incomingSourceBytes,
		inputName,
		settings: rawSettings
	} = msg as WorkerRequest;
	if (incomingSourceBytes && sourceRevision !== cachedSourceRevision) {
		cachedSourceRevision = sourceRevision;
		cachedSourceBytes = incomingSourceBytes;
	}
	const sourceBytes = cachedSourceBytes;

	try {
		if (!sourceBytes) throw new Error('Worker source image is unavailable');
		await ensureReady();
		let settings = rawSettings;
		const fontFamily = settings.annotateFontFamily?.trim();
		if (settings.annotateText?.trim().length > 0 && fontFamily?.length > 0) {
			const loaded = await ensureFont(fontFamily);
			if (!loaded) {
				settings = { ...settings, annotateFontFamily: DEFAULT_FONT };
			}
		}
		const result: ProcessResult = processImageSync(sourceBytes, settings, inputName);
		self.postMessage({ id, sourceRevision, result });
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		self.postMessage({ id, sourceRevision, error: message });
	}
};
