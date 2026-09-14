<script lang="ts">
	import { onMount } from 'svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import MobileAppShell from '$lib/components/MobileAppShell.svelte';
	import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
	import { useMagick } from '$lib/useMagick.svelte';
	import { useHistory } from '$lib/hooks/useHistory.svelte';
	import { usePresets } from '$lib/hooks/usePresets.svelte';
	import { useReplaceGuard, installClipboardPaste } from '$lib/hooks/useReplaceGuard.svelte';
	import { MOBILE_BREAKPOINT } from '$lib/constants.js';
	import { getClutPresets, getInterpolationOptions } from '$lib/luts';
	import { takePendingFile } from '$lib/pending-drop';
	import { applyTheme, resolveInitialTheme } from '$lib/theme';
	import type { EditorSection } from '$lib/editor-types';
	import type { AnnotationPlacement } from '$lib/annotation-utils';

	const magick = useMagick();
	const history = useHistory();
	const presets = usePresets();
	const guard = useReplaceGuard();

	let debugMode = $state(false);
	let isDarkMode = $state(false);
	let globalDragging = $state(false);
	let showShortcuts = $state(false);
	let activeSection = $state<EditorSection>('geometry');
	let isMobile = $state(false);
	let actionNotice = $state('');
	let actionNoticeTimer: ReturnType<typeof setTimeout> | null = null;
	let toastCanReveal = $state(false);
	let annotationPlacementActive = $state(false);

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
		if (actionNoticeTimer) clearTimeout(actionNoticeTimer);
		actionNotice = message;
		toastCanReveal = canReveal;
		actionNoticeTimer = setTimeout(() => {
			actionNotice = '';
			toastCanReveal = false;
		}, duration);
	}

	$effect(() => {
		const base = document.title.replace(/~$/, '');
		document.title = magick.isLoading ? `${base}~` : base;
	});

	onMount(() => {
		const mql = window.matchMedia(MOBILE_BREAKPOINT);
		isMobile = mql.matches;
		const handler = (e: MediaQueryListEvent) => (isMobile = e.matches);
		mql.addEventListener('change', handler);
		return () => mql.removeEventListener('change', handler);
	});

	let viewport: import('$lib/components/CanvasViewport.svelte').default | null = $state(null);

	// History label generator: a short description of the most recent change.
	function describeSettings(): string {
		const s = magick.settings;
		const parts: string[] = [];
		// Geometry
		if (s.resizeW || s.resizeH) parts.push(`Resize ${s.resizeW ?? 'A'}×${s.resizeH ?? 'A'}`);
		if (s.rotate !== '0') parts.push(`Rotate ${s.rotate}°`);
		if (s.flip) parts.push('Flip');
		if (s.flop) parts.push('Flop');
		if (s.cropX != null || s.cropY != null || s.cropW || s.cropH) {
			if (s.cropX != null) {
				parts.push(`Crop ${s.cropW ?? '?'}×${s.cropH ?? '?'} @${s.cropX},${s.cropY}`);
			} else {
				parts.push(`Crop ${s.cropW ?? 'A'}×${s.cropH ?? 'A'}`);
			}
		}
		if (s.shaveX != null || s.shaveY != null) {
			parts.push(`Shave ${s.shaveX ?? '0'}×${s.shaveY ?? '0'}`);
		}
		if (s.trimEdges) parts.push('Trim');
		if (s.borderSize[0] > 0) parts.push(`Border ${s.borderSize[0]}px`);
		if (s.extentW || s.extentH) parts.push('Canvas');
		if (s.deskewThreshold[0] > 0) {
			parts.push('Deskew');
			parts.push(s.deskewAutoCrop ? 'Auto Crop' : 'No AutoCrop');
		}
		if (s.autoOrient) parts.push('Auto-Orient');
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
		if (s.thresholdPercentage[0] !== 50) parts.push(`Threshold ${s.thresholdPercentage[0]}%`);
		if (s.autoThreshold !== 'Off') parts.push(`AutoThreshold ${s.autoThreshold}`);
		if (s.blackThreshold[0] > 0) parts.push(`BlackThresh ${s.blackThreshold[0]}%`);
		if (s.whiteThreshold[0] < 100) parts.push(`WhiteThresh ${s.whiteThreshold[0]}%`);
		if (s.claheXTiles[0] > 0) parts.push(`CLAHE ${s.claheXTiles[0]}×${s.claheYTiles[0]}`);
		if (s.sigmoidalContrast[0] !== 0)
			parts.push(`Sigmoidal ${s.sigmoidalContrast[0]}@${s.sigmoidalMidpoint[0]}`);
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
		if (s.imageFormat !== 'WebP') parts.push(s.imageFormat);
		if (s.quality[0] !== 85) parts.push(`Quality ${s.quality[0]}%`);
		if (s.stripMeta) parts.push('Strip Meta');
		// Annotate
		if (s.annotateText?.trim()) parts.push(`Text "${s.annotateText.slice(0, 15)}"`);
		if (s.annotateFontSize[0] !== 24) parts.push(`${s.annotateFontSize[0]}pt`);
		if (s.annotateAngle[0] !== 0) parts.push(`${s.annotateAngle[0]}°`);
		return parts.length ? parts.join(' · ') : 'Processed';
	}

	function toggleDarkMode() {
		isDarkMode = !isDarkMode;
		applyTheme(isDarkMode);
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
					stale ? 'Image saved — settings changed since preview' : 'Image saved',
					true,
					5000
				);
			} else {
				showNotice(stale ? 'Exported last preview — settings changed' : 'Image exported');
			}
		} else {
			showNotice('Could not save image');
		}
	}

	function revealSavedFile(): void {
		window.wasmagick?.revealSavedFile();
	}

	function handleKeydown(e: KeyboardEvent) {
		const cmdOrCtrl = e.ctrlKey || e.metaKey;

		if (cmdOrCtrl && e.key === 'Enter') {
			e.preventDefault();
			processCurrent();
			return;
		}

		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement
		)
			return;

		// Undo / Redo
		if (cmdOrCtrl && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
			e.preventDefault();
			void history.undo(magick);
			return;
		}
		if (cmdOrCtrl && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
			e.preventDefault();
			void history.redo(magick);
			return;
		}
		if (cmdOrCtrl && !e.shiftKey && (e.key === 'y' || e.key === 'Y')) {
			e.preventDefault();
			void history.redo(magick);
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
			viewport?.toggleSplitCompare();
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
				showNotice(`Only one image at a time — opening the first of ${files.length}`);
			}
			guard.requestReplace(files[0], replaceImage);
		}
	}

	onMount(async () => {
		isDarkMode = resolveInitialTheme();

		presets.load();
		guard.install(magick, history);
		installClipboardPaste(guard, replaceImage);

		// In Electron with a bundled binary, the native engine replaces WASM
		// entirely: no magick.wasm fetch, no worker.
		const native = await magick.initNative();
		if (!native) {
			magick.initWorker();
		}

		const pendingFile = takePendingFile();
		if (pendingFile) {
			await replaceImage(pendingFile);
		}

		if (!native) {
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
		onReset={() => magick.resetSettings()}
		onDownload={downloadCurrent}
		onUndo={() => history.undo(magick)}
		onRedo={() => history.redo(magick)}
		onReplace={replaceImage}
		onClose={closeCurrent}
	/>
{:else}
	<AppShell
		{magick}
		{history}
		{presets}
		{guard}
		{debugMode}
		{isDarkMode}
		bind:activeSection
		bind:viewport
		{annotationPlacementActive}
		onAnnotationPlacementChange={(active) => (annotationPlacementActive = active)}
		onAnnotationPlace={handleAnnotationPlace}
		onToggleDebug={() => (debugMode = !debugMode)}
		onToggleTheme={toggleDarkMode}
		onToggleShortcuts={() => (showShortcuts = !showShortcuts)}
		onProcess={processCurrent}
		onReset={() => magick.resetSettings()}
		onDownload={downloadCurrent}
		onUndo={() => history.undo(magick)}
		onRedo={() => history.redo(magick)}
		onReplace={replaceImage}
		onClose={closeCurrent}
	/>
{/if}

<KeyboardShortcuts bind:open={showShortcuts} />

{#if actionNotice}
	<div
		class="fixed right-4 bottom-12 z-50 flex items-center gap-3 border border-foreground/30 bg-background px-3 py-2 font-mono text-xs text-foreground shadow-sm"
		role="status"
	>
		{actionNotice}
		{#if toastCanReveal}
			<button
				type="button"
				onclick={revealSavedFile}
				class="border-l border-foreground/30 pl-3 text-muted-foreground underline decoration-dashed underline-offset-3 transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			>
				SHOW IN FOLDER
			</button>
		{/if}
	</div>
{/if}
