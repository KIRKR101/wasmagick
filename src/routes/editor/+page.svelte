<script lang="ts">
	import { onMount } from 'svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import MobileAppShell from '$lib/components/MobileAppShell.svelte';
	import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
	import SettingsOverlay from '$lib/components/SettingsOverlay.svelte';
	import { useMagick, DEFAULT_SETTINGS } from '$lib/useMagick.svelte';
	import { useHistory } from '$lib/hooks/useHistory.svelte';
	import { usePresets } from '$lib/hooks/usePresets.svelte';
	import { useReplaceGuard, installClipboardPaste } from '$lib/hooks/useReplaceGuard.svelte';
	import { MOBILE_BREAKPOINT } from '$lib/constants.js';
	import { getClutPresets, getInterpolationOptions } from '$lib/luts';
	import { takePendingFile } from '$lib/pending-drop';
	import { resolveInitialTheme } from '$lib/theme';
	import { usesShortcutModifier } from '$lib/shortcuts';
	import { toast } from '$lib/components/ui/sonner';
	import type { EditorSection } from '$lib/editor-types';
	import type { AnnotationPlacement } from '$lib/annotation-utils';

	const magick = useMagick();
	const history = useHistory();
	const presets = usePresets();
	const guard = useReplaceGuard();

	let debugMode = $state(false);
	let globalDragging = $state(false);
	let showShortcuts = $state(false);
	let settingsOpen = $state(false);
	let activeSection = $state<EditorSection>('geometry');
	let isMobile = $state(false);
	let annotationPlacementActive = $state(false);
	installClipboardPaste(guard, replaceImage);

	$effect(() => {
		if (activeSection !== 'annotate') annotationPlacementActive = false;
	});

	$effect(() => {
		// Track the annotation inputs here so the viewport can use metrics from
		// the same ImageMagick engine that renders the final text.
		const metricsKey = `${magick.nativeAvailable ? 'native' : 'wasm'}\u0000${magick.settings.annotateFontFamily}\u0000${magick.settings.annotateFontSize[0]}\u0000${magick.settings.annotateAngle[0]}\u0000${magick.settings.annotateText}`;
		const timer = setTimeout(() => {
			void magick.refreshAnnotationTextMetrics(metricsKey);
		}, 120);
		return () => clearTimeout(timer);
	});

	function showNotice(message: string, canReveal = false, duration = 2400): void {
		toast(message, {
			duration,
			action: canReveal ? { label: 'SHOW IN FOLDER', onClick: revealSavedFile } : undefined
		});
	}

	$effect(() => {
		const base = document.title.replace(/~$/, '');
		document.title = magick.isLoading ? `${base}~` : base;
	});

	onMount(() => {
		if (!window.wasmagick) {
			window.wasmagickSetDebug = (enabled = true) => (debugMode = enabled);
		}
		const mql = window.matchMedia(MOBILE_BREAKPOINT);
		isMobile = mql.matches;
		const handler = (e: MediaQueryListEvent) => (isMobile = e.matches);
		mql.addEventListener('change', handler);
		return () => {
			mql.removeEventListener('change', handler);
			delete window.wasmagickSetDebug;
		};
	});

	let viewport: import('$lib/components/CanvasViewport.svelte').default | null = $state(null);

	// History label generator: a short description of the most recent change.
	function describeSettings(): string {
		const s = magick.settings;
		const parts: string[] = [];
		// Geometry
		if (s.cropX != null || s.cropY != null || s.cropW || s.cropH) {
			if (s.cropX != null) {
				parts.push(`Crop ${s.cropW ?? '?'}×${s.cropH ?? '?'} @${s.cropX},${s.cropY}`);
			} else {
				parts.push(`Crop ${s.cropW ?? 'A'}×${s.cropH ?? 'A'}`);
			}
		}
		if (s.resizeW || s.resizeH) parts.push(`Resize ${s.resizeW ?? 'A'}×${s.resizeH ?? 'A'}`);
		if (s.rotate !== '0') parts.push(`Rotate ${s.rotate}°`);
		if (s.flip) parts.push('Flip');
		if (s.flop) parts.push('Flop');
		if (s.autoOrient) parts.push('Auto-Orient');
		if (s.trimEdges) parts.push('Trim');
		if (s.shaveX != null || s.shaveY != null) {
			parts.push(`Shave ${s.shaveX ?? '0'}×${s.shaveY ?? '0'}`);
		}
		if (s.deskewThreshold[0] > 0) {
			parts.push('Deskew');
			parts.push(s.deskewAutoCrop ? 'Auto Crop' : 'No AutoCrop');
		}
		if (s.extentW || s.extentH) parts.push('Canvas');
		if (s.borderSize[0] > 0) parts.push(`Border ${s.borderSize[0]}px`);
		// Color
		if (s.brightness[0] !== 100) parts.push(`Brightness ${s.brightness[0]}%`);
		if (s.saturation[0] !== 100) parts.push(`Saturation ${s.saturation[0]}%`);
		if (s.hue[0] !== 100) parts.push(`Hue ${s.hue[0]}%`);
		if (s.contrast[0] !== 0) parts.push(`Contrast ${s.contrast[0]}`);
		if (s.normalizeImage) parts.push('Normalize');
		if (s.autoLevel) parts.push('AutoLevel');
		if (s.autoGamma) parts.push('AutoGamma');
		const levelChs = ['All', 'Red', 'Green', 'Blue'] as const;
		const levelParts: string[] = [];
		for (const ch of levelChs) {
			const bp = s.levelBlackpoint[ch][0];
			const wp = s.levelWhitepoint[ch][0];
			const gm = s.levelGamma[ch][0];
			if (bp !== 0 || wp !== 100 || gm !== 1.0) levelParts.push(`${ch} ${bp}/${wp}/${gm}`);
		}
		if (levelParts.length > 0) parts.push(`Levels ${levelParts.join(' | ')}`);
		if (
			s.levelColorsBlack !== '#000000' ||
			s.levelColorsWhite !== '#ffffff' ||
			s.levelColorsInverse
		) {
			parts.push(
				`LvlColors ${s.levelColorsBlack}→${s.levelColorsWhite}${s.levelColorsInverse ? ' inv' : ''}`
			);
		}
		if (s.thresholdPercentage[0] !== 50)
			parts.push(
				`Threshold ${s.thresholdPercentage[0]}%${s.thresholdChannels !== 'All' ? ` ${s.thresholdChannels}` : ''}`
			);
		if (s.autoThreshold !== 'Off') parts.push(`AutoThreshold ${s.autoThreshold}`);
		if (s.blackThreshold[0] > 0) parts.push(`BlackThresh ${s.blackThreshold[0]}%`);
		if (s.whiteThreshold[0] < 100) parts.push(`WhiteThresh ${s.whiteThreshold[0]}%`);
		if (s.claheXTiles[0] > 0) parts.push(`CLAHE ${s.claheXTiles[0]}×${s.claheYTiles[0]}`);
		if (s.sigmoidalContrast[0] !== 0)
			parts.push(
				`Sigmoidal ${s.sigmoidalContrast[0]}@${s.sigmoidalMidpoint[0]}${s.sigmoidalChannels !== 'All' ? ` ${s.sigmoidalChannels}` : ''}`
			);
		if (s.colorSpace !== 'RGB') parts.push(s.colorSpace);
		// Filters
		if (s.effect !== 'none') parts.push(s.effect);
		if (s.clutMap !== 'identity') {
			const preset = getClutPresets().find((p) => p.id === s.clutMap);
			parts.push(`LUT: ${preset?.label ?? s.clutMap}`);
			const interp = getInterpolationOptions().find((o) => o.value === s.clutInterpolation);
			if (interp && s.clutInterpolation !== 'catrom') parts.push(interp.label);
		}
		if (s.blur[0] > 0) parts.push(`Blur ${s.blur[0]}`);
		if (s.sharpen[0] > 0) parts.push(`Sharpen ${s.sharpen[0]}`);
		if (s.gaussianBlurRadius[0] > 0) parts.push(`GaussBlur ${s.gaussianBlurRadius[0]}`);
		if (s.motionBlurRadius[0] > 0)
			parts.push(`MotionBlur ${s.motionBlurRadius[0]}°${s.motionBlurAngle[0]}`);
		if (s.addNoiseType !== 'Off') parts.push(`Noise ${s.addNoiseType}`);
		if (s.adaptiveSharpenRadius[0] > 0) parts.push(`AdptSharpen ${s.adaptiveSharpenRadius[0]}`);
		if (s.adaptiveBlurRadius[0] > 0) parts.push(`AdptBlur ${s.adaptiveBlurRadius[0]}`);
		if (s.quantizeColors[0] > 0) {
			parts.push(`Quantize ${s.quantizeColors[0]} colors`);
			if (s.quantizeTreeDepth[0] > 0) parts.push(`TreeDepth ${s.quantizeTreeDepth[0]}`);
			if (s.ditherMethod !== 'Riemersma')
				parts.push(s.ditherMethod === 'No' ? 'No dither' : s.ditherMethod);
			if (s.quantizeColorSpace !== 'sRGB') parts.push(`CS: ${s.quantizeColorSpace}`);
		}
		// Export
		if (s.imageFormat !== DEFAULT_SETTINGS.imageFormat) parts.push(s.imageFormat);
		if (s.quality[0] !== DEFAULT_SETTINGS.quality[0]) parts.push(`Quality ${s.quality[0]}%`);
		if (s.stripMeta) parts.push('Strip Meta');
		// Annotate
		if (s.annotateText?.trim()) parts.push(`Text "${s.annotateText.slice(0, 15)}"`);
		if (s.annotateFontSize[0] !== 24) parts.push(`${s.annotateFontSize[0]}pt`);
		if (s.annotateAngle[0] !== 0) parts.push(`${s.annotateAngle[0]}°`);
		return parts.length ? parts.join(' · ') : 'Processed';
	}

	async function handleUndo(): Promise<void> {
		const target = history.undoTargetLabel;
		if (!target) return;
		await history.undo(magick);
		showNotice(`Undid - ${target}`);
	}

	async function handleRedo(): Promise<void> {
		const target = history.redoTargetLabel;
		if (!target) return;
		await history.redo(magick);
		showNotice(`Redid - ${target}`);
	}

	function processCurrent() {
		if (!magick.sourceBytes) return;
		magick.processImage(debugMode, () => {
			// Push to history after a successful process.
			void history.pushFromMagick(magick, describeSettings());
			// Defer the reset so the new processed image has time to decode
			// and expose its naturalWidth/Height to fitImageToScreen.
			setTimeout(() => viewport?.resetView(), 100);
		});
	}

	function cancelCurrent() {
		if (!magick.isLoading) return;
		magick.cancelProcessing();
		showNotice('Processing cancelled');
	}

	function handleAnnotationPlace(placement: AnnotationPlacement): void {
		magick.settings.annotateGravity = placement.gravity;
		magick.settings.annotateOffsetX = placement.offsetX;
		magick.settings.annotateOffsetY = placement.offsetY;
	}

	/** Replace the current image (called by the replace guard after confirmation). */
	async function replaceImage(file: File): Promise<void> {
		annotationPlacementActive = false;
		const ok = await magick.setSourceFile(file);
		if (ok) {
			history.clear();
			await history.resetToOriginal(magick);
			setTimeout(() => viewport?.fitImageToScreen(), 100);
		}
	}

	/** Close the current image (called by the replace guard after confirmation). */
	function closeCurrent(): void {
		annotationPlacementActive = false;
		history.clear();
		magick.clearSource();
	}

	/** Download the processed result and mark it saved in history. */
	async function downloadCurrent(): Promise<void> {
		if (!magick.processedImageUrl) return;
		const stale = magick.isStale;
		const saved = await magick.downloadImage();
		if (saved) {
			history.markCurrentSaved();
			if (window.wasmagick) {
				showNotice(
					stale ? 'Image saved, settings changed since preview' : 'Image saved',
					true,
					5000
				);
			} else {
				showNotice(stale ? 'Exported last preview, settings changed' : 'Image exported');
			}
		} else {
			showNotice('Could not save image');
		}
	}

	function revealSavedFile(): void {
		window.wasmagick?.revealSavedFile();
	}

	function handleKeydown(e: KeyboardEvent) {
		// While the settings overlay is open the editor behind it stays
		// mounted but must not react to shortcuts (the overlay handles Escape).
		if (settingsOpen) return;
		const cmdOrCtrl = usesShortcutModifier(e);
		const inField =
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement;

		// Escape cancels an in-flight process run (annotation placement and
		// crop overlays handle their own Escape first via the viewport), but
		// never while typing in a field, where Escape means blur/dismiss.
		if (e.key === 'Escape' && magick.isLoading && !annotationPlacementActive && !inField) {
			e.preventDefault();
			cancelCurrent();
			return;
		}

		if (cmdOrCtrl && e.key === 'Enter') {
			e.preventDefault();
			processCurrent();
			return;
		}

		if (inField) return;

		// Undo / Redo
		if (cmdOrCtrl && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
			e.preventDefault();
			void handleUndo();
			return;
		}
		if (cmdOrCtrl && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
			e.preventDefault();
			void handleRedo();
			return;
		}
		if (cmdOrCtrl && !e.shiftKey && (e.key === 'y' || e.key === 'Y')) {
			e.preventDefault();
			void handleRedo();
			return;
		}

		if (cmdOrCtrl && (e.key === 's' || e.key === 'S')) {
			e.preventDefault();
			downloadCurrent();
		} else if (window.wasmagick && cmdOrCtrl && (e.key === 'o' || e.key === 'O')) {
			e.preventDefault();
			window.wasmagick.openImage();
		} else if (window.wasmagick && cmdOrCtrl && (e.key === 'w' || e.key === 'W')) {
			e.preventDefault();
			guard.requestClose(closeCurrent);
		} else if (cmdOrCtrl && e.key === '0') {
			e.preventDefault();
			viewport?.resetView();
		} else if (cmdOrCtrl && e.key === '=') {
			e.preventDefault();
			viewport?.zoomIn();
		} else if (cmdOrCtrl && e.key === '-') {
			e.preventDefault();
			viewport?.zoomOut();
		} else if (!cmdOrCtrl && (e.key === 'b' || e.key === 'B')) {
			e.preventDefault();
			if (magick.processedImageUrl) viewport?.toggleSplitCompare();
			else showNotice('Process an image first to compare');
		} else if (!cmdOrCtrl && (e.key === 'v' || e.key === 'V')) {
			// Paste shortcut hint: the global paste listener handles actual paste.
			// 'V' alone triggers the file picker as an upload shortcut.
			e.preventDefault();
			document.querySelector<HTMLInputElement>('input[type=file]')?.click();
		} else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
			e.preventDefault();
			magick.toggleCropMode();
		} else if (e.altKey && e.key === '1') {
			e.preventDefault();
			activeSection = 'geometry';
		} else if (e.altKey && e.key === '2') {
			e.preventDefault();
			activeSection = 'color';
		} else if (e.altKey && e.key === '3') {
			e.preventDefault();
			activeSection = 'filters';
		} else if (e.altKey && e.key === '4') {
			e.preventDefault();
			activeSection = 'annotate';
		} else if (e.altKey && e.key === '5') {
			e.preventDefault();
			activeSection = 'export';
		} else if (e.altKey && e.key === '6') {
			e.preventDefault();
			activeSection = 'presets';
		} else if (e.altKey && e.key === '7') {
			e.preventDefault();
			activeSection = 'history';
		} else if (cmdOrCtrl && e.shiftKey && (e.key === '?' || e.key === '/')) {
			e.preventDefault();
			showShortcuts = !showShortcuts;
		}
	}

	async function handleGlobalDrop(e: DragEvent) {
		e.preventDefault();
		globalDragging = false;
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			if (files.length > 1) {
				showNotice(`Only one image at a time, opening the first of ${files.length}`);
			}
			guard.requestReplace(files[0], replaceImage);
		}
	}

	onMount(async () => {
		resolveInitialTheme();

		presets.load();
		guard.install(magick, history);

		// Native ImageMagick handles ordinary images. RAW falls back to WASM on
		// bundles built without LibRaw (notably the stock Linux/Windows builds).
		const native = await magick.initNative();
		const needsWasm = !native || !magick.nativeRawAvailable;
		if (needsWasm) {
			magick.initWorker();
		}

		const pendingFile = takePendingFile();
		if (pendingFile) {
			await replaceImage(pendingFile);
		}

		if (needsWasm) {
			await magick.initWasm(debugMode);
		}

		if ('serviceWorker' in navigator) {
			navigator.serviceWorker.addEventListener('message', (event) => {
				if (event.data?.type === 'SHARED_IMAGE' && event.data?.file) {
					const { name, type, data } = event.data.file;
					const blob = new Blob([new Uint8Array(data)], { type });
					const file = new File([blob], name, { type });
					replaceImage(file);
				}
			});
		}

		if (window.wasmagick) {
			window.wasmagick.onOpenFile(({ name, type, data }) => {
				guard.requestReplace(new File([data], name, { type }), replaceImage);
			});
			await window.wasmagick.markReady();
		}
	});

	$effect(() => {
		if (!window.wasmagick) return;
		window.wasmagick.updateMenuState({
			hasImage: magick.originalImageUrl != null,
			hasProcessedImage: magick.processedImageUrl != null,
			hasUnsavedEdits: magick.hasUnsavedEdits,
			canUndo: history.canUndo,
			canRedo: history.canRedo,
			fileName: magick.originalImageUrl ? magick.originalName : ''
		});
	});
