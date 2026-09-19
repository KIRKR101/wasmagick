import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './useMagick.svelte';
import { buildNativeProcessingPlan } from './native-plan';
import { buildNativeDocument, buildNativeSegments } from './native-recipe';

describe('native recipe planning', () => {
	it('serializes source identity and operations independently of the backend', () => {
		const plan = buildNativeProcessingPlan({ ...DEFAULT_SETTINGS, resizeW: 400 }, 'photo.jpg');
		const document = buildNativeDocument(plan, 'photo.jpg', 7);

		expect(document.source).toEqual({ name: 'photo.jpg', revision: 7 });
		expect(document.ops[0]).toEqual({
			kind: 'native',
			operation: { type: 'resize', width: 400, height: null }
		});
	});

	it('exposes a render segment without changing backend selection', () => {
		const plan = buildNativeProcessingPlan(
			{ ...DEFAULT_SETTINGS, addNoiseType: 'Gaussian' },
			'photo.jpg'
		);
		const segments = buildNativeSegments(plan);

		expect(segments).toEqual([{ backend: 'magick', ops: [], reasons: ['filter operation'] }]);
		expect(plan.segments).toEqual(segments);
	});
});
