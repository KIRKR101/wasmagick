/**
 * Shared types and constants for the editor UI.
 */

/** Right-panel sections selectable from the left tool rail. */
export type EditorSection =
	| 'geometry'
	| 'color'
	| 'filters'
	| 'annotate'
	| 'export'
	| 'presets'
	| 'history';

/** Rail item descriptor for the ToolRail. */
export interface RailItem {
	id: EditorSection;
	label: string;
	/** Lucide icon component. */
	icon?: unknown;
	/** Alt+number shortcut digit (1-7). */
	shortcut: string;
	/** Whether the section has non-default state (drives the dirty dot). */
	dirty?: boolean;
}

/** Sample image descriptor for the empty state. */
export interface SampleImage {
	name: string;
	url: string;
}
