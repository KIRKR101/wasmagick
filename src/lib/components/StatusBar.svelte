<script lang="ts">
	import WarningCircle from 'phosphor-svelte/lib/WarningCircle';
	import CircleNotch from 'phosphor-svelte/lib/CircleNotch';
	import type { MagickState } from '$lib/useMagick.svelte';
	import ErrorDialog from './ErrorDialog.svelte';
	import { shortcutModifier } from '$lib/shortcuts';

	let {
		magick,
		isDirty,
		onRetry
	}: {
		magick: MagickState;
		isDirty: boolean;
		onRetry?: () => void;
	} = $props();

	let errorOpen = $state(false);
</script>

<div
	class="flex h-(--statusbar-h) shrink-0 items-center gap-3 border-t border-divider bg-chrome px-3 font-mono text-[11px] text-muted-foreground"
>
	<div class="flex min-w-0 items-center gap-3 truncate">
		{#if magick.hasError}
			<button
				onclick={() => (errorOpen = true)}
				class="flex min-w-0 cursor-pointer items-center gap-1 text-destructive focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				aria-label="Show full error details"
			>
				<WarningCircle class="size-3 shrink-0" />
				<span class="max-w-[40ch] truncate">{magick.errorMessage || 'Error'}</span>
			</button>
		{:else if magick.isLoading}
			<span
				class="flex min-w-0 items-center gap-1 text-foreground/80"
				role="status"
				aria-live="polite"
			>
				<CircleNotch class="size-3 shrink-0 animate-spin" />
				<span class="truncate">{magick.currentProcessingStep || 'Processing'}</span>
			</span>
		{:else if magick.isStale}
			<span class="text-amber-500">Unprocessed changes</span>
		{:else if magick.processedImageUrl}
			<span class="text-foreground/80 tabular-nums"
				>Processed in {magick.processedImageTime}ms {#if magick.processedBy}
					by {magick.processedBy}{/if}</span
			>
		{:else if !magick.originalImageUrl}
			<span class="text-muted-foreground/50">No image</span>
		{/if}
	</div>

	<div class="ml-auto flex items-center gap-3">
		{#if isDirty}
			<span
				class="flex items-center gap-1 text-foreground/70"
				title={`Unsaved edits, press ${shortcutModifier}+S to export`}
			>
				<span class="font-mono text-xs text-amber-500" aria-hidden="true">[*]</span>
				<span>Unsaved</span>
			</span>
		{/if}
	</div>
</div>

<ErrorDialog {magick} bind:open={errorOpen} {onRetry} />
