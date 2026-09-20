import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { formatNativeError, resolveWebpTool } = require('../electron/magick-native.cjs') as {
	formatNativeError: (code: number, detail: string, inputName: string) => string;
	resolveWebpTool: (tool: 'cwebp' | 'dwebp') => string | null;
};

describe('native ImageMagick error mapping', () => {
	it('gives RAW users an actionable message for a missing darktable delegate', () => {
		const message = formatNativeError(
			1,
			`sh: darktable-cli: command not found\nmagick: no images for write`,
			'input.cr2'
		);

		expect(message).toContain('RAW input (.cr2) could not be decoded');
		expect(message).toContain('libraw support');
		expect(message).not.toContain('darktable-cli');
	});

	it('preserves unrelated ImageMagick diagnostics', () => {
		const detail = 'magick: unable to open image `input.png`: No such file or directory';
		expect(formatNativeError(1, detail, 'input.png')).toBe(
			`ImageMagick exited with code 1: ${detail}`
		);
	});

	it('returns a valid staged WebP encoder path when one is available', () => {
		const resolved = resolveWebpTool('cwebp');
		if (resolved === null) {
			expect(resolved).toBeNull();
			return;
		}
		expect(existsSync(resolved)).toBe(true);
		expect(path.basename(resolved).toLowerCase()).toMatch(/^cwebp(?:\.exe)?$/);
	});
});
