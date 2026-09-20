import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './useMagick.svelte';
import { buildNativeProcessingPlan } from './native-plan';
import type { MagickSettings } from './types';

describe('native processing plans', () => {
	it('routes the basic geometry pipeline to VIPS', () => {
		const settings = {
			...DEFAULT_SETTINGS,
			resizeW: 1200,
			cropX: 10,
			cropY: 20,
			cropW: 800,
			cropH: 600,
			rotate: '90' as const,
			flip: true
		};

		const plan = buildNativeProcessingPlan(settings, 'photo.jpg');

		expect(plan.backend).toBe('vips');
		expect(plan.unsupported).toEqual([]);
		expect(plan.operations.map((operation) => operation.type)).toEqual([
			'autoOrient',
			'crop',
			'resize',
			'rotate',
			'flip'
		]);
	});

	it('routes the entire pipeline to ImageMagick when noise is enabled', () => {
		const settings = { ...DEFAULT_SETTINGS, resizeW: 1200, addNoiseType: 'Gaussian' as const };

		const plan = buildNativeProcessingPlan(settings, 'photo.jpg');

		expect(plan.backend).toBe('magick');
		expect(plan.unsupported).toContain('filter operation');
	});

	it('routes supported color and filter operations to VIPS', () => {
		const plan = buildNativeProcessingPlan(
			{
				...DEFAULT_SETTINGS,
				brightness: [110],
				saturation: [90],
				hue: [120],
				contrast: [15],
				normalizeImage: true,
				blur: [2],
				sharpen: [1],
				effect: 'grayscale'
			},
			'photo.jpg'
		);

		expect(plan.backend).toBe('vips');
		expect(plan.unsupported).toEqual([]);
		expect(plan.operations.map((operation) => operation.type)).toEqual([
			'autoOrient',
			'modulate',
			'contrast',
			'normalize',
			'grayscale',
			'blur',
			'sharpen'
		]);
	});

	it('routes RAW and gravity crops to ImageMagick', () => {
		const rawPlan = buildNativeProcessingPlan(DEFAULT_SETTINGS, 'photo.cr2');
		const gravityCropPlan = buildNativeProcessingPlan(
			{ ...DEFAULT_SETTINGS, cropW: 400, cropH: 400 },
			'photo.jpg'
		);

		expect(rawPlan.backend).toBe('magick');
		expect(rawPlan.unsupported).toContain('RAW input');
		expect(gravityCropPlan.backend).toBe('vips');
		expect(gravityCropPlan.unsupported).toEqual([]);
	});

	it('lets VIPS probe input formats instead of maintaining an extension denylist', () => {
		const plan = buildNativeProcessingPlan(DEFAULT_SETTINGS, 'photo.jxl');
		expect(plan.backend).toBe('vips');
		expect(plan.unsupported).toEqual([]);
	});

	it('supports partial coordinate and dimension crops', () => {
		const plan = buildNativeProcessingPlan({ ...DEFAULT_SETTINGS, cropX: 10 }, 'photo.jpg');
		expect(plan.backend).toBe('vips');
		expect(plan.operations).toContainEqual(
			expect.objectContaining({ type: 'crop', left: 10, top: null })
		);
	});

	it('routes sub-1 gamma to ImageMagick', () => {
		const plan = buildNativeProcessingPlan(
			{ ...DEFAULT_SETTINGS, levelGamma: { ...DEFAULT_SETTINGS.levelGamma, All: [0.1] } },
			'photo.jpg'
		);

		expect(plan.backend).toBe('magick');
		expect(plan.unsupported).toContain('gamma below VIPS range');
	});

	it.each([
		['unsupported output', { imageFormat: 'JXL' }, 'output format JXL'],
		['arbitrary rotation', { rotate: '45' }, 'arbitrary rotation'],
		['canvas extent', { extentW: 200 }, 'canvas extent'],
		['annotation', { annotateText: 'hello' }, 'annotation']
	])('routes %s through ImageMagick', (_name, patch, reason) => {
		const plan = buildNativeProcessingPlan(
			{ ...DEFAULT_SETTINGS, ...patch } as MagickSettings,
			'photo.jpg'
		);
		expect(plan.backend).toBe('magick');
		expect(plan.unsupported).toContain(reason);
	});

	it('normalizes crop coordinates and dimensions in the execution plan', () => {
		const plan = buildNativeProcessingPlan(
			{ ...DEFAULT_SETTINGS, cropX: -4.6, cropY: 7.6, cropW: 20.4, cropH: 30.6 },
			'photo.jpg'
		);
		expect(plan.operations).toContainEqual({
			type: 'crop',
			left: 0,
			top: 8,
			width: 20,
			height: 31,
			gravity: 'Center'
		});
	});
});
