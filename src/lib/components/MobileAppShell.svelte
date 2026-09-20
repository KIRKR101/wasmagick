<script lang="ts">
	import CanvasViewport from './CanvasViewport.svelte';
	import MobileToolbar from './MobileToolbar.svelte';
	import MobilePanel from './MobilePanel.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import ErrorDialog from './ErrorDialog.svelte';
	import { IMAGE_FILE_ACCEPT } from '$lib/utils';
	import type { MagickState } from '$lib/useMagick.svelte';
	import type { HistoryState } from '$lib/hooks/useHistory.svelte';
	import type { PresetsState } from '$lib/hooks/usePresets.svelte';
	import type { ReplaceGuardState } from '$lib/hooks/useReplaceGuard.svelte';
	import type { EditorSection, SampleImage } from '$lib/editor-types';
	import { computeCropPreview } from '$lib/crop-utils';

	let {
		magick,
		history,
		presets,
		guard,
		activeSection = $bindable('geometry'),
		viewport = $bindable(null),
		onProcess,
		onReset,
		onDownload,
		onUndo,
		onRedo,
		onReplace,
		onClose,
		onOpenSettings,
		onHistoryNavigate,
		annotationPlacementActive = false,
		onAnnotationPlacementChange = () => {},
		onAnnotationPlace = () => {}
	}: {
		magick: MagickState;
		history: HistoryState;
		presets: PresetsState;
		guard: ReplaceGuardState;
		activeSection?: EditorSection;
		viewport?: ReturnType<typeof CanvasViewport> | null;
		onProcess: () => void;
		onReset: () => void;
		onDownload: () => void;
		onUndo: () => void;
		onRedo: () => void;
		onReplace: (file: File) => Promise<void>;
		onClose: () => void;
		onOpenSettings: () => void;
		onHistoryNavigate?: (message: string) => void;
		annotationPlacementActive?: boolean;
		onAnnotationPlacementChange?: (active: boolean) => void;
		onAnnotationPlace?: (placement: import('$lib/annotation-utils').AnnotationPlacement) => void;
	} = $props();

	let fileInputEl = $state<HTMLInputElement | null>(null);
	let panelOpen = $state(false);
	let errorOpen = $state(false);
	let viewportZoom = $state(100);
	let isComparing = $state(false);
	let splitMode = $state(false);

	// Viewport ref
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
			magick.hasError = true;
			magick.errorMessage = 'Could not load sample image';
		}
	}

	function togglePanel() {
		panelOpen = !panelOpen;
	}

	function onViewportStateChange(st: { zoom: number }) {
		viewportZoom = st.zoom;
	}

	let cropInitialRect = $derived.by(() =>
		computeCropPreview(magick.settings, magick.originalWidth, magick.originalHeight)
	);

	// Close the bottom sheet so the crop overlay is visible on the canvas.
	$effect(() => {
		if (magick.cropMode) panelOpen = false;
	});

	// Confirm dialog state
	let confirmOpen = $derived(guard.pending != null);
	let currentImageName = $derived(magick.originalName);
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
		if (magick.hasUnsavedEdits) {
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
		viewport?.pressCompareDown();
		isComparing = viewport?.isCompareActive() ?? false;
	}
	function handleCompareEnd() {
		viewport?.pressCompareUp();
		isComparing = viewport?.isCompareActive() ?? false;
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
	accept={IMAGE_FILE_ACCEPT}
	onchange={onFileInputChange}
	class="hidden"
/>

<div class="mobile-layout">
	<!-- Full-screen canvas -->
	<div class="mobile-canvas">
		<CanvasViewport
			bind:this={viewport}
			originalImageUrl={magick.originalImageUrl}
			originalPreviewData={magick.originalPreviewData}
			originalWidth={magick.originalWidth}
			originalHeight={magick.originalHeight}
			originalPreviewWidth={magick.originalPreviewWidth}
			originalPreviewHeight={magick.originalPreviewHeight}
			originalPreviewLoading={magick.originalPreviewLoading}
			originalPreviewFull={magick.originalPreviewFull}
			processedImageUrl={magick.processedImageUrl}
			processedPreviewUrl={magick.processedPreviewUrl}
			processedWidth={magick.processedWidth}
			processedHeight={magick.processedHeight}
			processedPreviewData={magick.processedPreviewData}
			processedPreviewWidth={magick.processedPreviewWidth}
			processedPreviewHeight={magick.processedPreviewHeight}
			originalPreviewFailed={magick.originalPreviewFailed}
			isLoading={magick.isLoading}
			wasmLoaded={magick.wasmLoaded}
			magickSettings={magick.settings}
			annotationMetrics={magick.annotationTextMetrics}
			{annotationPlacementActive}
			annotationMenuActive={activeSection === 'annotate'}
			currentProcessingStep={magick.currentProcessingStep}
			cropActive={magick.cropMode}
			cropAspectRatio={magick.cropAspectRatio}
			initialCrop={magick.cropSelection ?? cropInitialRect}
			onBrowse={openFilePicker}
			onRequestOriginalFullPreview={() => magick.renderOriginalPreview(true)}
			onOriginalImageError={() => magick.handleOriginalImageError()}
			{onSelectSample}
			{onAnnotationPlace}
			{onAnnotationPlacementChange}
			onStateChange={onViewportStateChange}
			onCropConfirm={(crop) => magick.confirmCrop(crop)}
			onCropCancel={() => magick.cancelCrop()}
			onCropChange={(crop) => (magick.cropSelection = crop)}
			onCropAspectRatioChange={(preset) => {
				magick.cropAspectRatio = preset;
			}}
		/>
	</div>

	<!-- Floating toolbar -->
	{#if !magick.cropMode}
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
				{onOpenSettings}
			/>
		</div>
	{/if}

	<!-- Bottom sheet panel -->
	<MobilePanel
		bind:open={panelOpen}
		{magick}
		{history}
		{presets}
		bind:activeSection
		{annotationPlacementActive}
		{onAnnotationPlacementChange}
		{onProcess}
		{onDownload}
		onClearRequest={onClearHistoryRequest}
		onNavigate={onHistoryNavigate}
		onClose={() => (panelOpen = false)}
	/>
</div>

<ErrorDialog {magick} bind:open={errorOpen} onRetry={onProcess} />

<ConfirmDialog
	bind:open={confirmOpen}
	fileName={currentImageName}
	kind={confirmKind}
	hasUnsavedEdits={magick.hasUnsavedEdits}
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
