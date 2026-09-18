import { describe, expect, it } from 'vitest';
import {
	buildErrorDetailsText,
	buildErrorIssueBody,
	buildGeneralIssueBody,
	buildIssueUrl,
	collectEnvironmentInfo
} from './issue-report';

describe('issue-report', () => {
	it('collects an environment without throwing outside the browser', () => {
		const env = collectEnvironmentInfo({ engine: 'wasm' });
		expect(env.appVersion).toMatch(/\d+\.\d+\.\d+/);
		expect(env.engine).toBe('wasm');
		expect(env.platform.length).toBeGreaterThan(0);
	});

	it('prefills error bodies with environment context', () => {
		const body = buildErrorIssueBody({
			error: 'boom',
			engine: 'wasm',
			wasmVersion: '7.1.2',
			nativeVersion: null
		});
		expect(body).toContain('boom');
		expect(body).toContain('**Environment**');
		expect(body).toContain('- App: ');
		expect(body).toContain('- Platform: ');
		expect(body).toContain('- Browser: ');
		expect(body).toContain('- Engine: wasm');
		expect(body).toContain('- WASM engine: 7.1.2');
		expect(body).toContain('**Steps to reproduce**');
	});

	it('prefills the generic template with environment context', () => {
		const body = buildGeneralIssueBody();
		expect(body).toContain('**Environment**');
		expect(body).toContain('- App: ');
	});

	it('includes versions in the clipboard text where available', () => {
		const text = buildErrorDetailsText({
			error: 'boom',
			engine: 'native',
			nativeVersion: '7.1.1',
			time: new Date('2026-01-01T00:00:00.000Z')
		});
		expect(text).toContain('Time: 2026-01-01T00:00:00.000Z');
		expect(text).toContain('Engine: native');
		expect(text).toContain('Native ImageMagick: 7.1.1');
	});

	it('builds an encoded issue URL', () => {
		const url = buildIssueUrl('Error report', 'hello world');
		expect(url).toContain('/issues/new?title=Error%20report&body=hello%20world');
	});
});
