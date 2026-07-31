/**
 * Coordinate conversion helpers for the drag-to-crop overlay.
 *
 * The CanvasViewport positions the image with:
 *   transform: translate(calc(-50% + imageX), calc(-50% + imageY)) scale(zoom/100)
 *
 * This means the image center sits at the viewport center plus the pan offset
 * (imageX, imageY), and all pixel positions are scaled by zoom/100.
 */

import type { MagickSettings } from './types';

export interface Point {
	x: number;
	y: number;
}

export interface CropRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/**
 * Convert a screen (client) coordinate to top-left-absolute image pixel coordinates.
 *
 * The CanvasViewport centres the image in the viewport, so raw conversion
 * yields centre-relative coordinates.  Adding half the image dimensions
 * normalises to the standard (0,0) = top-left coordinate system.
 */
export function screenToImage(
	screenX: number,
	screenY: number,
	viewportRect: DOMRect,
	zoom: number,
	imageX: number,
	imageY: number,
	imageW: number,
	imageH: number
): Point {
	const centerX = viewportRect.left + viewportRect.width / 2;
	const centerY = viewportRect.top + viewportRect.height / 2;
	const scale = zoom / 100;
	return {
		x: (screenX - centerX - imageX) / scale + imageW / 2,
		y: (screenY - centerY - imageY) / scale + imageH / 2
	};
}

/**
 * Normalize a rectangle defined by two arbitrary corner points.
 * Ensures width and height are positive.
 */
export function normalizeRect(x1: number, y1: number, x2: number, y2: number): CropRect {
	return {
		x: Math.min(x1, x2),
		y: Math.min(y1, y2),
		w: Math.abs(x2 - x1),
		h: Math.abs(y2 - y1)
	};
}

/**
 * Clamp a crop rectangle to the intersection with the image bounds.
 *
 * Both the position and the far edges are clamped independently, so the
 * rectangle can never extend past the image: the left edge never moves right
 * of the original left edge while the right edge stays put. This is the
 * correct behaviour for drawing and edge/resize drags (the dragged corner is
 * clamped to the image edge). For moving the whole rect, use
 * {@link clampMoveToImage}, which preserves the size.
 */
export function clampCropToImage(crop: CropRect, imageW: number, imageH: number): CropRect {
	const x = Math.max(0, Math.min(crop.x, imageW));
	const y = Math.max(0, Math.min(crop.y, imageH));
	const right = Math.max(0, Math.min(crop.x + crop.w, imageW));
	const bottom = Math.max(0, Math.min(crop.y + crop.h, imageH));
	return {
		x,
		y,
		w: Math.max(0, right - x),
		h: Math.max(0, bottom - y)
	};
}

/**
 * Clamp a crop rectangle to lie within image bounds while preserving its size.
 * The rect is shifted back into view instead of being shrunk, so moving a crop
 * (or nudging it with the arrow keys) past an image edge snaps it fully back
 * into view rather than collapsing its dimensions.
 */
export function clampMoveToImage(crop: CropRect, imageW: number, imageH: number): CropRect {
	const w = Math.min(crop.w, imageW);
	const h = Math.min(crop.h, imageH);
	return {
		x: Math.max(0, Math.min(crop.x, imageW - w)),
		y: Math.max(0, Math.min(crop.y, imageH - h)),
		w,
		h
	};
}

/**
 * Apply an aspect ratio constraint to a crop rectangle, anchoring at a given corner.
 * `ratio` is width/height (e.g. 16/9).
 * `anchor` determines which corner stays fixed: 'nw' | 'ne' | 'se' | 'sw'.
 */
export function constrainAspect(crop: CropRect, ratio: number, anchor: 'nw' | 'ne' | 'se' | 'sw'): CropRect {
	let { x, y, w, h } = crop;
	if (w <= 0 || h <= 0) return crop;

	const currentRatio = w / h;
	if (currentRatio > ratio) {
		// Too wide — reduce width
		w = h * ratio;
	} else {
		// Too tall — reduce height
		h = w / ratio;
	}

	// Adjust position based on anchor so the fixed corner doesn't move
	switch (anchor) {
		case 'ne':
			x = crop.x + crop.w - w;
			break;
		case 'se':
			x = crop.x + crop.w - w;
			y = crop.y + crop.h - h;
			break;
		case 'sw':
			y = crop.y + crop.h - h;
			break;
		// 'nw' — anchor is top-left, no position adjustment needed
	}

	return { x, y, w, h };
}

