<script lang="ts">
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select/index.js';
	import type { MagickState } from '$lib/useMagick.svelte';
	import type { LevelChannel } from '$lib/types';
	import SliderRow from '$lib/components/controls/SliderRow.svelte';
	import ToggleRow from '$lib/components/controls/ToggleRow.svelte';
	import SectionCard from '$lib/components/controls/SectionCard.svelte';

	let { magick } = $props<{ magick: MagickState }>();

	const LEVEL_CHS = ['All', 'Red', 'Green', 'Blue'] as const;

	const COLORSPACE_OPTIONS = [
		{ value: 'RGB', label: 'RGB' },
		{ value: 'Gray', label: 'Grayscale' },
		{ value: 'CMYK', label: 'CMYK' },
		{ value: 'HSL', label: 'HSL' },
		{ value: 'HSV', label: 'HSV' },
		{ value: 'Lab', label: 'Lab' }
	];

	const CHANNEL_OPTIONS = [
		{ value: 'All', label: 'All' },
		{ value: 'Red', label: 'Red' },
		{ value: 'Green', label: 'Green' },
		{ value: 'Blue', label: 'Blue' }
	];

	const AUTO_THRESHOLD_OPTIONS = [
		{ value: 'Off', label: 'Off' },
		{ value: 'Kapur', label: 'Kapur' },
		{ value: 'OTSU', label: 'OTSU' },
		{ value: 'Triangle', label: 'Triangle' }
	];
</script>

