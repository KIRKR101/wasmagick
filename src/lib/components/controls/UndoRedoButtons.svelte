<script lang="ts">
	import { Redo2, Undo2 } from 'lucide-svelte';

	let {
		canUndo,
		canRedo,
		onUndo,
		onRedo,
		undoLabel = 'Undo',
		redoLabel = 'Redo',
		class: className = ''
	}: {
		canUndo: boolean;
		canRedo: boolean;
		onUndo: () => void;
		onRedo: () => void;
		undoLabel?: string;
		redoLabel?: string;
		class?: string;
	} = $props();
</script>

<div class="flex border border-foreground/30 {className}">
	<button
		onclick={onUndo}
		disabled={!canUndo}
		aria-label={undoLabel}
		title={undoLabel}
		class="group flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-2 py-1 font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
	>
		<span class="inline-flex items-center" aria-hidden="true">[<Undo2 class="size-3.5" />]</span>
		<span class="group-hover:underline">UNDO</span>
	</button>
	<div class="w-px self-stretch bg-foreground/30"></div>
	<button
		onclick={onRedo}
		disabled={!canRedo}
		aria-label={redoLabel}
		title={redoLabel}
		class="group flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-2 py-1 font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
	>
		<span class="group-hover:underline">REDO</span>
		<span class="inline-flex items-center" aria-hidden="true">[<Redo2 class="size-3.5" />]</span>
	</button>
</div>
