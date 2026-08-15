export function applyTheme(dark: boolean): void {
	const root = document.documentElement;
	root.classList.add('theme-transition-off');
	root.classList.toggle('dark', dark);
	localStorage.setItem('theme', dark ? 'dark' : 'light');
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
	return dark;
}
