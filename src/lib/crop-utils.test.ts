import { describe, it, expect } from 'vitest';
import {
	clampCropToImage,
	clampMoveToImage,
	constrainAspect,
	normalizeRect,
	ensurePositiveDimensions,
	fitCropToImage,
	computeCropPreview,
	computeCropStepOffset
} from './crop-utils';
import type { CropRect } from './crop-utils';
import type { MagickSettings } from './types';

const IMG = { imageW: 100, imageH: 100 };

function rect(x: number, y: number, w: number, h: number): CropRect {
	return { x, y, w, h };
}

function settings(patch: Partial<MagickSettings>): MagickSettings {
	return {
		rotate: '0',
		resizeW: null,
		resizeH: null,
		cropX: null,
		cropY: null,
		cropW: null,
		cropH: null,
		cropGravity: 'Center',
		shaveX: null,
		shaveY: null,
		...patch
	} as MagickSettings;
}

describe('normalizeRect', () => {
	it('normalises any corner order', () => {
		expect(normalizeRect(20, 30, 10, 10)).toEqual({ x: 10, y: 10, w: 10, h: 20 });
		expect(normalizeRect(10, 10, 20, 30)).toEqual({ x: 10, y: 10, w: 10, h: 20 });
	});
});

describe('clampCropToImage', () => {
	it('leaves a fully contained rect untouched', () => {
		expect(clampCropToImage(rect(10, 10, 40, 40), IMG.imageW, IMG.imageH)).toEqual(
			rect(10, 10, 40, 40)
		);
	});

	it('truncates the far edge when dragging past the right/bottom', () => {
		expect(clampCropToImage(rect(10, 10, 95, 95), IMG.imageW, IMG.imageH)).toEqual(
			rect(10, 10, 90, 90)
		);
	});

	it('truncates the near edge without enlarging when starting inside and dragging out', () => {
		// Drawn from (10,10) toward (-5,-5): only the visible 0..10 range remains.
		expect(clampCropToImage(rect(-5, -5, 15, 15), IMG.imageW, IMG.imageH)).toEqual(
			rect(0, 0, 10, 10)
		);
	});

	it('keeps the far edge fixed when the near edge is clipped', () => {
		// Drawn from (-5,-5) to (95,95): far edges stay at 95, not 100.
		expect(clampCropToImage(rect(-5, -5, 100, 100), IMG.imageW, IMG.imageH)).toEqual(
			rect(0, 0, 95, 95)
		);
	});

	it('returns an empty rect when fully outside the image', () => {
		expect(clampCropToImage(rect(120, 120, 40, 40), IMG.imageW, IMG.imageH)).toEqual(
			rect(100, 100, 0, 0)
		);
	});
});

describe('clampMoveToImage', () => {
	it('keeps the size when moved fully past the right edge', () => {
		expect(clampMoveToImage(rect(110, 10, 40, 40), IMG.imageW, IMG.imageH)).toEqual(
			rect(60, 10, 40, 40)
		);
	});

	it('keeps the size when moved past the left edge', () => {
		expect(clampMoveToImage(rect(-5, 10, 40, 40), IMG.imageW, IMG.imageH)).toEqual(
			rect(0, 10, 40, 40)
		);
	});

	it('clamps both axes independently', () => {
		expect(clampMoveToImage(rect(-5, 120, 40, 40), IMG.imageW, IMG.imageH)).toEqual(
			rect(0, 60, 40, 40)
		);
	});

	it('shrinks a rect larger than the image to fit', () => {
		expect(clampMoveToImage(rect(10, 10, 150, 150), IMG.imageW, IMG.imageH)).toEqual(
			rect(0, 0, 100, 100)
		);
	});
});

describe('constrainAspect', () => {
	it('shrinks width for a too-wide rect', () => {
		const result = constrainAspect(rect(0, 0, 100, 40), 1, 'nw');
		expect(result).toEqual({ x: 0, y: 0, w: 40, h: 40 });
	});

	it('shrinks height for a too-tall rect', () => {
		const result = constrainAspect(rect(0, 0, 40, 100), 1, 'nw');
		expect(result).toEqual({ x: 0, y: 0, w: 40, h: 40 });
	});

	it('keeps the opposite corner fixed', () => {
		const result = constrainAspect(rect(20, 30, 100, 40), 1, 'se');
		// se corner stays at (120, 70)
		expect(result).toEqual({ x: 80, y: 30, w: 40, h: 40 });
	});
});

describe('ensurePositiveDimensions', () => {
	it('flips negative width', () => {
		expect(ensurePositiveDimensions(rect(20, 0, -10, 30))).toEqual(rect(10, 0, 10, 30));
	});

	it('flips negative height', () => {
		expect(ensurePositiveDimensions(rect(0, 20, 30, -10))).toEqual(rect(0, 10, 30, 10));
	});
});

describe('fitCropToImage', () => {
	it('keeps the aspect ratio within the image', () => {
		const result = fitCropToImage(rect(10, 10, 100, 40), 1, 'nw', 100, 100);
		expect(result.w).toBe(result.h);
		expect(result.x + result.w).toBeLessThanOrEqual(100);
		expect(result.y + result.h).toBeLessThanOrEqual(100);
	});

	it('clamps the dragged corner when overshooting the image', () => {
		const result = fitCropToImage(rect(10, 10, 200, 200), 1, 'nw', 100, 100);
		expect(result.w).toBe(90);
		expect(result.h).toBe(90);
		expect(result).toEqual(rect(10, 10, 90, 90));
	});
});

describe('computeCropStepOffset', () => {
	it('is zero when no position crop exists', () => {
		expect(computeCropStepOffset(settings({}))).toEqual({ offsetX: 0, offsetY: 0 });
	});

	it('reflects an existing position crop', () => {
		expect(computeCropStepOffset(settings({ cropX: 20, cropY: 30 }))).toEqual({
			offsetX: 20,
			offsetY: 30
		});
	});
});

describe('computeCropPreview', () => {
	it('returns null when no crop is set', () => {
		expect(computeCropPreview(settings({}), 100, 100)).toBeNull();
	});

	it('positions an existing position crop at the origin of the displayed image', () => {
		const result = computeCropPreview(
			settings({ cropX: 20, cropY: 30, cropW: 40, cropH: 50 }),
			100,
			100
		);
		expect(result).toEqual({ x: 0, y: 0, w: 40, h: 50 });
	});

	it('computes a center-gravity crop position', () => {
		const result = computeCropPreview(
			settings({ cropW: 40, cropH: 40, cropGravity: 'Center' }),
			100,
			100
		);
		expect(result).toEqual({ x: 30, y: 30, w: 40, h: 40 });
	});

	it('uses truncating division for odd image dimensions (matches ImageMagick)', () => {
		const result = computeCropPreview(
			settings({ cropW: 40, cropH: 40, cropGravity: 'Center' }),
			101,
			99
		);
		expect(result).toEqual({ x: 30, y: 29, w: 40, h: 40 });
	});

	it('places gravity crops at the correct corners', () => {
		const nw = computeCropPreview(
			settings({ cropW: 40, cropH: 40, cropGravity: 'Northwest' }),
			100,
			100
		);
		expect(nw).toEqual({ x: 0, y: 0, w: 40, h: 40 });
		const se = computeCropPreview(
			settings({ cropW: 40, cropH: 40, cropGravity: 'Southeast' }),
			100,
			100
		);
		expect(se).toEqual({ x: 60, y: 60, w: 40, h: 40 });
	});
});
