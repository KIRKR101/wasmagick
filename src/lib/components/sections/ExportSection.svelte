<script lang="ts">
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import type { MagickState } from '$lib/useMagick.svelte';
	import ToggleRow from '$lib/components/controls/ToggleRow.svelte';
	import TruncatedText from '$lib/components/controls/TruncatedText.svelte';
	let { magick } = $props<{ magick: MagickState }>();

	const FORMAT_OPTIONS = ['WebP', 'JPEG', 'PNG', 'AVIF', 'JXL', 'TIFF', 'GIF'];
	const LOSSLESS = new Set(['PNG', 'GIF']);
	let isLossless = $derived(LOSSLESS.has(magick.settings.imageFormat));

	let showExif = $state(false);
	$effect(() => {
		if (showExif) magick.ensureExif();
	});
	let showAllExif = $state(false);
	let exifRows = $derived(
		showAllExif || (magick.exif?.priority.length ?? 0) === 0
			? (magick.exif?.all ?? [])
			: (magick.exif?.priority ?? [])
	);
</script>

<div class="space-y-5">
	<div class="grid grid-cols-2 gap-3">
		<div class="flex flex-col gap-2">
			<span class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
				>Format</span
			>
			<Select type="single" bind:value={magick.settings.imageFormat}>
				<SelectTrigger class="h-9 w-full font-mono text-xs uppercase">
					{magick.settings.imageFormat}
				</SelectTrigger>
				<SelectContent>
					{#each FORMAT_OPTIONS as fmt}
						<SelectItem value={fmt}>{fmt}</SelectItem>
					{/each}
				</SelectContent>
			</Select>
		</div>
		<div class="flex flex-col gap-2">
			<div class="flex h-4 items-center justify-between">
				<span class="text-[11px] tracking-wide text-muted-foreground uppercase">Quality</span>
				<span class="font-mono text-xs text-foreground tabular-nums">
					{#if isLossless}
						<span class="text-muted-foreground">Lossless</span>
					{:else}
						{magick.settings.quality[0]}%
					{/if}
				</span>
			</div>
			<div class="flex h-9 items-center">
				<Slider
					type="multiple"
					bind:value={magick.settings.quality}
					min={1}
					max={100}
					step={1}
					disabled={isLossless}
				/>
			</div>
		</div>
	</div>

	<ToggleRow
		id="exp-strip-meta"
		label="Strip Metadata"
		description="Remove EXIF / profiles"
		bind:checked={magick.settings.stripMeta}
	/>

	<ToggleRow id="exp-show-exif" label="Show EXIF" chevron bind:checked={showExif} />
	{#if showExif}
		<div class="border border-foreground/30 bg-transparent p-3">
			<div class="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
				EXIF
			</div>
			{#if magick.exifLoading}
				<div class="space-y-1 font-mono text-xs">
					<span class="text-muted-foreground">Reading EXIF…</span>
				</div>
			{:else if magick.exifError}
				<div class="space-y-1 font-mono text-xs">
					<span class="text-red-500">{magick.exifError}</span>
				</div>
			{:else if magick.exif}
				<div class="space-y-1 font-mono text-xs">
					{#each exifRows as { label, value } (label)}
						<div class="flex justify-between gap-3">
							<span class="shrink-0 text-muted-foreground">{label}</span>
							<TruncatedText text={value} class="text-foreground" />
						</div>
					{/each}
				</div>
				{#if magick.exif.all.length > magick.exif.priority.length}
					<button
						type="button"
						onclick={() => (showAllExif = !showAllExif)}
						class="group mt-2 w-full cursor-pointer border border-foreground/30 px-3 py-1.5 font-mono text-xs transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					>
						[{showAllExif ? '-' : '+'}]
						<span class="group-hover:underline">{showAllExif ? 'SHOW FEWER' : 'SHOW MORE'}</span>
					</button>
				{/if}
			{:else}
				<div class="space-y-1 font-mono text-xs">
					<span class="text-muted-foreground">No EXIF data</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Output preview -->
	{#if magick.processedImageUrl}
		<div class="border border-foreground/30 bg-transparent p-3">
			<div class="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
				Output
			</div>
			<div class="space-y-1 font-mono text-xs">
				<div class="flex justify-between">
					<span class="text-muted-foreground">Dimensions</span>
					<span class="text-foreground">{magick.processedWidth}×{magick.processedHeight}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-muted-foreground">Format</span>
					<span class="text-foreground uppercase">{magick.processedImageFormat}</span>
				</div>
				{#if magick.statsMessage}
					<div class="flex justify-between">
						<span class="text-muted-foreground">Process time</span>
						<span class="text-foreground">{magick.processedImageTime}ms</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">File size</span>
						<span class="text-foreground">{magick.processedImageDelta}</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
