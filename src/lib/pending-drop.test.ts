import { describe, expect, it } from 'vitest';
import { stashPendingFile, takePendingFile } from './pending-drop';

describe('pending dropped file', () => {
	it('returns a stashed file exactly once', () => {
		const file = new File(['pixels'], 'photo.png', { type: 'image/png' });
		stashPendingFile(file);
		expect(takePendingFile()).toBe(file);
		expect(takePendingFile()).toBeNull();
	});

	it('keeps only the most recently stashed file', () => {
		const latest = new File([], 'latest.png');
		stashPendingFile(new File([], 'old.png'));
		stashPendingFile(latest);
		expect(takePendingFile()).toBe(latest);
	});
});
