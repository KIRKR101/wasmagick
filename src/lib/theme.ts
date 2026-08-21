export function applyTheme(dark: boolean): void {
	const root = document.documentElement;
	root.classList.add('theme-transition-off');
	root.classList.toggle('dark', dark);
	localStorage.setItem('theme', dark ? 'dark' : 'light');
	window.wasmagick?.setTheme(dark);
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			root.classList.remove('theme-transition-off');
		});
	});
}

export function resolveInitialTheme(): boolean {
	const dark =
		localStorage.getItem('theme') === 'dark' ||
		(!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
	document.documentElement.classList.toggle('dark', dark);
	window.wasmagick?.setTheme(dark);
	return dark;
}

/** True when running in the packaged desktop app with a custom title bar. */
export function hasCustomTitleBar(): boolean {
	return window.wasmagick?.platform === 'win32' || window.wasmagick?.platform === 'linux';
}
