import { Magick, MagickFormat } from '@imagemagick/magick-wasm';

export interface ExportFormatInfo {
	format: string;
	supportsWriting: boolean;
	moduleFormat?: string;
	mimeType?: string | null;
	description?: string;
}

export interface ExportFormat {
	/** The ImageMagick format identifier sent to the selected engine. */
	value: string;
	/** A short, user-facing format label. */
	label: string;
	/** The output filename extension, without a dot. */
	extension: string;
	mimeType: string | null;
	description: string;
}

/** Formats that are useful enough to keep at the top of the export picker. */
export const POPULAR_EXPORT_FORMATS = [
	'WEBP',
	'JPEG',
	'PNG',
	'AVIF',
	'JXL',
	'TIFF',
	'GIF',
	'ICO',
	'BMP',
	'PSD',
	'PDF',
	'EXR',
	'DDS',
	'TGA',
	'QOI'
] as const;

/** ImageMagick outputs that are not useful image exports in this editor. */
export const VIDEO_EXPORT_FORMATS = [
	'3G2',
	'3GP',
	'AVI',
	'FLV',
	'M2V',
	'M4V',
	'MKV',
	'MOV',
	'MP4',
	'MPEG',
	'MPG',
	'WEBM',
	'WMV'
] as const;

/** Vector and page-description formats are not image exports for this menu. */
export const VECTOR_EXPORT_FORMATS = [
	'AI',
	'CDR',
	'CGM',
	'DFONT',
	'DPS',
	'DXF',
	'EMF',
	'EPI',
	'EPS',
	'EPS2',
	'EPS3',
	'EPSF',
	'EPSI',
	'EPT',
	'EPT2',
	'EPT3',
	'FIG',
	'HPGL',
	'MVG',
	'ODG',
	'OTF',
	'PCT',
	'PFA',
	'PFB',
	'PICT',
	'PCL',
	'PLT',
	'PS',
	'PS2',
	'PS3',
	'SVG',
	'SVGZ',
	'TTC',
	'TTF',
	'WMF',
	'WMZ',
	'WPG',
	'XPS'
] as const;

export const EXCLUDED_EXPORT_FORMATS = [
	// Raw channel/sample dumps and pixel interchange formats.
	'A',
	'B',
	'C',
	'G',
	'K',
	'M',
	'O',
	'R',
	'Y',
	'BAYER',
	'BAYERA',
	'BGR',
	'BGRA',
	'BGRO',
	'CMYK',
	'CMYKA',
	'GRAY',
	'GRAYA',
	'MONO',
	'RGB',
	'RGBA',
	'RGBO',
	'UYVY',
	'YCBCR',
	'YCBCRA',
	'YUV',
	// Coders that need external resources, special dimensions, or metadata that
	// this editor cannot reliably provide for arbitrary source images.
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
	// Reports, metadata, text, templates, and ImageMagick internals.
	'DATA',
	'FTXT',
	'HISTOGRAM',
	'HTM',
	'HTML',
	'INFO',
	'INLINE',
	'JSON',
	'KERNEL',
	'CANVAS',
	'CAPTION',
	'FRACTAL',
	'GRADIENT',
	'LABEL',
	'MAP',
	'MASK',
	'MATTE',
	'MPC',
	'NULL',
	'PATTERN',
	'POCKETMOD',
	'PANGO',
	'PLASMA',
	'RADIAL-GRADIENT',
	'SPARSE-COLOR',
	'STRIMG',
	'SHTML',
	'TEXT',
	'THUMBNAIL',
	'TXT',
	'UIL',
	'VID',
	'WBINFO',
	'XC',
	'YAML',
	// Braille/text and other non-image terminal outputs.
	'BRF',
	'ISOBRL',
	'ISOBRL6',
	'UBRL',
	'UBRL6',
	'SIX',
	'SIXEL',
	// Internal mask/rendering/cache formats and printer control language.
	'CLIP',
	'CLIPBOARD',
	'RSVG',
	'MSVG',
	'PCL',
	// Vector and page-description formats; PDF is intentionally retained.
	...VECTOR_EXPORT_FORMATS,
	// ImageMagick's video and multimedia container coders.
	...VIDEO_EXPORT_FORMATS
] as const;

const EXCLUDED_FORMAT_SET = new Set(EXCLUDED_EXPORT_FORMATS.map(normalizeFormat));

const NON_IMAGE_DESCRIPTION =
	/\b(?:adobe illustrator|base64|colormap intensities|constant image|coreldraw|drawing interchange|encapsulated postscript|formatted text|histogram|image clip mask|image format and characteristics|librsvg|metafile|morphology kernel|multimedia container|open media|open web media|page description|postscript|raw\s+(?:alpha|blue|cyan|green|magenta|opacity|red|yellow|gray|mosaiced|samples?)|scalable vector|sixel|sparse color|string to image|svg renderer|terminal|text|thumbnail|unicode text|vector graphics|video stream|video-4|flash video|wordperfect graphics|x-motif)\b/i;

const POPULAR_LABELS: Record<string, string> = {
	WEBP: 'WebP',
	JPEG: 'JPEG',
	PNG: 'PNG',
	AVIF: 'AVIF',
	JXL: 'JXL',
	TIFF: 'TIFF',
	GIF: 'GIF',
	ICO: 'ICO',
	BMP: 'BMP',
	PSD: 'PSD',
	PDF: 'PDF',
	EXR: 'EXR',
	DDS: 'DDS',
	TGA: 'TGA',
	QOI: 'QOI'
};

/** The old seven-format fallback used before an engine reports its capabilities. */
export const FALLBACK_EXPORT_FORMATS: readonly ExportFormat[] = POPULAR_EXPORT_FORMATS.map(
	(format) => ({
		value: POPULAR_LABELS[format],
		label: POPULAR_LABELS[format],
		extension: outputExtensionForFormat(format),
		mimeType: `image/${format.toLowerCase()}`,
		description: ''
	})
);

