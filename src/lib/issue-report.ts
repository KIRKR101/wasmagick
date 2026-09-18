import { APP_VERSION } from '$lib/settings';
import { ISSUES_URL } from '$lib/constants';

export interface EnvironmentInfo {
	appVersion: string;
	runtime: 'Electron' | 'Web';
	electronVersion: string | null;
	/** OS / host platform where known (e.g. win32, darwin, linux, Windows, macOS). */
	platform: string;
	browser: string;
	userAgent: string | null;
	language: string | null;
	wasmVersion: string | null;
	nativeVersion: string | null;
	engine: string | null;
}

export interface EnvironmentOverrides {
	engine?: string | null;
	wasmVersion?: string | null;
	nativeVersion?: string | null;
}

interface UserAgentDataBrand {
	brand: string;
	version: string;
}

function readUserAgentData(): {
	platform?: string;
	brands?: UserAgentDataBrand[];
	mobile?: boolean;
} | null {
	try {
		if (typeof navigator === 'undefined') return null;
		const uaData = (navigator as Navigator & { userAgentData?: unknown }).userAgentData ?? null;
		if (!uaData || typeof uaData !== 'object') return null;
		const data = uaData as {
			platform?: unknown;
			brands?: unknown;
			mobile?: unknown;
		};
		return {
			platform: typeof data.platform === 'string' ? data.platform : undefined,
			brands: Array.isArray(data.brands)
				? (data.brands as UserAgentDataBrand[]).filter(
						(b) => b && typeof b.brand === 'string' && typeof b.version === 'string'
					)
				: undefined,
			mobile: typeof data.mobile === 'boolean' ? data.mobile : undefined
		};
	} catch {
		return null;
	}
}

function parseBrowser(userAgent: string | null, brands: UserAgentDataBrand[] | undefined): string {
	const meaningful = (brands ?? []).filter(
		(b) => b.brand && !/not[.\s]?a[.\s]?brand/i.test(b.brand)
	);
	if (meaningful.length > 0) {
		const preferred =
			meaningful.find((b) => /chrome|edge|firefox|safari|opera|brave|vivaldi/i.test(b.brand)) ??
			meaningful[0];
		return `${preferred.brand} ${preferred.version}`.trim();
	}
	if (!userAgent) return 'Unknown';
	const matchers: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
		[/Edg\/([\d.]+)/, (m) => `Edge ${m[1]}`],
		[/OPR\/([\d.]+)/, (m) => `Opera ${m[1]}`],
		[/Vivaldi\/([\d.]+)/, (m) => `Vivaldi ${m[1]}`],
		[/Firefox\/([\d.]+)/, (m) => `Firefox ${m[1]}`],
		[/Version\/([\d.]+).*Safari\//, (m) => `Safari ${m[1]}`],
		[/Chrome\/([\d.]+)/, (m) => `Chrome ${m[1]}`],
		[/Safari\/([\d.]+)/, () => 'Safari (Unknown version)']
	];
	for (const [pattern, format] of matchers) {
		const m = userAgent.match(pattern);
		if (m) return format(m);
	}
	return 'Unknown';
}

function readPlatform(): string {
	try {
		if (typeof window !== 'undefined' && window.wasmagick?.platform) {
			return window.wasmagick.platform;
		}
	} catch {
		// ignore and fall through to web signals
	}
	const uaData = readUserAgentData();
	if (uaData?.platform) return uaData.platform;
	try {
		if (typeof navigator !== 'undefined') {
			const legacy = (navigator as Navigator & { platform?: unknown }).platform;
			if (typeof legacy === 'string' && legacy) return legacy;
		}
	} catch {
		// ignore
	}
	return 'Unknown';
}

