import type { GravityPosition } from './types';

export interface AnnotationPlacement {
	gravity: GravityPosition;
	offsetX: number;
	offsetY: number;
}

export interface AnnotationPoint {
	x: number;
	y: number;
}

/** Text metrics in the coordinate system used by ImageMagick's -annotate. */
export interface AnnotationTextMetrics {
	/** Advance width used to resolve horizontal gravity. */
	advanceWidth: number;
	/** Full typographic height used to resolve vertical gravity. */
	layoutHeight: number;
	/** Visible ink bounds used to keep the annotation inside the canvas. */
	inkWidth: number;
	inkHeight: number;
	/** Visible ink offset from the ImageMagick text origin. */
	inkOffsetX: number;
	inkOffsetYNorth: number;
	inkOffsetYCenter: number;
	inkOffsetYSouth: number;
}

/** Return the canvas anchor used by an ImageMagick gravity position. */
export function gravityAnchor(
	gravity: GravityPosition,
	width: number,
	height: number
): AnnotationPoint {
	const normalized = gravity.toLowerCase();
	const x = normalized.includes('west') ? 0 : normalized.includes('east') ? width : width / 2;
	const y = normalized.includes('north') ? 0 : normalized.includes('south') ? height : height / 2;
	return { x, y };
}

/**
 * Convert the UI's gravity/positive inward offsets back into a canvas point.
 * This mirrors the sign conversion used before -annotate is sent to Magick.
 */
export function pointFromAnnotationPlacement(
	placement: Pick<AnnotationPlacement, 'gravity' | 'offsetX' | 'offsetY'>,
	width: number,
	height: number
): AnnotationPoint {
	const anchor = gravityAnchor(placement.gravity, width, height);
	const normalized = placement.gravity.toLowerCase();
	const rightAnchored = normalized.includes('east');
	const bottomAnchored = normalized.includes('south');
	return {
		x: anchor.x + (rightAnchored ? -1 : 1) * placement.offsetX,
		y: anchor.y + (bottomAnchored ? -1 : 1) * placement.offsetY
	};
}

/** Convert a placement into the top-left corner of its rendered text box. */
export function topLeftFromAnnotationPlacement(
	placement: Pick<AnnotationPlacement, 'gravity' | 'offsetX' | 'offsetY'>,
	width: number,
	height: number,
	metrics: AnnotationTextMetrics
): AnnotationPoint {
	const anchor = pointFromAnnotationPlacement(placement, width, height);
	const normalized = placement.gravity.toLowerCase();
	const x = normalized.includes('west')
		? 0
		: normalized.includes('east')
			? metrics.advanceWidth
			: metrics.advanceWidth / 2;
	const y = normalized.includes('north')
		? 0
		: normalized.includes('south')
			? metrics.layoutHeight
			: metrics.layoutHeight / 2;
	const inkOffsetY = normalized.includes('north')
		? metrics.inkOffsetYNorth
		: normalized.includes('south')
			? metrics.inkOffsetYSouth
			: metrics.inkOffsetYCenter;
	return {
		x: anchor.x - x + metrics.inkOffsetX,
		y: anchor.y - y + inkOffsetY
	};
}

/**
 * Convert a canvas point into the nearest gravity anchor and positive inward
 * offsets. Gravity switches at the midpoint between the three anchors on
 * each axis, so a click naturally selects corner, edge, or center placement.
 */
export function annotationPlacementFromPoint(
	point: AnnotationPoint,
	width: number,
	height: number,
	metrics: AnnotationTextMetrics = {
		advanceWidth: 0,
		layoutHeight: 0,
		inkWidth: 0,
		inkHeight: 0,
		inkOffsetX: 0,
		inkOffsetYNorth: 0,
		inkOffsetYCenter: 0,
		inkOffsetYSouth: 0
	}
): AnnotationPlacement {
	// The marker is an explicit text-origin point, not a request to fit the
	// annotation inside the image. Preserve edge clicks so ImageMagick can
	// render or clip the overflowing text naturally.
	const x = Math.max(0, Math.min(width, point.x));
	const y = Math.max(0, Math.min(height, point.y));
	const horizontal = x < width * 0.25 ? 'West' : x > width * 0.75 ? 'East' : '';
	const vertical = y < height * 0.25 ? 'North' : y > height * 0.75 ? 'South' : '';

	const gravity = (
		vertical === 'North'
			? horizontal === 'West'
				? 'Northwest'
				: horizontal === 'East'
					? 'Northeast'
					: 'North'
			: vertical === 'South'
				? horizontal === 'West'
					? 'Southwest'
					: horizontal === 'East'
						? 'Southeast'
						: 'South'
				: horizontal === 'West'
					? 'West'
					: horizontal === 'East'
						? 'East'
						: 'Center'
	) as GravityPosition;

	const anchor = gravityAnchor(gravity, width, height);
	const normalized = gravity.toLowerCase();
	const textAnchor = {
		x:
			x -
			metrics.inkOffsetX +
			(normalized.includes('west')
				? 0
				: normalized.includes('east')
					? metrics.advanceWidth
					: metrics.advanceWidth / 2),
		y:
			y -
			(normalized.includes('north')
				? metrics.inkOffsetYNorth
				: normalized.includes('south')
					? metrics.inkOffsetYSouth
					: metrics.inkOffsetYCenter) +
			(normalized.includes('north')
				? 0
				: normalized.includes('south')
					? metrics.layoutHeight
					: metrics.layoutHeight / 2)
	};
	const actualOffsetX = textAnchor.x - anchor.x;
	const actualOffsetY = textAnchor.y - anchor.y;
	const offsetX = Math.round(normalized.includes('east') ? -actualOffsetX : actualOffsetX);
	const offsetY = Math.round(normalized.includes('south') ? -actualOffsetY : actualOffsetY);
	return {
		gravity,
		offsetX: offsetX === 0 ? 0 : offsetX,
		offsetY: offsetY === 0 ? 0 : offsetY
	};
}
