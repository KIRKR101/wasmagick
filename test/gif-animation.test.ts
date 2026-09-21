import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { beforeAll, describe, expect, it } from 'vitest';
import { ImageMagick, initializeImageMagick } from '@imagemagick/magick-wasm';
import { processImageSync } from '../src/lib/magick-process';
import { buildNativeMagickArgs } from '../src/lib/magick-args';
import { buildNativeProcessingPlan } from '../src/lib/native-plan';
import { DEFAULT_SETTINGS } from '../src/lib/useMagick.svelte';
import type { MagickSettings } from '../src/lib/types';

const require = createRequire(import.meta.url);
const { processNative, isNativeAvailable } = require('../electron/magick-native.cjs') as {
	processNative: (payload: Record<string, unknown>) => Promise<{
		data: Uint8Array;
		width: number;
		height: number;
		format: string;
		backend: string;
	}>;
	isNativeAvailable: () => boolean;
};

let initialized = false;

beforeAll(async () => {
	if (initialized) return;
	let wasmPath = path.resolve('node_modules/@imagemagick/magick-wasm/dist/x86/magick.wasm');
	try {
		readFileSync(wasmPath);
	} catch {
		wasmPath = path.resolve('node_modules/@imagemagick/magick-wasm/dist/magick.wasm');
	}
	await initializeImageMagick(new Uint8Array(readFileSync(wasmPath)));
	initialized = true;
});

function readFixture(name: string): Uint8Array {
	return new Uint8Array(readFileSync(path.resolve(`test/fixtures/source/${name}`)));
}

interface FrameInfo {
	width: number;
	height: number;
	delay: number;
	corner: [number, number, number];
}

function inspectFrames(data: Uint8Array): FrameInfo[] {
	return ImageMagick.readCollection(data, (collection) =>
		[...collection].map((frame) => {
			const corner = frame.getPixels(
				(pixels) => pixels.toByteArray(0, 0, 1, 1, 'RGBA') ?? new Uint8Array()
			);
			return {
				width: frame.width,
				height: frame.height,
				delay: frame.animationDelay,
				corner: [corner[0] ?? -1, corner[1] ?? -1, corner[2] ?? -1] as [number, number, number]
			};
		})
	);
}

function gifSettings(partial: Partial<MagickSettings>): MagickSettings {
	return { ...DEFAULT_SETTINGS, ...partial };
}

