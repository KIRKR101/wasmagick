/**
 * useReplaceGuard - coordinates image replacement (drop, paste, file input,
 * sample selection) with a dirty-state confirmation.
 *
 * "Dirty" means the current image has a processed result that would be lost
 * on replacement or close (regardless of whether it was downloaded). When
 * dirty, `requestReplace(file)` stages the file and the caller renders a
 * ConfirmDialog; on confirm, `confirmReplace()` proceeds.
 *
 * Also installs a global `paste` listener that converts clipboard images to
 * a File and routes them through `requestReplace`.
 */

import { onMount } from 'svelte';
import type { MagickState } from '$lib/useMagick.svelte';
import type { HistoryState } from './useHistory.svelte';

export type PendingAction = { kind: 'replace'; file: File } | { kind: 'close' };

export class ReplaceGuardState {
	/** A file or close-request staged pending confirmation; when set, render ConfirmDialog. */
	pending = $state<PendingAction | null>(null);
	/** Callback to run after a confirmed replace. */
	private _onReplace: ((file: File) => Promise<void>) | null = null;
	/** Callback to run after a confirmed close. */
	private _onClose: (() => void) | null = null;

	get isDirty(): boolean {
		// A processed result exists that would be lost on replacement.
		// `this._magick` is set in `install`.
		return this._magick ? this._magick.processedImageUrl != null : false;
	}

	private _magick: MagickState | null = null;
	private _history: HistoryState | null = null;

	install(magick: MagickState, history: HistoryState): void {
		this._magick = magick;
		this._history = history;
	}

	/**
	 * Request to replace the current image. If dirty, stages the file and
	 * expects the caller to render a ConfirmDialog. Otherwise runs immediately.
	 */
	requestReplace(file: File, onReplace: (file: File) => Promise<void>): void {
		if (this.isDirty) {
			this.pending = { kind: 'replace', file };
			this._onReplace = onReplace;
		} else {
			void onReplace(file);
		}
	}

	/**
	 * Request to close the current image. If dirty, stages the request and
	 * expects the caller to render a ConfirmDialog. Otherwise runs immediately.
	 */
	requestClose(onClose: () => void): void {
		if (this.isDirty) {
			this.pending = { kind: 'close' };
			this._onClose = onClose;
		} else {
			onClose();
		}
	}

	/** Confirm a staged action. */
	async confirmPending(): Promise<void> {
		const action = this.pending;
		const replaceCb = this._onReplace;
		const closeCb = this._onClose;
		this.pending = null;
		this._onReplace = null;
		this._onClose = null;
		if (action?.kind === 'replace' && replaceCb) await replaceCb(action.file);
		else if (action?.kind === 'close' && closeCb) closeCb();
	}

	/** Cancel a staged action. */
	cancelPending(): void {
		this.pending = null;
		this._onReplace = null;
		this._onClose = null;
	}
}

/**
 * Installs a global paste listener that routes pasted images through the
 * replace guard. Returns a cleanup function.
 */
export function installClipboardPaste(
	guard: ReplaceGuardState,
	onReplace: (file: File) => Promise<void>
): () => void {
	let active = true;

	async function onPaste(e: ClipboardEvent) {
		if (!active) return;
		const items = e.clipboardData?.items;
		if (!items) return;
		for (const item of items) {
			if (item.type.startsWith('image/')) {
				const file = item.getAsFile();
				if (file) {
					e.preventDefault();
					guard.requestReplace(file, onReplace);
					return;
				}
			}
		}
	}

	onMount(() => {
		window.addEventListener('paste', onPaste);
		return () => {
			active = false;
			window.removeEventListener('paste', onPaste);
		};
	});

	return () => {
		active = false;
		window.removeEventListener('paste', onPaste);
	};
}

export function useReplaceGuard(): ReplaceGuardState {
	return new ReplaceGuardState();
}
