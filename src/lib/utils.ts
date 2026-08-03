import type { MagickSettings } from './types';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

export function isGeoDirty(s: MagickSettings): boolean {
	return (
		s.resizeW != null ||
		s.resizeH != null ||
		s.rotate !== '0' ||
		s.flip ||
		s.flop ||
		(s.cropW != null && s.cropW > 0) ||
		(s.cropH != null && s.cropH > 0) ||
		s.cropX != null ||
		s.cropY != null ||
		s.trimEdges ||
		s.borderSize[0] > 0 ||
		s.extentW != null ||
		s.extentH != null ||
		s.deskewThreshold[0] > 0 ||
		s.deskewAutoCrop ||
		s.autoOrient ||
		s.shaveX != null ||
		s.shaveY != null
	);
}

export function isColorDirty(s: MagickSettings): boolean {
	const levelChs = ['All', 'Red', 'Green', 'Blue'] as const;
	const levelDirty = levelChs.some(
		(ch) =>
			s.levelBlackpoint[ch][0] !== 0 ||
			s.levelWhitepoint[ch][0] !== 100 ||
			s.levelGamma[ch][0] !== 1.0
	);
	return (
		s.normalizeImage ||
		s.autoLevel ||
		s.autoGamma ||
		s.brightness[0] !== 100 ||
		s.contrast[0] !== 0 ||
		s.saturation[0] !== 100 ||
		s.hue[0] !== 100 ||
		levelDirty ||
		s.levelColorsBlack !== '#000000' ||
		s.levelColorsWhite !== '#ffffff' ||
		s.levelColorsInverse ||
		s.thresholdPercentage[0] !== 50 ||
		s.autoThreshold !== 'Off' ||
		s.blackThreshold[0] > 0 ||
		s.whiteThreshold[0] < 100 ||
		s.claheXTiles[0] > 0 ||
		s.sigmoidalContrast[0] !== 0 ||
		s.colorSpace !== 'RGB'
	);
}

export function isFiltersDirty(s: MagickSettings): boolean {
	return (
		s.effect !== 'none' ||
		s.blur[0] > 0 ||
		s.sharpen[0] > 0 ||
		s.gaussianBlurRadius[0] > 0 ||
		s.motionBlurRadius[0] > 0 ||
		s.addNoiseType !== 'Off' ||
		s.adaptiveSharpenRadius[0] > 0 ||
		s.adaptiveBlurRadius[0] > 0 ||
		s.quantizeColors[0] > 0 ||
		s.quantizeTreeDepth[0] > 0 ||
		s.clutMap !== 'identity'
	);
}

export function isExportDirty(s: MagickSettings): boolean {
	return s.imageFormat !== 'WebP' || s.quality[0] !== 85 || !s.stripMeta;
}

export function isAnnotateDirty(s: MagickSettings): boolean {
	return (
		s.annotateText?.trim().length > 0 ||
		s.annotateFontFamily !== 'Roboto-Regular' ||
		s.annotateFontSize[0] !== 24 ||
		s.annotateFontColor !== '#ffffff' ||
		s.annotateGravity !== 'Center' ||
		s.annotateOffsetX !== 0 ||
		s.annotateOffsetY !== 0 ||
		s.annotateAngle[0] !== 0 ||
		s.annotateStroke ||
		s.annotateStrokeWidth[0] !== 1
	);
}
