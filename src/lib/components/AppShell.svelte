<script lang="ts">
	import ToolRail from './ToolRail.svelte';
	import CanvasViewport from './CanvasViewport.svelte';
	import PropertiesPanel from './PropertiesPanel.svelte';
	import StatusBar from './StatusBar.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
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
		debugMode,
		isDarkMode,
		activeSection = $bindable('geometry'),
		viewport = $bindable(null),
		onToggleDebug,
		onToggleTheme,
		onToggleShortcuts,
		onProcess,
		onReset,
		onDownload,
		onUndo,
		onRedo,
		onReplace
	}: {
		magick: MagickState;
		history: HistoryState;
		presets: PresetsState;
		guard: ReplaceGuardState;
		debugMode: boolean;
		isDarkMode: boolean;
		activeSection?: EditorSection;
		viewport?: ReturnType<typeof CanvasViewport> | null;
		onToggleDebug: () => void;
		onToggleTheme: () => void;
		onToggleShortcuts: () => void;
		onProcess: () => void;
		onReset: () => void;
		onDownload: () => void;
		onUndo: () => void;
		onRedo: () => void;
		onReplace: (file: File) => Promise<void>;
	} = $props();

	let fileInputEl = $state<HTMLInputElement | null>(null);

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

	let cropInitialRect = $derived.by(() =>
		computeCropPreview(magick.settings, magick.originalWidth, magick.originalHeight)
	);

	let confirmOpen = $derived(guard.pending != null);
	let pendingName = $derived(guard.pendingFile?.name ?? '');
	let confirmKind: 'close' | 'replace' = $derived(
		guard.pending?.kind === 'close' ? 'close' : 'replace'
	);

	function setSection(section: EditorSection) {
		activeSection = section;
	}

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
</script>

<!-- Hidden file input shared by rail upload + browse -->
<input
	bind:this={fileInputEl}
	type="file"
	accept="image/*"
	onchange={onFileInputChange}
	class="hidden"
/>

<div class="flex h-screen max-h-screen w-full flex-col overflow-hidden bg-background">
	<div class="flex min-h-0 flex-1">
		<ToolRail
			{magick}
			{history}
			{debugMode}
			{isDarkMode}
			{activeSection}
			onSectionChange={setSection}
			onUploadClick={openFilePicker}
			onReset={onResetRequest}
			{onToggleDebug}
			{onToggleTheme}
			{onToggleShortcuts}
			{onUndo}
			{onRedo}
		/>

		<div class="hidden shrink-0 md:block" style="width: var(--panel-default);">
			<PropertiesPanel
				{magick}
				{history}
				{presets}
				{activeSection}
				{onProcess}
				{onDownload}
				onClearRequest={onClearHistoryRequest}
			/>
		</div>

		<div class="min-w-0 flex-1">
			<CanvasViewport
				bind:this={viewport}
				originalImageUrl={magick.originalImageUrl}
				processedImageUrl={magick.processedImageUrl}
				isLoading={magick.isLoading}
				wasmLoaded={magick.wasmLoaded}
				magickSettings={magick.settings}
				currentProcessingStep={magick.currentProcessingStep}
				cropActive={magick.cropMode}
				cropAspectRatio={magick.cropAspectRatio}
				initialCrop={magick.cropSelection ?? cropInitialRect}
				onBrowse={openFilePicker}
				{onSelectSample}
				onCropConfirm={(crop) => magick.confirmCrop(crop)}
				onCropCancel={() => magick.cancelCrop()}
				onCropChange={(crop) => (magick.cropSelection = crop)}
				onCropAspectRatioChange={(preset) => {
					magick.cropAspectRatio = preset;
				}}
			/>
		</div>
	</div>

	<StatusBar {magick} isDirty={guard.isDirty} />
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
