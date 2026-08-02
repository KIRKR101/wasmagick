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
		open = $bindable(false),
		magick,
		history,
		presets,
		activeSection = $bindable('geometry'),
		onProcess,
		onDownload,
		onClearRequest,
		onClose
	}: {
		open?: boolean;
		magick: MagickState;
		history: HistoryState;
		presets: PresetsState;
		activeSection?: EditorSection;
		onProcess: () => void;
		onDownload: () => void;
		onClearRequest?: () => void;
		onClose: () => void;
	} = $props();

	const TABS: { id: EditorSection; label: string; dirty: () => boolean }[] = [
		{ id: 'geometry', label: 'Geo', dirty: () => isGeoDirty(magick.settings) },
		{ id: 'color', label: 'Color', dirty: () => isColorDirty(magick.settings) },
		{ id: 'filters', label: 'Fx', dirty: () => isFiltersDirty(magick.settings) },
		{ id: 'annotate', label: 'Txt', dirty: () => isAnnotateDirty(magick.settings) },
		{ id: 'export', label: 'Export', dirty: () => isExportDirty(magick.settings) },
		{ id: 'presets', label: 'Presets', dirty: () => false },
		{ id: 'history', label: 'History', dirty: () => false }
	];

	let canDownload = $derived(!!magick.processedImageUrl);

	let tabsRef = $state<HTMLDivElement | null>(null);
	let contentRef = $state<HTMLDivElement | null>(null);
	let lastSection: EditorSection | null = null;

	// Always start each section scrolled to the top.
	$effect(() => {
		if (activeSection !== lastSection) {
			lastSection = activeSection;
			contentRef?.scrollTo(0, 0);
		}
	});

	// Drag state
	let sheetRef = $state<HTMLDivElement | null>(null);
	let isDragging = $state(false);
	let dragStartY = 0;
	let dragStartTranslate = 0;
	let currentTranslate = $state(0);

	const MIN_TRANSLATE = 0;

	// Animate sheet in when opened
	$effect(() => {
		if (open) {
			const rafId = requestAnimationFrame(() => {
				currentTranslate = window.innerHeight * 0.55;
			});
			return () => cancelAnimationFrame(rafId);
		} else {
			currentTranslate = 0;
		}
	});

	function snapToNearest(y: number) {
		const vh = window.innerHeight;
		const thirdHeight = vh * 0.33;
		const halfHeight = vh * 0.55;
		const maxHeight = vh * 0.88;

		if (y < thirdHeight * 0.6) {
			return 0;
		} else if (y < (thirdHeight + halfHeight) / 2) {
			return thirdHeight;
		} else if (y < (halfHeight + maxHeight) / 2) {
			return halfHeight;
		}
		return maxHeight;
	}

	function onDragStart(e: PointerEvent) {
		isDragging = true;
		dragStartY = e.clientY;
		dragStartTranslate = currentTranslate;
		if (sheetRef) {
			sheetRef.style.transition = 'none';
		}
	}

	function onDragMove(e: PointerEvent) {
		if (!isDragging) return;
		const delta = dragStartY - e.clientY;
		const newTranslate = Math.max(MIN_TRANSLATE, dragStartTranslate + delta);
		currentTranslate = Math.min(newTranslate, window.innerHeight * 0.88);
	}

	function onDragEnd() {
		if (!isDragging) return;
		isDragging = false;
		currentTranslate = snapToNearest(currentTranslate);

		if (sheetRef) {
			sheetRef.style.transition = '';
		}
		if (currentTranslate <= 10) {
			onClose();
		}
	}

	function onBackdropClick() {
		onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			onClose();
		}
	}

	function scrollToTab(tabId: EditorSection) {
		const el = tabsRef?.querySelector(`[data-tab="${tabId}"]`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
	}

	function setSection(id: EditorSection) {
		activeSection = id;
		scrollToTab(id);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- Backdrop -->
	<button
		type="button"
		class="mobile-sheet-backdrop"
		onclick={onBackdropClick}
		aria-label="Close panel"
	></button>

	<!-- Sheet -->
	<div bind:this={sheetRef} class="mobile-sheet" style="height: {currentTranslate}px">
		<!-- Drag handle -->
		<div
			class="flex cursor-grab touch-none items-center justify-center pt-2.5 pb-1.5 active:cursor-grabbing"
			onpointerdown={onDragStart}
			onpointermove={onDragMove}
			onpointerup={onDragEnd}
			role="button"
			tabindex="-1"
			aria-label="Drag to resize"
		>
			<div class="h-1 w-10 rounded-full bg-foreground/20"></div>
		</div>

		<!-- Tab bar -->
		<div bind:this={tabsRef} class="mobile-tabs">
			{#each TABS as tab (tab.id)}
				{@const dirty = tab.dirty()}
				<button
					data-tab={tab.id}
					onclick={() => setSection(tab.id)}
					class="mobile-tab {activeSection === tab.id ? 'active' : ''}"
					aria-pressed={activeSection === tab.id}
				>
					{tab.label}
					{#if dirty}
						<span class="w-3 text-center text-xs text-muted-foreground/60">^</span>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Section content -->
		<div bind:this={contentRef} class="mobile-sheet-content custom-scrollbar">
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

		<!-- Bottom action bar -->
		<div class="mobile-sheet-footer">
			<button
				onclick={onProcess}
				disabled={!magick.wasmLoaded || !magick.sourceBytes}
				class="mobile-action-btn primary"
			>
				PROCESS<span class="ml-1 inline-block w-3 text-left">{magick.isLoading ? ' ~' : ''}</span>
			</button>
			<button onclick={onDownload} disabled={!canDownload} class="mobile-action-btn">
				EXPORT
			</button>
		</div>
	</div>
{/if}