<div class="space-y-5">
	<!-- Modulate -->
	<SectionCard
		title="Adjust"
		dirty={magick.settings.brightness[0] !== 100 ||
			magick.settings.contrast[0] !== 0 ||
			magick.settings.saturation[0] !== 100 ||
			magick.settings.hue[0] !== 100}
	>
		<div class="space-y-3">
			<SliderRow
				label="Brightness"
				bind:value={magick.settings.brightness}
				suffix="%"
				min={0}
				max={200}
			/>
			<SliderRow label="Contrast" bind:value={magick.settings.contrast} min={-100} max={100} />
			<SliderRow
				label="Saturation"
				bind:value={magick.settings.saturation}
				suffix="%"
				min={0}
				max={300}
			/>
			<SliderRow
				label="Hue"
				bind:value={magick.settings.hue}
				suffix="%"
				min={0}
				max={200}
				class="pb-1"
			/>
		</div>
	</SectionCard>

	<!-- Color space + auto operations -->
	<div class="space-y-3">
		<Select type="single" bind:value={magick.settings.colorSpace}>
			<SelectTrigger class="h-9 w-full font-mono text-xs">
				{COLORSPACE_OPTIONS.find((o) => o.value === magick.settings.colorSpace)?.label ??
					magick.settings.colorSpace}
			</SelectTrigger>
			<SelectContent>
				{#each COLORSPACE_OPTIONS as opt (opt.value)}
					<SelectItem value={opt.value}>{opt.label}</SelectItem>
				{/each}
			</SelectContent>
		</Select>

		<div class="grid grid-cols-2 gap-2">
			<ToggleRow
				id="clr-normalize"
				label="Normalize"
				bind:checked={magick.settings.normalizeImage}
			/>
			<ToggleRow id="clr-autolevel" label="Auto Level" bind:checked={magick.settings.autoLevel} />
			<ToggleRow id="clr-autogamma" label="Auto Gamma" bind:checked={magick.settings.autoGamma} />
		</div>
	</div>

	<!-- Levels -->
	<SectionCard
		title="Levels"
		dirty={LEVEL_CHS.some(
			(ch) =>
				magick.settings.levelBlackpoint[ch][0] !== 0 ||
				magick.settings.levelWhitepoint[ch][0] !== 100 ||
				magick.settings.levelGamma[ch][0] !== 1.0
		)}
	>
		<div class="space-y-3">
			<div class="flex items-center justify-start">
				<Select type="single" bind:value={magick.settings.levelChannels}>
					<SelectTrigger class="h-9 w-24 font-mono text-xs">
						{CHANNEL_OPTIONS.find((o) => o.value === magick.settings.levelChannels)?.label ??
							magick.settings.levelChannels}
					</SelectTrigger>
					<SelectContent>
						{#each CHANNEL_OPTIONS as opt (opt.value)}
							<SelectItem value={opt.value}>{opt.label}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>
			<SliderRow
				label="Black Point"
				bind:value={magick.settings.levelBlackpoint[magick.settings.levelChannels as LevelChannel]}
				min={0}
				max={100}
			/>
			<SliderRow
				label="White Point"
				bind:value={magick.settings.levelWhitepoint[magick.settings.levelChannels as LevelChannel]}
				min={0}
				max={100}
			/>
			<SliderRow
				label="Gamma"
				bind:value={magick.settings.levelGamma[magick.settings.levelChannels as LevelChannel]}
				min={0.1}
				max={3}
				step={0.1}
				class="pb-1"
			/>
		</div>
	</SectionCard>

	<!-- Advanced -->
	<SectionCard
		title="Advanced Color"
		dirty={magick.settings.thresholdPercentage[0] !== 50 ||
			magick.settings.sigmoidalContrast[0] !== 0 ||
			magick.settings.autoThreshold !== 'Off' ||
			magick.settings.blackThreshold[0] > 0 ||
			magick.settings.whiteThreshold[0] < 100}
	>
		<div class="space-y-3">
			<SliderRow
				label="Threshold"
				bind:value={magick.settings.thresholdPercentage}
				suffix="%"
				min={0}
				max={100}
			/>
			<SliderRow
				label="Sigmoidal Contrast"
				bind:value={magick.settings.sigmoidalContrast}
				min={-20}
				max={20}
			/>
			<SliderRow
				label="Black Threshold"
				bind:value={magick.settings.blackThreshold}
				suffix="%"
				min={0}
				max={100}
			/>
			<SliderRow
				label="White Threshold"
				bind:value={magick.settings.whiteThreshold}
				suffix="%"
				min={0}
				max={100}
				class="pb-1"
			/>
			<div class="space-y-1.5">
				<span class="font-mono text-[10px] text-muted-foreground uppercase"
					>Auto Threshold</span
				>
				<Select type="single" bind:value={magick.settings.autoThreshold}>
					<SelectTrigger class="h-9 w-full font-mono text-xs">
						{AUTO_THRESHOLD_OPTIONS.find(
							(o) => o.value === magick.settings.autoThreshold
						)?.label ?? magick.settings.autoThreshold}
					</SelectTrigger>
					<SelectContent>
						{#each AUTO_THRESHOLD_OPTIONS as opt (opt.value)}
							<SelectItem value={opt.value}>{opt.label}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>
		</div>
	</SectionCard>

	<!-- CLAHE -->
	<SectionCard
		title="CLAHE"
		dirty={magick.settings.claheXTiles[0] > 0}
	>
		<div class="space-y-3">
			<SliderRow
				label="X Tiles"
				bind:value={magick.settings.claheXTiles}
				min={0}
				max={16}
			/>
			<SliderRow
				label="Y Tiles"
				bind:value={magick.settings.claheYTiles}
				min={0}
				max={16}
				disabled={magick.settings.claheXTiles[0] === 0}
			/>
			<SliderRow
				label="Histogram Bins"
				bind:value={magick.settings.claheBins}
				min={32}
				max={512}
				step={32}
				disabled={magick.settings.claheXTiles[0] === 0}
			/>
			<SliderRow
				label="Clip Limit"
				bind:value={magick.settings.claheClipLimit}
				min={0}
				max={10}
				step={0.5}
				disabled={magick.settings.claheXTiles[0] === 0}
				class="pb-1"
			/>
		</div>
	</SectionCard>
</div>
