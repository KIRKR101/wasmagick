<script lang="ts">
	import {
		Dialog,
		DialogPortal,
		DialogOverlay,
		DialogContent
	} from '$lib/components/ui/dialog/index.js';

	let {
		open = $bindable(false),
		fileName = '',
		kind = 'replace',
		hasUnsavedEdits = false,
		onConfirm,
		onCancel
	}: {
		open?: boolean;
		fileName?: string;
		kind?: 'replace' | 'close' | 'clear-history' | 'reset-all';
		hasUnsavedEdits?: boolean;
		onConfirm: () => void;
		onCancel: () => void;
	} = $props();

	function confirm() {
		open = false;
		onConfirm();
	}
	function cancel() {
		open = false;
		onCancel();
	}
</script>

<Dialog bind:open>
	<DialogPortal>
		<DialogOverlay
			class="fixed inset-0 isolate z-50 bg-black/5 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
		/>
		<DialogContent
			class="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-0 rounded-none border border-foreground/30 bg-[#f7f7f4] p-0 font-mono text-sm text-foreground duration-100 outline-none sm:max-w-sm dark:bg-background data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
			showCloseButton={false}
		>
			<div
				class="border-b border-foreground/30 px-4 py-3 text-xs tracking-wider text-muted-foreground uppercase"
			>
				{#if kind === 'close'}
					Close current image?
				{:else if kind === 'clear-history'}
					Clear entire history?
				{:else if kind === 'reset-all'}
					Reset all settings?
				{:else}
					Replace current image?
				{/if}
			</div>

			<div class="px-4 py-4 text-xs leading-relaxed text-muted-foreground">
				{#if kind === 'close'}
					{#if hasUnsavedEdits}
						You have unsaved edits to the current image
						{#if fileName}<span class="font-medium text-foreground">({fileName})</span>{/if}.
						Closing it will discard the processed result and history.
					{:else}
						Are you sure you want to close the current image
						{#if fileName}<span class="font-medium text-foreground">({fileName})</span>{/if}? The
						processed result and history will be discarded.
					{/if}
				{:else if kind === 'clear-history'}
					This will discard all history entries. This action cannot be undone.
				{:else if kind === 'reset-all'}
					This will reset all settings to their defaults. Processed result and history will be
					preserved.
				{:else if hasUnsavedEdits}
					You have unsaved edits to the current image
					{#if fileName}<span class="font-medium text-foreground">({fileName})</span>{/if}.
					Replacing it will discard the processed result and history.
				{:else}
					Are you sure you want to replace the current image
					{#if fileName}<span class="font-medium text-foreground">({fileName})</span>{/if}? The
					processed result and history will be discarded.
				{/if}
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-foreground/30 px-4 py-3">
				<button
					onclick={cancel}
					class="cursor-pointer border border-foreground/30 px-3 py-1 font-mono text-[11px] text-muted-foreground uppercase focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				>
					[<span class="hover:underline"> Cancel </span>]
				</button>
				<button
					onclick={confirm}
					class="cursor-pointer border border-foreground/30 px-3 py-1 font-mono text-[11px] text-muted-foreground uppercase focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				>
					[<span class="hover:underline"
						>{kind === 'close'
							? 'Close'
							: kind === 'clear-history'
								? 'Clear'
								: kind === 'reset-all'
									? 'Reset'
									: 'Replace'}</span
					>]
				</button>
			</div>

			<button
				onclick={cancel}
				class="absolute top-2 right-2 flex size-5 cursor-pointer items-center justify-center font-mono text-[11px] text-muted-foreground/40 focus:outline-none"
				aria-label="Close"
			>
				[X]
			</button>
		</DialogContent>
	</DialogPortal>
</Dialog>
