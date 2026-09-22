<script lang="ts">
	import type { MagickState } from '$lib/useMagick.svelte';
	import type { HistoryState, SettingsDiffItem } from '$lib/hooks/useHistory.svelte';
	import { formatBytes, formatDimensions } from '$lib/utils';
	import Trash from 'phosphor-svelte/lib/Trash';
	import UndoRedoButtons from '../controls/UndoRedoButtons.svelte';

	let {
		magick,
		history,
		onClearRequest,
		onNavigate
	}: {
		magick: MagickState;
		history: HistoryState;
		onClearRequest?: () => void;
		onNavigate?: (message: string) => void;
	} = $props();

	let diffMode = $state<'relative' | 'absolute'>('relative');

	async function undo() {
		const target = history.undoTargetLabel;
		if (!target) return;
		await history.undo(magick);
		onNavigate?.(`Undid — ${target}`);
	}

	async function redo() {
		const target = history.redoTargetLabel;
		if (!target) return;
		await history.redo(magick);
		onNavigate?.(`Redid — ${target}`);
	}

	async function jump(id: number, label: string) {
		await history.jumpTo(magick, id);
		onNavigate?.(`History — ${label}`);
	}

	function getDiff(i: number): SettingsDiffItem[] {
		if (i === 0) return [];
		return diffMode === 'relative' ? history.getDiff(i) : history.getAbsoluteDiff(i);
	}
</script>

<div class="flex h-full flex-col">
	<!-- Undo/redo controls -->
	<div class="flex shrink-0 gap-1.5 border-b border-divider pb-3">
		<UndoRedoButtons
			class="min-w-0 flex-1"
			canUndo={history.canUndo}
			canRedo={history.canRedo}
			onUndo={undo}
			onRedo={redo}
			undoLabel={history.undoTargetLabel ? `Undo ${history.undoTargetLabel}` : 'Undo'}
			redoLabel={history.redoTargetLabel ? `Redo ${history.redoTargetLabel}` : 'Redo'}
		/>
		<button
			onclick={() => onClearRequest?.()}
			disabled={history.count === 0}
			class="cursor-pointer border border-divider px-2 py-1.5 font-mono text-[11px] uppercase focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			aria-label="Clear history"
			title="Clear history"
		>
			<Trash class="size-3.5" aria-hidden="true" />
		</button>
	</div>

	{#if history.entries.length > 1}
		<div class="flex shrink-0 gap-1 pt-2">
			<button
				onclick={() => (diffMode = 'relative')}
				class="flex-1 cursor-pointer border px-1.5 py-1 font-mono text-[11px] uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {diffMode ===
				'relative'
					? 'border-divider bg-muted/50 text-foreground'
					: 'border-divider text-muted-foreground/60 hover:border-foreground/50 hover:text-muted-foreground'}"
			>
				Since last
			</button>
			<button
				onclick={() => (diffMode = 'absolute')}
				class="flex-1 cursor-pointer border px-1.5 py-1 font-mono text-[11px] uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {diffMode ===
				'absolute'
					? 'border-divider bg-muted/50 text-foreground'
					: 'border-divider text-muted-foreground/60 hover:border-foreground/50 hover:text-muted-foreground'}"
			>
				From original
			</button>
		</div>
	{/if}

	<div class="flex-1 overflow-y-auto pt-2">
		{#if history.entries.length === 0}
			<div class="flex flex-col items-center justify-center gap-2 py-10 text-center">
				<p class="text-xs text-muted-foreground">No history yet</p>
				<p class="text-[11px] text-muted-foreground/60">Process an image to start tracking</p>
			</div>
		{:else}
			<ol class="space-y-1">
				{#each history.entries as entry, i (entry.id)}
					{@const isCurrent = i === history.pointer}
					{@const diffs = getDiff(i)}
					<li>
						<button
							onclick={() => jump(entry.id, entry.label)}
							class="flex w-full flex-col border text-left transition-colors {isCurrent
								? 'border-divider bg-muted/50'
								: 'border-divider bg-transparent hover:border-foreground/50 hover:bg-muted/30'}"
							aria-current={isCurrent}
						>
							<div class="flex items-center gap-2.5 px-2 py-1.5">
								<div
									class="size-9 shrink-0 overflow-hidden border border-foreground/50 bg-transparent"
								>
									<img
										src={entry.blobUrl}
										alt={entry.label}
										class="size-full object-cover"
										draggable="false"
									/>
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between gap-2">
										<span
											class="truncate text-xs font-semibold {isCurrent
												? 'text-foreground'
												: 'text-foreground/80'}"
										>
											{entry.label}
										</span>
										{#if entry.isOriginal}{:else if entry.time > 0}
											<span class="font-mono text-[11px] text-muted-foreground">{entry.time}ms</span
											>
										{/if}
									</div>
									<div
										class="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground"
									>
										<span>{formatDimensions(entry.width, entry.height)}</span>
										<span class="text-muted-foreground/40">·</span>
										<span class="uppercase">{entry.format}</span>
										{#if entry.size > 0}
											<span class="text-muted-foreground/40">·</span>
											<span>{formatBytes(entry.size)}</span>
										{/if}
									</div>
								</div>
							</div>
							{#if diffs.length > 0}
								<div
									class="flex flex-wrap gap-x-2 gap-y-0.5 border-t border-foreground/10 px-2 py-1"
								>
									{#each diffs as d}
										<span class="font-mono text-[11px] text-muted-foreground">
											{d.label}: <span class="text-muted-foreground/40">{d.prev}</span> → {d.curr}
										</span>
									{/each}
								</div>
							{/if}
						</button>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
</div>
