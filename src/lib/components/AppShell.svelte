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

	let {
		magick,
		history,
		presets,
		guard,
		debugMode,
		isDarkMode,
		activeSection = $bindable('geometry'),
		viewport = $bindable(null),
		isDragging = false,
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
		isDragging?: boolean;
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
	let viewportZoom = $state(100);

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

	let cropInitialRect = $derived.by(() => {
		const s = magick.settings;
		const { offsetX, offsetY } = cropStepOffset;

		if (s.cropX != null && s.cropY != null && (s.cropW ?? 0) > 0 && (s.cropH ?? 0) > 0) {
			return {
				x: s.cropX - offsetX,
				y: s.cropY - offsetY,
				w: s.cropW!,
				h: s.cropH!
			};
		}
		if (s.cropW != null && s.cropW > 0 && s.cropH != null && s.cropH > 0) {
			const stepW = s.resizeW ?? (magick.originalWidth || 0);
			const stepH = s.resizeH ?? (magick.originalHeight || 0);
			const grav = s.cropGravity;
			let x = 0;
			let y = 0;
			const cw = Math.min(s.cropW, stepW);
			const ch = Math.min(s.cropH, stepH);
			if (grav === 'Center') {
				x = Math.round((stepW - cw) / 2);
				y = Math.round((stepH - ch) / 2);
			} else if (grav === 'Northwest') { x = 0; y = 0; }
			else if (grav === 'North') { x = Math.round((stepW - cw) / 2); y = 0; }
			else if (grav === 'Northeast') { x = stepW - cw; y = 0; }
			else if (grav === 'West') { x = 0; y = Math.round((stepH - ch) / 2); }
			else if (grav === 'East') { x = stepW - cw; y = Math.round((stepH - ch) / 2); }
			else if (grav === 'Southwest') { x = 0; y = stepH - ch; }
			else if (grav === 'South') { x = Math.round((stepW - cw) / 2); y = stepH - ch; }
			else if (grav === 'Southeast') { x = stepW - cw; y = stepH - ch; }
			return {
				x: Math.max(0, x) - offsetX,
				y: Math.max(0, y) - offsetY,
				w: cw,
				h: ch
			};
		}
		return null;
	});

	// The offset of the displayed image's top-left in the crop-step
	// coordinate space (after resize/rotate, before crop in the pipeline).
	let cropStepOffset = $derived.by(() => {
		const s = magick.settings;
		const srcW = magick.originalWidth || 0;
		const srcH = magick.originalHeight || 0;
		const stepW = s.resizeW ?? srcW;
		const stepH = s.resizeH ?? srcH;

		if (s.cropX != null && s.cropY != null) {
			return { offsetX: s.cropX, offsetY: s.cropY, stepW, stepH };
		}
		if (s.cropW != null && s.cropW > 0 && s.cropH != null && s.cropH > 0) {
			const grav = s.cropGravity;
			const cw = Math.min(s.cropW, stepW);
			const ch = Math.min(s.cropH, stepH);
			let ox = 0;
			let oy = 0;
			if (grav === 'Center') {
				ox = Math.round((stepW - cw) / 2);
				oy = Math.round((stepH - ch) / 2);
			} else if (grav === 'Northwest') { ox = 0; oy = 0; }
			else if (grav === 'North') { ox = Math.round((stepW - cw) / 2); oy = 0; }
			else if (grav === 'Northeast') { ox = stepW - cw; oy = 0; }
			else if (grav === 'West') { ox = 0; oy = Math.round((stepH - ch) / 2); }
			else if (grav === 'East') { ox = stepW - cw; oy = Math.round((stepH - ch) / 2); }
			else if (grav === 'Southwest') { ox = 0; oy = stepH - ch; }
			else if (grav === 'South') { ox = Math.round((stepW - cw) / 2); oy = stepH - ch; }
			else if (grav === 'Southeast') { ox = stepW - cw; oy = stepH - ch; }
			return { offsetX: Math.max(0, ox), offsetY: Math.max(0, oy), stepW, stepH };
		}
		return { offsetX: 0, offsetY: 0, stepW, stepH };
	});

	function onViewportStateChange(st: { zoom: number }) {
		viewportZoom = st.zoom;
	}

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
			activeSection={activeSection}
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
			activeSection={activeSection}
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
				originalWidth={magick.originalWidth}
				originalHeight={magick.originalHeight}
				originalFormat={magick.originalImageFormat}
				processedWidth={magick.processedWidth}
				processedHeight={magick.processedHeight}
				processedFormat={magick.processedImageFormat}
				magickSettings={magick.settings}
				currentProcessingStep={magick.currentProcessingStep}
				{isDragging}
				cropActive={magick.cropMode}
				cropAspectRatio={magick.cropAspectRatio}
				initialCrop={cropInitialRect}
				onBrowse={openFilePicker}
				{onSelectSample}
				onStateChange={onViewportStateChange}
				onCropConfirm={(crop) => {
					magick.settings.cropX = cropStepOffset.offsetX + crop.x;
					magick.settings.cropY = cropStepOffset.offsetY + crop.y;
					magick.settings.cropW = crop.w;
					magick.settings.cropH = crop.h;
					magick.cropMode = false;
				}}
				onCropCancel={() => {
					magick.cropMode = false;
				}}
				onCropAspectRatioChange={(preset) => {
					magick.cropAspectRatio = preset;
				}}
			/>
		</div>
	</div>

	<StatusBar {magick} zoomPct={viewportZoom} isDirty={guard.isDirty} />
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