describe('animated GIF processing', () => {
	it('preserves every frame with per-frame content through the WASM path', () => {
		const result = processImageSync(
			readFixture('anim-2frame.gif'),
			gifSettings({ imageFormat: 'GIF', resizeW: 10, resizeH: 10 }),
			'anim-2frame.gif'
		);

		expect([result.width, result.height]).toEqual([10, 10]);
		const frames = inspectFrames(result.data);
		expect(frames).toHaveLength(2);
		// Distinct corners prove frame 2 was transformed, not duplicated from frame 1.
		expect(frames[0].corner).toEqual([255, 0, 0]);
		expect(frames[1].corner).toEqual([0, 0, 255]);
		expect(frames.map((frame) => [frame.width, frame.height])).toEqual([
			[10, 10],
			[10, 10]
		]);
		expect(frames.map((frame) => frame.delay)).toEqual([50, 50]);
	});

	it('coalesces optimized partial frames before WASM geometry', () => {
		const result = processImageSync(
			readFixture('anim-optimized.gif'),
			gifSettings({ imageFormat: 'GIF', resizeW: 10, resizeH: 10 }),
			'anim-optimized.gif'
		);

		const frames = inspectFrames(result.data);
		expect(frames).toHaveLength(2);
		expect(frames.map((frame) => [frame.width, frame.height])).toEqual([
			[10, 10],
			[10, 10]
		]);
		// Without coalescing, the partial second frame resizes on its own and
		// fills the canvas; coalesced, the red background shows through.
		expect(frames[0].corner).toEqual([255, 0, 0]);
		expect(frames[1].corner).toEqual([255, 0, 0]);
	});

	it('exports the last frame for static WASM outputs', () => {
		const result = processImageSync(
			readFixture('anim-2frame.gif'),
			gifSettings({ imageFormat: 'JPEG', resizeW: 10, resizeH: 10 }),
			'anim-2frame.gif'
		);

		expect([...result.data.slice(0, 2)]).toEqual([0xff, 0xd8]);
		expect([result.width, result.height]).toEqual([10, 10]);
		const decoded: FrameInfo = ImageMagick.read(result.data, (image) => {
			const corner = image.getPixels(
				(pixels) => pixels.toByteArray(0, 0, 1, 1, 'RGBA') ?? new Uint8Array()
			);
			return {
				width: image.width,
				height: image.height,
				delay: 0,
				corner: [corner[0], corner[1], corner[2]] as [number, number, number]
			};
		});
		expect(decoded.width).toBe(10);
		expect(decoded.height).toBe(10);
		// Last frame is blue; JPEG encoding needs tolerance.
		expect(decoded.corner[2]).toBeGreaterThanOrEqual(200);
		expect(decoded.corner[0]).toBeLessThanOrEqual(60);
		expect(decoded.corner[1]).toBeLessThanOrEqual(60);
	});

	it('keeps every frame when the output holds a sequence', () => {
		const result = processImageSync(
			readFixture('anim-blankfirst.gif'),
			gifSettings({ imageFormat: 'GIF' }),
			'anim-blankfirst.gif'
		);
		const frames = inspectFrames(result.data);
		expect(frames).toHaveLength(2);
		expect(frames.map((frame) => [frame.width, frame.height])).toEqual([
			[20, 20],
			[20, 20]
		]);
	});

	it('exports a visible still for blank-first GIFs instead of an empty canvas', () => {
		for (const imageFormat of ['JPEG', 'PNG']) {
			const result = processImageSync(
				readFixture('anim-blankfirst.gif'),
				gifSettings({ imageFormat }),
				'anim-blankfirst.gif'
			);

			expect([result.width, result.height]).toEqual([20, 20]);
			const decoded = ImageMagick.read(result.data, (image) => {
				const w = image.width;
				const h = image.height;
				const all =
					image.getPixels((pixels) => pixels.toByteArray(0, 0, w, h, 'RGBA') ?? new Uint8Array()) ??
					new Uint8Array();
				let red = 0;
				let transparent = 0;
				for (let i = 0; i < w * h; i++) {
					if (all[i * 4] > 200 && all[i * 4 + 1] < 80 && all[i * 4 + 2] < 80) red++;
					if (all[i * 4 + 3] < 10) transparent++;
				}
				return { red: red / (w * h), transparent: transparent / (w * h) };
			});
			// The red square covers 25% of the last frame; the blank first
			// frame would report 0% red.
			expect(decoded.red).toBeGreaterThan(0.15);
			if (imageFormat === 'JPEG') {
				// No alpha: transparency flattens over white.
				expect(decoded.transparent).toBe(0);
			} else {
				expect(decoded.transparent).toBeGreaterThan(0.5);
			}
		}
	});

	it('keeps every page when the output is TIFF', () => {
		const result = processImageSync(
			readFixture('anim-2frame.gif'),
			gifSettings({ imageFormat: 'TIFF', resizeW: 10, resizeH: 10 }),
			'anim-2frame.gif'
		);

		expect([result.width, result.height]).toEqual([10, 10]);
		const pages = inspectFrames(result.data);
		expect(pages).toHaveLength(2);
		// Distinct corners prove page 2 was transformed, not duplicated from page 1.
		expect(pages[0].corner).toEqual([255, 0, 0]);
		expect(pages[1].corner).toEqual([0, 0, 255]);
		expect(pages.map((page) => [page.width, page.height])).toEqual([
			[10, 10],
			[10, 10]
		]);
	});

	it('preserves TIFF pages round-tripped through TIFF output', () => {
		const encoded = processImageSync(
			readFixture('anim-2frame.gif'),
			gifSettings({ imageFormat: 'TIFF' }),
			'anim-2frame.gif'
		);
		const result = processImageSync(
			encoded.data,
			gifSettings({ imageFormat: 'TIFF', resizeW: 10, resizeH: 10 }),
			'anim-2frame.tiff'
		);

		const pages = inspectFrames(result.data);
		expect(pages).toHaveLength(2);
		expect(pages.map((page) => [page.width, page.height])).toEqual([
			[10, 10],
			[10, 10]
		]);
		expect(pages[0].corner).toEqual([255, 0, 0]);
		expect(pages[1].corner).toEqual([0, 0, 255]);
	});

	it('emits -coalesce for GIF/WebP native inputs only', () => {
		const settings = gifSettings({ imageFormat: 'GIF' });
		expect(buildNativeMagickArgs(settings, { inputName: 'anim.gif' }).args).toContain('-coalesce');
		expect(buildNativeMagickArgs(settings, { inputName: 'anim.webp' }).args).toContain('-coalesce');
		expect(buildNativeMagickArgs(settings, { inputName: 'photo.png' }).args).not.toContain(
			'-coalesce'
		);
		expect(buildNativeMagickArgs(settings, {}).args).not.toContain('-coalesce');
	});

	const hasNative = isNativeAvailable();
	it.runIf(hasNative)('preserves animation through the native magick backend', async () => {
		const settings = gifSettings({ imageFormat: 'GIF', resizeW: 10, resizeH: 10 });
		const built = buildNativeMagickArgs(settings, { inputName: 'anim-2frame.gif' });
		expect(built.args).toContain('-coalesce');
		const result = await processNative({
			inputName: 'anim-2frame.gif',
			inputData: readFixture('anim-2frame.gif'),
			sourceRevision: Date.now(),
			args: built.args,
			outputExtension: built.outputExtension,
			outputFormat: 'GIF',
			plan: buildNativeProcessingPlan(settings, 'anim-2frame.gif')
		});

		expect(result.backend).toBe('magick');
		expect([result.width, result.height]).toEqual([10, 10]);
		const frames = inspectFrames(result.data);
		expect(frames).toHaveLength(2);
		expect(frames[0].corner).toEqual([255, 0, 0]);
		expect(frames[1].corner).toEqual([0, 0, 255]);
	});

	it.runIf(hasNative)('exports the last frame for static native outputs', async () => {
		const settings = gifSettings({ imageFormat: 'JPEG', resizeW: 10, resizeH: 10 });
		const built = buildNativeMagickArgs(settings, { inputName: 'anim-2frame.gif' });
		expect(built.args).toContain('-delete');
		const result = await processNative({
			inputName: 'anim-2frame.gif',
			inputData: readFixture('anim-2frame.gif'),
			sourceRevision: Date.now() + 1,
			args: built.args,
			outputExtension: built.outputExtension,
			outputFormat: 'JPEG',
			plan: buildNativeProcessingPlan(settings, 'anim-2frame.gif')
		});

		expect([...result.data.slice(0, 2)]).toEqual([0xff, 0xd8]);
		expect([result.width, result.height]).toEqual([10, 10]);
	});

	it.runIf(hasNative)(
		'exports a visible still for blank-first GIFs through native magick',
		async () => {
			const settings = gifSettings({ imageFormat: 'JPEG' });
			const built = buildNativeMagickArgs(settings, { inputName: 'anim-blankfirst.gif' });
			const result = await processNative({
				inputName: 'anim-blankfirst.gif',
				inputData: readFixture('anim-blankfirst.gif'),
				sourceRevision: Date.now() + 5,
				args: built.args,
				outputExtension: built.outputExtension,
				outputFormat: 'JPEG',
				plan: buildNativeProcessingPlan(settings, 'anim-blankfirst.gif')
			});

			expect([result.width, result.height]).toEqual([20, 20]);
			const decoded = ImageMagick.read(result.data, (image) => {
				const w = image.width;
				const h = image.height;
				const all =
					image.getPixels((pixels) => pixels.toByteArray(0, 0, w, h, 'RGBA') ?? new Uint8Array()) ??
					new Uint8Array();
				let red = 0;
				for (let i = 0; i < w * h; i++) {
					if (all[i * 4] > 200 && all[i * 4 + 1] < 80 && all[i * 4 + 2] < 80) red++;
				}
				return red / (w * h);
			});
			expect(decoded).toBeGreaterThan(0.15);
		}
	);

	it('decodes the last frame for static VIPS outputs', async () => {
		const settings = gifSettings({ imageFormat: 'JPEG', resizeW: 10, resizeH: 10 });
		const plan = buildNativeProcessingPlan(settings, 'anim-2frame.gif');
		expect(plan.backend).toBe('vips');
		const result = await processNative({
			inputName: 'anim-2frame.gif',
			inputData: readFixture('anim-2frame.gif'),
			sourceRevision: Date.now() + 2,
			args: [],
			outputExtension: 'jpg',
			outputFormat: 'JPEG',
			plan
		});

		expect(result.backend).toBe('vips');
		// A full-sequence decode into a static encoder stacks frames vertically.
		expect([result.width, result.height]).toEqual([10, 10]);
		const decoded = ImageMagick.read(result.data, (image) => {
			const corner =
				image.getPixels((pixels) => pixels.toByteArray(0, 0, 1, 1, 'RGBA') ?? new Uint8Array()) ??
				new Uint8Array();
			return [corner[0], corner[1], corner[2]];
		});
		// Last frame is blue.
		expect(decoded[2]).toBeGreaterThanOrEqual(200);
		expect(decoded[0]).toBeLessThanOrEqual(60);
	});

	it('decodes a visible still for blank-first GIFs through VIPS', async () => {
		const settings = gifSettings({ imageFormat: 'JPEG' });
		const plan = buildNativeProcessingPlan(settings, 'anim-blankfirst.gif');
		expect(plan.backend).toBe('vips');
		const result = await processNative({
			inputName: 'anim-blankfirst.gif',
			inputData: readFixture('anim-blankfirst.gif'),
			sourceRevision: Date.now() + 6,
			args: [],
			outputExtension: 'jpg',
			outputFormat: 'JPEG',
			plan
		});

		expect(result.backend).toBe('vips');
		expect([result.width, result.height]).toEqual([20, 20]);
		const decoded = ImageMagick.read(result.data, (image) => {
			const w = image.width;
			const h = image.height;
			const all =
				image.getPixels((pixels) => pixels.toByteArray(0, 0, w, h, 'RGBA') ?? new Uint8Array()) ??
				new Uint8Array();
			let red = 0;
			for (let i = 0; i < w * h; i++) {
				if (all[i * 4] > 200 && all[i * 4 + 1] < 80 && all[i * 4 + 2] < 80) red++;
			}
			return red / (w * h);
		});
		expect(decoded).toBeGreaterThan(0.15);
	});

	it.runIf(hasNative)('routes animated inputs with animated outputs to the magick backend', async () => {
		// sharp applies geometry to the stacked page strip and reads the
		// strip height for the oversize check (a hugely upscaled second
		// animated encode), so multi-frame inputs with animated outputs must
		// not stay on VIPS even when the plan allows it.
		const settings = gifSettings({ imageFormat: 'WEBP', resizeW: 10, resizeH: 10 });
		const plan = buildNativeProcessingPlan(settings, 'anim-2frame.gif');
		expect(plan.backend).toBe('vips');
		const built = buildNativeMagickArgs(settings, { inputName: 'anim-2frame.gif' });
		const result = await processNative({
			inputName: 'anim-2frame.gif',
			inputData: readFixture('anim-2frame.gif'),
			sourceRevision: Date.now() + 3,
			args: built.args,
			outputExtension: built.outputExtension,
			outputFormat: 'WEBP',
			plan
		});

		expect(result.backend).toBe('magick');
		expect([result.width, result.height]).toEqual([10, 10]);
		const frames = inspectFrames(result.data);
		expect(frames).toHaveLength(2);
		// Lossy WebP corners get tolerance; they must stay clearly red/blue.
		expect(frames[0].corner[0]).toBeGreaterThanOrEqual(200);
		expect(frames[0].corner[1]).toBeLessThanOrEqual(60);
		expect(frames[0].corner[2]).toBeLessThanOrEqual(60);
		expect(frames[1].corner[2]).toBeGreaterThanOrEqual(200);
		expect(frames[1].corner[0]).toBeLessThanOrEqual(60);
		expect(frames[1].corner[1]).toBeLessThanOrEqual(60);
	});

	it.runIf(hasNative)('preserves pages through the native magick TIFF backend', async () => {
		const settings = gifSettings({ imageFormat: 'TIFF', resizeW: 10, resizeH: 10 });
		const built = buildNativeMagickArgs(settings, { inputName: 'anim-2frame.gif' });
		expect(built.args).not.toContain('-delete');
		const result = await processNative({
			inputName: 'anim-2frame.gif',
			inputData: readFixture('anim-2frame.gif'),
			sourceRevision: Date.now() + 7,
			args: built.args,
			outputExtension: built.outputExtension,
			outputFormat: 'TIFF',
			plan: buildNativeProcessingPlan(settings, 'anim-2frame.gif')
		});

		expect(result.backend).toBe('magick');
		expect([result.width, result.height]).toEqual([10, 10]);
		const pages = inspectFrames(result.data);
		expect(pages).toHaveLength(2);
		expect(pages[0].corner).toEqual([255, 0, 0]);
		expect(pages[1].corner).toEqual([0, 0, 255]);
	});

	it.runIf(hasNative)('routes multi-frame inputs with TIFF outputs to the magick backend', async () => {
		// Same stacked-strip hazard as animated outputs: multipage inputs
		// with TIFF outputs must not stay on VIPS even when the plan allows it.
		const settings = gifSettings({ imageFormat: 'TIFF', resizeW: 10, resizeH: 10 });
		const plan = buildNativeProcessingPlan(settings, 'anim-2frame.gif');
		expect(plan.backend).toBe('vips');
		const built = buildNativeMagickArgs(settings, { inputName: 'anim-2frame.gif' });
		const result = await processNative({
			inputName: 'anim-2frame.gif',
			inputData: readFixture('anim-2frame.gif'),
			sourceRevision: Date.now() + 8,
			args: built.args,
			outputExtension: built.outputExtension,
			outputFormat: 'TIFF',
			plan
		});

		expect(result.backend).toBe('magick');
		expect([result.width, result.height]).toEqual([10, 10]);
		const pages = inspectFrames(result.data);
		expect(pages).toHaveLength(2);
	});

	it('keeps single-frame inputs with animated outputs on VIPS', async () => {
		const settings = gifSettings({ imageFormat: 'WEBP', resizeW: 10, resizeH: 10 });
		const source = new Uint8Array(readFileSync('test/fixtures/source/source-100x100.png'));
		const plan = buildNativeProcessingPlan(settings, 'source.png');
		expect(plan.backend).toBe('vips');
		const result = await processNative({
			inputName: 'source.png',
			inputData: source,
			sourceRevision: Date.now() + 4,
			args: [],
			outputExtension: 'webp',
			outputFormat: 'WEBP',
			plan
		});

		expect(result.backend).toBe('vips');
		expect([result.width, result.height]).toEqual([10, 10]);
	});
});
