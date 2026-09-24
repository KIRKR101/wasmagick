import { describe, it, expect } from 'vitest';
import {
	isSvgInputName,
	intrinsicSvgSize,
	hasExplicitAbsoluteSize,
	isAbsoluteSvgLength,
	absoluteLengthToPx,
	parseSvgViewBox,
	decodeSvgText
} from './svg-raster';

describe('isSvgInputName', () => {
	it('matches svg and svgz extensions case-insensitively', () => {
		expect(isSvgInputName('icon.svg')).toBe(true);
		expect(isSvgInputName('icon.SVG')).toBe(true);
		expect(isSvgInputName('compressed.svgz')).toBe(true);
		expect(isSvgInputName('photo.png')).toBe(false);
		expect(isSvgInputName('noext')).toBe(false);
		expect(isSvgInputName(null)).toBe(false);
		expect(isSvgInputName(undefined)).toBe(false);
	});
});

describe('intrinsicSvgSize', () => {
	it('keeps explicit natural sizes', () => {
		const svg = `<svg width="64" height="48" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(intrinsicSvgSize(svg, 64, 48)).toEqual({ width: 64, height: 48 });
	});

	it('falls back to viewBox when the browser reports a default size', () => {
		const svg = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(intrinsicSvgSize(svg, 300, 150)).toEqual({ width: 16, height: 16 });
	});

	it('falls back to a square when nothing is known', () => {
		expect(intrinsicSvgSize('<svg></svg>', 0, 0)).toEqual({ width: 1024, height: 1024 });
	});

	it('detects inline style sizes', () => {
		const svg = `<svg style="width:64px;height:48px" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(hasExplicitAbsoluteSize(svg)).toBe(true);
		expect(intrinsicSvgSize(svg, 64, 48)).toEqual({ width: 64, height: 48 });
	});

	it('prefers viewBox over percentage-only sizes', () => {
		const svg = `<svg width="100%" height="100%" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(hasExplicitAbsoluteSize(svg)).toBe(false);
		expect(intrinsicSvgSize(svg, 300, 150)).toEqual({ width: 16, height: 16 });
	});

	it('prefers viewBox over percentage-only style sizes', () => {
		const svg = `<svg style="width:100%;height:100%" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(hasExplicitAbsoluteSize(svg)).toBe(false);
		expect(intrinsicSvgSize(svg, 300, 150)).toEqual({ width: 16, height: 16 });
	});

	it('ignores sizes on child elements', () => {
		const svg = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>`;
		expect(hasExplicitAbsoluteSize(svg)).toBe(false);
		expect(intrinsicSvgSize(svg, 300, 150)).toEqual({ width: 16, height: 16 });
	});

	it('ignores sizes in embedded style blocks', () => {
		const svg = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><style>.x{width:100px;height:100px}</style></svg>`;
		expect(hasExplicitAbsoluteSize(svg)).toBe(false);
		expect(intrinsicSvgSize(svg, 300, 150)).toEqual({ width: 16, height: 16 });
	});

	it('treats auto and relative units as non-absolute', () => {
		for (const value of ['auto', 'inherit', '100vw', '2em', '50%']) {
			expect(isAbsoluteSvgLength(value)).toBe(false);
		}
		for (const value of ['64', '64px', '12pt', '2.5mm', '+3', '.5in']) {
			expect(isAbsoluteSvgLength(value)).toBe(true);
		}
	});

	it('prefers viewBox when sizes are keyword-only', () => {
		const svg = `<svg width="auto" height="auto" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(intrinsicSvgSize(svg, 300, 150)).toEqual({ width: 16, height: 16 });
	});

	it('resolves a single absolute axis against the viewBox aspect', () => {
		const wide = `<svg width="64" viewBox="0 0 16 8" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(intrinsicSvgSize(wide, 64, 32)).toEqual({ width: 64, height: 32 });
		const tall = `<svg height="48" viewBox="0 0 8 16" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(intrinsicSvgSize(tall, 24, 48)).toEqual({ width: 24, height: 48 });
	});

	it('parses comma-separated viewBox values', () => {
		expect(parseSvgViewBox('<svg viewBox="0,0,16,16"></svg>')).toEqual({
			width: 16,
			height: 16
		});
		const svg = `<svg viewBox="0,0,16,16" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(intrinsicSvgSize(svg, 300, 150)).toEqual({ width: 16, height: 16 });
	});

	it('prefers inline style over conflicting attributes', () => {
		const svg = `<svg width="64" style="width:100%" viewBox="0 0 16 8" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(hasExplicitAbsoluteSize(svg)).toBe(false);
		expect(intrinsicSvgSize(svg, 300, 150)).toEqual({ width: 16, height: 8 });
	});

	it('ignores !important when testing sizes', () => {
		const svg = `<svg style="width:64px !important;height:48px !important" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(hasExplicitAbsoluteSize(svg)).toBe(true);
		expect(intrinsicSvgSize(svg, 64, 48)).toEqual({ width: 64, height: 48 });
	});

	it('falls back to declared sizes when the browser reports nothing', () => {
		const svg = `<svg width="64" height="48" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(intrinsicSvgSize(svg, 0, 0)).toEqual({ width: 64, height: 48 });
	});

	it('converts absolute units to pixels without a natural size', () => {
		expect(absoluteLengthToPx('72pt')).toBeCloseTo(96, 6);
		expect(absoluteLengthToPx('2.54cm')).toBeCloseTo(96, 6);
		expect(absoluteLengthToPx('100%')).toBeNull();
		expect(absoluteLengthToPx('auto')).toBeNull();
		const svg = `<svg width="72pt" height="72pt" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(intrinsicSvgSize(svg, 0, 0)).toEqual({ width: 96, height: 96 });
	});

	it('falls back to the viewBox when the browser reports nothing', () => {
		const svg = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(intrinsicSvgSize(svg, 0, 0)).toEqual({ width: 16, height: 16 });
	});

	it('rejects viewBox values with trailing garbage', () => {
		expect(parseSvgViewBox('<svg viewBox="0 0 16 16 99"></svg>')).toBeNull();
		const svg = `<svg viewBox="0 0 16 16 99" xmlns="http://www.w3.org/2000/svg"></svg>`;
		expect(intrinsicSvgSize(svg, 300, 150)).toEqual({ width: 300, height: 150 });
	});
});

describe('decodeSvgText', () => {
	it('decodes plain svg bytes', async () => {
		const text = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
		const bytes = new TextEncoder().encode(text);
		await expect(decodeSvgText(bytes, 'icon.svg')).resolves.toBe(text);
	});
});
