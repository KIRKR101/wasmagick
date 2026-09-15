import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ImageMagick, initializeImageMagick, Magick } from '@imagemagick/magick-wasm';
import { processImageSync } from '../src/lib/magick-process';
import { DEFAULT_SETTINGS } from '../src/lib/useMagick.svelte';

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

function hasTiffSignature(data: Uint8Array): boolean {
	return (
		[...data.slice(0, 4)].join(',') === '73,73,42,0' ||
		[...data.slice(0, 4)].join(',') === '77,77,0,42'
	);
}

describe('WASM export formats', () => {
	it('encodes and decodes a real TIFF file', () => {
		const tiff = Magick.supportedFormats.find(
			(format) => String(format.format).toUpperCase() === 'TIFF'
		);
		expect(tiff?.supportsWriting).toBe(true);

		const source = new Uint8Array(readFileSync('static/icons/icon-512.png'));
		const result = processImageSync(source, {
			...DEFAULT_SETTINGS,
			imageFormat: 'TIFF',
			quality: [100]
		});

		expect(result.data.length).toBeGreaterThan(0);
		expect(hasTiffSignature(result.data)).toBe(true);
		expect([result.width, result.height]).toEqual([512, 512]);

		let decodedDimensions: [number, number] = [0, 0];
		ImageMagick.read(result.data, (image) => {
			decodedDimensions = [image.width, image.height];
		});
		expect(decodedDimensions).toEqual([512, 512]);
	});

	it('keeps AVIF export valid at the maximum quality setting', () => {
		const source = new Uint8Array(readFileSync('static/icons/icon-512.png'));
		const result = processImageSync(source, {
			...DEFAULT_SETTINGS,
			imageFormat: 'AVIF',
			quality: [100]
		});

		expect(result.data.length).toBeGreaterThan(16);
		expect([...result.data.slice(4, 12)]).toEqual([...Buffer.from('ftypavif')]);
		expect([result.width, result.height]).toEqual([512, 512]);
	});
});
