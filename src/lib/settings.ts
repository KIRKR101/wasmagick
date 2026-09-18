/**
 * App-wide settings backing the settings overlay.
 *
 * Each setting lives in its own `localStorage` key so it can be read without
 * instantiating any editor state (the filename template is resolved on every
 * process, the history limit on every push):
 *
 * - `wasmagick.filename-template` — output filename pattern
 * - `wasmagick.history-limit` — max undo entries kept per editor session
 * - `wasmagick-settings` — default export format / quality / metadata
 *   stripping (shared with the editor's persisted export settings)
 *
 * Theme mode lives in `theme` and is handled by `$lib/theme`.
 */

export const APP_VERSION = '0.0.3';
export const REPO_URL = 'https://github.com/KIRKR101/wasmagick';
export const ISSUES_PAGE_URL = `${REPO_URL}/issues`;
export const MAGICK_WASM_URL = 'https://github.com/dlemstra/magick-wasm';

const FILENAME_KEY = 'wasmagick.filename-template';
const HISTORY_LIMIT_KEY = 'wasmagick.history-limit';
const EXPORT_DEFAULTS_KEY = 'wasmagick-settings';

export const DEFAULT_FILENAME_TEMPLATE = '{name}-edited.{ext}';
export const DEFAULT_HISTORY_LIMIT = 40;
export const MIN_HISTORY_LIMIT = 5;
export const MAX_HISTORY_LIMIT = 200;

function readStorage(key: string): string | null {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
}

function writeStorage(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// ignore quota / private mode
	}
}

function removeStorage(key: string): void {
	try {
		localStorage.removeItem(key);
	} catch {
		// ignore
	}
}

// --- Output filename template ----------------------------------------------

export function getFilenameTemplate(): string {
	return readStorage(FILENAME_KEY) ?? DEFAULT_FILENAME_TEMPLATE;
}

export function setFilenameTemplate(template: string): void {
	const trimmed = template.trim();
	if (!trimmed || trimmed === DEFAULT_FILENAME_TEMPLATE) {
		removeStorage(FILENAME_KEY);
	} else {
		writeStorage(FILENAME_KEY, trimmed);
	}
}

export interface FilenameVars {
	/** Original basename without extension. */
	name: string;
	/** Output file extension without a dot (e.g. `webp`). */
	ext: string;
	/** Output format identifier in lowercase (e.g. `webp`). */
	format: string;
	/** Render timestamp. Defaults to now. */
	at?: Date;
	/** Processed image width, for the optional `{w}` / `{h}` tokens. */
	width?: number;
	/** Processed image height, for the optional `{w}` / `{h}` tokens. */
	height?: number;
}

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

/** Strip characters that are illegal in file names on common platforms. */
export function sanitizeFilename(name: string): string {
	const cleaned = Array.from(name)
		.filter((ch) => {
			const code = ch.codePointAt(0) ?? 32;
			return code >= 32 && !'/\\:*?"<>|'.includes(ch);
		})
		.join('')
		.trim();
	return cleaned || 'image';
}

/**
 * Render an output filename from a template. Supported tokens: `{name}`,
 * `{ext}`, `{format}`, `{date}` (YYYYMMDD), `{time}` (HHMMSS), `{w}`,
 * `{h}`. Unknown tokens are left untouched. When the template omits `{ext}`
 * the extension is appended so downloads always keep a valid suffix.
 */
export function formatOutputFilename(template: string, vars: FilenameVars): string {
	const at = vars.at ?? new Date();
	const date = `${at.getFullYear()}${pad2(at.getMonth() + 1)}${pad2(at.getDate())}`;
	const time = `${pad2(at.getHours())}${pad2(at.getMinutes())}${pad2(at.getSeconds())}`;
	const tokens: Record<string, string> = {
		name: vars.name || 'image',
		ext: vars.ext,
		format: vars.format,
		date,
		time,
		w: vars.width != null ? String(vars.width) : '',
		h: vars.height != null ? String(vars.height) : ''
	};
	const raw = (template.trim() || DEFAULT_FILENAME_TEMPLATE).replace(
		/\{(name|ext|format|date|time|w|h)\}/g,
		(match, key: string) => tokens[key] ?? match
	);
	const withExt = raw.includes(vars.ext) ? raw : `${raw}.${vars.ext}`;
	return sanitizeFilename(withExt);
}

