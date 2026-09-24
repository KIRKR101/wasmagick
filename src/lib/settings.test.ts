import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_EXPORT_DEFAULTS,
	DEFAULT_FILENAME_TEMPLATE,
	buildOutputFilename,
	clearExportDefaults,
	formatOutputFilename,
	getExportDefaults,
	getFilenameTemplate,
	sanitizeFilename,
	setExportDefaults,
	setFilenameTemplate
} from './settings';

const values = new Map<string, string>();

beforeEach(() => {
	values.clear();
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key)
	});
});

describe('output filenames', () => {
	const at = new Date(2026, 8, 7, 6, 5, 4);

	it('renders every supported token and sanitizes invalid filename characters', () => {
		expect(
			formatOutputFilename('{name}-{date}-{time}-{w}x{h}-{format}.{ext}', {
				name: 'bad:/name',
				ext: 'jpg',
				format: 'jpeg',
				width: 640,
				height: 480,
				at
			})
		).toBe('badname-20260907-060504-640x480-jpeg.jpg');
	});

	it('appends the extension only when it is not already the suffix', () => {
		expect(
			formatOutputFilename('{name}', { name: 'jpg-photo', ext: 'jpg', format: 'jpeg', at })
		).toBe('jpg-photo.jpg');
		expect(
			formatOutputFilename('{name}.JPG', { name: 'photo', ext: 'jpg', format: 'jpeg', at })
		).toBe('photo.JPG');
	});

	it('uses safe defaults for empty templates and filenames', () => {
		expect(formatOutputFilename('', { name: '', ext: 'png', format: 'png', at })).toBe(
			'image-edited.png'
		);
		expect(sanitizeFilename(' <>:"/\\|?* ')).toBe('image');
	});

	it('persists a trimmed template and removes the default', () => {
		setFilenameTemplate('  {name}-small.{ext}  ');
		expect(getFilenameTemplate()).toBe('{name}-small.{ext}');
		expect(buildOutputFilename({ name: 'photo', ext: 'webp', format: 'webp', at })).toBe(
			'photo-small.webp'
		);
		setFilenameTemplate(DEFAULT_FILENAME_TEMPLATE);
		expect(getFilenameTemplate()).toBe(DEFAULT_FILENAME_TEMPLATE);
	});
});

describe('stored settings', () => {
	it('round-trips export defaults and accepts the legacy scalar quality', () => {
		setExportDefaults({ imageFormat: 'PNG', quality: [91], stripMeta: true });
		expect(getExportDefaults()).toEqual({ imageFormat: 'PNG', quality: [91], stripMeta: true });
		values.set('wasmagick-settings', '{"imageFormat":"JPEG","quality":75}');
		expect(getExportDefaults()).toEqual({ imageFormat: 'JPEG', quality: [75], stripMeta: false });
		clearExportDefaults();
		expect(getExportDefaults()).toEqual(DEFAULT_EXPORT_DEFAULTS);
	});

	it('falls back safely for corrupt storage', () => {
		values.set('wasmagick-settings', '{broken');
		expect(getExportDefaults()).toEqual(DEFAULT_EXPORT_DEFAULTS);
	});
});
