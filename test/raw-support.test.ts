import { describe, expect, it } from 'vitest';
import {
	describeRawCapability,
	hasLibrawFormatAnnotation,
	hasRawConfigureFlag,
	hasRawDelegate,
	isRawCapable,
	isRawFilename,
	missingRawFormats,
	RAW_FORMATS,
	REQUIRED_RAW_FORMATS,
	rawFormatLines
} from '../tooling/raw-support';
import { rawReadFormatForFilename } from '../src/lib/magick-process';
import { parseExifOrientation } from '../src/lib/exif';

const RAW_CONFIGURE = `
CONFIGURE ./configure '--with-raw=yes' '--with-modules'
DELEGATES bzlib jpeg png raw tiff webp xml zlib
`;

const RAW_FORMAT_OUTPUT = `
      CR2* DNG r-- Canon Digital Camera Raw Format (0.22.2-Release)
      CR3* DNG r-- Canon Digital Camera Raw Format (0.22.2-Release)
      DNG* DNG rw+ Digital Negative (0.22.2-Release)
      ARW* DNG r-- Sony Alpha Raw Format (0.22.2-Release)
      JPEG* JPEG rw- Joint Photographic Experts Group JFIF format
      NEF* DNG r-- Nikon Digital Camera Raw Format (0.22.2-Release)
      RW2* DNG r-- Panasonic Lumix Raw Format (0.22.2-Release)
      ORF* DNG r-- Olympus Digital Camera Raw Format (0.22.2-Release)
      RAF* DNG r-- Fuji CCD-RAW Graphic Raw Format (0.22.2-Release)
`;

describe('RAW ImageMagick capability parsing', () => {
	it('maps TIFF-based camera files to an explicit WASM read format', () => {
		expect(rawReadFormatForFilename('IMG_0001.CR2')).toBe('CR2');
		expect(rawReadFormatForFilename('capture.dng')).toBe('DNG');
		expect(rawReadFormatForFilename('photo.tif')).toBeNull();
	});

	it('recognizes RAW-capable configure and format output', () => {
		expect(hasRawConfigureFlag(RAW_CONFIGURE)).toBe(true);
		expect(hasRawDelegate(RAW_CONFIGURE)).toBe(true);
		expect(rawFormatLines(RAW_FORMAT_OUTPUT)).toHaveLength(8);
		expect(hasLibrawFormatAnnotation(RAW_FORMAT_OUTPUT)).toBe(true);
		expect(isRawCapable(describeRawCapability(RAW_CONFIGURE, RAW_FORMAT_OUTPUT))).toBe(true);
	});

	it('rejects a build whose formats are delegated externally', () => {
		const configure = `DELEGATES bzlib jpeg png\nCONFIGURE '--with-raw=no'`;
		const formats = `CR2* DNG r-- Canon Digital Camera Raw Format`;
		const capability = describeRawCapability(configure, formats);

		expect(capability.formatCount).toBe(1);
		expect(capability.delegate).toBe(false);
		expect(isRawCapable(capability)).toBe(false);
	});

	it('recognizes camera RAW filenames case-insensitively', () => {
		expect(isRawFilename('IMG_0001.CR2')).toBe(true);
		expect(isRawFilename('capture.dng')).toBe(true);
		expect(isRawFilename('photo.jpeg')).toBe(false);
		expect(isRawFilename('raw')).toBe(false);
	});

	it('recognizes every declared RAW extension and reports required omissions', () => {
		for (const format of RAW_FORMATS) expect(isRawFilename(`photo.${format}`), format).toBe(true);
		const completeFormatList = RAW_FORMATS.map((format) => `${format} DNG r-- RAW`).join('\n');
		expect(missingRawFormats(completeFormatList)).toEqual([]);
		expect(missingRawFormats('CR2 DNG r-- RAW')).toEqual(
			REQUIRED_RAW_FORMATS.filter((format) => format !== 'CR2')
		);
	});

	it('normalizes common ExifTool orientation labels', () => {
		expect(parseExifOrientation('Rotate 90 CW')).toBe(6);
		expect(parseExifOrientation('Mirror horizontal and rotate 270 CW')).toBe(5);
		expect(parseExifOrientation('Mirror horizontal and rotate 90 CW')).toBe(7);
		expect(parseExifOrientation('Horizontal (normal)')).toBe(1);
	});
});
