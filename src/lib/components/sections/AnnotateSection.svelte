<script lang="ts">
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectSeparator,
		SelectTrigger
	} from '$lib/components/ui/select/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import type { MagickState } from '$lib/useMagick.svelte';
	import SliderRow from '$lib/components/controls/SliderRow.svelte';
	import ToggleRow from '$lib/components/controls/ToggleRow.svelte';
	import SectionCard from '$lib/components/controls/SectionCard.svelte';
	import {
		registerLocalFont,
		registerLocalFontSource,
		getLocalFonts,
		isFontLoaded
	} from '$lib/fonts';

	let {
		magick,
		annotationPlacementActive = false,
		onAnnotationPlacementChange = () => {}
	} = $props<{
		magick: MagickState;
		annotationPlacementActive?: boolean;
		onAnnotationPlacementChange?: (active: boolean) => void;
	}>();

	const BUILTIN_FONTS = [
		{ value: 'Roboto-Regular', label: 'Roboto' },
		{ value: 'Lato-Regular', label: 'Lato' },
		{ value: 'PT_Serif-Regular', label: 'PT Serif' },
		{ value: 'SpaceMono-Regular', label: 'Space Mono' },
		{ value: 'Pacifico-Regular', label: 'Pacifico' }
	];

	let localFonts = $state<{ value: string; label: string }[]>(getLocalFonts());
	let loadingSystemFonts = $state(false);

	const hasLocalFontAPI =
		typeof window !== 'undefined' &&
		(typeof window.wasmagick?.listSystemFonts === 'function' ||
			typeof window.queryLocalFonts === 'function');

	async function loadSystemFonts() {
		if (!window.wasmagick?.listSystemFonts && !window.queryLocalFonts) return;
		loadingSystemFonts = true;
		try {
			if (window.wasmagick?.listSystemFonts) {
				const fonts = await window.wasmagick.listSystemFonts();
				for (const font of fonts) {
					const label = font.style ? `${font.family} ${font.style}` : font.family;
					registerLocalFontSource(font.postscriptName, label, font.fileName, async () => {
						const result = await window.wasmagick?.readSystemFont(font.postscriptName);
						return result ? new Uint8Array(result.data) : null;
					});
				}
			} else if (window.queryLocalFonts) {
				const fonts = await window.queryLocalFonts();
				for (const font of fonts) {
					if (!font.postscriptName || font.postscriptName === '' || font.postscriptName === '.')
						continue;
					if (isFontLoaded(font.postscriptName)) continue;
					try {
						const blob = await font.blob();
						const data = new Uint8Array(await blob.arrayBuffer());
						const label = font.style ? `${font.family} ${font.style}` : font.family;
						await registerLocalFont(font.postscriptName, data, label);
					} catch (err) {
						console.warn(`Skipping font "${font.family}":`, err);
					}
				}
			}
			localFonts = getLocalFonts();
			if (magick.settings.annotateFontFamily === 'Roboto-Regular' && localFonts.length > 0) {
				magick.settings.annotateFontFamily = localFonts[0].value;
			}
		} catch (err) {
			if ((err as DOMException)?.name !== 'AbortError') {
				console.warn('Local font loading failed:', err);
			}
		} finally {
			loadingSystemFonts = false;
		}
	}

	const fontOptions = $derived([...BUILTIN_FONTS, ...localFonts]);
	const hasLocalFonts = $derived(localFonts.length > 0);

	const GRAVITY_OPTIONS = [
		{ value: 'Center', label: 'Center' },
		{ value: 'Northwest', label: 'Top Left' },
		{ value: 'North', label: 'Top' },
		{ value: 'Northeast', label: 'Top Right' },
		{ value: 'West', label: 'Left' },
		{ value: 'East', label: 'Right' },
		{ value: 'Southwest', label: 'Bottom Left' },
		{ value: 'South', label: 'Bottom' },
		{ value: 'Southeast', label: 'Bottom Right' }
	];
</script>

