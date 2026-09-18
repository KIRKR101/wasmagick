/**
 * Theme handling: explicit `light` / `dark` modes plus `auto`, which follows
 * the operating system's `prefers-color-scheme` media query.
 *
 * The mode persists to `localStorage` under `theme`. A missing key means
 * `auto` (preserves behavior for installs that predate the settings page).
 */

export type ThemeMode = 'light' | 'dark' | 'auto';

const THEME_KEY = 'theme';

export function getThemeMode(): ThemeMode {
	try {
		const stored = localStorage.getItem(THEME_KEY);
		if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
	} catch {
		// private mode / SSR: fall through to auto
	}
	return 'auto';
}

export function systemPrefersDark(): boolean {
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveIsDark(mode: ThemeMode = getThemeMode()): boolean {
	if (mode === 'dark') return true;
	if (mode === 'light') return false;
	return systemPrefersDark();
}

/**
 * Apply a theme mode. Returns the resolved dark flag so quick toggles can
 * stay in sync without tracking the mode themselves.
 */
export function applyThemeMode(mode: ThemeMode): boolean {
	const dark = resolveIsDark(mode);
	const root = document.documentElement;
	root.classList.add('theme-transition-off');
	root.classList.toggle('dark', dark);
	try {
		localStorage.setItem(THEME_KEY, mode);
	} catch {
		// ignore quota / private mode
	}
	window.wasmagick?.setTheme(dark);
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			root.classList.remove('theme-transition-off');
		});
	});
	return dark;
}

/** Explicit boolean toggle used by the landing page and editor tool rail. */
export function applyTheme(dark: boolean): void {
	applyThemeMode(dark ? 'dark' : 'light');
}

export function resolveInitialTheme(): boolean {
	return applyThemeMode(getThemeMode());
}

/**
 * Re-apply the theme whenever the OS color scheme changes while the mode is
 * `auto`. Returns an unsubscribe function.
 */
export function watchSystemTheme(): () => void {
	const mql = window.matchMedia('(prefers-color-scheme: dark)');
	const handler = () => {
		if (getThemeMode() === 'auto') applyThemeMode('auto');
	};
	mql.addEventListener('change', handler);
	return () => mql.removeEventListener('change', handler);
}

/** True when running in the packaged desktop app with a custom title bar. */
export function hasCustomTitleBar(): boolean {
	return window.wasmagick?.platform === 'win32' || window.wasmagick?.platform === 'linux';
}
