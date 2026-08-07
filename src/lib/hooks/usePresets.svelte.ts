/**
 * usePresets - built-in and user-defined processing presets.
 *
 * Built-in presets are partial patches applied on top of default settings
 * (so a preset always produces the same result regardless of current state).
 * User presets are full MagickSettings snapshots saved from the current state.
 *
 * User presets persist to `localStorage` under `wasmagick.presets.v1`.
 */

import type { MagickState } from '$lib/useMagick.svelte';
import { DEFAULT_SETTINGS } from '$lib/useMagick.svelte';
import type { MagickSettings } from '$lib/types';

export interface BuiltInPreset {
	id: string;
	name: string;
	description: string;
	patch: Partial<MagickSettings>;
}

export interface UserPreset {
	id: string;
	name: string;
	settings: MagickSettings;
	createdAt: number;
}

const STORAGE_KEY = 'wasmagick.presets.v1';

function clonePatch(patch: Partial<MagickSettings>): Partial<MagickSettings> {
	// Deep clone: patches contain arrays and per-channel records (e.g.
	// levelGamma) that must not be shared by reference with live settings,
	// otherwise user edits would mutate the preset definition itself.
	return JSON.parse(JSON.stringify(patch)) as Partial<MagickSettings>;
}

function snapSettings(settings: MagickSettings): MagickSettings {
	return JSON.parse(JSON.stringify(settings));
}

/** Stable serialized form of a settings object, for equality comparison. */
function settingsKey(settings: MagickSettings): string {
	return JSON.stringify(settings);
}

/** The settings a built-in preset would produce if applied now. */
function builtInExpected(preset: BuiltInPreset): MagickSettings {
	return snapSettings({ ...DEFAULT_SETTINGS, ...clonePatch(preset.patch) });
}

export const BUILTIN_PRESETS: BuiltInPreset[] = [
	{
		id: 'web-shrink',
		name: 'Web Shrink',
		description: '1600px wide · WebP · q80',
		patch: { resizeW: 1600, resizeH: null, imageFormat: 'WebP', quality: [80], stripMeta: true }
	},
	{
		id: 'thumbnail',
		name: 'Thumbnail',
		description: '256×256 · WebP · q85',
		patch: { resizeW: 256, resizeH: 256, imageFormat: 'WebP', quality: [85], stripMeta: true }
	},
	{
		id: 'bw-photo',
		name: 'B&W Photo',
		description: 'Grayscale · normalized · +15 contrast',
		patch: { effect: 'grayscale', contrast: [15], normalizeImage: true }
	},
	{
		id: 'sepia-vintage',
		name: 'Sepia Vintage',
		description: 'Sepia · warm · soft',
		patch: { effect: 'sepia', sepiaThreshold: [80], saturation: [90], brightness: [105] }
	},
	{
		id: 'sharpen-scan',
		name: 'Sharpen Scan',
		description: 'Grayscale · sharpen · +20 contrast',
		patch: { effect: 'grayscale', sharpen: [2], contrast: [20], normalizeImage: true }
	},
	{
		id: 'social-square',
		name: 'Social Square',
		description: '1080² canvas · centered · q90',
		patch: {
			extentW: 1080,
			extentH: 1080,
			extentGravity: 'Center',
			extentBgColor: '#ffffff',
			imageFormat: 'WebP',
			quality: [90]
		}
	},
	{
		id: 'hq-png',
		name: 'HQ PNG',
		description: 'PNG · lossless · keep metadata',
		patch: { imageFormat: 'PNG', stripMeta: false }
	},
	{
		id: 'poster-print',
		name: 'Poster Print',
		description: 'Posterize · 16-color dither · punchy',
		patch: {
			sigmoidalContrast: [10],
			brightness: [80],
			saturation: [160],
			autoLevel: true,
			sharpen: [2],
			quantizeColors: [16],
			ditherMethod: 'FloydSteinberg',
			quantizeColorSpace: 'Oklab',
			quantizeTreeDepth: [4],
			imageFormat: 'PNG',
			quality: [100]
		}
	},
	{
		id: 'instant-polaroid',
		name: 'Instant Polaroid',
		description: 'Vintage CLUT · warm level colors · white border · grain',
		patch: {
			clutMap: 'vintage',
			levelColorsBlack: '#40260d',
			levelColorsWhite: '#ffe9c9',
			levelGamma: { All: [1.12], Red: [1.12], Green: [1.12], Blue: [1.12] },
			borderSize: [14],
			borderColor: '#faf3e7',
			addNoiseType: 'Gaussian',
			addNoiseAttenuate: [0.8],
			adaptiveSharpenRadius: [1],
			adaptiveSharpenSigma: [0.7],
			contrast: [10],
			saturation: [85],
			imageFormat: 'JPEG',
			quality: [92],
			stripMeta: true
		}
	},
	{
		id: 'film-noir',
		name: 'Film Noir',
		description: 'Grayscale · crushed blacks · moody contrast',
		patch: {
			colorSpace: 'Gray',
			blackThreshold: [8],
			whiteThreshold: [95],
			contrast: [20],
			sharpen: [1.5],
			imageFormat: 'JPEG',
			quality: [92],
			stripMeta: true
		}
	}
];

export class PresetsState {
	userPresets = $state<UserPreset[]>([]);
	loaded = $state(false);

	/** Load user presets from localStorage. Call on mount. */
	load(): void {
		if (this.loaded) return;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as UserPreset[];
				if (Array.isArray(parsed)) this.userPresets = parsed;
			}
		} catch {
			// ignore corrupt storage
		}
		this.loaded = true;
	}

	private persist(): void {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.userPresets));
		} catch {
			// ignore quota / private mode
		}
	}

	applyBuiltIn(magick: MagickState, preset: BuiltInPreset): void {
		magick.resetSettings();
		const patch = clonePatch(preset.patch);
		Object.assign(magick.settings, patch);
	}

	applyUser(magick: MagickState, preset: UserPreset): void {
		magick.settings = snapSettings(preset.settings);
	}

	/** True when the live settings exactly match what this built-in would produce. */
	isBuiltInActive(magick: MagickState, preset: BuiltInPreset): boolean {
		return settingsKey(magick.settings) === settingsKey(builtInExpected(preset));
	}

	/** True when the live settings exactly match this user preset's snapshot. */
	isUserActive(magick: MagickState, preset: UserPreset): boolean {
		return settingsKey(magick.settings) === settingsKey(preset.settings);
	}

	saveUser(name: string, magick: MagickState): UserPreset {
		const preset: UserPreset = {
			id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			name: name.trim() || 'Untitled Preset',
			settings: snapSettings(magick.settings),
			createdAt: Date.now()
		};
		this.userPresets = [...this.userPresets, preset];
		this.persist();
		return preset;
	}

	deleteUser(id: string): void {
		this.userPresets = this.userPresets.filter((p) => p.id !== id);
		this.persist();
	}

	renameUser(id: string, name: string): void {
		this.userPresets = this.userPresets.map((p) =>
			p.id === id ? { ...p, name: name.trim() || p.name } : p
		);
		this.persist();
	}
}

export function usePresets(): PresetsState {
	return new PresetsState();
}
