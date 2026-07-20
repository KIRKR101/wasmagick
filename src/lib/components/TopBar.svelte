<script lang="ts">
	import { X } from 'lucide-svelte';
	import type { MagickState } from '$lib/useMagick.svelte';
	import type { HistoryState } from '$lib/hooks/useHistory.svelte';
	import HoverTooltip from './controls/HoverTooltip.svelte';

	let {
		magick,
		history,
		debugMode,
		isDarkMode,
		onToggleDebug,
		onToggleTheme,
		onToggleShortcuts,
		onUndo,
		onRedo,
		onClose
	}: {
		magick: MagickState;
		history: HistoryState;
		debugMode: boolean;
		isDarkMode: boolean;
		onToggleDebug: () => void;
		onToggleTheme: () => void;
		onToggleShortcuts: () => void;
		onUndo: () => void;
		onRedo: () => void;
		onClose: () => void;
	} = $props();
</script>

<header
	class="relative z-30 flex h-[var(--topbar-h)] shrink-0 items-center gap-2 border-b border-foreground/30 bg-[#f7f7f4] px-3 font-mono text-[11px] uppercase dark:bg-background"
>
	<span class="font-bold tracking-wider text-foreground">[ ] WASMAGICK.APP</span>

	{#if magick.originalImageUrl}
		<span class="text-muted-foreground/40">/</span>
		<span class="truncate text-foreground/80 max-md:hidden">{magick.originalName}</span>
		<HoverTooltip label="Close image">
			<button
				onclick={onClose}
				class="flex size-5 cursor-pointer items-center justify-center border border-foreground/30 text-muted-foreground/60 transition-colors focus:outline-none max-md:hidden"
				aria-label="Close image"
			>
				<X class="size-3" />
			</button>
		</HoverTooltip>
	{/if}

	<div class="ml-auto flex items-center gap-1">
		<HoverTooltip label="Undo (Ctrl+Z)">
			<button
				onclick={onUndo}
				disabled={!history.canUndo}
				class="cursor-pointer px-1.5 py-1 text-muted-foreground transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
			>
				[&lt;]
			</button>
		</HoverTooltip>
		<HoverTooltip label="Redo (Ctrl+Shift+Z)">
			<button
				onclick={onRedo}
				disabled={!history.canRedo}
				class="cursor-pointer px-1.5 py-1 text-muted-foreground transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
			>
				[&gt;]
			</button>
		</HoverTooltip>

		<span class="mx-1 h-4 w-px bg-border"></span>

		<HoverTooltip label="Debug Mode">
			<button
				onclick={onToggleDebug}
				class="cursor-pointer px-1.5 py-1 transition-colors focus:outline-none {debugMode ? 'text-foreground' : 'text-muted-foreground'}"
			>
				[BUG]
			</button>
		</HoverTooltip>

		<HoverTooltip label="Toggle Theme">
			<button
				onclick={onToggleTheme}
				class="cursor-pointer px-1.5 py-1 text-muted-foreground transition-colors focus:outline-none"
			>
				[{isDarkMode ? '~' : 'O'}]
			</button>
		</HoverTooltip>

		<HoverTooltip label="Shortcuts (Ctrl+Shift+?)">
			<button
				onclick={onToggleShortcuts}
				class="cursor-pointer px-1.5 py-1 text-muted-foreground transition-colors focus:outline-none"
			>
				[?]
			</button>
		</HoverTooltip>
	</div>
</header>
