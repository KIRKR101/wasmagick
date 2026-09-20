import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryState, type HistoryEntry } from './useHistory.svelte';
import { DEFAULT_SETTINGS, type MagickState } from '$lib/useMagick.svelte';
import type { MagickSettings } from '$lib/types';

function entry(id: number, settings: MagickSettings, label: string): HistoryEntry {
	return {
		id,
		label,
		settings,
		blobUrl: 'blob:x',
		width: 1,
		height: 1,
		format: 'webp',
		size: 0,
		time: 0,
		ts: 0,
		isOriginal: false,
		saved: false,
		statsMessage: ''
	};
}

let nextUrl = 0;

beforeEach(() => {
	nextUrl = 0;
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(new Blob(['image'])))
	);
	vi.stubGlobal('localStorage', { getItem: () => null });
	vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:clone-${++nextUrl}`);
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});

function magick(patch: Partial<MagickState> = {}): MagickState {
	return {
		settings: structuredClone(DEFAULT_SETTINGS),
		originalImageUrl: 'blob:original',
		originalWidth: 100,
		originalHeight: 80,
		originalImageFormat: 'png',
		originalImageSize: 5,
		originalName: 'photo.png',
		processedImageUrl: 'blob:processed',
		processedPreviewUrl: null,
		processedImageFormat: 'webp',
		processedWidth: 50,
		processedHeight: 40,
		processedImageTime: 12,
		statsMessage: '50×40',
		clearPreviewSnapshot: vi.fn(),
		markPreviewFresh: vi.fn(),
		...patch
	} as unknown as MagickState;
}

describe('HistoryState target labels', () => {
	it('names only the reverted change for undo', () => {
		const h = new HistoryState();
		const base = { ...DEFAULT_SETTINGS };
		const bright: MagickSettings = { ...DEFAULT_SETTINGS, brightness: [120] };
		const brightContrast: MagickSettings = {
			...DEFAULT_SETTINGS,
			brightness: [120],
			contrast: [5]
		};
		h.entries = [
			entry(1, base, 'Original'),
			entry(2, bright, 'Brightness 120%'),
			entry(3, brightContrast, 'Brightness 120% · Contrast 5')
		];
		h.pointer = 2;
		// Must not echo the cumulative entry label.
		expect(h.undoTargetLabel).toBe('Contrast 0 → 5');
	});

	it('names only the re-applied change for redo', () => {
		const h = new HistoryState();
		const base = { ...DEFAULT_SETTINGS };
		const bright: MagickSettings = { ...DEFAULT_SETTINGS, brightness: [120] };
		h.entries = [entry(1, base, 'Original'), entry(2, bright, 'Brightness 120%')];
		h.pointer = 0;
		expect(h.redoTargetLabel).toBe('Brightness 100 → 120');
	});

	it('falls back to the entry label when nothing changed', () => {
		const h = new HistoryState();
		const base = { ...DEFAULT_SETTINGS };
		h.entries = [entry(1, base, 'Original'), entry(2, { ...base }, 'Processed')];
		h.pointer = 1;
		expect(h.undoTargetLabel).toBe('Processed');
	});

	it('returns null at the ends of the stack', () => {
		const h = new HistoryState();
		const base = { ...DEFAULT_SETTINGS };
		h.entries = [entry(1, base, 'Original')];
		h.pointer = 0;
		expect(h.undoTargetLabel).toBeNull();
		expect(h.redoTargetLabel).toBeNull();
	});

	it('resets to an independent snapshot of the original image', async () => {
		const h = new HistoryState();
		const state = magick();
		await h.resetToOriginal(state);

		expect(h.current).toMatchObject({
			label: 'Original',
			blobUrl: 'blob:clone-1',
			width: 100,
			height: 80,
			isOriginal: true
		});
		state.settings.brightness = [120];
		expect(h.current?.settings.brightness).toEqual([100]);
	});

	it('pushes snapshots, discards the redo branch, and revokes its URLs', async () => {
		const h = new HistoryState();
		const state = magick();
		await h.resetToOriginal(state);
		state.settings.brightness = [120];
		await h.pushFromMagick(state, 'Bright');
		state.settings.contrast = [10];
		await h.pushFromMagick(state, 'Contrast');
		await h.undo(state);
		await h.pushFromMagick(state, 'Replacement');

		expect(h.entries.map(({ label }) => label)).toEqual(['Original', 'Bright', 'Replacement']);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:clone-3');
		expect(h.canRedo).toBe(false);
	});

	it('restores original and processed state through undo and redo', async () => {
		const h = new HistoryState();
		const state = magick();
		await h.resetToOriginal(state);
		state.settings.imageFormat = 'PNG';
		await h.pushFromMagick(state, 'PNG');

		await h.undo(state);
		expect(state.processedImageUrl).toBeNull();
		expect(state.clearPreviewSnapshot).toHaveBeenCalled();
		await h.redo(state);
		expect(state.processedImageUrl).toMatch(/^blob:clone-/);
		expect(state.processedImageName).toBe('photo-edited.webp');
		expect(state.markPreviewFresh).toHaveBeenCalled();
	});

	it('marks and clears entries while releasing owned URLs', () => {
		const h = new HistoryState();
		h.entries = [entry(1, structuredClone(DEFAULT_SETTINGS), 'Processed')];
		h.pointer = 0;
		h.markCurrentSaved();
		expect(h.current?.saved).toBe(true);
		h.clear();
		expect(h.count).toBe(0);
		expect(h.pointer).toBe(-1);
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
	});
});
