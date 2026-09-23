<script lang="ts">
	import X from 'phosphor-svelte/lib/X';
	import Play from 'phosphor-svelte/lib/Play';
	import DownloadSimple from 'phosphor-svelte/lib/DownloadSimple';
	import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';
	import CircleNotch from 'phosphor-svelte/lib/CircleNotch';
	import type { MagickState } from '$lib/useMagick.svelte';
	import type { HistoryState } from '$lib/hooks/useHistory.svelte';
	import type { PresetsState } from '$lib/hooks/usePresets.svelte';
	import type { EditorSection } from '$lib/editor-types';
	import {
		isGeoDirty,
		isColorDirty,
		isFiltersDirty,
		isExportDirty,
		isAnnotateDirty,
		isSettingsDirty
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
		onReset,
		onClearRequest,
		onClose,
		onNavigate,
		annotationPlacementActive = false,
		onAnnotationPlacementChange = () => {}
	}: {
		open?: boolean;
		magick: MagickState;
		history: HistoryState;
		presets: PresetsState;
		activeSection?: EditorSection;
		onProcess: () => void;
		onDownload: () => void;
		onReset: () => void;
		onClearRequest?: () => void;
		onClose: () => void;
		onNavigate?: (message: string) => void;
		annotationPlacementActive?: boolean;
		onAnnotationPlacementChange?: (active: boolean) => void;
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
	let anyDirty = $derived(isSettingsDirty(magick.settings));

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
	let returnFocusTo: HTMLElement | null = null;
	let isDragging = $state(false);
	let dragStartY = 0;
	let dragStartTranslate = 0;
	let currentTranslate = $state(0);

	const MIN_TRANSLATE = 0;

	// Animate sheet in when opened. Default to 50vh so all operations are
	// comfortable to reach, while the canvas stays visible behind the
	// non-modal sheet.
	$effect(() => {
		if (open) {
			returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			const rafId = requestAnimationFrame(() => {
				currentTranslate = window.innerHeight * 0.5;
				sheetRef?.focus();
			});
			return () => {
				cancelAnimationFrame(rafId);
				returnFocusTo?.focus();
			};
		} else {
			currentTranslate = 0;
		}
	});

	function snapToNearest(y: number) {
		const vh = window.innerHeight;
		const thirdHeight = vh * 0.33;
		const halfHeight = vh * 0.5;
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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			onClose();
		} else if (e.key === 'Tab' && open && sheetRef) {
			const focusable = Array.from(
				sheetRef.querySelectorAll<HTMLElement>(
					'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
				)
			);
			if (focusable.length === 0) {
				e.preventDefault();
				sheetRef.focus();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
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
	<!-- Non-modal sheet: no backdrop so the canvas stays visible and interactive -->
	<!-- Sheet -->
	<div
		bind:this={sheetRef}
		class="mobile-sheet"
		style="height: {currentTranslate}px"
		role="dialog"
		aria-modal="true"
		aria-labelledby="mobile-tools-title"
		tabindex="-1"
	>
		<h2 id="mobile-tools-title" class="sr-only">Image editing tools</h2>
		<!-- Drag handle + explicit close (no backdrop in non-modal mode) -->
		<div class="relative flex items-center justify-center pt-2.5 pb-1.5">
			<div
				class="flex cursor-grab touch-none items-center justify-center px-8 py-1 active:cursor-grabbing"
				onpointerdown={onDragStart}
				onpointermove={onDragMove}
				onpointerup={onDragEnd}
				aria-hidden="true"
			>
				<div class="h-1 w-10 rounded-full bg-foreground/20"></div>
			</div>
			<button
				type="button"
				onclick={onClose}
				class="mobile-btn-sm absolute top-0 right-1"
				aria-label="Close tools"
			>
				<X class="size-4" />
			</button>
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
						<span class="w-3 text-center text-xs text-muted-foreground/60" aria-label="Modified"
							>^</span
						>
					{/if}
				</button>
			{/each}
		</div>

		<!-- Section content -->
		<div bind:this={contentRef} class="mobile-sheet-content @container">
			{#key activeSection}
				{#if activeSection === 'geometry'}
					<GeometrySection {magick} />
				{:else if activeSection === 'color'}
					<ColorSection {magick} />
				{:else if activeSection === 'filters'}
					<FiltersSection {magick} />
				{:else if activeSection === 'annotate'}
					<AnnotateSection {magick} {annotationPlacementActive} {onAnnotationPlacementChange} />
				{:else if activeSection === 'export'}
					<ExportSection {magick} />
				{:else if activeSection === 'presets'}
					<PresetsSection {magick} {presets} />
				{:else if activeSection === 'history'}
					<HistoryPanel {magick} {history} {onClearRequest} {onNavigate} />
				{/if}
			{/key}
		</div>

		<!-- Bottom action bar -->
		<div class="mobile-sheet-footer">
			<button
				onclick={onReset}
				disabled={!anyDirty}
				class="mobile-action-btn gap-1.5"
				style="flex: none; padding: 0 12px;"
				aria-label="Reset all edits"
			>
				<ArrowCounterClockwise class="size-4" />
				<span>RESET</span>
			</button>
			<button
				onclick={onProcess}
				disabled={!magick.wasmLoaded || !magick.sourceBytes}
				class="mobile-action-btn primary gap-2 {magick.isStale
					? 'font-semibold underline underline-offset-4'
					: ''}"
				aria-label={!magick.sourceBytes
					? 'Process - load an image first'
					: !magick.wasmLoaded
						? 'Process - engine loading…'
						: magick.isStale
							? 'Settings changed, process to update preview'
							: 'Process image'}
			>
				{#if magick.isLoading}
					<CircleNotch class="size-4 animate-spin" />
				{:else if magick.isStale}
					<Play class="size-4" weight="fill" />
				{:else}
					<Play class="size-4" />
				{/if}
				<span>PROCESS</span>
			</button>
			<button
				onclick={onDownload}
				disabled={!canDownload}
				class="mobile-action-btn gap-2"
				aria-label="Export image"
			>
				<DownloadSimple class="size-4" />
				<span>EXPORT</span>
			</button>
		</div>
	</div>
{/if}
