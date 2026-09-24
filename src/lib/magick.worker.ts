import { initializeImageMagick, Magick } from '@imagemagick/magick-wasm';
import { processImageSync, type ProcessResult } from './magick-process';
import type { MagickSettings } from './types';
import { ensureFont, DEFAULT_FONT } from './fonts';

let ready = false;
let initPromise: Promise<void> | null = null;
let cachedSourceRevision: number | null = null;
let cachedSourceBytes: Uint8Array | null = null;
/** Local/system fonts pushed from the main thread (see `registerFonts`). */
const registeredFontNames = new Set<string>();

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
	/** Correlation id echoed back in the `fontsRegistered` ack. */
	syncId: number;
	fonts: { name: string; data: Uint8Array }[];
}

interface FontSyncAck {
	type: 'fontsRegistered';
	syncId: number;
	names: string[];
}

self.onmessage = async (e: MessageEvent<WorkerRequest | FontSyncMessage>) => {
	const msg = e.data;

	if ('type' in msg && msg.type === 'registerFonts') {
		const syncMsg = msg as FontSyncMessage;
		const names: string[] = [];
		try {
			await ensureReady();
			for (const { name, data } of syncMsg.fonts) {
				try {
					// `data` arrives as a cloned (or transferred) Uint8Array; wrap
					// defensively since older senders shipped plain number arrays.
					const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
					Magick.addFont(name, bytes);
					registeredFontNames.add(name);
					names.push(name);
				} catch (err) {
					console.warn(`Worker: failed to register font "${name}":`, err);
				}
			}
		} catch (err) {
			// Always acknowledge the sync, even if WASM initialization fails, so
			// the main thread can fall back instead of waiting indefinitely.
			console.warn('Worker: failed to initialize for font registration:', err);
		}
		const ack: FontSyncAck = { type: 'fontsRegistered', syncId: syncMsg.syncId, names };
		self.postMessage(ack);
		return;
	}

	const {
		id,
		sourceRevision,
		sourceBytes: incomingSourceBytes,
		inputName,
		settings: rawSettings
	} = msg as WorkerRequest;
	if (incomingSourceBytes) {
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
			// Fonts pushed via `registerFonts` are already in the engine;
			// only bundled fonts need lazy loading here.
			if (!registeredFontNames.has(fontFamily)) {
				const loaded = await ensureFont(fontFamily);
				if (!loaded) {
					settings = { ...settings, annotateFontFamily: DEFAULT_FONT };
				}
			}
		}
		const result: ProcessResult = processImageSync(sourceBytes, settings, inputName);
		self.postMessage(
			{ id, sourceRevision, result },
			{
				transfer: [result.data.buffer, result.previewData.buffer]
			}
		);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		self.postMessage({ id, sourceRevision, error: message });
	}
};
