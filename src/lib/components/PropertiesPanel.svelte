<script lang="ts">
	import type { MagickState } from '$lib/useMagick.svelte';
	import type { HistoryState } from '$lib/hooks/useHistory.svelte';
	import type { PresetsState } from '$lib/hooks/usePresets.svelte';
	import type { EditorSection } from '$lib/editor-types';
	import {
		isGeoDirty,
		isColorDirty,
		isFiltersDirty,
		isExportDirty,
		isAnnotateDirty
	} from '$lib/utils';

	import GeometrySection from './sections/GeometrySection.svelte';
	import ColorSection from './sections/ColorSection.svelte';
	import FiltersSection from './sections/FiltersSection.svelte';
	import AnnotateSection from './sections/AnnotateSection.svelte';
	import ExportSection from './sections/ExportSection.svelte';
	import PresetsSection from './sections/PresetsSection.svelte';
	import HistoryPanel from './sections/HistoryPanel.svelte';

	let {
		activeSection,
		magick,
		history,
		presets,
		onProcess,
		onDownload,
		onClearRequest
	}: {
		activeSection: EditorSection;
		magick: MagickState;
		history: HistoryState;
		presets: PresetsState;
		onProcess: () => void;
		onDownload: () => void;
		onClearRequest?: () => void;
	} = $props();

	const META: Record<
		EditorSection,
		{ title: string; subtitle: string; reset?: () => void; scroll?: boolean; dirty?: boolean }
	> = {
		geometry: {
			title: 'Geometry',
			subtitle: 'Size · rotation · canvas',
			reset: () => magick.resetGeometry()
		},
		color: { title: 'Color', subtitle: 'Tone · levels · space', reset: () => magick.resetColor() },
		filters: {
			title: 'Filters',
			subtitle: 'Effects · blur · sharpen · quantize',
			reset: () => magick.resetFilters()
		},
		annotate: {
			title: 'Annotate',
			subtitle: 'Text · overlay · caption',
			reset: () => magick.resetAnnotate()
		},
		export: {
			title: 'Export',
			subtitle: 'Format · quality · metadata',
			reset: () => magick.resetExport()
		},
		presets: { title: 'Presets', subtitle: 'Reusable recipes' },
		history: { title: 'History', subtitle: 'Undo · redo · states', scroll: false }
	};

	let dirty = $derived({
		geometry: isGeoDirty(magick.settings),
		color: isColorDirty(magick.settings),
		filters: isFiltersDirty(magick.settings),
		annotate: isAnnotateDirty(magick.settings),
		export: isExportDirty(magick.settings),
		presets: false,
		history: false
	});
	let meta = $derived({ ...META[activeSection], dirty: dirty[activeSection] });
	let canDownload = $derived(!!magick.processedImageUrl);

	let bodyEl = $state<HTMLElement | null>(null);
	let lastSection: EditorSection | null = null;

	// Always start each section scrolled to the top.
	$effect(() => {
		if (activeSection !== lastSection) {
			lastSection = activeSection;
			bodyEl?.scrollTo(0, 0);
		}
	});
</script>

<aside
	class="flex h-full w-full flex-col border-r border-foreground/30 bg-[#f7f7f4] font-mono text-sm dark:border-border dark:bg-background"
>
	<!-- Header for current section -->
	<div
		class="flex items-center justify-between border-b border-foreground/30 px-4 py-3 text-xs tracking-wider text-muted-foreground uppercase dark:border-border"
	>
		<span>{meta.title}</span>
		{#if meta.reset && meta.dirty}
			<button
				class="cursor-pointer px-2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				onclick={meta.reset}>[<span class="hover:underline">RESET</span>]</button
			>
		{/if}
	</div>

	<!-- Body -->
	<div
		bind:this={bodyEl}
		class="properties-panel-inner @container min-h-0 flex-1 overflow-y-auto p-4 {meta.scroll ===
		false
			? 'overflow-hidden'
			: ''}"
	>
		{#if activeSection === 'geometry'}
			<GeometrySection {magick} />
		{:else if activeSection === 'color'}
			<ColorSection {magick} />
		{:else if activeSection === 'filters'}
			<FiltersSection {magick} />
		{:else if activeSection === 'annotate'}
			<AnnotateSection {magick} />
		{:else if activeSection === 'export'}
			<ExportSection {magick} />
		{:else if activeSection === 'presets'}
			<PresetsSection {magick} {presets} />
		{:else if activeSection === 'history'}
			<HistoryPanel {magick} {history} {onClearRequest} />
		{/if}
	</div>

	<!-- Bottom Action Bar -->
	<div
		class="mt-auto border-t border-foreground/30 bg-[#f7f7f4] p-4 dark:border-border dark:bg-background"
	>
		<div class="mb-3 flex items-center justify-between text-xs text-muted-foreground uppercase">
			<span>Output format</span>
			<span class="underline underline-offset-2"
				>{magick.settings.imageFormat} {magick.settings.quality[0]}%</span
			>
		</div>
		<div class="flex flex-col gap-1.5">
			<button
				onclick={onProcess}
				disabled={!magick.wasmLoaded || !magick.sourceBytes}
				class="group flex h-8 w-full shrink-0 cursor-pointer items-center justify-between border border-foreground/30 bg-transparent px-2 font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				<span
					><span class="group-hover:underline">PROCESS</span><span
						class="ml-1 inline-block w-3 text-left">{magick.isLoading ? ' ~' : ''}</span
					></span
				>
				<span class="text-[11px] opacity-70">CTRL+<span class="text-sm">↵</span></span>
			</button>
			<button
				onclick={onDownload}
				disabled={!canDownload}
				class="group flex h-8 w-full shrink-0 cursor-pointer items-center justify-between border border-foreground/30 bg-transparent px-2 font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				<span class="group-hover:underline">EXPORT CANVAS</span>
				<span class="text-[11px] opacity-70">CTRL+S</span>
			</button>
		</div>
	</div>
</aside>
