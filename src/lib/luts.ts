import { MagickColor, MagickImage, PixelInterpolateMethod } from '@imagemagick/magick-wasm';
import type { IMagickImage } from '@imagemagick/magick-wasm';
import type { ClutInterpolation } from './types';

export interface ClutPreset {
	id: string;
	label: string;
	description: string;
	map: (t: number) => [number, number, number];
}

function clamp(v: number): number {
	return Math.max(0, Math.min(255, Math.round(v)));
}

const CLUT_PRESETS: ClutPreset[] = [
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

export function getClutPresets(): ClutPreset[] {
	return CLUT_PRESETS;
}

export function getClutPreset(id: string): ClutPreset | undefined {
	return CLUT_PRESETS.find((p) => p.id === id);
}

export function getInterpolationOptions(): { value: ClutInterpolation; label: string }[] {
	return [
		{ value: 'catrom', label: 'Catrom (Smooth)' },
		{ value: 'bilinear', label: 'Bilinear' },
		{ value: 'nearest', label: 'Nearest (Hard)' },
		{ value: 'spline', label: 'Spline' },
		{ value: 'average', label: 'Average' }
	];
}

export function generateClutImage(
	presetId: string,
	interpolation: ClutInterpolation
): IMagickImage {
	const preset = getClutPreset(presetId) ?? CLUT_PRESETS[0];
	const width = 256;
	const height = 1;

	const lut = MagickImage.create(new MagickColor(0, 0, 0), width, height);
	lut.getPixels((pixels) => {
		for (let x = 0; x < width; x++) {
			const [r, g, b] = preset.map(x);
			pixels.setPixel(x, 0, [r, g, b, 255]);
		}
	});
	lut.interpolate = getPixelInterpolateMethod(interpolation);
	return lut;
}

export function getPixelInterpolateMethod(
	interpolation: ClutInterpolation
): PixelInterpolateMethod {
	switch (interpolation) {
		case 'catrom':
			return PixelInterpolateMethod.Catrom;
		case 'bilinear':
			return PixelInterpolateMethod.Bilinear;
		case 'nearest':
			return PixelInterpolateMethod.Nearest;
		case 'spline':
			return PixelInterpolateMethod.Spline;
		case 'average':
			return PixelInterpolateMethod.Average;
	}
}
