import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type MagickState } from '$lib/useMagick.svelte';
import { BUILTIN_PRESETS, PresetsState } from './usePresets.svelte';

const values = new Map<string, string>();

beforeEach(() => {
	values.clear();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value)
	});
});

function magick(): MagickState {
	return {
		settings: structuredClone(DEFAULT_SETTINGS),
		resetSettings: vi.fn(function (this: MagickState) {
			this.settings = structuredClone(DEFAULT_SETTINGS);
		}),
		ensureSelectedExportFormat: vi.fn()
	} as unknown as MagickState;
}

describe('preset state', () => {
	it('applies a built-in from defaults without sharing mutable values', () => {
		const state = new PresetsState();
		const editor = magick();
		const preset = BUILTIN_PRESETS.find(({ id }) => id === 'web-shrink')!;
		state.applyBuiltIn(editor, preset);

		expect(editor.settings).toMatchObject({ resizeW: 1600, imageFormat: 'WebP', quality: [80] });
		expect(state.isBuiltInActive(editor, preset)).toBe(true);
		editor.settings.quality[0] = 50;
		expect(preset.patch.quality).toEqual([80]);
		expect(state.isBuiltInActive(editor, preset)).toBe(false);
	});

	it('saves immutable snapshots and persists rename and delete operations', () => {
		vi.spyOn(Date, 'now').mockReturnValue(123);
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const state = new PresetsState();
		const editor = magick();
		editor.settings.brightness = [120];
		const saved = state.saveUser('  Bright  ', editor);
		editor.settings.brightness[0] = 80;

		expect(saved).toMatchObject({ name: 'Bright', createdAt: 123 });
		expect(saved.settings.brightness).toEqual([120]);
		state.renameUser(saved.id, ' Renamed ');
		expect(state.userPresets[0].name).toBe('Renamed');
		state.deleteUser(saved.id);
		expect(state.userPresets).toEqual([]);
		expect(JSON.parse(values.get('wasmagick.presets.v1')!)).toEqual([]);
	});

	it('loads once, tolerates corrupt storage, and imports only valid candidates', () => {
		values.set('wasmagick.presets.v1', '{broken');
		const state = new PresetsState();
		state.load();
		expect(state.loaded).toBe(true);
		expect(state.userPresets).toEqual([]);

		expect(
			state.importUsers([
				null,
				{ name: 3, settings: {} },
				{ name: ' Imported ', settings: DEFAULT_SETTINGS, createdAt: 42 }
			])
		).toBe(1);
		expect(state.userPresets[0]).toMatchObject({ name: 'Imported', createdAt: 42 });
	});

	it('applies a user preset as a clone', () => {
		const state = new PresetsState();
		const editor = magick();
		const preset = {
			id: 'user-1',
			name: 'Saved',
			settings: { ...structuredClone(DEFAULT_SETTINGS), contrast: [15] as [number] },
			createdAt: 1
		};
		state.applyUser(editor, preset);
		expect(editor.settings.contrast).toEqual([15]);
		editor.settings.contrast[0] = 30;
		expect(preset.settings.contrast).toEqual([15]);
	});
});
