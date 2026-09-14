import { describe, it, expect } from 'vitest';
import { HistoryState, type HistoryEntry } from './useHistory.svelte';
import { DEFAULT_SETTINGS } from '$lib/useMagick.svelte';
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
});
