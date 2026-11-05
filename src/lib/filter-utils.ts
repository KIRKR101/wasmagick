/**
 * Shared filter parameter normalization.
 *
 * The WASM and CLI pipelines must derive the same effective values from the
 * settings, so both import these helpers instead of repeating the arithmetic.
 */

/**
 * Window size for ImageMagick's median statistic filter.
 *
 * `medianFilter()` and `-statistic median` both take an odd window size; the
 * slider allows any integer so even values are rounded up. Returns 0 when the
 * filter is off.
 */
export function medianWindowSize(value: number): number {
	const size = Math.round(value);
	return Math.min(9, Math.max(3, size % 2 === 0 ? size + 1 : size));
}