function normalizeFormat(format: string): string {
	return String(format).trim().toUpperCase();
}

function labelForFormat(format: string): string {
	return POPULAR_LABELS[format] ?? format;
}

export function isPopularExportFormat(format: string): boolean {
	return POPULAR_EXPORT_FORMATS.includes(
		normalizeFormat(format) as (typeof POPULAR_EXPORT_FORMATS)[number]
	);
}

function isExportableFormat(info: ExportFormatInfo): boolean {
	const format = normalizeFormat(info.format);
	if (!format || EXCLUDED_FORMAT_SET.has(format)) return false;
	return !NON_IMAGE_DESCRIPTION.test(info.description ?? '');
}

/**
 * ImageMagick uses a few extensions that do not match the canonical format
 * name. Keep these names stable for both native temp files and browser saves.
 */
export function outputExtensionForFormat(format: string): string {
	switch (normalizeFormat(format)) {
		case 'JPEG':
		case 'JPG':
		case 'JPE':
		case 'PJPEG':
			return 'jpg';
		case 'BMP2':
		case 'BMP3':
			return 'bmp';
		case 'TIFF':
		case 'TIFF64':
		case 'PTIF':
		case 'GROUP4':
			return 'tiff';
		case 'TIF':
			return 'tif';
		case 'GIF87':
			return 'gif';
		case 'ICB':
		case 'VDA':
		case 'VST':
			return 'tga';
		case 'CAL':
		case 'CALS':
			return 'cal';
		case 'FARBFELD':
		case 'FF':
			return 'farbfeld';
		case 'FITS':
		case 'FTS':
			return 'fits';
		case 'PDF':
		case 'PDFA':
		case 'EPDF':
			return 'pdf';
		case 'WEBP':
			return 'webp';
		case 'PNG':
		case 'PNG00':
		case 'PNG8':
		case 'PNG24':
		case 'PNG32':
		case 'PNG48':
		case 'PNG64':
			return 'png';
		default:
			return normalizeFormat(format).toLowerCase() || 'webp';
	}
}

export function mimeTypeForFormat(
	format: string,
	extension = outputExtensionForFormat(format)
): string {
	const normalized = normalizeFormat(format);
	switch (normalized) {
		case 'JPEG':
		case 'JPG':
		case 'JPE':
		case 'PJPEG':
			return 'image/jpeg';
		case 'BMP':
		case 'BMP2':
		case 'BMP3':
			return 'image/bmp';
		case 'TIFF':
		case 'TIF':
		case 'TIFF64':
		case 'PTIF':
		case 'GROUP4':
			return 'image/tiff';
		case 'SVG':
		case 'SVGZ':
			return 'image/svg+xml';
		case 'GIF':
		case 'GIF87':
			return 'image/gif';
		case 'AVIF':
			return 'image/avif';
		case 'HEIC':
			return 'image/heic';
		case 'HEIF':
			return 'image/heif';
		case 'JXL':
			return 'image/jxl';
		case 'JP2':
		case 'J2C':
		case 'J2K':
		case 'JPC':
		case 'JPM':
		case 'JPT':
			return 'image/jp2';
		case 'PDF':
		case 'PDFA':
		case 'EPDF':
			return 'application/pdf';
		default:
			return `image/${extension.toLowerCase()}`;
	}
}

function toExportFormat(info: ExportFormatInfo): ExportFormat {
	const value = normalizeFormat(info.format);
	return {
		value: labelForFormat(value),
		label: labelForFormat(value),
		extension: outputExtensionForFormat(value),
		mimeType: info.mimeType ?? mimeTypeForFormat(value, outputExtensionForFormat(value)),
		description: info.description ?? ''
	};
}

/**
 * Build the picker list from one engine's reported capabilities. Popular
 * formats are always first in the declared order; every other writable
 * format is sorted alphabetically. Duplicate aliases are retained because
 * ImageMagick exposes them as independently selectable output identifiers.
 */
export function orderExportFormats(infos: readonly ExportFormatInfo[]): ExportFormat[] {
	const seen = new Set<string>();
	const formats = infos
		.filter((info) => info.supportsWriting)
		.filter(isExportableFormat)
		.map(toExportFormat)
		.filter((format) => {
			const key = normalizeFormat(format.value);
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		});

	const popular = new Map<string, number>(
		POPULAR_EXPORT_FORMATS.map((format, index) => [format, index])
	);
	return formats.sort((a, b) => {
		const aPopular = popular.get(normalizeFormat(a.value));
		const bPopular = popular.get(normalizeFormat(b.value));
		if (aPopular != null || bPopular != null) {
			if (aPopular == null) return 1;
			if (bPopular == null) return -1;
			return aPopular - bPopular;
		}
		return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
	});
}

export function getWasmExportFormats(): ExportFormat[] {
	try {
		return orderExportFormats(
			Magick.supportedFormats.map((info) => ({
				format: String(info.format),
				supportsWriting: info.supportsWriting,
				moduleFormat: String(info.moduleFormat),
				mimeType: info.mimeType,
				description: info.description
			}))
		);
	} catch {
		return [...FALLBACK_EXPORT_FORMATS];
	}
}

/** Resolve an ImageMagick enum value for a format identifier from a catalog. */
export function magickFormatForName(
	format: string
): (typeof MagickFormat)[keyof typeof MagickFormat] | null {
	const wanted = normalizeFormat(format);
	return (Object.values(MagickFormat).find((value) => value === wanted) ?? null) as
		| (typeof MagickFormat)[keyof typeof MagickFormat]
		| null;
}
