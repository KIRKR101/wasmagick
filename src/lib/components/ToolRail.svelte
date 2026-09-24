<script lang="ts">
	import type { EditorSection, RailItem } from '$lib/editor-types';
	import type { MagickState } from '$lib/useMagick.svelte';
	import type { HistoryState } from '$lib/hooks/useHistory.svelte';
	import { getClutPresets, getInterpolationOptions } from '$lib/luts';
	import {
		isGeoDirty,
		isColorDirty,
		isFiltersDirty,
		isExportDirty,
		isAnnotateDirty,
		isSettingsDirty,
		formatBytes,
		formatDimensions
	} from '$lib/utils';
	import { DEFAULT_SETTINGS } from '$lib/useMagick.svelte';
	import HoverTooltip from './controls/HoverTooltip.svelte';
	import TruncatedText from './controls/TruncatedText.svelte';
	import UndoRedoButtons from './controls/UndoRedoButtons.svelte';
	import { shortcutModifier } from '$lib/shortcuts';
	import Keyboard from 'phosphor-svelte/lib/Keyboard';
	import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';
	import GearSix from 'phosphor-svelte/lib/GearSix';
	import UploadSimple from 'phosphor-svelte/lib/UploadSimple';
	import X from 'phosphor-svelte/lib/X';

	let {
		activeSection,
		onSectionChange,
		magick,
		history,
		onUploadClick,
		onReset,
		onClose,
		onToggleShortcuts,
		onOpenSettings,
		onUndo,
		onRedo
	}: {
		activeSection?: EditorSection;
		onSectionChange: (section: EditorSection) => void;
		magick: MagickState;
		history: HistoryState;
		onUploadClick: () => void;
		onReset: () => void;
		onClose: () => void;
		onToggleShortcuts?: () => void;
		onOpenSettings: () => void;
		onUndo: () => void;
		onRedo: () => void;
	} = $props();

	let originalDimensions = $derived(formatDimensions(magick.originalWidth, magick.originalHeight));
	let processedDimensions = $derived(
		formatDimensions(magick.processedWidth, magick.processedHeight)
	);

	function sectionSummary(id: EditorSection): string {
		const s = magick.settings;
		switch (id) {
			case 'geometry': {
				const parts: string[] = [];
				if (s.cropX != null || s.cropY != null || s.cropW || s.cropH) {
					if (s.cropX != null) {
						parts.push(
							`Crop ${Math.round(s.cropW ?? 0)}×${Math.round(s.cropH ?? 0)} @${Math.round(s.cropX ?? 0)},${Math.round(s.cropY ?? 0)}`
						);
					} else {
						parts.push(`Crop ${Math.round(s.cropW ?? 0)}×${Math.round(s.cropH ?? 0)}`);
					}
				}
				if (s.resizeW || s.resizeH) parts.push(`Resize ${s.resizeW ?? 'A'}×${s.resizeH ?? 'A'}`);
				if (s.rotate !== '0') parts.push(`Rotate ${s.rotate}°`);
				if (s.flip) parts.push('Flip');
				if (s.flop) parts.push('Flop');
				if (!s.autoOrient) parts.push('Auto-Orient Off');
				if (s.trimEdges) parts.push('Trim');
				if (s.shaveX != null || s.shaveY != null) {
					parts.push(`Shave ${s.shaveX ?? '0'}×${s.shaveY ?? '0'}`);
				}
				if (s.deskewThreshold[0] > 0) {
					parts.push(`Deskew ${s.deskewThreshold[0]}%`);
					parts.push(s.deskewAutoCrop ? 'Auto Crop' : 'No AutoCrop');
				}
				if (s.extentW || s.extentH) {
					parts.push(`Extent ${s.extentW ?? 'A'}×${s.extentH ?? 'A'}`);
				}
				if (s.borderSize[0] > 0) parts.push(`Border ${s.borderSize[0]}px`);
				return parts.join(' · ');
			}
			case 'color': {
				const parts: string[] = [];
				if (s.brightness[0] !== 100) parts.push(`Brightness ${s.brightness[0]}%`);
				if (s.saturation[0] !== 100) parts.push(`Saturation ${s.saturation[0]}%`);
				if (s.hue[0] !== 100) parts.push(`Hue ${s.hue[0]}%`);
				if (s.contrast[0] !== 0) parts.push(`Contrast ${s.contrast[0]}`);
				if (s.normalizeImage) parts.push('Normalize');
				if (s.autoLevel) parts.push('Auto-Level');
				if (s.autoGamma) parts.push('Auto-Gamma');
				const levelParts: string[] = [];
				for (const ch of ['All', 'Red', 'Green', 'Blue'] as const) {
					const bp = s.levelBlackpoint[ch][0];
					const wp = s.levelWhitepoint[ch][0];
					const gm = s.levelGamma[ch][0];
					if (bp !== 0 || wp !== 100 || gm !== 1.0) {
						levelParts.push(`${ch} ${bp}/${wp}/${gm}`);
					}
				}
				if (levelParts.length > 0) {
					parts.push(`Level ${levelParts.join(' | ')}`);
				}
				if (
					s.levelColorsBlack !== '#000000' ||
					s.levelColorsWhite !== '#ffffff' ||
					s.levelColorsInverse
				) {
					parts.push(
						`LvlColors ${s.levelColorsBlack}→${s.levelColorsWhite}${s.levelColorsInverse ? ' inv' : ''}`
					);
				}
				if (s.thresholdPercentage[0] !== 50) {
					parts.push(
						`Threshold ${s.thresholdPercentage[0]}%${s.thresholdChannels !== 'All' ? ` ${s.thresholdChannels}` : ''}`
					);
				}
				if (s.autoThreshold !== 'Off') {
					parts.push(`Auto-Threshold ${s.autoThreshold}`);
				}
				if (s.blackThreshold[0] > 0) {
					parts.push(`BlackThresh ${s.blackThreshold[0]}%`);
				}
				if (s.whiteThreshold[0] < 100) {
					parts.push(`WhiteThresh ${s.whiteThreshold[0]}%`);
				}
				if (s.claheXTiles[0] > 0) {
					parts.push(`CLAHE ${s.claheXTiles[0]}×${s.claheYTiles[0]}`);
				}
				if (s.sigmoidalContrast[0] !== 0) {
					parts.push(
						`Sigmoidal ${s.sigmoidalContrast[0]}@${s.sigmoidalMidpoint[0]}${s.sigmoidalChannels !== 'All' ? ` ${s.sigmoidalChannels}` : ''}`
					);
				}
				if (s.colorSpace !== 'RGB') parts.push(s.colorSpace);
				return parts.join(' · ');
			}
			case 'filters': {
				const parts: string[] = [];
				if (s.effect !== 'none') {
					parts.push(effectLabel(s.effect));
					switch (s.effect) {
						case 'sepia':
							if (s.sepiaThreshold[0] !== 80) parts.push(`Threshold ${s.sepiaThreshold[0]}%`);
							break;
						case 'charcoal':
							if (s.charcoalIntensity[0] > 0) parts.push(`Intensity ${s.charcoalIntensity[0]}`);
							break;
						case 'cannyEdge':
							parts.push(
								`S${s.cannyEdgeStrength[0]} L${s.cannyEdgeLower[0]} U${s.cannyEdgeUpper[0]}`
							);
							break;
						case 'oilpaint':
							if (s.oilpaintRadius[0] > 0) parts.push(`Radius ${s.oilpaintRadius[0]}`);
							break;
						case 'solarize':
							if (s.solarizeFactor[0] !== 50) parts.push(`Factor ${s.solarizeFactor[0]}%`);
							break;
						case 'bilateralBlur':
							parts.push(`${s.bilateralWidth[0]}×${s.bilateralHeight[0]}`);
							if (s.bilateralIntensitySigma[0] !== 1.5)
								parts.push(`iΣ ${s.bilateralIntensitySigma[0]}`);
							if (s.bilateralSpatialSigma[0] !== 1) parts.push(`sΣ ${s.bilateralSpatialSigma[0]}`);
							break;
					}
				}
				if (s.clutMap !== 'identity') {
					const preset = getClutPresets().find((p) => p.id === s.clutMap);
					parts.push(`LUT: ${preset?.label ?? s.clutMap}`);
					const interp = getInterpolationOptions().find((o) => o.value === s.clutInterpolation);
					if (interp && s.clutInterpolation !== 'catrom') parts.push(interp.label);
				}
				if (s.blur[0] > 0) parts.push(`Blur ${s.blur[0]}`);
				if (s.sharpen[0] > 0) parts.push(`Sharpen ${s.sharpen[0]}`);
				if (s.gaussianBlurRadius[0] > 0) parts.push(`GaussBlur ${s.gaussianBlurRadius[0]}`);
				if (s.motionBlurRadius[0] > 0) {
					parts.push(`MotionBlur ${s.motionBlurRadius[0]}@${s.motionBlurAngle[0]}°`);
				}
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
				return parts.join(' · ');
			}
			case 'export': {
				if (
					s.imageFormat === DEFAULT_SETTINGS.imageFormat &&
					s.quality[0] === DEFAULT_SETTINGS.quality[0] &&
					s.stripMeta === DEFAULT_SETTINGS.stripMeta
				) {
					return '';
				}
				const parts: string[] = [];
				if (s.imageFormat !== DEFAULT_SETTINGS.imageFormat) parts.push(s.imageFormat);
				if (s.quality[0] !== DEFAULT_SETTINGS.quality[0]) parts.push(`Quality ${s.quality[0]}%`);
				if (s.stripMeta) parts.push('Strip Meta');
				return parts.join(' · ');
			}
			case 'annotate': {
				if (!s.annotateText || s.annotateText.trim().length === 0) return '';
				const preview =
					s.annotateText.length > 20 ? s.annotateText.slice(0, 20) + '...' : s.annotateText;
				const parts: string[] = [`"${preview}"`];
				if (s.annotateFontSize[0] !== 24) parts.push(`${s.annotateFontSize[0]}pt`);
				if (s.annotateAngle[0] !== 0) parts.push(`${s.annotateAngle[0]}°`);
				return parts.join(' · ');
			}
			default:
				return '';
		}
	}

	function effectLabel(effect: string): string {
		switch (effect) {
			case 'grayscale':
				return 'Grayscale';
			case 'sepia':
				return 'Sepia';
			case 'charcoal':
				return 'Charcoal';
			case 'negate':
				return 'Negate';
			case 'cannyEdge':
				return 'Canny Edge';
			case 'oilpaint':
				return 'Oil Paint';
			case 'solarize':
				return 'Solarize';
			case 'bilateralBlur':
				return 'Bilateral Blur';
			default:
				return effect;
		}
	}

	const items: RailItem[] = $derived([
		{ id: 'geometry', label: 'GEOMETRY', shortcut: '1', dirty: isGeoDirty(magick.settings) },
		{ id: 'color', label: 'COLOR', shortcut: '2', dirty: isColorDirty(magick.settings) },
		{ id: 'filters', label: 'FILTERS', shortcut: '3', dirty: isFiltersDirty(magick.settings) },
		{ id: 'annotate', label: 'ANNOTATE', shortcut: '4', dirty: isAnnotateDirty(magick.settings) },
		{ id: 'export', label: 'EXPORT', shortcut: '5', dirty: isExportDirty(magick.settings) },
		{ id: 'presets', label: 'PRESETS', shortcut: '6' },
		{ id: 'history', label: 'HISTORY', shortcut: '7' }
	]);

	let anyDirty = $derived(isSettingsDirty(magick.settings));

	function sizeDelta() {
		if (!magick.processedImageUrl || magick.originalImageSize <= 0) return null;
		const m = magick.statsMessage.match(/New Size:\s*([\d.]+)\s*KB(?:\s*\(([-+]?[\d.]+)%\))?/);
		if (!m) return null;
		const kb = parseFloat(m[1]);
		const pct = m[2] != null ? parseFloat(m[2]) : null;
		return { kb, pct };
	}

	let delta = $derived(sizeDelta());
	let undoTip = $derived(
		history.undoTargetLabel
			? `Undo ${history.undoTargetLabel} (${shortcutModifier}+Z)`
			: `Undo (${shortcutModifier}+Z)`
	);
	let redoTip = $derived(
		history.redoTargetLabel
			? `Redo ${history.redoTargetLabel} (${shortcutModifier}+Shift+Z / ${shortcutModifier}+Y)`
			: `Redo (${shortcutModifier}+Shift+Z / ${shortcutModifier}+Y)`
	);