/** Render a filename with the currently stored template. */
export function buildOutputFilename(vars: FilenameVars): string {
	return formatOutputFilename(getFilenameTemplate(), vars);
}

// --- History limit -----------------------------------------------------------

export function getHistoryLimit(): number {
	const raw = readStorage(HISTORY_LIMIT_KEY);
	if (raw == null) return DEFAULT_HISTORY_LIMIT;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed)) return DEFAULT_HISTORY_LIMIT;
	return Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, parsed));
}

export function setHistoryLimit(limit: number): void {
	if (!Number.isFinite(limit) || limit === DEFAULT_HISTORY_LIMIT) {
		removeStorage(HISTORY_LIMIT_KEY);
	} else {
		writeStorage(
			HISTORY_LIMIT_KEY,
			String(Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, Math.round(limit))))
		);
	}
}

// --- Default export settings ---------------------------------------------------

export interface ExportDefaults {
	imageFormat: string;
	quality: number[];
	stripMeta: boolean;
}

export const DEFAULT_EXPORT_DEFAULTS: ExportDefaults = {
	imageFormat: 'WebP',
	quality: [85],
	stripMeta: false
};

export function getExportDefaults(): ExportDefaults {
	try {
		const raw = localStorage.getItem(EXPORT_DEFAULTS_KEY);
		if (!raw) return { ...DEFAULT_EXPORT_DEFAULTS, quality: [...DEFAULT_EXPORT_DEFAULTS.quality] };
		const parsed = JSON.parse(raw) as Partial<ExportDefaults>;
		return {
			imageFormat:
				typeof parsed.imageFormat === 'string' && parsed.imageFormat
					? parsed.imageFormat
					: DEFAULT_EXPORT_DEFAULTS.imageFormat,
			quality:
				Array.isArray(parsed.quality) && typeof parsed.quality[0] === 'number'
					? [parsed.quality[0]]
					: typeof parsed.quality === 'number'
						? [parsed.quality]
						: [...DEFAULT_EXPORT_DEFAULTS.quality],
			stripMeta: parsed.stripMeta === true
		};
	} catch {
		return { ...DEFAULT_EXPORT_DEFAULTS, quality: [...DEFAULT_EXPORT_DEFAULTS.quality] };
	}
}

export function setExportDefaults(defaults: ExportDefaults): void {
	writeStorage(
		EXPORT_DEFAULTS_KEY,
		JSON.stringify({
			imageFormat: defaults.imageFormat,
			quality: defaults.quality,
			stripMeta: defaults.stripMeta
		})
	);
}

export function clearExportDefaults(): void {
	removeStorage(EXPORT_DEFAULTS_KEY);
}

// --- Storage inspection ---------------------------------------------------------

export interface StorageEntry {
	key: string;
	bytes: number;
}

const KNOWN_STORAGE_KEYS = [
	'theme',
	FILENAME_KEY,
	HISTORY_LIMIT_KEY,
	EXPORT_DEFAULTS_KEY,
	'wasmagick.presets.v1'
];

export function getStorageUsage(): StorageEntry[] {
	const entries: StorageEntry[] = [];
	for (const key of KNOWN_STORAGE_KEYS) {
		const raw = readStorage(key);
		if (raw != null) {
			entries.push({ key, bytes: new Blob([raw]).size });
		}
	}
	return entries;
}

/** Remove every known app key (theme, filename, history limit, export defaults, presets). */
export function clearAllAppStorage(): void {
	for (const key of KNOWN_STORAGE_KEYS) removeStorage(key);
}
