/**
 * Shared RAW-camera-format capability helpers.
 *
 * Used by `tooling/setup-imagemagick.ts` (`verifyRawSupport`) and covered by
 * `test/raw-support.test.ts`. Kept dependency-free and pure so the parsers
 * are unit-testable without an ImageMagick binary on PATH.
 *
 * Background: the stock Homebrew `imagemagick` formula and the official
 * Linux AppImage / Windows portable builds are compiled `--with-raw=no`.
 * Their `delegates.xml` routes `dng:decode` (which also handles CR2, NEF,
 * ARW, ...) to an external `darktable-cli` binary that WASMagick does not
 * bundle, so RAW input fails with `darktable-cli: command not found` +
 * `no images for write`. The Homebrew `imagemagick-full` formula is built
 * `--with-raw=yes` (libraw) and its `dng.so` coder links `libraw_r`,
 * decoding RAW internally with no external process.
 */

/** Camera RAW formats decoded through the DNG coder (libraw). */
export const RAW_FORMATS = [
	'3FR',
	'ARW',
	'CR2',
	'CR3',
	'CRW',
	'DCR',
	'DNG',
	'ERF',
	'FFF',
	'IIQ',
	'K25',
	'KDC',
	'MEF',
	'MOS',
	'MRW',
	'NEF',
	'NRW',
	'ORF',
	'PEF',
	'RAF',
	'RAW',
	'RMF',
	'RW2',
	'RWL',
	'SR2',
	'SRF',
	'SRW',
	'X3F'
] as const;

/** Formats used as the minimum capability gate for a desktop bundle. */
export const REQUIRED_RAW_FORMATS = [
	'CR2',
	'CR3',
	'NEF',
	'ARW',
	'DNG',
	'RW2',
	'ORF',
	'RAF'
] as const;

/** True when a user-supplied filename has a camera RAW extension. */
export function isRawFilename(filename: string): boolean {
	const extension = String(filename ?? '')
		.toLowerCase()
		.match(/\.([^.]+)$/)?.[1];
	return extension != null && RAW_FORMATS.some((format) => format.toLowerCase() === extension);
}

/**
 * True when `magick -list configure` output shows a libraw-backed build:
 * the `DELEGATES` line lists `raw` (covers both `DELEGATES ... raw ...`
 * spellings ImageMagick 7 emits).
 */
export function hasRawDelegate(configureOutput: string): boolean {
	for (const line of String(configureOutput ?? '').split('\n')) {
		const trimmed = line.trim();
		if (!/^DELEGATES\s/i.test(trimmed)) continue;
		// Match the standalone `raw` token, not substrings like `draw`.
		if (/(^|\s)raw(\s|$)/i.test(trimmed)) return true;
	}
	return false;
}

/**
 * True when `magick -list configure` shows `--with-raw=yes` (or
 * `--with-libraw=yes`, used by some builds).
 */
export function hasRawConfigureFlag(configureOutput: string): boolean {
	return /--with-(lib)?raw=yes/i.test(String(configureOutput ?? ''));
}

/**
 * Extract the `magick -list format` lines for known RAW formats.
 * Returns the matched lines (e.g. `CR2  DNG  r--  Canon ... (0.22.2-Release)`).
 */
export function rawFormatLines(formatOutput: string): string[] {
	const wanted = new Set(RAW_FORMATS);
	const lines: string[] = [];
	for (const line of String(formatOutput ?? '').split('\n')) {
		const name = line
			.trim()
			.split(/\s+/)[0]
			?.replace(/[*!+]+$/, '')
			.toUpperCase();
		if (name && wanted.has(name as (typeof RAW_FORMATS)[number])) {
			lines.push(line.trim());
		}
	}
	return lines;
}

/** Return the required camera formats absent from an ImageMagick format list. */
export function missingRawFormats(formatOutput: string): string[] {
	const names = new Set(
		rawFormatLines(formatOutput).map((line) =>
			line
				.trim()
				.split(/\s+/)[0]
				.replace(/[*!+]+$/, '')
				.toUpperCase()
		)
	);
	return REQUIRED_RAW_FORMATS.filter((format) => !names.has(format));
}

/**
 * True when the format list shows libraw-backed RAW decoders. libraw builds
 * annotate the description with the library version, e.g.
 * `CR2  DNG  r--  Canon Digital Camera Raw Format (0.22.2-Release)`;
 * `--with-raw=no` builds list the same formats with no version suffix and
 * decode via the external `darktable-cli` delegate instead.
 */
export function hasLibrawFormatAnnotation(formatOutput: string): boolean {
	const lines = rawFormatLines(formatOutput);
	if (lines.length === 0) return false;
	return lines.some((line) => /\(\d+\.\d+.*\)/.test(line));
}

export interface RawCapability {
	/** DELEGATES line includes `raw`. */
	delegate: boolean;
	/** `--with-raw=yes` / `--with-libraw=yes` present. */
	configureFlag: boolean;
	/** Number of known RAW formats listed by `magick -list format`. */
	formatCount: number;
	/** Required camera formats absent from the format list. */
	missingFormats: string[];
	/** Format descriptions carry a libraw version annotation. */
	librawAnnotation: boolean;
}

/** Summarize RAW capability from the two `magick -list` probes. */
export function describeRawCapability(
	configureOutput: string,
	formatOutput: string
): RawCapability {
	const formatCount = rawFormatLines(formatOutput).length;
	return {
		delegate: hasRawDelegate(configureOutput),
		configureFlag: hasRawConfigureFlag(configureOutput),
		formatCount,
		missingFormats: missingRawFormats(formatOutput),
		librawAnnotation: hasLibrawFormatAnnotation(formatOutput)
	};
}

/**
 * True when the build decodes the required camera formats internally via
 * LibRaw: it must advertise the raw delegate, the explicit configure flag,
 * and the complete minimum format matrix.
 */
export function isRawCapable(capability: RawCapability): boolean {
	return (
		capability.delegate &&
		capability.configureFlag &&
		capability.formatCount > 0 &&
		capability.missingFormats.length === 0
	);
}