/**
 * Determine which handle (or 'move') a point is inside, given a crop rect in screen space.
 * Returns null if the point is not on any handle.
 *
 * Priority: corners → edge bands → interior.
 * Edge bands create a wider grab zone along each border so users can drag
 * from anywhere along an edge, not just the midpoint handles.
 *
 * `hitRadius` is in screen pixels (default 8).
 */
export function hitTestHandle(
	screenPt: Point,
	cropScreen: CropRect,
	hitRadius: number = 8
): string | null {
	const { x, y, w, h } = cropScreen;
	const edgeBand = hitRadius * 2;

	const handlePositions: Record<string, Point> = {
		nw: { x, y },
		ne: { x: x + w, y },
		se: { x: x + w, y: y + h },
		sw: { x, y: y + h }
	};

	// 1. Corner handles (exact hit zones)
	for (const [name, pt] of Object.entries(handlePositions)) {
		const dx = screenPt.x - pt.x;
		const dy = screenPt.y - pt.y;
		if (Math.abs(dx) <= hitRadius && Math.abs(dy) <= hitRadius) {
			return name;
		}
	}

	// 2. Edge bands — wider hit zones along each border, excluding corners
	const inTopBand = screenPt.y >= y - edgeBand && screenPt.y <= y + edgeBand;
	const inBottomBand = screenPt.y >= y + h - edgeBand && screenPt.y <= y + h + edgeBand;
	const inLeftBand = screenPt.x >= x - edgeBand && screenPt.x <= x + edgeBand;
	const inRightBand = screenPt.x >= x + w - edgeBand && screenPt.x <= x + w + edgeBand;
	const isHorizCorner = (px: number) =>
		(px >= x - hitRadius && px <= x + hitRadius) ||
		(px >= x + w - hitRadius && px <= x + w + hitRadius);
	const isVertCorner = (py: number) =>
		(py >= y - hitRadius && py <= y + hitRadius) ||
		(py >= y + h - hitRadius && py <= y + h + hitRadius);

	if (inTopBand && !isHorizCorner(screenPt.x)) return 'n';
	if (inBottomBand && !isHorizCorner(screenPt.x)) return 's';
	if (inLeftBand && !isVertCorner(screenPt.y)) return 'w';
	if (inRightBand && !isVertCorner(screenPt.y)) return 'e';

	// 3. Interior — moving
	if (screenPt.x >= x && screenPt.x <= x + w && screenPt.y >= y && screenPt.y <= y + h) {
		return 'move';
	}

	return null;
}

/**
 * Map a handle name to the appropriate CSS cursor.
 */
export function handleCursor(handle: string): string {
	switch (handle) {
		case 'nw':
			return 'nwse-resize';
		case 'ne':
			return 'nesw-resize';
		case 'se':
			return 'nwse-resize';
		case 'sw':
			return 'nesw-resize';
		case 'n':
			return 'ns-resize';
		case 's':
			return 'ns-resize';
		case 'e':
			return 'ew-resize';
		case 'w':
			return 'ew-resize';
		case 'move':
			return 'move';
		default:
			return 'crosshair';
	}
}

/**
 * Get the anchor point opposite to a given handle.
 * Used for aspect-ratio-constrained resizing: the opposite corner stays fixed.
 */
export function oppositeAnchor(handle: string): 'nw' | 'ne' | 'se' | 'sw' {
	switch (handle) {
		case 'nw':
			return 'se';
		case 'ne':
			return 'sw';
		case 'se':
			return 'nw';
		case 'sw':
			return 'ne';
		case 'n':
			return 'se'; // vertical resize: anchor bottom
		case 's':
			return 'nw'; // vertical resize: anchor top
		case 'e':
			return 'nw'; // horizontal resize: anchor left
		case 'w':
			return 'ne'; // horizontal resize: anchor right
		default:
			return 'nw';
	}
}

/**
 * Resize a crop rect based on a handle drag.
 * `handle` determines which edge/corner moves.
 * `dx`, `dy` are the drag deltas in image pixel space.
 * `original` is the crop rect before the resize started.
 */
export function resizeFromHandle(
	original: CropRect,
	handle: string,
	dx: number,
	dy: number
): CropRect {
	let { x, y, w, h } = original;

	switch (handle) {
		case 'nw':
			x += dx;
			y += dy;
			w -= dx;
			h -= dy;
			break;
		case 'n':
			y += dy;
			h -= dy;
			break;
		case 'ne':
			w += dx;
			y += dy;
			h -= dy;
			break;
		case 'e':
			w += dx;
			break;
		case 'se':
			w += dx;
			h += dy;
			break;
		case 's':
			h += dy;
			break;
		case 'sw':
			x += dx;
			w -= dx;
			h += dy;
			break;
		case 'w':
			x += dx;
			w -= dx;
			break;
	}

	return { x, y, w, h };
}

