<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select/index.js';
	import type { MagickState } from '$lib/useMagick.svelte';
	import SliderRow from '$lib/components/controls/SliderRow.svelte';
	import ToggleRow from '$lib/components/controls/ToggleRow.svelte';
	import SectionCard from '$lib/components/controls/SectionCard.svelte';

	let { magick } = $props<{ magick: MagickState }>();

	const ROTATE_OPTIONS = [
		{ value: '0', label: '0° (None)' },
		{ value: '90', label: '90° CW' },
		{ value: '180', label: '180°' },
		{ value: '-90', label: '270° CCW' }
	];

	const GRAVITY_OPTIONS = [
		{ value: 'Center', label: 'Center' },
		{ value: 'Northwest', label: 'Top Left' },
		{ value: 'North', label: 'Top Center' },
		{ value: 'Northeast', label: 'Top Right' },
		{ value: 'West', label: 'Left' },
		{ value: 'East', label: 'Right' },
		{ value: 'Southwest', label: 'Bottom Left' },
		{ value: 'South', label: 'Bottom Center' },
		{ value: 'Southeast', label: 'Bottom Right' }
	];
</script>

<div class="space-y-5">
	<!-- Resize -->
	<SectionCard title="Resize" dirty={magick.settings.resizeW != null || magick.settings.resizeH != null}>
		<div class="grid grid-cols-2 gap-2">
			<div class="relative">
				<span
					class="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[11px] font-bold text-muted-foreground"
					>W</span
				>
				<Input
					type="number"
					bind:value={magick.settings.resizeW}
					placeholder="Auto"
					min="0"
					class="h-9 pl-8 font-mono text-xs"
				/>
			</div>
			<div class="relative">
				<span
					class="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[11px] font-bold text-muted-foreground"
					>H</span
				>
				<Input
					type="number"
					bind:value={magick.settings.resizeH}
					placeholder="Auto"
					min="0"
					class="h-9 pl-8 font-mono text-xs"
				/>
			</div>
		</div>
	</SectionCard>

	<!-- Rotate + Transform + Auto Orient -->
	<SectionCard title="Rotate" dirty={magick.settings.rotate !== '0' || magick.settings.flip || magick.settings.flop || magick.settings.autoOrient}>
		<div class="grid grid-cols-2 gap-3">
			<Select type="single" bind:value={magick.settings.rotate}>
				<SelectTrigger class="w-full h-9 text-xs font-mono">
					{ROTATE_OPTIONS.find(o => o.value === magick.settings.rotate)?.label ?? magick.settings.rotate}
				</SelectTrigger>
				<SelectContent>
					{#each ROTATE_OPTIONS as opt (opt.value)}
						<SelectItem value={opt.value}>{opt.label}</SelectItem>
					{/each}
				</SelectContent>
			</Select>
			<div class="grid h-9 grid-cols-2 gap-1.5">
				<button
					type="button"
					class="group flex cursor-pointer items-center justify-center gap-1 border border-foreground/30 bg-transparent px-2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					onclick={() => (magick.settings.flip = !magick.settings.flip)}
				>
					<span class="font-mono text-[11px] whitespace-pre"
						>[{magick.settings.flip ? '*' : ' '}]</span
					>
					<span class="font-mono text-[11px] uppercase group-hover:underline">Flip</span>
				</button>
				<button
					type="button"
					class="group flex cursor-pointer items-center justify-center gap-1 border border-foreground/30 bg-transparent px-2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					onclick={() => (magick.settings.flop = !magick.settings.flop)}
				>
					<span class="font-mono text-[11px] whitespace-pre"
						>[{magick.settings.flop ? '*' : ' '}]</span
					>
					<span class="font-mono text-[11px] uppercase group-hover:underline">Flop</span>
				</button>
			</div>
		</div>
		<ToggleRow
			id="geo-auto-orient"
			label="Auto Orient"
			description="Apply EXIF orientation"
			class="mt-2"
			bind:checked={magick.settings.autoOrient}
		/>
	</SectionCard>

	<!-- Deskew -->
	<SectionCard title="Deskew" dirty={magick.settings.deskewThreshold[0] > 0}>
		<ToggleRow
			id="geo-deskew-crop"
			label="Auto Crop"
			class="mb-2"
			bind:checked={magick.settings.deskewAutoCrop}
		/>
		<SliderRow
			label="Threshold"
			bind:value={magick.settings.deskewThreshold}
			suffix="%"
			min={0}
			max={100}
		/>
	</SectionCard>

	<!-- Canvas Extent -->
	<SectionCard title="Canvas Extent" dirty={magick.settings.extentW != null || magick.settings.extentH != null}>
		<div class="grid grid-cols-2 gap-2 mb-2">
			<div class="relative">
				<span
					class="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[11px] font-bold text-muted-foreground"
					>W</span
				>
				<Input
					type="number"
					bind:value={magick.settings.extentW}
					placeholder="Auto"
					min="0"
					class="h-9 pl-8 font-mono text-xs"
				/>
			</div>
			<div class="relative">
				<span
					class="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[11px] font-bold text-muted-foreground"
					>H</span
				>
				<Input
					type="number"
					bind:value={magick.settings.extentH}
					placeholder="Auto"
					min="0"
					class="h-9 pl-8 font-mono text-xs"
				/>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<Select type="single" bind:value={magick.settings.extentGravity}>
				<SelectTrigger class="flex-1 h-9 text-xs font-mono">
					{GRAVITY_OPTIONS.find(o => o.value === magick.settings.extentGravity)?.label ?? magick.settings.extentGravity}
				</SelectTrigger>
				<SelectContent>
					{#each GRAVITY_OPTIONS as opt (opt.value)}
						<SelectItem value={opt.value}>{opt.label}</SelectItem>
					{/each}
				</SelectContent>
			</Select>
			<div class="flex items-center gap-1.5">
				<div
					class="relative shrink-0 h-7 w-7 overflow-hidden border border-foreground/30 transition-all hover:border-foreground"
				>
					<input
						type="color"
						bind:value={magick.settings.extentBgColor}
						aria-label="Canvas background color"
						class="absolute inset-0 -top-1/2 -left-1/2 h-[200%] w-[200%] cursor-pointer border-0 p-0"
					/>
				</div>
				<span class="font-mono text-[10px] text-muted-foreground/50 uppercase">{magick.settings.extentBgColor}</span>
			</div>
		</div>
	</SectionCard>

	<!-- Border -->
	<SectionCard title="Border" dirty={magick.settings.borderSize[0] > 0}>
		<div class="flex items-end gap-3">
			<div class="flex-1">
				<SliderRow
					label="Size"
					bind:value={magick.settings.borderSize}
					suffix="px"
					min={0}
					max={50}
				/>
			</div>
			<div class="flex items-center gap-1.5">
				<div
					class="relative h-7 w-7 shrink-0 overflow-hidden border border-foreground/30 transition-all hover:border-foreground"
				>
					<input
						type="color"
						bind:value={magick.settings.borderColor}
						aria-label="Border color"
						class="absolute inset-0 -top-1/2 -left-1/2 h-[200%] w-[200%] cursor-pointer border-0 p-0"
					/>
				</div>
				<span class="font-mono text-[10px] text-muted-foreground/50 uppercase">{magick.settings.borderColor}</span>
			</div>
		</div>
	</SectionCard>
</div>