</script>

<svelte:window onkeydown={handleKeydown} />
<svelte:document
	ondragstart={(e) => {
		if (!e.dataTransfer?.types.includes('Files')) {
			e.preventDefault();
		}
	}}
	ondragover={(e) => {
		e.preventDefault();
		if (e.dataTransfer?.types.includes('Files')) {
			globalDragging = true;
		}
	}}
	ondragleave={(e) => {
		if (
			!e.relatedTarget ||
			!(e.relatedTarget instanceof Node && document.documentElement.contains(e.relatedTarget))
		) {
			globalDragging = false;
		}
	}}
	ondrop={handleGlobalDrop}
/>

{#if globalDragging}
	<div
		class="pointer-events-none fixed inset-0 z-50 flex animate-in items-center justify-center bg-background/40 backdrop-blur-[2px] fade-in-0"
	>
		<p class="font-mono text-xs tracking-wider text-foreground uppercase">Drop your image here</p>
	</div>
{/if}

{#if isMobile}
	<MobileAppShell
		{magick}
		{history}
		{presets}
		{guard}
		bind:activeSection
		bind:viewport
		{annotationPlacementActive}
		onAnnotationPlacementChange={(active) => (annotationPlacementActive = active)}
		onAnnotationPlace={handleAnnotationPlace}
		onProcess={processCurrent}
		onCancel={cancelCurrent}
		onReset={() => magick.resetSettings()}
		onDownload={downloadCurrent}
		onUndo={handleUndo}
		onRedo={handleRedo}
		onHistoryNavigate={(message) => showNotice(message)}
		onReplace={replaceImage}
		onClose={closeCurrent}
		onOpenSettings={() => (settingsOpen = true)}
	/>
{:else}
	<AppShell
		{magick}
		{history}
		{presets}
		{guard}
		bind:activeSection
		bind:viewport
		{annotationPlacementActive}
		onAnnotationPlacementChange={(active) => (annotationPlacementActive = active)}
		onAnnotationPlace={handleAnnotationPlace}
		onToggleShortcuts={() => (showShortcuts = !showShortcuts)}
		onProcess={processCurrent}
		onCancel={cancelCurrent}
		onReset={() => magick.resetSettings()}
		onDownload={downloadCurrent}
		onUndo={handleUndo}
		onRedo={handleRedo}
		onHistoryNavigate={(message) => showNotice(message)}
		onReplace={replaceImage}
		onClose={closeCurrent}
		onOpenSettings={() => (settingsOpen = true)}
	/>
{/if}

<KeyboardShortcuts bind:open={showShortcuts} />

<SettingsOverlay bind:open={settingsOpen} />
