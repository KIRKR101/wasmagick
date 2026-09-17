import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	EXCLUDED_EXPORT_FORMATS,
	VECTOR_EXPORT_FORMATS,
	VIDEO_EXPORT_FORMATS,
	orderExportFormats
} from '../src/lib/export-formats';

// Keep this test against the same parser used by the Electron IPC handler.
const {
	listNativeFormats,
	parseNativeFormatList,
	outputSpecifierFor,
	processNative,
	resolveMagickBin,
	resolveWebpTool
} = require('../electron/magick-native.cjs') as {
	listNativeFormats: () => Promise<
		{
			format: string;
			supportsWriting: boolean;
			moduleFormat: string;
			description: string;
		}[]
	>;
	parseNativeFormatList: (output: string) => {
		format: string;
		supportsWriting: boolean;
		moduleFormat: string;
		description: string;
	}[];
	outputSpecifierFor: (format: string, outputPath: string) => string;
	processNative: (payload: {
		inputName: string;
		inputData: Uint8Array;
		args: string[];
		outputExtension: string;
		outputFormat: string;
	}) => Promise<{ data: Uint8Array; width: number; height: number }>;
	resolveMagickBin: () => string | null;
	resolveWebpTool: (tool: 'cwebp' | 'dwebp') => string | null;
};

