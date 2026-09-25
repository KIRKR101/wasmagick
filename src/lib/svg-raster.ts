/**
 * Browser-side SVG rasterization for the WASM engine.
 *
 * The `@imagemagick/magick-wasm` build delegates `SVG` decoding to an
 * external `inkscape` binary (`error/delegate.c/ExternalDelegateCommand`),
 * which cannot exist in a browser sandbox. Its internal `MSVG` renderer is
 * additionally blocked by the build's security policy (`NotAuthorized MVG`).
 * The bundled native ImageMagick likewise ships without its SVG delegate
 * (`rsvg-convert` / `svg.la` missing), so raw SVG bytes fail there too.
 *
 * SVG/SVGZ inputs are therefore rasterized with the browser's own SVG
 * engine (canvas, available in the Electron renderer as well) into PNG
 * bytes before they reach either engine. This gives better fidelity than
 * MSVG would anyway, and identical input on both platforms.
 *
 * Accepted tradeoff: rastering happens once at intrinsic size (capped at
 * `SVG_RASTER_MAX_EDGE`), so a later upscale (e.g. a 16px icon resized to
 * 8000px) upscales the bitmap instead of re-rendering crisp vectors.
 * Resolution-aware rastering would fix that but requires keying the cache
 * on target size; not worth it while SVG remains an edge case.
 */

export interface RasterizedSvg {
	data: Uint8Array;
	width: number;
	height: number;
}

const SVG_EXTENSIONS = new Set(['svg', 'svgz']);

export function isSvgInputName(filename: string | null | undefined): boolean {
	if (!filename) return false;
	const extension = filename.toLowerCase().split('.').pop();
	return extension != null && SVG_EXTENSIONS.has(extension);
}

/** Maximum raster edge to avoid OOM on pathological SVGs. */
export const SVG_RASTER_MAX_EDGE = 4096;

export async function decodeSvgText(bytes: Uint8Array, filename: string): Promise<string> {
	const extension = filename.toLowerCase().split('.').pop();
	if (extension === 'svgz') {
		if (typeof DecompressionStream === 'undefined') {
			throw new Error('SVGZ (gzipped SVG) is not supported in this browser');
		}
		const stream = new Blob([bytes as unknown as BlobPart])
			.stream()
			.pipeThrough(new DecompressionStream('gzip'));
		const decompressed = new Uint8Array(await new Response(stream).arrayBuffer());
		return new TextDecoder().decode(decompressed);
	}
	return new TextDecoder().decode(bytes);
}

/** Opening tag of the root `<svg>` element; width/height/viewBox are only meaningful there. */
function rootSvgTag(svgText: string): string {
	return svgText.match(/<svg\b[^>]*>/i)?.[0] ?? '';
}

/**
 * Raw width/height value for one axis from the root tag. Inline `style`
 * wins over the presentation attribute, per CSS cascade.
 */
