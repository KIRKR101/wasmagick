<script lang="ts">
	import type { MagickState } from '$lib/useMagick.svelte';
	import type { HistoryState, SettingsDiffItem } from '$lib/hooks/useHistory.svelte';
	import { formatBytes } from '$lib/utils';

	let {
		magick,
		history,
		onClearRequest
	}: { magick: MagickState; history: HistoryState; onClearRequest?: () => void } = $props();

	let diffMode = $state<'relative' | 'absolute'>('relative');

	function getDiff(i: number): SettingsDiffItem[] {
		if (i === 0) return [];
		return diffMode === 'relative' ? history.getDiff(i) : history.getAbsoluteDiff(i);
	}
</script>

<div class="flex h-full flex-col">
	<!-- Undo/redo controls -->
	<div class="flex shrink-0 gap-1.5 border-b border-foreground/30 pb-3">
		<button
			onclick={() => history.undo(magick)}
			disabled={!history.canUndo}
			class="flex-1 cursor-pointer border border-foreground/30 font-mono text-[11px] uppercase px-2 py-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
		>
			[&lt;] <span class="hover:underline">UNDO</span>
		</button>
		<button
			onclick={() => history.redo(magick)}
			disabled={!history.canRedo}
			class="flex-1 cursor-pointer border border-foreground/30 font-mono text-[11px] uppercase px-2 py-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
		>
			<span class="hover:underline">REDO</span> [&gt;]
		</button>
		<button
			onclick={() => onClearRequest?.()}
			disabled={history.count === 0}
			class="cursor-pointer border border-foreground/30 font-mono text-[11px] uppercase px-2 py-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
			aria-label="Clear history"
		>
			[X]
		</button>
	</div>

	{#if history.entries.length > 1}
		<div class="flex shrink-0 gap-1 pt-2">
			<button
				onclick={() => (diffMode = 'relative')}
				class="flex-1 cursor-pointer border font-mono text-[10px] uppercase px-1.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring {diffMode ===
				'relative'
					? 'border-foreground/50 bg-muted/50 text-foreground'
					: 'border-foreground/20 text-muted-foreground/60 hover:text-muted-foreground'}"
			>
				Since last
			</button>
			<button
				onclick={() => (diffMode = 'absolute')}
				class="flex-1 cursor-pointer border font-mono text-[10px] uppercase px-1.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring {diffMode ===
				'absolute'
					? 'border-foreground/50 bg-muted/50 text-foreground'
					: 'border-foreground/20 text-muted-foreground/60 hover:text-muted-foreground'}"
			>
				From original
			</button>
		</div>
	{/if}

	<div class="custom-scrollbar flex-1 overflow-y-auto pt-2">
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
							onclick={() => history.jumpTo(magick, entry.id)}
							class="flex w-full flex-col text-left transition-colors border {isCurrent
								? 'border-foreground bg-muted/50'
								: 'border-foreground/30 bg-transparent hover:bg-muted/30 hover:border-foreground/60'}"
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
											<span class="font-mono text-[10px] text-muted-foreground"
												>{entry.time}ms</span
											>
										{/if}
									</div>
									<div
										class="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground"
									>
										<span>{entry.width}×{entry.height}</span>
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
								<div class="flex flex-wrap gap-x-2 gap-y-0.5 border-t border-foreground/10 px-2 py-1">
									{#each diffs as d}
										<span class="font-mono text-[10px] text-muted-foreground/70">
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
