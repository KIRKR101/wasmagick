<script lang="ts">
	import CanvasViewport from './CanvasViewport.svelte';
	import MobileToolbar from './MobileToolbar.svelte';
	import MobilePanel from './MobilePanel.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import type { MagickState } from '$lib/useMagick.svelte';
	import type { HistoryState } from '$lib/hooks/useHistory.svelte';
	import type { PresetsState } from '$lib/hooks/usePresets.svelte';
	import type { ReplaceGuardState } from '$lib/hooks/useReplaceGuard.svelte';
	import type { EditorSection, SampleImage } from '$lib/editor-types';

	let {
		magick,
		history,
		presets,
		guard,
		activeSection = $bindable('geometry'),
		isDragging = false,
		onProcess,
		onReset,
		onDownload,
		onUndo,
		onRedo,
		onReplace,
		onClose
	}: {
		magick: MagickState;
		history: HistoryState;
		presets: PresetsState;
		guard: ReplaceGuardState;
		activeSection?: EditorSection;
		isDragging?: boolean;
		onProcess: () => void;
		onReset: () => void;
		onDownload: () => void;
		onUndo: () => void;
		onRedo: () => void;
		onReplace: (file: File) => Promise<void>;
		onClose: () => void;
	} = $props();

	let fileInputEl = $state<HTMLInputElement | null>(null);
	let panelOpen = $state(false);
	let viewportZoom = $state(100);
	let isComparing = $state(false);
	let splitMode = $state(false);

	// Viewport ref
	let viewport = $state<ReturnType<typeof CanvasViewport> | null>(null);

	function openFilePicker() {
		fileInputEl?.click();
	}

	async function onFileInputChange(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			guard.requestReplace(target.files[0], onReplace);
		}
		target.value = '';
	}

	async function onSelectSample(s: SampleImage) {
		try {
			const res = await fetch(s.url);
			const blob = await res.blob();
			const file = new File([blob], `${s.name.toLowerCase()}.png`, {
				type: blob.type || 'image/png'
			});
			guard.requestReplace(file, onReplace);
		} catch {
			// ignore
		}
	}

	function togglePanel() {
		panelOpen = !panelOpen;
	}

	function onViewportStateChange(st: { zoom: number }) {
		viewportZoom = st.zoom;
	}

	// Confirm dialog state
	let confirmOpen = $derived(guard.pending != null);
	let pendingName = $derived(guard.pendingFile?.name ?? '');
	let confirmKind: 'close' | 'replace' = $derived(
		guard.pending?.kind === 'close' ? 'close' : 'replace'
	);

	function onConfirmReplace() {
		void guard.confirmPending();
	}
	function onCancelReplace() {
		guard.cancelPending();
	}

	let clearHistoryOpen = $state(false);
	let resetConfirmOpen = $state(false);

	function onClearHistoryRequest() {
		clearHistoryOpen = true;
	}
	function onClearHistoryConfirm() {
		history.clear();
	}
	function onClearHistoryCancel() {
		clearHistoryOpen = false;
	}

	function onResetRequest() {
		if (guard.isDirty) {
			resetConfirmOpen = true;
		} else {
			onReset();
		}
	}
	function onResetConfirm() {
		resetConfirmOpen = false;
		onReset();
	}
	function onResetCancel() {
		resetConfirmOpen = false;
	}

	function onCloseRequest() {
		guard.requestClose(onClose);
	}

	function handleCompareStart() {
		viewport?.startCompare();
		isComparing = true;
	}
	function handleCompareEnd() {
		viewport?.endCompare();
		isComparing = false;
	}

	function handleToggleSplit() {
		viewport?.toggleSplitCompare();
		splitMode = !splitMode;
	}

	function handleFitToScreen() {
		viewport?.fitImageToScreen();
	}
</script>

<input
	bind:this={fileInputEl}
	type="file"
	accept="image/*"
	onchange={onFileInputChange}
	class="hidden"
/>

<div class="mobile-layout">
	<!-- Full-screen canvas -->
	<div class="mobile-canvas">
		<CanvasViewport
			bind:this={viewport}
			originalImageUrl={magick.originalImageUrl}
			processedImageUrl={magick.processedImageUrl}
			isLoading={magick.isLoading}
			wasmLoaded={magick.wasmLoaded}
			originalWidth={magick.originalWidth}
			originalHeight={magick.originalHeight}
			originalFormat={magick.originalImageFormat}
			processedWidth={magick.processedWidth}
			processedHeight={magick.processedHeight}
			processedFormat={magick.processedImageFormat}
			magickSettings={magick.settings}
			currentProcessingStep={magick.currentProcessingStep}
			{isDragging}
			onBrowse={openFilePicker}
			{onSelectSample}
			onStateChange={onViewportStateChange}
		/>
	</div>

	<!-- Floating toolbar -->
	<div class="mobile-toolbar-wrap">
		<MobileToolbar
			{magick}
			{history}
			{isComparing}
			isLoading={magick.isLoading}
			zoomPct={viewportZoom}
			{onUndo}
			{onRedo}
			{onDownload}
			onToggleTools={togglePanel}
			onFitToScreen={handleFitToScreen}
			onCompareStart={handleCompareStart}
			onCompareEnd={handleCompareEnd}
			onToggleSplitCompare={handleToggleSplit}
			{splitMode}
			onReset={onResetRequest}
			onClose={onCloseRequest}
		/>
	</div>

	<!-- Bottom sheet panel -->
	<MobilePanel
		bind:open={panelOpen}
		{magick}
		{history}
		{presets}
		bind:activeSection
		{onProcess}
		{onDownload}
		onClearRequest={onClearHistoryRequest}
		onClose={() => (panelOpen = false)}
	/>
</div>

<ConfirmDialog
	bind:open={confirmOpen}
	fileName={pendingName}
	kind={confirmKind}
	onConfirm={onConfirmReplace}
	onCancel={onCancelReplace}
/>

<ConfirmDialog
	bind:open={clearHistoryOpen}
	kind="clear-history"
	onConfirm={onClearHistoryConfirm}
	onCancel={onClearHistoryCancel}
/>

<ConfirmDialog
	bind:open={resetConfirmOpen}
	kind="reset-all"
	onConfirm={onResetConfirm}
	onCancel={onResetCancel}
/>