<div class="space-y-5">
	<SectionCard title="Text" dirty={magick.settings.annotateText?.trim().length > 0}>
		<Input
			type="text"
			bind:value={magick.settings.annotateText}
			placeholder="Enter text to overlay..."
			class="h-9 font-mono text-xs"
		/>
	</SectionCard>

	<SectionCard
		title="Font"
		dirty={magick.settings.annotateFontFamily !== 'Roboto-Regular' ||
			magick.settings.annotateFontSize[0] !== 24 ||
			magick.settings.annotateFontColor !== '#ffffff'}
	>
		<div class="space-y-3">
			<Select type="single" bind:value={magick.settings.annotateFontFamily}>
				<SelectTrigger class="h-9 w-full font-mono text-xs">
					{fontOptions.find((o) => o.value === magick.settings.annotateFontFamily)?.label ??
						magick.settings.annotateFontFamily}
				</SelectTrigger>
				<SelectContent class="max-h-72 max-w-(--bits-select-anchor-width)">
					{#each BUILTIN_FONTS as font (font.value)}
						<SelectItem value={font.value}>{font.label}</SelectItem>
					{/each}
					{#if hasLocalFonts}
						<SelectSeparator />
						{#each localFonts as font (font.value)}
							<SelectItem value={font.value}>{font.label}</SelectItem>
						{/each}
					{/if}
				</SelectContent>
			</Select>
			{#if hasLocalFontAPI}
				<button
					type="button"
					onclick={loadSystemFonts}
					disabled={loadingSystemFonts}
					class="group w-full cursor-pointer border border-foreground/30 px-3 py-1.5 font-mono text-xs transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:cursor-wait disabled:opacity-50"
				>
					{#if loadingSystemFonts}
						[···] <span class="group-hover:underline">LOADING</span>
					{:else if hasLocalFonts}
						[↻] <span class="group-hover:underline">RELOAD</span>
					{:else}
						[+] <span class="group-hover:underline">LOAD SYSTEM FONTS</span>
					{/if}
				</button>
			{/if}
			<div class="flex items-end gap-3">
				<div class="flex-1">
					<SliderRow
						label="Size"
						bind:value={magick.settings.annotateFontSize}
						suffix="pt"
						min={4}
						max={400}
					/>
				</div>
				<div class="flex items-center gap-1.5">
					<div
						class="relative h-7 w-7 shrink-0 overflow-hidden border border-foreground/30 transition-all hover:border-foreground"
					>
						<input
							type="color"
							bind:value={magick.settings.annotateFontColor}
							aria-label="Font color"
							class="absolute inset-0 -top-1/2 -left-1/2 h-[200%] w-[200%] cursor-pointer border-0 p-0"
						/>
					</div>
					<span class="font-mono text-[11px] text-muted-foreground uppercase"
						>{magick.settings.annotateFontColor}</span
					>
				</div>
			</div>
		</div>
	</SectionCard>

	<SectionCard
		title="Position & Rotation"
		dirty={magick.settings.annotateGravity !== 'Center' ||
			magick.settings.annotateOffsetX !== 0 ||
			magick.settings.annotateOffsetY !== 0 ||
			magick.settings.annotateAngle[0] !== 0}
	>
		<div class="space-y-3">
			<div class="border border-dashed border-foreground/30 p-2.5">
				<div class="flex items-center justify-between gap-3">
					<div class="min-w-0">
						<p class="font-mono text-[11px] text-foreground">Place on canvas</p>
						<p class="mt-0.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
							Click the image to set gravity and offset.
						</p>
					</div>
					<button
						type="button"
						disabled={!magick.originalImageUrl}
						onclick={() => onAnnotationPlacementChange(!annotationPlacementActive)}
						aria-pressed={annotationPlacementActive}
						class="shrink-0 cursor-pointer border border-foreground/40 px-2 py-1.5 font-mono text-[11px] tracking-wide text-muted-foreground uppercase transition-colors hover:border-foreground hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 {annotationPlacementActive
							? 'bg-foreground text-background hover:bg-foreground hover:text-background'
							: ''}"
					>
						{annotationPlacementActive ? 'DONE' : 'PLACE'}
					</button>
				</div>
				{#if annotationPlacementActive}
					<p
						class="mt-2 border-t border-dashed border-foreground/20 pt-2 font-mono text-[11px] text-muted-foreground"
					>
						Placement mode on · press Esc to exit
					</p>
				{/if}
			</div>
			<div class="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
				<span class="h-px flex-1 bg-foreground/15"></span>
				<span>or set manually</span>
				<span class="h-px flex-1 bg-foreground/15"></span>
			</div>
			<Select type="single" bind:value={magick.settings.annotateGravity}>
				<SelectTrigger class="h-9 w-full font-mono text-xs">
					{GRAVITY_OPTIONS.find((o) => o.value === magick.settings.annotateGravity)?.label ??
						magick.settings.annotateGravity}
				</SelectTrigger>
				<SelectContent>
					{#each GRAVITY_OPTIONS as opt (opt.value)}
						<SelectItem value={opt.value}>{opt.label}</SelectItem>
					{/each}
				</SelectContent>
			</Select>
			<div class="flex gap-3">
				<div class="flex-1">
					<label
						for="annotate-offset-x"
						class="mb-1 block font-mono text-[11px] tracking-wider text-muted-foreground uppercase"
						>Offset X (px)</label
					>
					<Input
						id="annotate-offset-x"
						type="number"
						bind:value={magick.settings.annotateOffsetX}
						placeholder="0"
						class="h-8 font-mono text-xs"
						onblur={() => {
							if (
								magick.settings.annotateOffsetX == null ||
								Number.isNaN(magick.settings.annotateOffsetX)
							) {
								magick.settings.annotateOffsetX = 0;
							}
						}}
					/>
				</div>
				<div class="flex-1">
					<label
						for="annotate-offset-y"
						class="mb-1 block font-mono text-[11px] tracking-wider text-muted-foreground uppercase"
						>Offset Y (px)</label
					>
					<Input
						id="annotate-offset-y"
						type="number"
						bind:value={magick.settings.annotateOffsetY}
						placeholder="0"
						class="h-8 font-mono text-xs"
						onblur={() => {
							if (
								magick.settings.annotateOffsetY == null ||
								Number.isNaN(magick.settings.annotateOffsetY)
							) {
								magick.settings.annotateOffsetY = 0;
							}
						}}
					/>
				</div>
			</div>
			<SliderRow
				label="Angle"
				bind:value={magick.settings.annotateAngle}
				suffix="°"
				min={-180}
				max={180}
				class="pb-1"
			/>
		</div>
	</SectionCard>

	<SectionCard title="Stroke Outline" dirty={magick.settings.annotateStroke}>
		<div class="space-y-3">
			<ToggleRow
				id="annotate-stroke"
				label="Enable Stroke"
				bind:checked={magick.settings.annotateStroke}
			/>
			{#if magick.settings.annotateStroke}
				<div class="space-y-3">
					<SliderRow
						label="Width"
						bind:value={magick.settings.annotateStrokeWidth}
						suffix="px"
						min={0}
						max={10}
						step={0.5}
					/>
					<div class="flex items-center gap-1.5">
						<div
							class="relative h-7 w-7 shrink-0 overflow-hidden border border-foreground/30 transition-all hover:border-foreground"
						>
							<input
								type="color"
								bind:value={magick.settings.annotateStrokeColor}
								aria-label="Stroke color"
								class="absolute inset-0 -top-1/2 -left-1/2 h-[200%] w-[200%] cursor-pointer border-0 p-0"
							/>
						</div>
						<span class="font-mono text-[11px] text-muted-foreground uppercase"
							>{magick.settings.annotateStrokeColor}</span
						>
					</div>
				</div>
			{/if}
		</div>
	</SectionCard>
</div>
