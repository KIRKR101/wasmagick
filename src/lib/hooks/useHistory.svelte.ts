/**
 * useHistory - undo/redo stack for image processing states.
 *
 * Each entry stores the settings snapshot AND a blob URL for the processed
 * result, so undo/redo are instant (no re-processing). History owns its own
 * blob URLs (cloned from magick's) so magick's lifecycle (which revokes its
 * own URLs on the next process) never invalidates history entries.
 *
 * Cap is 40 entries; oldest is evicted (FIFO) with URL revoke.
 */

import type { MagickState } from '$lib/useMagick.svelte';
import type { MagickSettings } from '$lib/types';

export interface SettingsDiffItem {
	label: string;
	prev: string | null;
	curr: string;
}

function fmt(val: unknown): string {
	if (val === null || val === undefined) return '—';
	if (typeof val === 'boolean') return val ? 'on' : 'off';
	if (typeof val === 'number') return String(val);
	if (typeof val === 'string') return val || '—';
	return String(val);
}

function diffSettings(a: MagickSettings, b: MagickSettings): SettingsDiffItem[] {
	const items: SettingsDiffItem[] = [];
	const push = (label: string, av: unknown, bv: unknown) => {
		if (JSON.stringify(av) !== JSON.stringify(bv)) {
			items.push({ label, prev: fmt(av), curr: fmt(bv) });
		}
	};

	// Export
	push('Format', a.imageFormat, b.imageFormat);
	push('Quality', a.quality[0], b.quality[0]);
	push('Strip meta', a.stripMeta, b.stripMeta);

	// Geometry
	push('Resize W', a.resizeW, b.resizeW);
	push('Resize H', a.resizeH, b.resizeH);
	push('Rotate', a.rotate, b.rotate);
	push('Flop', a.flop, b.flop);
	push('Flip', a.flip, b.flip);
	push('Border', a.borderSize[0], b.borderSize[0]);
	push('Border color', a.borderColor, b.borderColor);
	push('Extent W', a.extentW, b.extentW);
	push('Extent H', a.extentH, b.extentH);
	push('Extent bg', a.extentBgColor, b.extentBgColor);
	push('Gravity', a.extentGravity, b.extentGravity);
	push('Deskew', a.deskewThreshold[0], b.deskewThreshold[0]);
	push('Deskew crop', a.deskewAutoCrop, b.deskewAutoCrop);
	push('Crop W', a.cropW, b.cropW);
	push('Crop H', a.cropH, b.cropH);
	push('Crop gravity', a.cropGravity, b.cropGravity);
	push('Crop X', a.cropX, b.cropX);
	push('Crop Y', a.cropY, b.cropY);
	push('Shave X', a.shaveX, b.shaveX);
	push('Shave Y', a.shaveY, b.shaveY);

	// Color
	push('Brightness', a.brightness[0], b.brightness[0]);
	push('Saturation', a.saturation[0], b.saturation[0]);
	push('Hue', a.hue[0], b.hue[0]);
	push('Contrast', a.contrast[0], b.contrast[0]);
	push('Normalize', a.normalizeImage, b.normalizeImage);
	push('Auto level', a.autoLevel, b.autoLevel);
	push('Auto gamma', a.autoGamma, b.autoGamma);
	push('Auto orient', a.autoOrient, b.autoOrient);
	push('Color space', a.colorSpace, b.colorSpace);
	push('Level channel', a.levelChannels, b.levelChannels);
	push('Threshold', a.thresholdPercentage[0], b.thresholdPercentage[0]);
	push('Threshold ch', a.thresholdChannels, b.thresholdChannels);
	push('Auto threshold', a.autoThreshold, b.autoThreshold);
	push('Black threshold', a.blackThreshold[0], b.blackThreshold[0]);
	push('White threshold', a.whiteThreshold[0], b.whiteThreshold[0]);
	push('CLAHE X', a.claheXTiles[0], b.claheXTiles[0]);
	push('CLAHE Y', a.claheYTiles[0], b.claheYTiles[0]);
	push('CLAHE bins', a.claheBins[0], b.claheBins[0]);
	push('CLAHE clip', a.claheClipLimit[0], b.claheClipLimit[0]);
	push('Sigmoidal C', a.sigmoidalContrast[0], b.sigmoidalContrast[0]);
	push('Sigmoidal M', a.sigmoidalMidpoint[0], b.sigmoidalMidpoint[0]);
	push('Sigmoidal ch', a.sigmoidalChannels, b.sigmoidalChannels);

	// Levels (per-channel)
	for (const ch of ['All', 'Red', 'Green', 'Blue'] as const) {
		push(`Lvl black ${ch}`, a.levelBlackpoint[ch][0], b.levelBlackpoint[ch][0]);
		push(`Lvl white ${ch}`, a.levelWhitepoint[ch][0], b.levelWhitepoint[ch][0]);
		push(`Lvl gamma ${ch}`, a.levelGamma[ch][0], b.levelGamma[ch][0]);
	}

	// Filters
	push('Effect', a.effect, b.effect);
	push('Blur', a.blur[0], b.blur[0]);
	push('Sharpen', a.sharpen[0], b.sharpen[0]);
	push('Gauss blur r', a.gaussianBlurRadius[0], b.gaussianBlurRadius[0]);
	push('Gauss blur σ', a.gaussianBlurSigma[0], b.gaussianBlurSigma[0]);
	push('Motion blur r', a.motionBlurRadius[0], b.motionBlurRadius[0]);
	push('Motion blur σ', a.motionBlurSigma[0], b.motionBlurSigma[0]);
	push('Motion blur °', a.motionBlurAngle[0], b.motionBlurAngle[0]);
	push('Noise', a.addNoiseType, b.addNoiseType);
	push('Noise attenuate', a.addNoiseAttenuate[0], b.addNoiseAttenuate[0]);
	push('Sepia', a.sepiaThreshold[0], b.sepiaThreshold[0]);
	push('Charcoal', a.charcoalIntensity[0], b.charcoalIntensity[0]);
	push('Canny strength', a.cannyEdgeStrength[0], b.cannyEdgeStrength[0]);
	push('Canny lower', a.cannyEdgeLower[0], b.cannyEdgeLower[0]);
	push('Canny upper', a.cannyEdgeUpper[0], b.cannyEdgeUpper[0]);
	push('Oil paint', a.oilpaintRadius[0], b.oilpaintRadius[0]);
	push('Solarize', a.solarizeFactor[0], b.solarizeFactor[0]);
	push('Bilateral W', a.bilateralWidth[0], b.bilateralWidth[0]);
	push('Bilateral H', a.bilateralHeight[0], b.bilateralHeight[0]);
	push('Bilateral iΣ', a.bilateralIntensitySigma[0], b.bilateralIntensitySigma[0]);
	push('Bilateral sΣ', a.bilateralSpatialSigma[0], b.bilateralSpatialSigma[0]);
	push('CLUT', a.clutMap, b.clutMap);
	push('CLUT interp', a.clutInterpolation, b.clutInterpolation);

	// Quantize
	push('Quantize colors', a.quantizeColors[0], b.quantizeColors[0]);
	push('Dither', a.ditherMethod, b.ditherMethod);
	push('Quantize space', a.quantizeColorSpace, b.quantizeColorSpace);
	push('Quantize depth', a.quantizeTreeDepth[0], b.quantizeTreeDepth[0]);

	// Annotate
	push('Text', a.annotateText, b.annotateText);
	push('Font', a.annotateFontFamily, b.annotateFontFamily);
	push('Font size', a.annotateFontSize[0], b.annotateFontSize[0]);
	push('Font color', a.annotateFontColor, b.annotateFontColor);
	push('Text gravity', a.annotateGravity, b.annotateGravity);
	push('Offset X', a.annotateOffsetX, b.annotateOffsetX);
	push('Offset Y', a.annotateOffsetY, b.annotateOffsetY);
	push('Text angle', a.annotateAngle[0], b.annotateAngle[0]);
	push('Stroke', a.annotateStroke, b.annotateStroke);
	push('Stroke color', a.annotateStrokeColor, b.annotateStrokeColor);
	push('Stroke width', a.annotateStrokeWidth[0], b.annotateStrokeWidth[0]);

	return items;
}

