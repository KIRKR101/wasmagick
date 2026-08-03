<script lang="ts">
	import { AlertCircle, Loader2 } from 'lucide-svelte';
	import type { MagickState } from '$lib/useMagick.svelte';

	let {
		magick,
		isDirty
	}: {
		magick: MagickState;
		isDirty: boolean;
	} = $props();
</script>

<div
	class="flex h-(--statusbar-h) shrink-0 items-center gap-3 border-t border-foreground/30 bg-[#f7f7f4] px-3 font-mono text-[11px] text-muted-foreground dark:border-border dark:bg-background"
>
	<div class="flex min-w-0 items-center gap-3 truncate">
		{#if magick.hasError}
			<span class="flex items-center gap-1 text-destructive">
				<AlertCircle class="size-3" />
				<span class="max-w-[40ch] truncate">{magick.errorMessage || 'Error'}</span>
			</span>
		{:else if magick.isLoading}
			<span class="flex items-center gap-1 text-foreground/80">
				<Loader2 class="size-3 animate-spin" />
				<span>{magick.currentProcessingStep || 'Processing…'}</span>
			</span>
		{:else if magick.processedImageUrl}
			<span class="text-foreground/80 tabular-nums">Processed in {magick.processedImageTime} ms</span>
		{:else if !magick.originalImageUrl}
			<span class="text-muted-foreground/50">No image</span>
		{/if}
	</div>

	<div class="ml-auto flex items-center gap-3">
		{#if isDirty}
			<span class="flex items-center gap-1 text-foreground/70" title="Unsaved edits">
				<span class="font-mono text-xs text-amber-500">[*]</span>
				<span>Unsaved</span>
			</span>
		{/if}
	</div>
</div>
