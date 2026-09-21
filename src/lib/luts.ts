/**
 * Pure CLUT preset catalog (no ImageMagick dependency) so editor UI can import
 * it without pulling `@imagemagick/magick-wasm` into the initial chunk.
 * Rasterization lives in `magick-process.ts` (`generateClutImage`), which the
 * main thread loads lazily and the worker bundles separately.
 */
import type { ClutInterpolation } from './types';
import { CLUT_PRESET_MAPS } from './clut-data';
import type { ClutPresetMap } from './clut-data';

export type ClutPreset = ClutPresetMap;

export function getClutPresets(): ClutPreset[] {
	return CLUT_PRESET_MAPS;
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