/**
 * Ensure a crop rect has positive dimensions, flipping axis if dragged past origin.
 */
export function ensurePositiveDimensions(crop: CropRect): CropRect {
	let { x, y, w, h } = crop;
	if (w < 0) {
		x += w;
		w = -w;
	}
	if (h < 0) {
		y += h;
		h = -h;
	}
	return { x, y, w, h };
}

/**
 * Fit a crop rect to image bounds while preserving aspect ratio and anchor.
 * Clamping can break the ratio (reduces one dimension but not the other),
 * so we apply constrain + clamp twice to converge.
 */
export function fitCropToImage(
	crop: CropRect,
	ratio: number,
	anchor: 'nw' | 'ne' | 'se' | 'sw',
	imageW: number,
	imageH: number
): CropRect {
	let rect = constrainAspect(crop, ratio, anchor);
	rect = clampCropToImage(rect, imageW, imageH);
	rect = constrainAspect(rect, ratio, anchor);
	rect = clampCropToImage(rect, imageW, imageH);
	return rect;
}

/**
 * Positional offset for a gravity anchor along a single axis.
 * `gap` is the unused space on that axis (image size minus crop size).
 * Matches ImageMagick's gravity placement (truncating division for centering).
 */
function gravityAxisOffset(gap: number, gravity: string, isHorizontal: boolean): number {
	const g = gravity;
	if (isHorizontal) {
		if (g === 'West' || g === 'Northwest' || g === 'Southwest') return 0;
		if (g === 'East' || g === 'Northeast' || g === 'Southeast') return gap;
		return Math.floor(gap / 2); // Center, North, South
	}
	if (g === 'North' || g === 'Northwest' || g === 'Northeast') return 0;
	if (g === 'South' || g === 'Southwest' || g === 'Southeast') return gap;
	return Math.floor(gap / 2); // Center, West, East
}

/**
 * The offset of the displayed image's top-left in the crop-step coordinate
 * space (after resize/rotate, before crop in the pipeline). When a position
 * crop is already applied the displayed image *is* that crop, so its top-left
 * maps back to (cropX, cropY); otherwise it sits at the origin.
 */
export function computeCropStepOffset(settings: MagickSettings): { offsetX: number; offsetY: number } {
	if (settings.cropX != null && settings.cropY != null) {
		return { offsetX: settings.cropX, offsetY: settings.cropY };
	}
	return { offsetX: 0, offsetY: 0 };
}

/**
 * Compute the initial crop rect shown by the visual crop overlay for the
 * currently applied crop settings.
 *
 * The overlay operates on the image currently displayed in the viewport (the
 * output of the processing pipeline). If a position crop (cropX/cropY) is
 * already applied, the displayed image is that crop, so the rect is positioned
 * at its top-left. If only a gravity crop (cropW/cropH + gravity) is applied,
 * the gravity position is approximated in step space.
 *
 * Returns null when no crop is active.
 */
export function computeCropPreview(
	settings: MagickSettings,
	originalWidth: number,
	originalHeight: number
): CropRect | null {
	const srcW = originalWidth || 0;
	const srcH = originalHeight || 0;
	const rotated = settings.rotate === '90' || settings.rotate === '-90';
	const stepW = rotated ? (settings.resizeH ?? srcH) : (settings.resizeW ?? srcW);
	const stepH = rotated ? (settings.resizeW ?? srcW) : (settings.resizeH ?? srcH);

	let offsetX = 0;
	let offsetY = 0;
	if (settings.cropX != null && settings.cropY != null) {
		offsetX = settings.cropX;
		offsetY = settings.cropY;
	}

	if (
		settings.cropX != null &&
		settings.cropY != null &&
		(settings.cropW ?? 0) > 0 &&
		(settings.cropH ?? 0) > 0
	) {
		return {
			x: settings.cropX - offsetX,
			y: settings.cropY - offsetY,
			w: settings.cropW!,
			h: settings.cropH!
		};
	}

	if (settings.cropW != null && settings.cropW > 0 && settings.cropH != null && settings.cropH > 0) {
		const cw = Math.min(settings.cropW, stepW);
		const ch = Math.min(settings.cropH, stepH);
		return {
			x: gravityAxisOffset(stepW - cw, settings.cropGravity, true) - offsetX,
			y: gravityAxisOffset(stepH - ch, settings.cropGravity, false) - offsetY,
			w: cw,
			h: ch
		};
	}

	return null;
}
