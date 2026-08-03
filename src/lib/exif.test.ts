import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { extractExif, type EngineFetch, type ExifData } from './exif';

// The library's Node wasm loader misresolves paths on Windows, so force its
// browser fetch path and serve the engine wasm straight from node_modules.
Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
Object.defineProperty(globalThis, 'document', { value: {}, configurable: true });

let engineFetch: EngineFetch;

beforeAll(() => {
	const wasmBytes = fs.readFileSync(
		path.resolve('node_modules/@6over3/zeroperl-ts/dist/esm/zeroperl.wasm')
	);
	engineFetch = (...args) => {
		const url = String(args[0]).replace(/^\.\//, '/');
		return url === '/zeroperl.wasm'
			? Promise.resolve(new Response(wasmBytes))
			: fetch(url, args[1] as RequestInit);
	};
});

async function exifDataFor(file: string): Promise<ExifData> {
	const bytes = fs.readFileSync(path.resolve(file));
	const data = await extractExif(new Uint8Array(bytes), path.basename(file), engineFetch);
	expect(data).not.toBeNull();
	return data!;
}

async function entriesByLabel(file: string): Promise<Map<string, string>> {
	const data = await exifDataFor(file);
	return new Map(data.all.map((e) => [e.label, e.value]));
}

describe('extractExif', () => {
	it('extracts all metadata fields from a file with EXIF', async () => {
		const byLabel = await entriesByLabel('test/fixtures/source-exif.jpg');

		expect(byLabel.get('Make')).toBe('RICOH');
		expect(byLabel.get('Model')).toBe('GR III HDF');
		expect(byLabel.get('LensModel')).toBe('18.3mm f/2.8');
		expect(byLabel.get('ExposureTime')).toBe('1/6');
		expect(byLabel.get('FNumber')).toBe('6');
		expect(byLabel.get('ISO')).toBe('400');
		expect(byLabel.get('DateTimeOriginal')).toBe('2025:07:24 11:08:09');
		expect(byLabel.get('GPSPosition')).toMatch(/35 deg/);
	});

	it('excludes path and environment artifacts', async () => {
		const byLabel = await entriesByLabel('test/fixtures/source-exif.jpg');

		for (const tag of [
			'SourceFile',
			'FileName',
			'Directory',
			'ExifToolVersion',
			'FileModifyDate',
			'FileAccessDate',
			'FileInodeChangeDate',
			'FilePermissions'
		]) {
			expect(byLabel.has(tag)).toBe(false);
		}
	});

	it('returns the file metadata for an image without EXIF', async () => {
		const byLabel = await entriesByLabel('test/fixtures/source/source-100x100.png');

		expect(byLabel.get('FileType')).toBe('PNG');
		expect(byLabel.get('ImageWidth')).toBe('100');
		expect(byLabel.get('ImageHeight')).toBe('100');
		expect(byLabel.get('BitDepth')).toBe('16');
		expect(byLabel.has('Make')).toBe(false);
	});

	it('lists the important tags first in priority order', async () => {
		const data = await exifDataFor('test/fixtures/source-exif.jpg');

		expect(data.priority.map((e) => e.label)).toEqual([
			'Make',
			'Model',
			'LensModel',
			'DateTimeOriginal',
			'ModifyDate',
			'ExposureTime',
			'FNumber',
			'ISO',
			'ColorSpace',
			'ImageWidth',
			'ImageHeight',
			'GPSLatitude',
			'GPSLongitude'
		]);
	});

	it('keeps non-priority tags out of the priority list but in the full list', async () => {
		const data = await exifDataFor('test/fixtures/source-exif.jpg');

		expect(data.priority.some((e) => e.label === 'Megapixels')).toBe(false);
		const allLabels = data.all.map((e) => e.label);
		expect(allLabels).toContain('Megapixels');
		expect(allLabels).toContain('GPSPosition');
		expect(allLabels.indexOf('Make')).toBe(0);
	});
});
