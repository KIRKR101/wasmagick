<script lang="ts">
	import ArrowUUpLeft from 'phosphor-svelte/lib/ArrowUUpLeft';
	import ArrowUUpRight from 'phosphor-svelte/lib/ArrowUUpRight';
	import HoverTooltip from './HoverTooltip.svelte';

	let {
		canUndo,
		canRedo,
		onUndo,
		onRedo,
		undoLabel = 'Undo',
		redoLabel = 'Redo',
		tooltipSide = 'top',
		class: className = ''
	}: {
		canUndo: boolean;
		canRedo: boolean;
		onUndo: () => void;
		onRedo: () => void;
		undoLabel?: string;
		redoLabel?: string;
		tooltipSide?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
		class?: string;
	} = $props();
</script>

<div class="relative flex overflow-hidden border border-divider {className}">
	<HoverTooltip label={undoLabel} side={tooltipSide} triggerClass="flex-1">
		<button
			onclick={onUndo}
			disabled={!canUndo}
			aria-label={undoLabel}
			class="group flex w-full flex-1 cursor-pointer items-center justify-center gap-1.5 px-2 py-1 font-mono text-[11px] leading-none text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		>
			<span class="inline-flex w-[3ch] shrink-0 items-center justify-center" aria-hidden="true"
				><ArrowUUpLeft class="size-[1em]" /></span
			>
			<span class="group-hover:underline">UNDO</span>
		</button>
	</HoverTooltip>
	<HoverTooltip label={redoLabel} side={tooltipSide} triggerClass="flex-1">
		<button
			onclick={onRedo}
			disabled={!canRedo}
			aria-label={redoLabel}
			class="group flex w-full flex-1 cursor-pointer items-center justify-center gap-1.5 px-2 py-1 font-mono text-[11px] leading-none text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		>
			<span class="inline-flex w-[3ch] shrink-0 items-center justify-center" aria-hidden="true"
				><ArrowUUpRight class="size-[1em]" /></span
			>
			<span class="group-hover:underline">REDO</span>
		</button>
	</HoverTooltip>
	<div
		class="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px -translate-x-1/2 bg-divider"
		aria-hidden="true"
	></div>
</div>
