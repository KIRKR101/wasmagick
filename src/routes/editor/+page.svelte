<script lang="ts">
	import { onMount } from 'svelte';
	import { UploadCloud } from 'lucide-svelte';
	import AppShell from '$lib/components/AppShell.svelte';
	import MobileAppShell from '$lib/components/MobileAppShell.svelte';
	import KeyboardShortcuts from '$lib/components/KeyboardShortcuts.svelte';
	import { useMagick } from '$lib/useMagick.svelte';
	import { useHistory } from '$lib/hooks/useHistory.svelte';
	import { usePresets } from '$lib/hooks/usePresets.svelte';
	import { useReplaceGuard, installClipboardPaste } from '$lib/hooks/useReplaceGuard.svelte';
	import { MOBILE_BREAKPOINT } from '$lib/constants.js';
	import { getClutPresets, getInterpolationOptions } from '$lib/luts';
	import type { EditorSection } from '$lib/editor-types';

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
		if (s.trimEdges) parts.push('Trim');
		if (s.borderSize[0] > 0) parts.push(`Border ${s.borderSize[0]}px`);
		if (s.extentW || s.extentH) parts.push('Canvas');
		if (s.deskewThreshold[0] > 0) parts.push('Deskew');
		if (s.deskewThreshold[0] > 0 && !s.deskewAutoCrop) parts.push('No AutoCrop');
		if (s.autoOrient) parts.push('Auto-Orient');
		// Color
		if (s.brightness[0] !== 100) parts.push(`Brightness ${s.brightness[0]}%`);
		if (s.saturation[0] !== 100) parts.push(`Saturation ${s.saturation[0]}%`);
		if (s.hue[0] !== 100) parts.push(`Hue ${s.hue[0]}%`);
		if (s.contrast[0] !== 0) parts.push(`Contrast ${s.contrast[0]}`);
		if (s.normalizeImage) parts.push('Normalize');
		if (s.autoLevel) parts.push('AutoLevel');
		const levelChs = ['All', 'Red', 'Green', 'Blue'] as const;
		const levelParts: string[] = [];
		for (const ch of levelChs) {
			const bp = s.levelBlackpoint[ch][0];
			const wp = s.levelWhitepoint[ch][0];
			const gm = s.levelGamma[ch][0];
			if (bp !== 0 || wp !== 100 || gm !== 1.0) levelParts.push(`${ch} ${bp}/${wp}/${gm}`);
		}
		if (levelParts.length > 0) parts.push(`Levels ${levelParts.join(' | ')}`);
		if (s.thresholdPercentage[0] !== 50) parts.push(`Threshold ${s.thresholdPercentage[0]}%`);
		if (s.sigmoidalContrast[0] !== 0) parts.push(`Sigmoidal ${s.sigmoidalContrast[0]}@${s.sigmoidalMidpoint[0]}`);
		if (s.colorSpace !== 'RGB') parts.push(s.colorSpace);
		// Filters
		if (s.effect !== 'none') parts.push(s.effect);
		if (s.clutMap !== 'identity') {
			const preset = getClutPresets().find(p => p.id === s.clutMap);
			parts.push(`LUT: ${preset?.label ?? s.clutMap}`);
			const interp = getInterpolationOptions().find(o => o.value === s.clutInterpolation);
			if (interp && s.clutInterpolation !== 'catrom') parts.push(interp.label);
		}
		if (s.blur[0] > 0) parts.push(`Blur ${s.blur[0]}`);
		if (s.sharpen[0] > 0) parts.push(`Sharpen ${s.sharpen[0]}`);
		if (s.adaptiveSharpenRadius[0] > 0) parts.push(`AdptSharpen ${s.adaptiveSharpenRadius[0]}`);
		if (s.adaptiveBlurRadius[0] > 0) parts.push(`AdptBlur ${s.adaptiveBlurRadius[0]}`);
		if (s.quantizeColors[0] > 0) {
			parts.push(`Quantize ${s.quantizeColors[0]} colors`);
			if (s.quantizeTreeDepth[0] > 0) parts.push(`TreeDepth ${s.quantizeTreeDepth[0]}`);
			if (s.ditherMethod !== 'Riemersma') parts.push(s.ditherMethod === 'No' ? 'No dither' : s.ditherMethod);
			if (s.quantizeColorSpace !== 'sRGB') parts.push(`CS: ${s.quantizeColorSpace}`);
		}
		// Export
		if (s.imageFormat !== 'WebP') parts.push(s.imageFormat);
		if (s.quality[0] !== 85) parts.push(`Quality ${s.quality[0]}%`);
		if (!s.stripMeta) parts.push('Keep Meta');
		// Annotate
		if (s.annotateText?.trim()) parts.push(`Text "${s.annotateText.slice(0, 15)}"`);
		if (s.annotateFontSize[0] !== 24) parts.push(`${s.annotateFontSize[0]}pt`);
		if (s.annotateAngle[0] !== 0) parts.push(`${s.annotateAngle[0]}°`);
		return parts.length ? parts.join(' · ') : 'Processed';
	}

	function toggleDarkMode() {
		isDarkMode = !isDarkMode;
		if (isDarkMode) {
			document.documentElement.classList.add('dark');
			localStorage.setItem('theme', 'dark');
		} else {
			document.documentElement.classList.remove('dark');
			localStorage.setItem('theme', 'light');
		}
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

	/** Replace the current image (called by the replace guard after confirmation). */
	async function replaceImage(file: File): Promise<void> {
		const ok = await magick.setSourceFile(file);
		if (ok) {
			history.clear();
			await history.resetToOriginal(magick);
			setTimeout(() => viewport?.fitImageToScreen(), 100);
		}
	}

	/** Close the current image (called by the replace guard after confirmation). */
	function closeCurrent(): void {
		history.clear();
		magick.clearSource();
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

		if (cmdOrCtrl && (e.key === 's' || e.key === 'S')) {
			e.preventDefault();
			magick.downloadImage();
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
			guard.requestReplace(files[0], replaceImage);
		}
	}

	onMount(async () => {
		if (
			localStorage.getItem('theme') === 'dark' ||
			(!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
		) {
			document.documentElement.classList.add('dark');
			isDarkMode = true;
		} else {
			document.documentElement.classList.remove('dark');
			isDarkMode = false;
		}

		presets.load();
		guard.install(magick, history);
		installClipboardPaste(guard, replaceImage);

		magick.initWorker();
		await magick.initWasm(debugMode);

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
	});
</script>

<svelte:window onkeydown={handleKeydown} />
<svelte:document
	ondragover={(e) => {
		e.preventDefault();
		globalDragging = true;
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
		class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm"
	>
		<div
			class="flex flex-col items-center gap-3 rounded-2xl border-2 border-primary bg-background/90 px-10 py-8 shadow-xl"
		>
			<div class="flex size-14 items-center justify-center rounded-full bg-primary/10">
				<UploadCloud class="size-7 text-primary" />
			</div>
			<p class="text-sm font-semibold text-foreground">Drop your image anywhere</p>
		</div>
	</div>
{/if}

{#if isMobile}
	<MobileAppShell
		{magick}
		{history}
		{presets}
		{guard}
		bind:activeSection
		isDragging={globalDragging}
		onProcess={processCurrent}
		onReset={() => magick.resetSettings()}
		onDownload={() => magick.downloadImage()}
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
		isDragging={globalDragging}
		onToggleDebug={() => (debugMode = !debugMode)}
		onToggleTheme={toggleDarkMode}
		onToggleShortcuts={() => (showShortcuts = !showShortcuts)}
		onProcess={processCurrent}
		onReset={() => magick.resetSettings()}
		onDownload={() => magick.downloadImage()}
		onUndo={() => history.undo(magick)}
		onRedo={() => history.redo(magick)}
		onReplace={replaceImage}
	/>
{/if}

<KeyboardShortcuts bind:open={showShortcuts} />
