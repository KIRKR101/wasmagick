/**
 * Pure CLUT preset color math (no ImageMagick dependency).
 *
 * Shared by the WASM path (`luts.ts`, which rasterizes via MagickImage),
 * the native Electron path (which rasterizes via a 2D canvas in
 * `renderClutPngBytes`), and the CLI arg builder. Keeping the maps here
 * guarantees both engines grade identically.
 */

import type { ClutInterpolation } from './types';

export interface ClutPresetMap {
	id: string;
	label: string;
	description: string;
	map: (t: number) => [number, number, number];
}

function clamp(v: number): number {
	return Math.max(0, Math.min(255, Math.round(v)));
}

export const CLUT_PRESET_MAPS: ClutPresetMap[] = [
	{
		id: 'identity',
		label: 'Identity',
		description: 'No color change (passthrough)',
		map: (t) => [t, t, t]
	},
	{
		id: 'warm',
		label: 'Warm Tone',
		description: 'Boosts reds, reduces blues for a warm look',
		map: (t) => [clamp(t * 1.1), clamp(t * 1.0), clamp(t * 0.8)]
	},
	{
		id: 'cool',
		label: 'Cool Tone',
		description: 'Boosts blues, reduces reds for a cool look',
		map: (t) => [clamp(t * 0.8), clamp(t * 0.95), clamp(t * 1.15)]
	},
	{
		id: 'vintage',
		label: 'Vintage',
		description: 'Faded, washed-out retro look',
		map: (t) => {
			const fade = t * 0.85 + 20;
			return [clamp(fade * 1.05), clamp(fade * 0.95), clamp(fade * 0.85)];
		}
	},
	{
		id: 'highContrast',
		label: 'High Contrast',
		description: 'S-curve contrast boost',
		map: (t) => {
			const n = t / 255;
			const s = n < 0.5 ? 0.5 * Math.pow(2 * n, 1.3) : 1 - 0.5 * Math.pow(2 * (1 - n), 1.3);
			const v = clamp(s * 255);
			return [v, v, v];
		}
	},
	{
		id: 'tealOrange',
		label: 'Teal & Orange',
		description: 'Teal shadows, orange highlights (cinematic)',
		map: (t) => {
			const n = t / 255;
			const shadow = 1 - n;
			const highlight = n;

			const r = clamp(t - shadow * 30 + highlight * 35);
			const g = clamp(t + shadow * 10 - highlight * 15);
			const b = clamp(t + shadow * 45 - highlight * 48);

			return [r, g, b];
		}
	},
	{
		id: 'warmMute',
		label: 'Warm Mute',
		description: 'Subtle warm tint with reduced contrast',
		map: (t) => {
			const midTone = 128;
			const blend = 0.4;
			return [
				clamp(t * (1 - blend) + midTone * blend),
				clamp(t * (1 - blend) + midTone * blend * 1.05),
				clamp(t * (1 - blend) + midTone * blend * 0.95)
			];
		}
	}
];

export function getClutPresetMap(id: string): ClutPresetMap {
	return CLUT_PRESET_MAPS.find((p) => p.id === id) ?? CLUT_PRESET_MAPS[0];
}

/** `-interpolate` CLI keyword for a UI interpolation option. */
export function interpolateCliKeyword(interpolation: ClutInterpolation): string {
	switch (interpolation) {
		case 'catrom':
			return 'Catrom';
		case 'bilinear':
			return 'Bilinear';
		case 'nearest':
			return 'Nearest';
		case 'spline':
			return 'Spline';
		case 'average':
			return 'Average';
	}
}

/**
 * Rasterize a 256x1 CLUT preset to PNG bytes using a 2D canvas (no
 * ImageMagick involved). Used by the native Electron path: the bytes are
 * sent to the main process, written to a temp file, and passed to
 * `magick ... <clut> -clut`.
 */
export async function renderClutPngBytes(presetId: string): Promise<Uint8Array> {
	const preset = getClutPresetMap(presetId);
	const canvas = document.createElement('canvas');
	canvas.width = 256;
	canvas.height = 1;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('2D canvas context unavailable for CLUT rendering');
	const imageData = ctx.createImageData(256, 1);
	for (let x = 0; x < 256; x++) {
		const [r, g, b] = preset.map(x);
		imageData.data[x * 4] = r;
		imageData.data[x * 4 + 1] = g;
		imageData.data[x * 4 + 2] = b;
		imageData.data[x * 4 + 3] = 255;
	}
	ctx.putImageData(imageData, 0, 0);
	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	if (!blob) throw new Error('Failed to encode CLUT PNG');
	return new Uint8Array(await blob.arrayBuffer());
}
