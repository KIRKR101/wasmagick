import type { NativePlanOperation, NativeProcessingPlan } from './native-plan';

export type NativeRecipeOperation =
	| { kind: 'native'; operation: NativePlanOperation }
	| { kind: 'unsupported'; reason: string };

export type NativeDocument = {
	source: { name: string; revision?: number };
	ops: NativeRecipeOperation[];
	output: NativeProcessingPlan['output'];
};

export type NativeRenderSegment = {
	backend: 'vips' | 'magick';
	ops: NativePlanOperation[];
	reasons: string[];
};

export function buildNativeDocument(
	plan: NativeProcessingPlan,
	inputName: string,
	sourceRevision?: number
): NativeDocument {
	return {
		source: { name: inputName, revision: sourceRevision },
		ops: [
			...plan.operations.map((operation) => ({ kind: 'native' as const, operation })),
			...plan.unsupported.map((reason) => ({ kind: 'unsupported' as const, reason }))
		],
		output: plan.output
	};
}

export function buildNativeSegments(plan: NativeProcessingPlan): NativeRenderSegment[] {
	if (plan.backend === 'vips') {
		return [{ backend: 'vips', ops: plan.operations, reasons: [] }];
	}
	return [{ backend: 'magick', ops: [], reasons: plan.unsupported }];
}