function rootAxisValue(rootTag: string, axis: 'width' | 'height'): string | null {
	const style = rootTag.match(/style\s*=\s*("([^"]*)"|'([^']*)')/i);
	if (style) {
		const declarations = (style[2] ?? style[3] ?? '').split(';');
		for (const declaration of declarations) {
			const parts = declaration.split(':');
			if (parts.length >= 2 && parts[0].trim().toLowerCase() === axis) {
				const value = parts.slice(1).join(':').trim();
				if (value) return value;
			}
		}
	}
	const attr = rootTag.match(
		new RegExp(`(?:^|\\s)${axis}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
	);
	if (attr) return (attr[2] ?? attr[3] ?? attr[4] ?? '').trim() || null;
	return null;
}

const ABSOLUTE_LENGTH_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)\s*(px|pt|pc|mm|cm|in|q)?$/i;

/**
 * True for unitless numbers and absolute lengths (`px,pt,pc,mm,cm,in,q`).
 * Percentages, keywords (`auto,inherit,...`) and font/viewport-relative
 * units (`em,vw,...`) resolve against the viewport and carry no intrinsic
 * pixels. A trailing `!important` is ignored.
 */
export function isAbsoluteSvgLength(value: string): boolean {
	return ABSOLUTE_LENGTH_PATTERN.test(value.replace(/\s*!important\s*$/i, '').trim());
}

/** Absolute SVG length resolved to pixels, or null for relative/keyword values. */
export function absoluteLengthToPx(value: string): number | null {
	const match = value
		.replace(/\s*!important\s*$/i, '')
		.trim()
		.match(/^([+-]?(?:\d+\.?\d*|\.\d+))\s*(px|pt|pc|mm|cm|in|q)?$/i);
	if (!match) return null;
	const pixelsPerUnit: Record<string, number> = {
		px: 1,
		pt: 96 / 72,
		pc: 16,
		mm: 96 / 25.4,
		cm: 96 / 2.54,
		in: 96,
		q: 96 / 101.6
	};
	const unit = (match[2] ?? 'px').toLowerCase();
	const pixels = Number(match[1]) * (pixelsPerUnit[unit] ?? NaN);
	return Number.isFinite(pixels) && pixels > 0 ? pixels : null;
}

/**
 * True when the root `<svg>` tag declares absolute width AND height
 * (attribute or inline style). Only the root tag counts: sizes on child
 * elements or in `<style>` blocks say nothing about the document size.
 */
export function hasExplicitAbsoluteSize(svgText: string): boolean {
	const rootTag = rootSvgTag(svgText);
	const width = rootAxisValue(rootTag, 'width');
	const height = rootAxisValue(rootTag, 'height');
	return (
		width != null && height != null && isAbsoluteSvgLength(width) && isAbsoluteSvgLength(height)
	);
}

/**
 * viewBox dimensions from the root tag. Tolerates comma separators but
 * requires exactly four numbers: trailing garbage (`viewBox="0 0 16 16 99"`)
 * is spec-invalid and yields null.
 */
export function parseSvgViewBox(svgText: string): { width: number; height: number } | null {
	const rootTag = rootSvgTag(svgText);
	const attr = rootTag.match(/viewBox\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i);
	const raw = (attr?.[2] ?? attr?.[3] ?? attr?.[4] ?? '').trim();
	if (!raw) return null;
	const parts = raw.split(/[\s,]+/).filter((part) => part.length > 0);
	if (parts.length !== 4) return null;
	const numbers = parts.map(Number);
	if (numbers.some((n) => !Number.isFinite(n))) return null;
	const [, , width, height] = numbers as [number, number, number, number];
	if (width <= 0 || height <= 0) return null;
	return { width, height };
}

/**
 * Infer a raster size for SVGs without intrinsic width/height. Browsers fall
 * back to 300x150 for such files; prefer an explicit width/height or viewBox
 * when present so e.g. a 16x16 icon does not rasterize at 300x150.
 *
 * Each axis resolves independently: an absolute axis keeps the browser's
 * natural size, a relative axis falls back to the viewBox (preserving
 * aspect against the absolute axis when only one is absolute).
 */
export function intrinsicSvgSize(
	svgText: string,
	naturalWidth: number,
	naturalHeight: number
): { width: number; height: number } {
	// Sizes here are uncapped: rasterizeSvgToPng applies SVG_RASTER_MAX_EDGE once.
	const rootTag = rootSvgTag(svgText);
	const widthValue = rootAxisValue(rootTag, 'width');
	const heightValue = rootAxisValue(rootTag, 'height');
	const widthAbsolute = widthValue != null && isAbsoluteSvgLength(widthValue);
	const heightAbsolute = heightValue != null && isAbsoluteSvgLength(heightValue);
	const viewBox = parseSvgViewBox(svgText);
	const hasNatural = naturalWidth > 0 && naturalHeight > 0;
	if (hasNatural) {
		if (widthAbsolute && heightAbsolute) return { width: naturalWidth, height: naturalHeight };
		if (viewBox) {
			if (widthAbsolute && !heightAbsolute) {
				return {
					width: Math.round(naturalWidth),
					height: Math.max(1, Math.round((naturalWidth * viewBox.height) / viewBox.width))
				};
			}
			if (heightAbsolute && !widthAbsolute) {
				return {
					width: Math.max(1, Math.round((naturalHeight * viewBox.width) / viewBox.height)),
					height: Math.round(naturalHeight)
				};
			}
			return { width: Math.round(viewBox.width), height: Math.round(viewBox.height) };
		}
		return { width: naturalWidth, height: naturalHeight };
	}
	// The browser reported no size (e.g. Image onload with 0x0): fall back to
	// declared absolute sizes, then the viewBox, then a square.
	if (widthAbsolute && heightAbsolute) {
		const widthPx = absoluteLengthToPx(widthValue as string);
		const heightPx = absoluteLengthToPx(heightValue as string);
		if (widthPx != null && heightPx != null) {
			return { width: Math.max(1, Math.round(widthPx)), height: Math.max(1, Math.round(heightPx)) };
		}
	}
	if (viewBox) {
		return { width: Math.round(viewBox.width), height: Math.round(viewBox.height) };
	}
	return { width: 1024, height: 1024 };
}

function loadSvgImage(svgText: string): Promise<{ img: HTMLImageElement; url: string }> {
	const blob = new Blob([svgText], { type: 'image/svg+xml' });
	const url = URL.createObjectURL(blob);
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve({ img, url });
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Could not rasterize SVG in this browser'));
		};
		img.src = url;
	});
}

export async function rasterizeSvgToPng(
	sourceBytes: Uint8Array,
	inputName: string
): Promise<RasterizedSvg> {
	const svgText = await decodeSvgText(sourceBytes, inputName);
	const { img, url } = await loadSvgImage(svgText);
	try {
		const naturalWidth = img.naturalWidth || img.width || 0;
		const naturalHeight = img.naturalHeight || img.height || 0;
		let { width, height } = intrinsicSvgSize(svgText, naturalWidth, naturalHeight);
		const scale = Math.min(1, SVG_RASTER_MAX_EDGE / Math.max(width, height));
		width = Math.max(1, Math.round(width * scale));
		height = Math.max(1, Math.round(height * scale));

		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Could not rasterize SVG in this browser');
		context.clearRect(0, 0, width, height);
		context.drawImage(img, 0, 0, width, height);

		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
		if (!blob) throw new Error('Could not rasterize SVG in this browser');
		const data = new Uint8Array(await blob.arrayBuffer());
		return { data, width, height };
	} finally {
		URL.revokeObjectURL(url);
	}
}
