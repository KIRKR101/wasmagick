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
		s.borderSize[0] > 0 ||
		s.extentW != null ||
		s.extentH != null ||
		s.deskewThreshold[0] > 0 ||
		!s.deskewAutoCrop ||
		s.autoOrient
	);
}

export function isColorDirty(s: MagickSettings): boolean {
	const levelChs = ['All', 'Red', 'Green', 'Blue'] as const;
	const levelDirty = levelChs.some(
		ch =>
			s.levelBlackpoint[ch][0] !== 0 ||
			s.levelWhitepoint[ch][0] !== 100 ||
			s.levelGamma[ch][0] !== 1.0
	);
	return (
		s.normalizeImage ||
		s.autoLevel ||
		s.brightness[0] !== 100 ||
		s.contrast[0] !== 0 ||
		s.saturation[0] !== 100 ||
		s.hue[0] !== 100 ||
		levelDirty ||
		s.thresholdPercentage[0] !== 50 ||
		s.sigmoidalContrast[0] !== 0 ||
		s.colorSpace !== 'RGB'
	);
}

export function isFiltersDirty(s: MagickSettings): boolean {
	return s.effect !== 'none' || s.blur[0] > 0 || s.sharpen[0] > 0;
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
