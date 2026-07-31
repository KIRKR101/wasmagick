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
		isAnnotateDirty
	} from '$lib/utils';
	import { DEFAULT_SETTINGS } from '$lib/useMagick.svelte';

	let {
		activeSection,
		onSectionChange,
		magick,
		history,
		debugMode = false,
		isDarkMode = false,
		onUploadClick,
		onReset,
		onToggleDebug,
		onToggleTheme,
		onToggleShortcuts,
		onUndo,
		onRedo
	}: {
		activeSection?: EditorSection;
		onSectionChange: (section: EditorSection) => void;
		magick: MagickState;
		history: HistoryState;
		debugMode?: boolean;
		isDarkMode?: boolean;
		onUploadClick: () => void;
		onReset: () => void;
		onToggleDebug?: () => void;
		onToggleTheme?: () => void;
		onToggleShortcuts?: () => void;
		onUndo?: () => void;
		onRedo?: () => void;
	} = $props();

	function sectionSummary(id: EditorSection): string {
		const s = magick.settings;
		switch (id) {
			case 'geometry': {
				const parts: string[] = [];
				if (s.resizeW || s.resizeH) parts.push(`Resize ${s.resizeW ?? 'A'}×${s.resizeH ?? 'A'}`);
				if (s.rotate !== '0') parts.push(`Rotate ${s.rotate}°`);
				if (s.flip) parts.push('Flip');
				if (s.flop) parts.push('Flop');
				if (s.cropX != null || s.cropY != null || s.cropW || s.cropH) {
					if (s.cropX != null) {
						parts.push(
							`Crop ${Math.round(s.cropW ?? 0)}×${Math.round(s.cropH ?? 0)} @${Math.round(s.cropX ?? 0)},${Math.round(s.cropY ?? 0)}`
						);
					} else {
						parts.push(`Crop ${Math.round(s.cropW ?? 0)}×${Math.round(s.cropH ?? 0)}`);
					}
				}
				if (s.trimEdges) parts.push('Trim');
				if (s.borderSize[0] > 0) parts.push(`Border ${s.borderSize[0]}px`);
				if (s.extentW || s.extentH) {
					parts.push(`Extent ${s.extentW ?? 'A'}×${s.extentH ?? 'A'}`);
				}
				if (s.deskewThreshold[0] > 0) parts.push(`Deskew ${s.deskewThreshold[0]}%`);
				if (s.deskewThreshold[0] > 0 && !s.deskewAutoCrop) parts.push('No AutoCrop');
				if (s.autoOrient) parts.push('Auto-Orient');
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
				if (s.thresholdPercentage[0] !== 50) {
					parts.push(`Threshold ${s.thresholdPercentage[0]}%`);
				}
				if (s.sigmoidalContrast[0] !== 0) {
					parts.push(`Sigmoidal ${s.sigmoidalContrast[0]}@${s.sigmoidalMidpoint[0]}`);
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
				if (!s.stripMeta) parts.push('Keep Meta');
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

	let anyDirty = $derived(items.some((item) => item.dirty));
</script>

<aside
	class="z-20 flex w-64 shrink-0 flex-col border-r border-foreground/30 bg-[#f7f7f4] px-4 py-4 font-mono text-sm uppercase dark:border-border dark:bg-background"
	aria-label="Tool rail"
>
	<div class="mb-3 text-muted-foreground">/TOOLS</div>

	<!-- Section buttons -->
	<div class="mb-6 flex flex-col gap-1.5">
		{#each items as item (item.id)}
			<button
				onclick={() => onSectionChange(item.id)}
				class="group flex w-full cursor-pointer items-center justify-between text-left transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {activeSection ===
				item.id
					? 'font-bold text-foreground'
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
						class="w-3 text-center text-xs text-muted-foreground/60 {item.dirty ? '' : 'invisible'}"
						>^</span
					>
					{#if sectionSummary(item.id)}
						{@const lines = sectionSummary(item.id).split(' · ')}
						<span class="group/tip relative">
							<span
								class="block max-w-24 truncate text-[10px] font-normal text-muted-foreground/60 normal-case hover:text-foreground/60"
								>{sectionSummary(item.id)}</span
							>
							<span
								class="pointer-events-none absolute top-1/2 left-full z-50 ml-1.5 -translate-y-1/2 rounded-none border border-foreground/30 bg-[#f7f7f4] px-2 py-1 font-mono text-[11px] text-muted-foreground normal-case opacity-0 shadow-md transition-opacity group-hover/tip:opacity-100 max-md:hidden dark:border-border dark:bg-background"
							>
								<div class="flex flex-col gap-0.5 whitespace-nowrap">
									{#each lines as line}
										<span>{line}</span>
									{/each}
								</div>
							</span>
						</span>
					{/if}
				</div>
			</button>
		{/each}
	</div>

	<div class="mb-3 text-muted-foreground">/ACTIONS</div>
	<div class="flex flex-col gap-1.5">
		<button
			onclick={onUploadClick}
			class="group flex w-full cursor-pointer items-center justify-between text-left text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			<span class="truncate"><span>[ ]</span> <span class="hover:underline">UPLOAD</span></span>
		</button>

		<button
			onclick={onReset}
			disabled={!anyDirty}
			class="group flex w-full cursor-pointer items-center justify-between text-left text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		>
			<span class="truncate"><span>[ ]</span> <span class="hover:underline">RESET ALL</span></span>
		</button>
	</div>

	<div class="mt-auto mb-3 text-muted-foreground">/NAV</div>
	<div class="flex flex-col gap-1.5">
		<div class="mb-2 flex border border-foreground/30">
			<button
				onclick={onUndo}
				disabled={!history.canUndo}
				class="group flex-1 cursor-pointer px-2 py-1 text-center font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				[&lt;] <span class="group-hover:underline">UNDO</span>
			</button>
			<div class="w-px self-stretch bg-foreground/30"></div>
			<button
				onclick={onRedo}
				disabled={!history.canRedo}
				class="group flex-1 cursor-pointer px-2 py-1 text-center font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				<span class="group-hover:underline">REDO</span> [&gt;]
			</button>
		</div>

		<button
			onclick={onToggleDebug}
			class="group flex w-full cursor-pointer items-center justify-between text-left text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {debugMode
				? 'text-foreground'
				: ''}"
		>
			<span class="truncate"
				><span>[{debugMode ? '⚠' : 'B'}]</span> <span class="hover:underline">DEBUG</span></span
			>
		</button>

		<button
			onclick={onToggleTheme}
			class="group flex w-full cursor-pointer items-center justify-between text-left text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			<span class="truncate"
				><span>[{isDarkMode ? '~' : 'O'}]</span> <span class="hover:underline">THEME</span></span
			>
		</button>

		<button
			onclick={onToggleShortcuts}
			class="group flex w-full cursor-pointer items-center justify-between text-left text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			<span class="truncate"><span>[?]</span> <span class="hover:underline">SHORTCUTS</span></span>
		</button>
	</div>
</aside>
