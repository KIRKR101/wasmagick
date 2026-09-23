<script lang="ts">
	import ArrowUUpLeft from 'phosphor-svelte/lib/ArrowUUpLeft';
	import ArrowUUpRight from 'phosphor-svelte/lib/ArrowUUpRight';
	import SquareSplitHorizontal from 'phosphor-svelte/lib/SquareSplitHorizontal';
	import Images from 'phosphor-svelte/lib/Images';
	import DownloadSimple from 'phosphor-svelte/lib/DownloadSimple';
	import GearSix from 'phosphor-svelte/lib/GearSix';
	import SlidersHorizontal from 'phosphor-svelte/lib/SlidersHorizontal';
	import CornersOut from 'phosphor-svelte/lib/CornersOut';
	import CircleNotch from 'phosphor-svelte/lib/CircleNotch';
	import Play from 'phosphor-svelte/lib/Play';
	import X from 'phosphor-svelte/lib/X';
	import type { MagickState } from '$lib/useMagick.svelte';
	import type { HistoryState } from '$lib/hooks/useHistory.svelte';

	let {
		magick,
		history,
		isComparing = false,
		isLoading = false,
		zoomPct = 100,
		onUndo,
		onRedo,
		onDownload,
		onProcess,
		onToggleTools,
		onFitToScreen,
		onCompareStart,
		onCompareEnd,
		onToggleSplitCompare,
		splitMode = false,
		onClose,
		onOpenSettings
	}: {
		magick: MagickState;
		history: HistoryState;
		isComparing?: boolean;
		isLoading?: boolean;
		zoomPct?: number;
		onUndo: () => void;
		onRedo: () => void;
		onDownload: () => void;
		onProcess: () => void;
		onToggleTools: () => void;
		onFitToScreen: () => void;
		onCompareStart: () => void;
		onCompareEnd: () => void;
		onToggleSplitCompare: () => void;
		splitMode?: boolean;
		onClose: () => void;
		onOpenSettings: () => void;
	} = $props();

	let canDownload = $derived(!!magick.processedImageUrl);
	let canProcess = $derived(!!magick.sourceBytes && magick.wasmLoaded && !isLoading);
</script>

<div class="mobile-toolbar">
	<!-- View / Canvas tools -->
	<div class="flex items-center justify-between border-b border-divider px-3 py-1">
		<!-- Zoom -->
		<div class="flex items-center gap-0">
			<button
				onclick={onFitToScreen}
				disabled={!magick.originalImageUrl}
				class="mobile-btn-sm"
				aria-label="Fit to screen"
			>
				<CornersOut class="size-4" />
			</button>
			<span
				class="w-12 text-center font-mono text-[11px] text-muted-foreground tabular-nums"
				class:opacity-35={!magick.originalImageUrl}
			>
				{Math.round(zoomPct)}%
			</span>
		</div>

		<!-- View -->
		<div class="flex items-center gap-0">
			<button
				onpointerdown={(e) => {
					e.preventDefault();
					onCompareStart();
				}}
				onpointerup={(e) => {
					e.preventDefault();
					onCompareEnd();
				}}
				onpointercancel={onCompareEnd}
				onpointerleave={() => onCompareEnd()}
				disabled={!magick.processedImageUrl}
				class="mobile-btn-sm {isComparing ? 'bg-muted/50 text-foreground' : ''}"
				aria-label="Hold to compare"
				aria-pressed={isComparing}
			>
				<Images class="size-4" />
			</button>
			<button
				onclick={onToggleSplitCompare}
				disabled={!magick.processedImageUrl}
				class="mobile-btn-sm {splitMode ? 'bg-muted/50 text-foreground' : ''}"
				aria-label="Split compare"
				aria-pressed={splitMode}
			>
				<SquareSplitHorizontal class="size-4" />
			</button>
			<button onclick={onOpenSettings} class="mobile-btn-sm" aria-label="App settings">
				<GearSix class="size-4" />
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
			aria-label="Export image"
		>
			<DownloadSimple class="size-4.5" />
			<span class="text-[11px]">EXPORT</span>
		</button>
		<button
			onclick={onClose}
			disabled={!magick.sourceBytes}
			class="mobile-btn"
			aria-label="Close image"
		>
			<X class="size-4.5" />
			<span class="text-[11px]">CLOSE</span>
		</button>

		<div class="h-5 w-px bg-divider"></div>

		<!-- History -->
		<button
			onclick={onUndo}
			disabled={!history.canUndo}
			class="mobile-btn flex-row gap-1.5"
			aria-label={history.undoTargetLabel ? `Undo ${history.undoTargetLabel}` : 'Undo'}
		>
			<ArrowUUpLeft class="size-4.5" />
			<span class="text-[11px] leading-none">UNDO</span>
		</button>
		<button
			onclick={onRedo}
			disabled={!history.canRedo}
			class="mobile-btn flex-row gap-1.5"
			aria-label={history.redoTargetLabel ? `Redo ${history.redoTargetLabel}` : 'Redo'}
		>
			<ArrowUUpRight class="size-4.5" />
			<span class="text-[11px] leading-none">REDO</span>
		</button>

		<div class="h-5 w-px bg-divider"></div>

		<!-- Settings -->
		<button
			onclick={onProcess}
			disabled={!canProcess}
			class="mobile-btn"
			aria-label={!magick.sourceBytes
				? 'Process - load an image first'
				: !magick.wasmLoaded
					? 'Process - engine loading…'
					: magick.isStale
						? 'Settings changed, process to update preview'
						: 'Process image'}
		>
			{#if isLoading}
				<CircleNotch class="size-4.5 animate-spin" />
			{:else}
				<Play class="size-4.5" />
			{/if}
			<span class="text-[11px]">PROCESS</span>
		</button>
		<button
			onclick={onToggleTools}
			class="mobile-btn {isLoading ? 'text-primary' : ''}"
			aria-label="Open tools"
		>
			{#if isLoading}
				<CircleNotch class="size-4.5 animate-spin" />
			{:else}
				<SlidersHorizontal class="size-4.5" />
			{/if}
			<span class="text-[11px]">TOOLS</span>
		</button>
	</div>
</div>
