import { describe, expect, it } from 'vitest';
import { formatDimensions } from './utils';

describe('formatDimensions', () => {
	it('formats valid dimensions', () => {
		expect(formatDimensions(1920, 1080)).toBe('1920×1080');
	});

	it('returns nothing when either dimension is unavailable', () => {
		expect(formatDimensions(0, 1080)).toBe('');
		expect(formatDimensions(1920, 0)).toBe('');
		expect(formatDimensions(0, 0)).toBe('');
	});

	it('returns nothing for invalid dimensions', () => {
		expect(formatDimensions(-1, 100)).toBe('');
		expect(formatDimensions(100, Number.NaN)).toBe('');
		expect(formatDimensions(Number.POSITIVE_INFINITY, 100)).toBe('');
	});
});