export interface HistoryEntry {
	id: number;
	label: string;
	settings: MagickSettings;
	/** History-owned blob URL. Survives magick re-processing. */
	blobUrl: string;
	width: number;
	height: number;
	format: string;
	size: number;
	/** Processing time in ms; 0 for the Original entry. */
	time: number;
	/** Creation timestamp. */
	ts: number;
	isOriginal: boolean;
	statsMessage: string;
}

const MAX_ENTRIES = 40;

async function cloneBlobUrl(url: string): Promise<string> {
	const blob = await fetch(url).then((r) => r.blob());
	return URL.createObjectURL(blob);
}

function snapSettings(settings: MagickSettings): MagickSettings {
	return JSON.parse(JSON.stringify(settings));
}

let nextId = 1;

export class HistoryState {
	entries = $state<HistoryEntry[]>([]);
	/** Index of the current state within `entries`, -1 when empty. */
	pointer = $state(-1);

	// Non-reactive internal set tracking blob URLs pending revoke.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	private _urlsToRevoke: Set<string> = new Set();

	get canUndo(): boolean {
		return this.pointer > 0;
	}
	get canRedo(): boolean {
		return this.pointer < this.entries.length - 1;
	}
	get current(): HistoryEntry | null {
		return this.pointer >= 0 ? this.entries[this.pointer] : null;
	}
	get count(): number {
		return this.entries.length;
	}

	/** Diff of entry at `index` vs the previous entry (relative). */
	getDiff(index: number): SettingsDiffItem[] {
		if (index < 1 || index >= this.entries.length) return [];
		return diffSettings(this.entries[index - 1].settings, this.entries[index].settings);
	}

