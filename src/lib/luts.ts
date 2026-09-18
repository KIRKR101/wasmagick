import { MagickColor, MagickImage, PixelInterpolateMethod } from '@imagemagick/magick-wasm';
import type { IMagickImage } from '@imagemagick/magick-wasm';
import type { ClutInterpolation } from './types';
import { CLUT_PRESET_MAPS, getClutPresetMap } from './clut-data';
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

export function generateClutImage(
	presetId: string,
	interpolation: ClutInterpolation
): IMagickImage {
	const preset = getClutPresetMap(presetId);
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
