<script lang="ts">
	import {
		Upload,
		Undo2,
		Redo2,
		Images,
		Download,
		SlidersHorizontal,
		ZoomIn,
		ZoomOut,
		Maximize,
		Loader2,
		RotateCcw,
		X
	} from 'lucide-svelte';
	import type { MagickState } from '$lib/useMagick.svelte';
	import type { HistoryState } from '$lib/hooks/useHistory.svelte';
	import { isGeoDirty, isColorDirty, isFiltersDirty, isExportDirty } from '$lib/utils';

	let {
		magick,
		history,
		isComparing = false,
		isLoading = false,
		zoomPct = 100,
		onUploadClick,
		onUndo,
		onRedo,
		onDownload,
		onToggleTools,
		onZoomIn,
		onZoomOut,
		onFitToScreen,
		onCompareStart,
		onCompareEnd,
		onToggleSplitCompare,
		canSplit = false,
		splitMode = false,
		onReset,
		onClose
	}: {
		magick: MagickState;
		history: HistoryState;
		isComparing?: boolean;
		isLoading?: boolean;
		zoomPct?: number;
		onUploadClick: () => void;
		onUndo: () => void;
		onRedo: () => void;
		onDownload: () => void;
		onToggleTools: () => void;
		onZoomIn: () => void;
		onZoomOut: () => void;
		onFitToScreen: () => void;
		onCompareStart: () => void;
		onCompareEnd: () => void;
		onToggleSplitCompare: () => void;
		canSplit?: boolean;
		splitMode?: boolean;
		onReset: () => void;
		onClose: () => void;
	} = $props();

	let canDownload = $derived(!!magick.processedImageUrl);
	let anyDirty = $derived(
		isGeoDirty(magick.settings) || isColorDirty(magick.settings) ||
		isFiltersDirty(magick.settings) || isExportDirty(magick.settings)
	);
</script>

<div class="mobile-toolbar">
	<!-- Zoom row -->
	<div class="flex items-center justify-center gap-0 border-b border-foreground/30 px-2 py-1">
		<button
			onclick={onZoomOut}
			class="mobile-btn-sm"
			aria-label="Zoom out"
		>
			<ZoomOut class="size-3.5" />
		</button>
		<span class="w-12 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
			{zoomPct}%
		</span>
		<button
			onclick={onZoomIn}
			class="mobile-btn-sm"
			aria-label="Zoom in"
		>
			<ZoomIn class="size-3.5" />
		</button>
		<div class="mx-1 h-3.5 w-px bg-foreground/30"></div>
		<button
			onclick={onFitToScreen}
			class="mobile-btn-sm"
			aria-label="Fit to screen"
		>
			<Maximize class="size-3.5" />
		</button>
	</div>

	<!-- Action row -->
	<div class="flex items-center justify-around px-2 py-1.5">
		<button
			onclick={onUploadClick}
			class="mobile-btn"
			aria-label="Upload image"
		>
			<Upload class="size-4.5" />
			<span class="text-[9px]">OPEN</span>
		</button>

		<button
			onclick={onUndo}
			disabled={!history.canUndo}
			class="mobile-btn"
			aria-label="Undo"
		>
			<Undo2 class="size-4.5" />
			<span class="text-[9px]">UNDO</span>
		</button>

		<button
			onclick={onRedo}
			disabled={!history.canRedo}
			class="mobile-btn"
			aria-label="Redo"
		>
			<Redo2 class="size-4.5" />
			<span class="text-[9px]">REDO</span>
		</button>

		<button
			onpointerdown={(e) => { e.preventDefault(); onCompareStart(); }}
			onpointerup={(e) => { e.preventDefault(); onCompareEnd(); }}
			onpointerleave={() => onCompareEnd()}
			disabled={!magick.processedImageUrl}
			class="mobile-btn {isComparing ? 'bg-muted text-foreground' : ''}"
			aria-label="Hold to compare"
		>
			<Images class="size-4.5" />
			<span class="text-[9px]">COMPARE</span>
		</button>

		{#if canSplit}
			<button
				onclick={onToggleSplitCompare}
				class="mobile-btn {splitMode ? 'bg-muted text-foreground' : ''}"
				aria-label="Split compare"
			>
				<svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>
				<span class="text-[9px]">SPLIT</span>
			</button>
		{/if}

		<button
			onclick={onDownload}
			disabled={!canDownload}
			class="mobile-btn"
			aria-label="Download"
		>
			<Download class="size-4.5" />
			<span class="text-[9px]">SAVE</span>
		</button>

		<div class="h-5 w-px bg-foreground/30"></div>

		<button
			onclick={onReset}
			disabled={!anyDirty}
			class="mobile-btn"
			aria-label="Reset all"
		>
			<RotateCcw class="size-4.5" />
			<span class="text-[9px]">RESET</span>
		</button>

		<button
			onclick={onClose}
			disabled={!magick.sourceBytes}
			class="mobile-btn"
			aria-label="Close image"
		>
			<X class="size-4.5" />
			<span class="text-[9px]">CLOSE</span>
		</button>

		<div class="relative">
			<button
				onclick={onToggleTools}
				class="mobile-btn {isLoading ? 'text-primary' : ''}"
				aria-label="Open tools"
			>
				{#if isLoading}
					<Loader2 class="size-4.5 animate-spin" />
				{:else}
					<SlidersHorizontal class="size-4.5" />
				{/if}
				<span class="text-[9px]">TOOLS</span>
			</button>
		</div>
	</div>
</div>
