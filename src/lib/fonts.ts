import { Magick } from '@imagemagick/magick-wasm';

const FONT_URLS: Record<string, string> = {
	'Roboto-Regular': '/fonts/Roboto-Regular.ttf',
	'Lato-Regular': '/fonts/Lato-Regular.ttf',
	'PT_Serif-Regular': '/fonts/PT_Serif-Web-Regular.ttf',
	'SpaceMono-Regular': '/fonts/SpaceMono-Regular.ttf',
	'Pacifico-Regular': '/fonts/Pacifico-Regular.ttf'
};

const loadedFonts = new Set<string>();
const localFontLabels = new Map<string, string>();
export const DEFAULT_FONT = 'Roboto-Regular';

export async function ensureFont(name: string): Promise<boolean> {
	if (loadedFonts.has(name)) return true;
	const url = FONT_URLS[name];
	if (!url) return false;
	try {
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Font fetch failed for ${name}: ${response.status}`);
		const bytes = new Uint8Array(await response.arrayBuffer());
		Magick.addFont(name, bytes);
		loadedFonts.add(name);
		return true;
	} catch (err) {
		console.warn(`Failed to load font "${name}", falling back to default:`, err);
		return false;
	}
}

export function registerLocalFont(postscriptName: string, data: Uint8Array, label: string): void {
	if (loadedFonts.has(postscriptName)) return;
	try {
		Magick.addFont(postscriptName, data);
		loadedFonts.add(postscriptName);
		localFontLabels.set(postscriptName, label);
	} catch (err) {
		console.warn(`Failed to register font "${postscriptName}":`, err);
	}
}

export function isFontLoaded(name: string): boolean {
	return loadedFonts.has(name);
}

export function getLocalFonts(): { value: string; label: string }[] {
	return Array.from(localFontLabels.entries()).map(([value, label]) => ({ value, label }));
}

export function isLocalFont(name: string): boolean {
	return localFontLabels.has(name);
}

export function getRegisteredFontName(family: string): string {
	if (family in FONT_URLS) return family;
	if (loadedFonts.has(family)) return family;
	return DEFAULT_FONT;
}
