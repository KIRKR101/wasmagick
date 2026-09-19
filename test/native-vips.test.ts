import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { processNative } from '../electron/magick-native.cjs';
import { buildNativeProcessingPlan } from '../src/lib/native-plan';
import { DEFAULT_SETTINGS } from '../src/lib/useMagick.svelte';

describe('native VIPS backend', () => {
	it('runs a supported geometry plan and returns output plus RGBA preview', async () => {
		const source = new Uint8Array(
			fs.readFileSync(path.resolve('test/fixtures/source/source-100x100.png'))
		);
		const settings = {
			...DEFAULT_SETTINGS,
			resizeW: 50,
			resizeH: null,
			rotate: '90' as const,
			imageFormat: 'PNG'
		};
		const plan = buildNativeProcessingPlan(settings, 'source.png');
		const result = await processNative({
			inputName: 'source.png',
			inputData: source,
			sourceRevision: Date.now(),
			args: [],
			outputExtension: 'png',
			outputFormat: 'PNG',
			plan
		});

		expect(plan.backend).toBe('vips');
		expect(result.width).toBe(50);
		expect(result.height).toBe(50);
		expect(result.previewWidth).toBe(50);
		expect(result.previewHeight).toBe(50);
		expect(result.previewData).toHaveLength(50 * 50 * 4);
		expect(result.data.byteLength).toBeGreaterThan(0);
	});

	it('applies coordinate, gravity, and partial crops through VIPS', async () => {
		const source = new Uint8Array(
			fs.readFileSync(path.resolve('test/fixtures/source/source-100x100.png'))
		);
		for (const settings of [
			{ cropX: 10, cropY: 20, cropW: 30, cropH: 40 },
			{ cropW: 30, cropH: 40, cropGravity: 'Southeast' as const },
			{ cropX: 10 }
		]) {
			const plan = buildNativeProcessingPlan({ ...DEFAULT_SETTINGS, ...settings }, 'source.png');
			const result = await processNative({
				inputName: 'source.png',
				inputData: source,
				sourceRevision: Date.now(),
				args: [],
				outputExtension: 'png',
				outputFormat: 'PNG',
				plan
			});

			expect(plan.backend).toBe('vips');
			expect(result.width).toBe(settings.cropW ?? 90);
			expect(result.height).toBe(settings.cropH ?? 100);
		}
	});

	it('translates source crop coordinates through resize', async () => {
		const source = new Uint8Array(
			fs.readFileSync(path.resolve('test/fixtures/source/source-100x100.png'))
		);
		const settings = {
			...DEFAULT_SETTINGS,
			resizeW: 50,
			resizeH: 50,
			cropX: 20,
			cropY: 10,
			cropW: 40,
			cropH: 60,
			imageFormat: 'PNG'
		};
		const result = await processNative({
			inputName: 'source.png',
			inputData: source,
			sourceRevision: Date.now(),
			args: [],
			outputExtension: 'png',
			outputFormat: 'PNG',
			plan: buildNativeProcessingPlan(settings, 'source.png')
		});

		expect(result.width).toBe(33);
		expect(result.height).toBe(50);
	});

	it('runs supported color and filter operations through VIPS', async () => {
		const source = new Uint8Array(
			fs.readFileSync(path.resolve('test/fixtures/source/source-100x100.png'))
		);
		const settings = {
			...DEFAULT_SETTINGS,
			brightness: [110] as [number],
			saturation: [90] as [number],
			contrast: [10] as [number],
			normalizeImage: true,
			blur: [1] as [number],
			sharpen: [1] as [number],
			effect: 'grayscale' as const,
			imageFormat: 'PNG'
		};
		const plan = buildNativeProcessingPlan(settings, 'source.png');
		const result = await processNative({
			inputName: 'source.png',
			inputData: source,
			sourceRevision: Date.now(),
			args: [],
			outputExtension: 'png',
			outputFormat: 'PNG',
			plan
		});

		expect(plan.backend).toBe('vips');
		expect(result.backend).toBe('vips');
		expect(result.data.byteLength).toBeGreaterThan(0);
		expect(result.previewData).toHaveLength(result.previewWidth! * result.previewHeight! * 4);
	});

	it('runs gamma, threshold, negate, trim and border through VIPS', async () => {
		const source = new Uint8Array(
			fs.readFileSync(path.resolve('test/fixtures/source/source-100x100.png'))
		);
		const settings = {
			...DEFAULT_SETTINGS,
			levelGamma: { ...DEFAULT_SETTINGS.levelGamma, All: [1.2] as [number] },
			thresholdPercentage: [60] as [number],
			effect: 'negate' as const,
			trimEdges: true,
			borderSize: [2] as [number],
			imageFormat: 'PNG'
		};
		const plan = buildNativeProcessingPlan(settings, 'source.png');
		const result = await processNative({
			inputName: 'source.png',
			inputData: source,
			sourceRevision: Date.now(),
			args: [],
			outputExtension: 'png',
			outputFormat: 'PNG',
			plan
		});

		expect(plan.backend).toBe('vips');
		expect(result.backend).toBe('vips');
		expect(result.width).toBeGreaterThan(0);
		expect(result.height).toBeGreaterThan(0);
	});

	it('preserves alpha when VIPS negates RGB', async () => {
		const source = new Uint8Array(
			fs.readFileSync(path.resolve('test/fixtures/source/source-alpha-100x100.png'))
		);
		const plan = buildNativeProcessingPlan(
			{ ...DEFAULT_SETTINGS, effect: 'negate' as const, imageFormat: 'PNG' },
			'source.png'
		);
		const result = await processNative({
			inputName: 'source.png',
			inputData: source,
			sourceRevision: Date.now(),
			args: [],
			outputExtension: 'png',
			outputFormat: 'PNG',
			plan
		});
		for (let index = 3; index < result.previewData.length; index += 4) {
			expect(result.previewData[index]).toBe(255);
		}
	});
});