	/** Diff of entry at `index` vs the Original entry (absolute). */
	getAbsoluteDiff(index: number): SettingsDiffItem[] {
		if (index < 0 || index >= this.entries.length) return [];
		return diffSettings(this.entries[0].settings, this.entries[index].settings);
	}

	/** Reset history to a single Original entry. Called after a new file loads. */
	async resetToOriginal(magick: MagickState): Promise<void> {
		this.revokeAll();
		if (!magick.originalImageUrl) {
			this.entries = [];
			this.pointer = -1;
			return;
		}
		const blobUrl = await cloneBlobUrl(magick.originalImageUrl);
		const entry: HistoryEntry = {
			id: nextId++,
			label: 'Original',
			settings: snapSettings(magick.settings),
			blobUrl,
			width: magick.originalWidth,
			height: magick.originalHeight,
			format: magick.originalImageFormat ?? 'original',
			size: magick.originalImageSize,
			time: 0,
			ts: Date.now(),
			isOriginal: true,
			statsMessage: 'Original'
		};
		this.entries = [entry];
		this.pointer = 0;
	}

	/**
	 * Push a new state after a successful process. Clones the processed blob
	 * URL so history owns its own copy. Truncates any redo branch.
	 */
	async pushFromMagick(magick: MagickState, label: string): Promise<void> {
		if (!magick.processedImageUrl) return;
		const blobUrl = await cloneBlobUrl(magick.processedImageUrl);
		const entry: HistoryEntry = {
			id: nextId++,
			label,
			settings: snapSettings(magick.settings),
			blobUrl,
			width: magick.processedWidth,
			height: magick.processedHeight,
			format: magick.processedImageFormat ?? magick.settings.imageFormat.toLowerCase(),
			size: 0,
			time: 0,
			ts: Date.now(),
			isOriginal: false,
			statsMessage: magick.statsMessage
		};
		// Estimate size from the blob.
		try {
			const blob = await fetch(blobUrl).then((r) => r.blob());
			entry.size = blob.size;
		} catch {
			// ignore
		}
		entry.time = magick.processedImageTime;

		// Truncate redo branch.
		if (this.pointer < this.entries.length - 1) {
			const doomed = this.entries.slice(this.pointer + 1);
			for (const d of doomed) this._urlsToRevoke.add(d.blobUrl);
			this.entries = this.entries.slice(0, this.pointer + 1);
		}
		this.entries = [...this.entries, entry];

		// Enforce cap (evict oldest, but never the entry we just pushed).
		while (this.entries.length > MAX_ENTRIES) {
			const evicted = this.entries.shift()!;
			if (evicted.blobUrl !== entry.blobUrl) this._urlsToRevoke.add(evicted.blobUrl);
			this.pointer = Math.max(0, this.pointer - 1);
		}
		this.pointer = this.entries.length - 1;
		this.flushRevoke();
	}

	/** Restore state at `pointer - 1`. */
	async undo(magick: MagickState): Promise<void> {
		if (!this.canUndo) return;
		this.pointer -= 1;
		await this.restore(magick);
	}

	/** Restore state at `pointer + 1`. */
	async redo(magick: MagickState): Promise<void> {
		if (!this.canRedo) return;
		this.pointer += 1;
		await this.restore(magick);
	}

	/** Jump to an arbitrary entry by id. */
	async jumpTo(magick: MagickState, id: number): Promise<void> {
		const idx = this.entries.findIndex((e) => e.id === id);
		if (idx < 0) return;
		this.pointer = idx;
		await this.restore(magick);
	}

	private async restore(magick: MagickState): Promise<void> {
		const entry = this.current;
		if (!entry) return;
		magick.settings = snapSettings(entry.settings);
		// Give magick its own disposable URL (history keeps its own).
		if (magick.processedImageUrl) URL.revokeObjectURL(magick.processedImageUrl);
		if (entry.isOriginal) {
			magick.processedImageUrl = null;
			magick.processedImageFormat = null;
			magick.processedImageName = null;
			magick.processedWidth = 0;
			magick.processedHeight = 0;
		} else {
			magick.processedImageUrl = await cloneBlobUrl(entry.blobUrl);
			magick.processedImageFormat = entry.format;
			const base = magick.originalName.replace(/\.[^.]+$/, '');
			magick.processedImageName = `${base}-edited.${entry.format}`;
			magick.processedWidth = entry.width;
			magick.processedHeight = entry.height;
		}
		magick.statsMessage = entry.statsMessage;
		magick.hasError = false;
		magick.errorMessage = null;
		magick.cropMode = false;
		magick.cropAspectRatio = 'free';
		magick.cropSelection = null;
	}

	clear(): void {
		this.revokeAll();
		this.entries = [];
		this.pointer = -1;
	}

	private revokeAll(): void {
		for (const e of this.entries) this._urlsToRevoke.add(e.blobUrl);
		this.flushRevoke();
	}

	private flushRevoke(): void {
		for (const url of this._urlsToRevoke) URL.revokeObjectURL(url);
		this._urlsToRevoke.clear();
	}
}

export function useHistory(): HistoryState {
	return new HistoryState();
}
