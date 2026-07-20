<script lang="ts">
	import { AlertCircle, Loader2 } from 'lucide-svelte';
	import type { MagickState } from '$lib/useMagick.svelte';
	import { formatBytes } from '$lib/utils';

	let {
		magick,
		isDirty
	}: {
		magick: MagickState;
		zoomPct: number;
		isDirty: boolean;
	} = $props();

	function sizeDelta() {
		if (!magick.processedImageUrl || magick.originalImageSize <= 0) return null;
		const m = magick.statsMessage.match(/New Size:\s*([\d.]+)\s*KB(?:\s*\(([-+]?[\d.]+)%\))?/);
		if (!m) return null;
		const kb = parseFloat(m[1]);
		const pct = m[2] != null ? parseFloat(m[2]) : null;
		return { kb, pct };
	}

	let delta = $derived(sizeDelta());
</script>

<div
	class="flex h-(--statusbar-h) shrink-0 items-center gap-3 border-t border-foreground/30 bg-[#f7f7f4] px-3 font-mono text-[11px] text-muted-foreground dark:bg-background"
>
	<div class="flex items-center gap-2 truncate">
		{#if magick.originalImageUrl}
			{#if magick.processedImageUrl && (magick.processedWidth || magick.processedHeight)}
				<span class="text-foreground/80"
					>{magick.originalWidth}×{magick.originalHeight}</span
				>
				<span class="text-muted-foreground/60">→</span>
				<span class="text-foreground"
					>{magick.processedWidth}×{magick.processedHeight}</span
				>
			{:else}
				<span class="text-foreground/80"
					>{magick.originalWidth}×{magick.originalHeight}</span
				>
			{/if}
			<span class="text-muted-foreground/60">·</span>
			{#if magick.processedImageFormat}
				<span class="text-[10px] text-foreground/80 uppercase">
					{magick.processedImageFormat}
				</span>
			{:else if magick.originalImageFormat}
				<span class="text-[10px] text-foreground/80 uppercase">
					{magick.originalImageFormat}
				</span>
			{/if}
			<span class="text-muted-foreground/60">·</span>
			<span>{formatBytes(magick.originalImageSize)}</span>
			{#if delta}
				<span class="text-muted-foreground/60">→</span>
				<span
					class="{delta.pct != null && delta.pct < 0
						? 'text-emerald-600 dark:text-emerald-400'
						: 'text-foreground/80'}"
				>
					{delta.kb} KB
				</span>
				{#if delta.pct != null}
					<span
						class="{delta.pct < 0
							? 'text-emerald-600 dark:text-emerald-400'
							: delta.pct > 0
								? 'text-amber-600 dark:text-amber-400'
								: 'text-muted-foreground'}"
					>
						({delta.pct > 0 ? '+' : ''}{delta.pct}%)
					</span>
				{/if}
			{/if}
		{:else}
			<span class="text-muted-foreground/50">No image</span>
		{/if}
	</div>

	<div class="ml-auto flex items-center gap-3">
		{#if magick.hasError}
			<span class="flex items-center gap-1 font-medium text-destructive">
				<AlertCircle class="size-3" />
				<span class="max-w-[40ch] truncate">{magick.errorMessage || 'Error'}</span>
			</span>
		{:else if magick.isLoading}
			<span class="flex items-center gap-1 font-medium text-foreground">
				<Loader2 class="size-3 animate-spin" />
				<span>{magick.currentProcessingStep || 'Processing…'}</span>
			</span>
		{/if}

		{#if isDirty}
			<span class="flex items-center gap-1 text-foreground/70" title="Unsaved edits">
				<span class="font-mono text-xs text-amber-500">[*]</span>
				<span>Unsaved</span>
			</span>
		{/if}
	</div>
</div>
