export const isMac =
	typeof window !== 'undefined' &&
	(window.__wasmagickIsMac ??
		(window.wasmagick?.platform === 'darwin' || /Mac|iPhone|iPad|iPod/.test(navigator.platform)));

export const shortcutModifier = isMac ? '⌘' : 'Ctrl';

export function usesShortcutModifier(event: KeyboardEvent): boolean {
	return isMac ? event.metaKey : event.ctrlKey;
}