describe('native ImageMagick export capability parsing', () => {
	it('includes writable formats and ignores read-only formats', () => {
		const formats = parseNativeFormatList(`
      JPEG* JPEG rw- Joint Photographic Experts Group JFIF format
      DNG* DNG r-- Digital Negative
      PNG* PNG rw+ Portable Network Graphics
      SVG SVG rw- Scalable Vector Graphics
    `);

		expect(formats.map((format) => format.format)).toEqual(['JPEG', 'PNG', 'SVG']);
		expect(formats[1]).toMatchObject({
			moduleFormat: 'PNG',
			supportsWriting: true,
			description: 'Portable Network Graphics'
		});
	});

	it('accepts ImageMagick permission markers and strips capability suffixes', () => {
		const formats = parseNativeFormatList(`
      APNG* APNG rw+ Animated Portable Network Graphics
      TIFF64* TIFF rw- Tagged Image File Format (64-bit)
      CR2* DNG r-- Canon Digital Camera Raw Format
      weird! WEIRD rw- A format with a marker
    `);

		expect(formats.map((format) => format.format)).toEqual(['APNG', 'TIFF64', 'WEIRD']);
		expect(formats[0].moduleFormat).toBe('APNG');
	});

	it('parses the Windows three-column format table', () => {
		const formats = parseNativeFormatList(`
      Format  Mode  Description
      JPEG*   rw-   Joint Photographic Experts Group
      PNG*    rw+   Portable Network Graphics
      DNG     r--   Digital Negative
    `);

		expect(formats.map((format) => format.format)).toEqual(['JPEG', 'PNG']);
		expect(formats[1]).toMatchObject({
			moduleFormat: 'PNG',
			supportsWriting: true,
			description: 'Portable Network Graphics'
		});
	});

	it('skips headers, malformed rows, and non-format output safely', () => {
		const formats = parseNativeFormatList(`
ImageMagick version: 7.1.2-29
      Format Module Mode Description
      JPEG JPEG rw-
      ??? ??? rw- invalid
      PNG PNG r-- readable only
    `);

		expect(formats).toEqual([]);
	});

	it('produces the same popular-first and alphabetical-rest ordering as WASM', () => {
		const nativeFormats = parseNativeFormatList(`
		  QOI QOI rw- Quite OK Image Format
      GIF GIF rw- Graphics Interchange Format
      BMP BMP rw- Microsoft Windows bitmap
      AVIF HEIC rw- AV1 Image File Format
      WEBP WEBP rw- WebP Image Format
      PNG PNG rw- Portable Network Graphics
      JPEG JPEG rw- JPEG format
      JXL JXL rw- JPEG XL
      TIFF TIFF rw- Tagged Image File Format
    `);

		expect(orderExportFormats(nativeFormats).map((format) => format.value)).toEqual([
			'WebP',
			'JPEG',
			'PNG',
			'AVIF',
			'JXL',
			'TIFF',
			'GIF',
			'BMP',
			'QOI'
		]);
	});

	it('keeps native-only formats available instead of intersecting them away', () => {
		const formats = parseNativeFormatList(`
      HEIC HEIC rw- High Efficiency Image Format
      MIFF MIFF rw- Magick Image File Format
      WEBP WEBP rw- WebP Image Format
    `);

		expect(orderExportFormats(formats).map((format) => format.value)).toEqual([
			'WebP',
			'HEIC',
			'MIFF'
		]);
	});

	it.skipIf(!resolveMagickBin() || !resolveWebpTool('cwebp'))(
		'keeps delegate-backed WebP available when the format table omits it',
		async () => {
			const formats = await listNativeFormats();
			expect(formats.some((format) => format.format === 'WEBP')).toBe(true);
		},
		15_000
	);

	it('filters the complete non-image and video denylist for native capabilities', () => {
		const formats = parseNativeFormatList(
			[...EXCLUDED_EXPORT_FORMATS, ...VIDEO_EXPORT_FORMATS]
				.map((format) => `${format} ${format} rw- unsuitable output`)
				.join('\n')
		);

		expect(orderExportFormats(formats)).toEqual([]);
	});

	it('filters vector and page-description formats from native capabilities while keeping PDF', () => {
		const nativeFormats = parseNativeFormatList(
			[
				...VECTOR_EXPORT_FORMATS.map((format) => `${format} ${format} rw- Vector output`),
				'PDF PDF rw- Portable Document Format'
			].join('\n')
		);

		expect(orderExportFormats(nativeFormats).map((format) => format.value)).toEqual(['PDF']);
	});

	it('retains PDF output while filtering nearby document/report formats', () => {
		const formats = parseNativeFormatList(`
      PDF PDF rw- Portable Document Format
      PDFA PDF rw- Portable Document Archive Format
      JSON JSON rw- The image format and characteristics
      TXT TXT rw- Text
      MP4 MP4 rw- VIDEO-4 Video Stream
    `);

		expect(orderExportFormats(formats).map((format) => format.value)).toEqual(['PDF', 'PDFA']);
	});

	it('forces the selected native format even when its extension is an alias', () => {
		expect(outputSpecifierFor('PNG24', '/tmp/output.png')).toBe('PNG24:/tmp/output.png');
		expect(outputSpecifierFor('jpeg', '/tmp/output.jpg')).toBe('JPEG:/tmp/output.jpg');
		expect(outputSpecifierFor('SVGZ', '/tmp/output.svgz')).toBe('SVGZ:/tmp/output.svgz');
		expect(outputSpecifierFor('', '/tmp/output.png')).toBe('PNG:/tmp/output.png');
	});

	it.skipIf(!resolveMagickBin())(
		'exports a real TIFF through the native bundle',
		async () => {
			expect(outputSpecifierFor('TIFF', '/tmp/output.tiff')).toBe('TIFF:/tmp/output.tiff');
			expect(outputSpecifierFor('TIFF64', '/tmp/output.tiff')).toBe('TIFF64:/tmp/output.tiff');

			const formats = await listNativeFormats();
			expect(formats.some((format) => format.format === 'TIFF')).toBe(true);
			const inputData = new Uint8Array(readFileSync('static/icons/icon-512.png'));
			const result = await processNative({
				inputName: 'source.png',
				inputData,
				args: [],
				outputExtension: 'tiff',
				outputFormat: 'TIFF'
			});
			expect(result.data.length).toBeGreaterThan(0);
			expect([result.width, result.height]).toEqual([512, 512]);
			expect(
				[...result.data.slice(0, 4)].join(',') === '73,73,42,0' ||
					[...result.data.slice(0, 4)].join(',') === '77,77,0,42'
			).toBe(true);
		},
		15_000
	);
});
