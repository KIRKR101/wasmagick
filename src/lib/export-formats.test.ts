import { describe, expect, it } from 'vitest';
import {
	EXCLUDED_EXPORT_FORMATS,
	FALLBACK_EXPORT_FORMATS,
	VECTOR_EXPORT_FORMATS,
	isPopularExportFormat,
	magickFormatForName,
	mimeTypeForFormat,
	orderExportFormats,
	outputExtensionForFormat
} from './export-formats';

const info = (format: string, supportsWriting = true) => ({ format, supportsWriting });

describe('export format catalog', () => {
	it('keeps the popular formats in product order', () => {
		const formats = orderExportFormats([
			info('GIF'),
			info('PNG'),
			info('AVIF'),
			info('JPEG'),
			info('JXL'),
			info('WebP'),
			info('TIFF')
		]);

		expect(formats.map((format) => format.value)).toEqual([
			'WebP',
			'JPEG',
			'PNG',
			'AVIF',
			'JXL',
			'TIFF',
			'GIF'
		]);
	});

	it('puts every non-popular writable format alphabetically after popular formats', () => {
		const formats = orderExportFormats([
			info('QOI'),
			info('BMP'),
			info('WebP'),
			info('AVIF'),
			info('EXR'),
			info('PNG'),
			info('GIF'),
			info('JPEG'),
			info('TIFF'),
			info('JXL'),
			info('MIFF')
		]);

		expect(formats.map((format) => format.value)).toEqual([
			'WebP',
			'JPEG',
			'PNG',
			'AVIF',
			'JXL',
			'TIFF',
			'GIF',
			'BMP',
			'EXR',
			'QOI',
			'MIFF'
		]);
	});

	it('filters read-only formats without changing the order of writable formats', () => {
		const formats = orderExportFormats([
			info('PNG', false),
			info('WEBP'),
			info('JPEG', false),
			info('BMP'),
			info('GIF')
		]);

		expect(formats.map((format) => format.value)).toEqual(['WebP', 'GIF', 'BMP']);
	});

	it('excludes reports, text, metadata, internal, raw-sample, and terminal formats', () => {
		const formats = orderExportFormats(
			EXCLUDED_EXPORT_FORMATS.map((format) => info(format)).concat([
				info('PDF'),
				info('PNG'),
				info('SVG')
			])
		);

		expect(formats.map((format) => format.value)).toEqual(['PNG', 'PDF']);
	});

	it('excludes non-image descriptions even when a future coder uses a new name', () => {
		const formats = orderExportFormats([
			{ format: 'FUTURE_RAW', supportsWriting: true, description: 'Raw red samples' },
			{ format: 'FUTURE_TEXT', supportsWriting: true, description: 'Plain text output' },
			{ format: 'FUTURE_VIDEO', supportsWriting: true, description: 'Video stream output' },
			{ format: 'FUTURE_IMAGE', supportsWriting: true, description: 'Future raster image' }
		]);

		expect(formats.map((format) => format.value)).toEqual(['FUTURE_IMAGE']);
	});

	it('excludes the complete vector family while retaining PDF exports', () => {
		const formats = orderExportFormats([
			...VECTOR_EXPORT_FORMATS.map((format) => info(format)),
			info('PDF'),
			info('PDFA'),
			info('PNG')
		]);

		expect(formats.map((format) => format.value)).toEqual(['PNG', 'PDF', 'PDFA']);
	});

	it('rejects future vector formats by description as well as by name', () => {
		const formats = orderExportFormats([
			{ format: 'FUTURE_VECTOR', supportsWriting: true, description: 'Scalable vector graphics' },
			{
				format: 'FUTURE_PAGE',
				supportsWriting: true,
				description: 'PostScript page description output'
			},
			{ format: 'FUTURE_RASTER', supportsWriting: true, description: 'Future raster image' }
		]);

		expect(formats.map((format) => format.value)).toEqual(['FUTURE_RASTER']);
	});

	it('excludes renderer, terminal, and pseudo-image coders', () => {
		const formats = orderExportFormats([
			info('APNG'),
			info('ASHLAR'),
			info('RSVG'),
			info('SIXEL'),
			info('KERNEL'),
			info('PLASMA'),
			{ format: 'FUTURE_RENDERER', supportsWriting: true, description: 'SVG renderer' },
			info('PNG')
		]);

		expect(formats.map((format) => format.value)).toEqual(['PNG']);
	});

	it('excludes coders that cannot reliably encode arbitrary editor images', () => {
		const formats = orderExportFormats(
			[
				'APNG',
				'ART',
				'ASHLAR',
				'CAL',
				'CALS',
				'CIP',
				'G4',
				'GROUP4',
				'JPT',
				'PAL',
				'PALM',
				'RGF',
				'UHDR',
				'PNG'
			].map((format) => info(format))
		);

		expect(formats.map((format) => format.value)).toEqual(['PNG']);
	});

	it('keeps PDF variants while excluding video containers', () => {
		const formats = orderExportFormats([
			info('PDF'),
			info('PDFA'),
			info('EPDF'),
			info('PS'),
			info('MP4'),
			info('MPEG'),
			info('WEBM'),
			info('WMV'),
			info('MNG')
		]);

		expect(formats.map((format) => format.value)).toEqual(['EPDF', 'MNG', 'PDF', 'PDFA']);
	});

	it('removes duplicate rows while retaining distinct ImageMagick aliases', () => {
		const formats = orderExportFormats([
			info('png'),
			info('PNG'),
			info('JPG'),
			info('JPEG'),
			info('jpg')
		]);

		expect(formats.map((format) => format.value)).toEqual(['JPEG', 'PNG', 'JPG']);
	});

	it('normalizes labels and preserves capability metadata', () => {
		const [webp, bmp] = orderExportFormats([
			{
				format: 'WEBP',
				supportsWriting: true,
				mimeType: 'image/webp',
				description: 'WebP image'
			},
			{
				format: 'BMP',
				supportsWriting: true,
				mimeType: 'image/bmp',
				description: 'Microsoft Windows bitmap'
			}
		]);

		expect(webp).toMatchObject({ value: 'WebP', label: 'WebP', mimeType: 'image/webp' });
		expect(bmp).toMatchObject({
			value: 'BMP',
			label: 'BMP',
			extension: 'bmp',
			mimeType: 'image/bmp',
			description: 'Microsoft Windows bitmap'
		});
	});

	it('maps format aliases and extended formats to usable output extensions', () => {
		const cases = [
			['JPEG', 'jpg'],
			['jpg', 'jpg'],
			['PJPEG', 'jpg'],
			['TIF', 'tif'],
			['TIFF64', 'tiff'],
			['GROUP4', 'tiff'],
			['BMP2', 'bmp'],
			['GIF87', 'gif'],
			['EPDF', 'pdf'],
			['FF', 'farbfeld'],
			['PNG24', 'png'],
			['APNG', 'apng'],
			['SVGZ', 'svgz'],
			['MIFF', 'miff'],
			['', 'webp']
		] as const;

		for (const [format, extension] of cases) {
			expect(outputExtensionForFormat(format), format).toBe(extension);
		}
	});

	it('uses valid MIME types for aliases and document exports', () => {
		expect(mimeTypeForFormat('JPG', 'jpg')).toBe('image/jpeg');
		expect(mimeTypeForFormat('TIFF64', 'tiff')).toBe('image/tiff');
		expect(mimeTypeForFormat('PDF', 'pdf')).toBe('application/pdf');
	});

	it('resolves every common and extended WASM enum value without a fallback', () => {
		for (const format of [
			'WEBP',
			'JPEG',
			'PNG',
			'AVIF',
			'JXL',
			'TIFF',
			'GIF',
			'BMP',
			'SVG',
			'QOI'
		]) {
			expect(magickFormatForName(format), format).toBe(format);
		}
	});

	it('provides the familiar popular list while an engine is still loading', () => {
		expect(FALLBACK_EXPORT_FORMATS.map((format) => format.value)).toEqual([
			'WebP',
			'JPEG',
			'PNG',
			'AVIF',
			'JXL',
			'TIFF',
			'GIF'
		]);
	});

	it('recognizes popular formats regardless of engine casing', () => {
		expect(isPopularExportFormat('WebP')).toBe(true);
		expect(isPopularExportFormat('webp')).toBe(true);
		expect(isPopularExportFormat('JPEG')).toBe(true);
		expect(isPopularExportFormat('HEIC')).toBe(false);
	});
});