/** Collect every issue-report field that is synchronously available. */
export function collectEnvironmentInfo(overrides: EnvironmentOverrides = {}): EnvironmentInfo {
	let runtime: 'Electron' | 'Web' = 'Web';
	let electronVersion: string | null = null;
	try {
		if (typeof window !== 'undefined' && window.wasmagick) {
			runtime = 'Electron';
			electronVersion = window.wasmagick.electronVersion ?? null;
		}
	} catch {
		runtime = 'Web';
	}

	let userAgent: string | null = null;
	let language: string | null = null;
	try {
		if (typeof navigator !== 'undefined') {
			userAgent = navigator.userAgent ?? null;
			language = navigator.language ?? null;
		}
	} catch {
		// unavailable (SSR / restricted context)
	}

	const uaData = readUserAgentData();
	return {
		appVersion: APP_VERSION,
		runtime,
		electronVersion,
		platform: readPlatform(),
		browser:
			runtime === 'Electron'
				? `Electron ${electronVersion ?? 'Unknown'}`
				: parseBrowser(userAgent, uaData?.brands),
		userAgent,
		language,
		wasmVersion: overrides.wasmVersion ?? null,
		nativeVersion: overrides.nativeVersion ?? null,
		engine: overrides.engine ?? null
	};
}

function valueOrUnknown(value: string | null): string {
	return value && value.trim() ? value : 'Unknown';
}

export function formatEnvironmentLines(env: EnvironmentInfo): string[] {
	const lines = [
		`- App: ${env.appVersion}`,
		`- Runtime: ${env.runtime}${env.runtime === 'Electron' ? ` (Electron ${valueOrUnknown(env.electronVersion)})` : ''}`,
		`- Platform: ${valueOrUnknown(env.platform)}`,
		`- Browser: ${valueOrUnknown(env.browser)}`
	];
	if (env.engine) lines.push(`- Engine: ${env.engine}`);
	if (env.wasmVersion) lines.push(`- WASM engine: ${env.wasmVersion}`);
	if (env.nativeVersion) lines.push(`- Native ImageMagick: ${env.nativeVersion}`);
	if (env.language) lines.push(`- Language: ${env.language}`);
	if (env.userAgent) lines.push(`- User agent: ${env.userAgent}`);
	return lines;
}

/** Markdown body for the error dialog's prefilled issue. */
export function buildErrorIssueBody(options: {
	error: string;
	engine?: string | null;
	wasmVersion?: string | null;
	nativeVersion?: string | null;
}): string {
	const env = collectEnvironmentInfo(options);
	return [
		'**Error**',
		'```',
		options.error,
		'```',
		'',
		'**Environment**',
		...formatEnvironmentLines(env),
		'',
		'**Steps to reproduce**',
		'1. ',
		'2. '
	].join('\n');
}

/** Markdown body for the generic "Issues" link (no error context). */
export function buildGeneralIssueBody(): string {
	const env = collectEnvironmentInfo();
	return [
		'**Describe the bug**',
		'',
		'',
		'**Steps to reproduce**',
		'1. ',
		'2. ',
		'',
		'**Environment**',
		...formatEnvironmentLines(env)
	].join('\n');
}

/** Plain-text details for the clipboard copy in the error dialog. */
export function buildErrorDetailsText(options: {
	error: string;
	engine?: string | null;
	wasmVersion?: string | null;
	nativeVersion?: string | null;
	time?: Date;
}): string {
	const env = collectEnvironmentInfo(options);
	return [
		'WASMagick error report',
		`Time: ${(options.time ?? new Date()).toISOString()}`,
		`App: ${env.appVersion}`,
		`Runtime: ${env.runtime}${env.runtime === 'Electron' ? ` (Electron ${valueOrUnknown(env.electronVersion)})` : ''}`,
		`Platform: ${valueOrUnknown(env.platform)}`,
		`Browser: ${valueOrUnknown(env.browser)}`,
		...(env.engine ? [`Engine: ${env.engine}`] : []),
		...(env.wasmVersion ? [`WASM engine: ${env.wasmVersion}`] : []),
		...(env.nativeVersion ? [`Native ImageMagick: ${env.nativeVersion}`] : []),
		...(env.language ? [`Language: ${env.language}`] : []),
		...(env.userAgent ? [`User agent: ${env.userAgent}`] : []),
		`Error: ${options.error}`
	].join('\n');
}

export function buildIssueUrl(title: string, body: string, base: string = ISSUES_URL): string {
	return `${base}/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
