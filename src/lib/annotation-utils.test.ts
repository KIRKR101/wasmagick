import { describe, expect, it } from 'vitest';
import {
	annotationPlacementFromPoint,
	gravityAnchor,
	pointFromAnnotationPlacement,
	topLeftFromAnnotationPlacement,
	type AnnotationTextMetrics
} from './annotation-utils';

const textMetrics: AnnotationTextMetrics = {
	advanceWidth: 240,
	layoutHeight: 48,
	inkWidth: 240,
	inkHeight: 48,
	inkOffsetX: 0,
	inkOffsetYNorth: 0,
	inkOffsetYCenter: 0,
	inkOffsetYSouth: 0
};

describe('annotation placement', () => {
	it('chooses a corner and inward offsets from a canvas point', () => {
		expect(annotationPlacementFromPoint({ x: 120, y: 80 }, 1000, 800)).toEqual({
			gravity: 'Northwest',
			offsetX: 120,
			offsetY: 80
		});
	});

	it('uses inward offsets for right and bottom anchors', () => {
		expect(annotationPlacementFromPoint({ x: 920, y: 740 }, 1000, 800)).toEqual({
			gravity: 'Southeast',
			offsetX: 80,
			offsetY: 60
		});
	});

	it('round-trips a placement back to its canvas point', () => {
		const placement = {
			gravity: 'East' as const,
			offsetX: 64,
			offsetY: -18
		};
		expect(pointFromAnnotationPlacement(placement, 1200, 900)).toEqual({
			x: 1136,
			y: 432
		});
	});

	it('round-trips a text top-left point using measured text bounds', () => {
		const placement = annotationPlacementFromPoint({ x: 120, y: 80 }, 1000, 800, textMetrics);
		expect(placement).toEqual({ gravity: 'Northwest', offsetX: 120, offsetY: 80 });
		expect(topLeftFromAnnotationPlacement(placement, 1000, 800, textMetrics)).toEqual({
			x: 120,
			y: 80
		});
	});

	it('preserves an edge placement even when the text overflows', () => {
		const placement = annotationPlacementFromPoint({ x: 999, y: 799 }, 1000, 800, textMetrics);
		expect(placement).toEqual({ gravity: 'Southeast', offsetX: -239, offsetY: -47 });
		expect(topLeftFromAnnotationPlacement(placement, 1000, 800, textMetrics)).toEqual({
			x: 999,
			y: 799
		});
	});

	it('uses ImageMagick ink offsets instead of the logical text box origin', () => {
		const metrics: AnnotationTextMetrics = {
			advanceWidth: 523,
			layoutHeight: 118,
			inkWidth: 508,
			inkHeight: 77,
			inkOffsetX: 8,
			inkOffsetYNorth: -1,
			inkOffsetYCenter: 17,
			inkOffsetYSouth: 17
		};
		const placement = { gravity: 'Southeast' as const, offsetX: 0, offsetY: 0 };
		expect(topLeftFromAnnotationPlacement(placement, 1500, 1200, metrics)).toEqual({
			x: 985,
			y: 1099
		});
	});

	it('returns the center anchor for Center gravity', () => {
		expect(gravityAnchor('Center', 1200, 900)).toEqual({ x: 600, y: 450 });
	});
});