</script>

<aside
	class="z-20 flex w-64 shrink-0 flex-col border-r border-divider bg-chrome px-4 py-4 font-mono text-sm uppercase"
	aria-label="Tool rail"
>
	<div class="mb-3 text-muted-foreground">/TOOLS</div>

	<!-- Section buttons -->
	<div class="mb-6 flex flex-col gap-1.5">
		{#each items as item (item.id)}
			{@const summary = sectionSummary(item.id)}
			<HoverTooltip
				label={summary
					? `${item.label} (Alt+${item.shortcut}) — ${summary}`
					: `${item.label} (Alt+${item.shortcut})`}
				side="right"
				triggerClass="w-full"
			>
				<button
					onclick={() => onSectionChange(item.id)}
					class="group flex w-full cursor-pointer items-center justify-between text-left transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {activeSection ===
					item.id
						? 'font-semibold text-foreground'
						: 'text-muted-foreground'}"
					aria-label="{item.label} (Alt+{item.shortcut})"
					aria-pressed={activeSection === item.id}
				>
					<span class="inline-flex items-center gap-1.5 truncate"
						><span>[{activeSection === item.id ? '*' : ' '}]</span><span class="hover:underline"
							>{item.label}</span
						></span
					>
					<div class="flex shrink-0 items-center gap-1">
						<span
							class="w-3 text-center text-xs text-muted-foreground/60 {item.dirty
								? ''
								: 'invisible'}"
							aria-hidden={item.dirty ? undefined : true}>^</span
						>
						{#if summary}
							<span
								class="block max-w-24 truncate text-[11px] font-normal text-muted-foreground normal-case hover:text-foreground"
								aria-hidden="true">{summary}</span
							>
						{/if}
					</div>
				</button>
			</HoverTooltip>
		{/each}
	</div>

	<div class="mb-3 text-muted-foreground">/ACTIONS</div>
	<div class="flex flex-col gap-1.5">
		<HoverTooltip label="Upload image (V)" triggerClass="w-full">
			<button
				onclick={onUploadClick}
				aria-label="Upload image (V)"
				class="group flex w-full cursor-pointer items-center justify-between text-left text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			>
				<span class="inline-flex items-center gap-1.5 truncate"
					><span class="inline-flex w-[3ch] items-center justify-center"
						><UploadSimple class="size-[1em]" /></span
					>
					<span class="hover:underline">UPLOAD</span></span
				>
			</button>
		</HoverTooltip>

		<HoverTooltip
			label={anyDirty ? 'Reset all settings' : 'Reset all (no changes to reset)'}
			triggerClass="w-full"
		>
			<button
				onclick={onReset}
				disabled={!anyDirty}
				aria-label={anyDirty ? 'Reset all settings' : 'Reset all (no changes to reset)'}
				class="group flex w-full cursor-pointer items-center justify-between text-left text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				<span class="inline-flex items-center gap-1.5 truncate"
					><span class="inline-flex w-[3ch] items-center justify-center"
						><ArrowCounterClockwise class="size-[1em]" /></span
					>
					<span class="hover:underline">RESET ALL</span></span
				>
			</button>
		</HoverTooltip>

		<HoverTooltip
			label={magick.originalImageUrl
				? `Close image (${shortcutModifier}+W)`
				: 'Close (no image open)'}
			triggerClass="w-full"
		>
			<button
				onclick={onClose}
				disabled={!magick.originalImageUrl}
				aria-label={magick.originalImageUrl
					? `Close image (${shortcutModifier}+W)`
					: 'Close (no image open)'}
				class="group flex w-full cursor-pointer items-center justify-between text-left text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				<span class="inline-flex items-center gap-1.5 truncate"
					><span class="inline-flex w-[3ch] items-center justify-center"
						><X class="size-[1em]" /></span
					>
					<span class="hover:underline">CLOSE</span></span
				>
			</button>
		</HoverTooltip>
	</div>

	<div class="mt-auto">
		{#if magick.originalImageUrl}
			<div class="mb-6">
				<div class="mb-3 text-muted-foreground">/FILE</div>
				<div
					class="flex flex-col gap-1.5 border border-divider px-2 py-2 font-mono text-[11px] text-muted-foreground uppercase"
				>
					<div class="border-b border-divider pb-1.5 text-foreground/90">
						<TruncatedText text={magick.originalName} />
					</div>
					<div class="flex justify-between gap-2">
						<span class="shrink-0 text-[11px] text-muted-foreground">DIMS</span>
						<span class="truncate text-foreground/80">
							{#if magick.processedImageUrl && originalDimensions && processedDimensions}
								{originalDimensions}
								<span class="text-muted-foreground/60">→</span>
								{processedDimensions}
							{:else if processedDimensions}
								{processedDimensions}
							{:else}
								{originalDimensions}
							{/if}
						</span>
					</div>
					<div class="flex justify-between gap-2">
						<span class="shrink-0 text-[11px] text-muted-foreground">FORMAT</span>
						<span class="truncate text-foreground/80">
							{#if magick.processedImageFormat}
								{magick.originalImageFormat}
								<span class="text-muted-foreground/60">→</span>
								{magick.processedImageFormat}
							{:else}
								{magick.originalImageFormat}
							{/if}
						</span>
					</div>
					<div class="flex justify-between gap-2">
						<span class="shrink-0 text-[11px] text-muted-foreground">SIZE</span>
						<span class="truncate text-foreground/80">
							{#if delta}
								<span
									class={delta.pct != null && delta.pct < 0
										? 'text-emerald-600 dark:text-emerald-400'
										: 'text-foreground/80'}
								>
									{delta.kb} KB
								</span>
								{#if delta.pct != null}
									<span
										class={delta.pct < 0
											? 'text-emerald-600 dark:text-emerald-400'
											: delta.pct > 0
												? 'text-amber-600 dark:text-amber-400'
												: 'text-muted-foreground'}
									>
										({delta.pct > 0 ? '+' : ''}{delta.pct}%)
									</span>
								{/if}
							{:else}
								{formatBytes(magick.originalImageSize)}
							{/if}
						</span>
					</div>
				</div>
			</div>
		{/if}

		<div class="mb-3 text-muted-foreground">/NAV</div>
		<div class="flex flex-col gap-1.5">
			<UndoRedoButtons
				class="mb-2 min-h-7"
				canUndo={history.canUndo}
				canRedo={history.canRedo}
				{onUndo}
				{onRedo}
				undoLabel={undoTip}
				redoLabel={redoTip}
			/>

			<HoverTooltip
				label={`Keyboard shortcuts (${shortcutModifier}+Shift+?)`}
				triggerClass="w-full"
			>
				<button
					onclick={onToggleShortcuts}
					aria-label={`Keyboard shortcuts (${shortcutModifier}+Shift+?)`}
					class="group flex w-full cursor-pointer items-center justify-between text-left text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				>
					<span class="inline-flex items-center gap-1.5 truncate"
						><span class="inline-flex w-[3ch] items-center justify-center"
							><Keyboard class="size-[1em]" /></span
						>
						<span class="hover:underline">SHORTCUTS</span></span
					>
				</button>
			</HoverTooltip>

			<HoverTooltip label="App settings" triggerClass="w-full">
				<button
					onclick={onOpenSettings}
					aria-label="App settings"
					class="group flex w-full cursor-pointer items-center justify-between text-left text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				>
					<span class="inline-flex items-center gap-1.5 truncate"
						><span class="inline-flex w-[3ch] items-center justify-center"
							><GearSix class="size-[1em]" /></span
						>
						<span class="hover:underline">SETTINGS</span></span
					>
				</button>
			</HoverTooltip>
		</div>
	</div>
</aside>
