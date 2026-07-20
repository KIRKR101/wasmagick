<script lang="ts">
	import {
		Undo2,
		Redo2,
		Columns2,
		Images,
		Download,
		SlidersHorizontal,
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
		splitMode = false,
		onReset,
		onClose
	}: {
		magick: MagickState;
		history: HistoryState;
		isComparing?: boolean;
		isLoading?: boolean;
		zoomPct?: number;
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
	<!-- View / Canvas tools -->
	<div class="flex items-center justify-between border-b border-foreground/30 px-3 py-1">
		<!-- Zoom -->
		<div class="flex items-center gap-0">
			<button
				onclick={onFitToScreen}
				disabled={!magick.originalImageUrl}
				class="mobile-btn-sm"
				aria-label="Fit to screen"
			>
				<Maximize class="size-4" />
			</button>
			<span class="w-12 text-center font-mono text-[11px] tabular-nums text-muted-foreground">
				{Math.round(zoomPct)}%
			</span>
		</div>

		<!-- View -->
		<div class="flex items-center gap-0">
			<button
				onpointerdown={(e) => { e.preventDefault(); onCompareStart(); }}
				onpointerup={(e) => { e.preventDefault(); onCompareEnd(); }}
				onpointerleave={() => onCompareEnd()}
				disabled={!magick.processedImageUrl}
				class="mobile-btn-sm {isComparing ? 'bg-muted text-foreground' : ''}"
				aria-label="Hold to compare"
			>
				<Images class="size-4" />
			</button>
			<button
				onclick={onToggleSplitCompare}
				disabled={!magick.processedImageUrl}
				class="mobile-btn-sm {splitMode ? 'bg-muted text-foreground' : ''}"
				aria-label="Split compare"
			>
				<Columns2 class="size-4" />
			</button>
		</div>
	</div>

	<!-- Actions -->
	<div class="flex items-center justify-around px-2 py-1.5">
		<!-- File operations -->
		<button
			onclick={onDownload}
			disabled={!canDownload}
			class="mobile-btn"
			aria-label="Download"
		>
			<Download class="size-4.5" />
			<span class="text-[9px]">SAVE</span>
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

		<div class="h-5 w-px bg-foreground/30"></div>

		<!-- History -->
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

		<div class="h-5 w-px bg-foreground/30"></div>

		<!-- Settings -->
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
