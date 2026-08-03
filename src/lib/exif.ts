/**
 * EXIF extraction for the Export section, backed by ExifTool 13.42 running in
 * WebAssembly (`@uswriting/exiftool` + `@6over3/zeroperl-ts`).
 *
 * The engine fetches `./zeroperl.wasm` with a relative URL that resolves
 * against the route path (e.g. `/editor/zeroperl.wasm`), so a custom fetch
 * remaps it to the absolute `/zeroperl.wasm` served from `static/`.
 */

export interface ExifEntry {
	label: string;
	value: string;
}

export interface ExifData {
	/** Entries for the important tags (PRIORITY_TAGS), in priority order. */
	priority: ExifEntry[];
	/** The complete field list: priority entries first, then the rest alphabetically. */
	all: ExifEntry[];
}

/** Matches the `fetch` option type of `@uswriting/exiftool`. */
export type EngineFetch = (...args: unknown[]) => Promise<Response>;

type ExifRow = Record<string, unknown>;

/**
 * Tags that are artifacts of the input path or the wasm environment (zero
 * dates, permission masks), not image metadata.
 */
const HIDDEN_TAGS = new Set([
	'SourceFile',
	'FileName',
	'Directory',
	'ExifToolVersion',
	'FileModifyDate',
	'FileAccessDate',
	'FileInodeChangeDate',
	'FilePermissions'
]);

/**
 * The most important metadata tags, most important first. The panel shows
 * these by default; a "show all fields" toggle exposes everything else.
 */
const PRIORITY_TAGS = [
	'Make',
	'Model',
	'LensModel',
	'DateTimeOriginal',
	'CreateDate',
	'ModifyDate',
	'ExposureTime',
	'FNumber',
	'ISO',
	'ExposureProgram',
	'ExposureCompensation',
	'MeteringMode',
	'Flash',
	'FocalLength',
	'FocalLengthIn35mmFormat',
	'MaxApertureValue',
	'ShutterSpeedValue',
	'ApertureValue',
	'WhiteBalance',
	'ColorSpace',
	'Orientation',
	'ImageWidth',
	'ImageHeight',
	'ResolutionUnit',
	'XResolution',
	'YResolution',
	'Software',
	'Artist',
	'Copyright',
	'SubSecTimeOriginal',
	'ExposureMode',
	'LensMake',
	'LensInfo',
	'LensSerialNumber',
	'GPSLatitude',
	'GPSLongitude',
	'GPSAltitude',
	'GPSDateStamp',
	'GPSTimeStamp',
	'GPSImgDirection',
	'GPSSpeed',
	'GPSDOP',
	'GPSHPositioningError'
];

const PRIORITY_SET = new Set(PRIORITY_TAGS);

function fmtValue(v: unknown): string | null {
	if (Array.isArray(v)) {
		const parts = v.map(fmtValue).filter((p): p is string => p !== null);
		return parts.length > 0 ? parts.join(', ') : null;
	}
	if (typeof v === 'string') {
		const s = v.trim();
		return s.length > 0 && s !== 'N/A' ? s : null;
	}
	if (typeof v === 'number' && Number.isFinite(v)) return String(v);
	return null;
}

/**
 * Extract every metadata field ExifTool reports for the raw image bytes,
 * skipping empty/N-A values and environment artifacts. The result splits into
 * the important tags (PRIORITY_TAGS, in priority order) and the complete
 * list (priority first, the rest alphabetical). Returns null when no
 * meaningful fields remain. The heavy engine chunk is imported lazily so the
 * main bundle stays lean.
 *
 * `engineFetch` overrides how the zeroperl.wasm module is loaded; it defaults
 * to remapping the library's relative `./zeroperl.wasm` request to the static
 * `/zeroperl.wasm`. Node test environments pass an implementation that serves
 * the wasm from node_modules (the library's own Node loader misresolves paths
 * on Windows).
 */
export async function extractExif(
	bytes: Uint8Array,
	name: string,
	engineFetch?: EngineFetch
): Promise<ExifData | null> {
	const { parseMetadata } = await import('@uswriting/exiftool');

	const result = await parseMetadata<ExifRow[]>(
		{ name, data: bytes },
		{
			args: ['-json'],
			transform: (data) => JSON.parse(data) as ExifRow[],
			fetch:
				engineFetch ??
				((input, init) => {
					const url = String(input).replace(/^\.\//, '/');
					return fetch(url, init as RequestInit);
				})
		}
	);

	if (!result.success) {
		throw new Error(result.error || 'Failed to read EXIF');
	}

	const row = Array.isArray(result.data) ? result.data[0] : undefined;
	if (!row) return null;

	const entries: ExifEntry[] = [];
	for (const [label, raw] of Object.entries(row)) {
		if (HIDDEN_TAGS.has(label)) continue;
		const value = fmtValue(raw);
		if (value === null) continue;
		entries.push({ label, value });
	}
	if (entries.length === 0) return null;

	const priority: ExifEntry[] = [];
	const rest: ExifEntry[] = [];
	for (const entry of entries) {
		if (PRIORITY_SET.has(entry.label)) {
			priority.push(entry);
		} else {
			rest.push(entry);
		}
	}
	const priorityIndex = new Map(PRIORITY_TAGS.map((t, i) => [t, i]));
	priority.sort((a, b) => priorityIndex.get(a.label)! - priorityIndex.get(b.label)!);
	rest.sort((a, b) => a.label.localeCompare(b.label));

	return { priority, all: [...priority, ...rest] };
}
