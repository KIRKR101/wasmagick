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

	const t2 = (v: number | null) => (v == null ? '' : String(Math.round(v * 100) / 100));

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

	const CROP_RATIO_OPTIONS = [
		{ value: 'free', label: 'Free' },
		{ value: '1:1', label: '1:1' },
		{ value: '4:3', label: '4:3' },
		{ value: '3:2', label: '3:2' },
		{ value: '16:9', label: '16:9' },
		{ value: '9:16', label: '9:16' }
	];
</script>

<div class="space-y-5">
	<!-- Resize -->
	<SectionCard
		title="Resize"
		dirty={magick.settings.resizeW != null || magick.settings.resizeH != null}
	>
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
	<SectionCard
		title="Rotate"
		dirty={magick.settings.rotate !== '0' ||
			magick.settings.flip ||
			magick.settings.flop ||
			magick.settings.autoOrient}
	>
		<div class="grid grid-cols-2 gap-3">
			<Select type="single" bind:value={magick.settings.rotate}>
				<SelectTrigger class="h-9 w-full font-mono text-xs">
					{ROTATE_OPTIONS.find((o) => o.value === magick.settings.rotate)?.label ??
						magick.settings.rotate}
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

	<!-- Crop -->
	<SectionCard
		title="Crop"
		dirty={magick.settings.cropW != null ||
			magick.settings.cropH != null ||
			magick.settings.cropX != null ||
			magick.settings.cropY != null}
	>
		<div class="mb-3 flex items-center justify-between">
			<span class="font-mono text-[10px] text-muted-foreground/60 uppercase">Source</span>
			<span class="font-mono text-[10px] text-muted-foreground/40">
				{magick.originalWidth} × {magick.originalHeight}
			</span>
		</div>

		<button
			type="button"
			class="mb-3 flex w-full cursor-pointer items-center justify-center gap-2 border border-foreground/30 bg-transparent py-1.5 font-mono text-[11px] uppercase transition-colors hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {magick.cropMode
				? 'bg-muted font-bold text-foreground'
				: 'text-muted-foreground'}"
			onclick={() => (magick.cropMode = !magick.cropMode)}
		>
			{magick.cropMode ? 'Cancel Selection' : 'Select Region'}
		</button>

		<div class="space-y-2">
			<div>
				<div class="mb-1.5 font-mono text-[10px] text-muted-foreground/50 uppercase">Position</div>
				<div class="grid grid-cols-2 gap-2">
					<div class="relative">
						<span
							class="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[11px] font-bold text-muted-foreground"
							>X</span
						>
						<Input
							type="number"
							value={t2(magick.settings.cropX)}
							placeholder="0"
							class="h-8 pl-8 font-mono text-xs"
							onchange={(e) => {
								const v = parseFloat(e.currentTarget.value);
								magick.settings.cropX = isNaN(v) ? null : v;
							}}
						/>
					</div>
					<div class="relative">
						<span
							class="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[11px] font-bold text-muted-foreground"
							>Y</span
						>
						<Input
							type="number"
							value={t2(magick.settings.cropY)}
							placeholder="0"
							class="h-8 pl-8 font-mono text-xs"
							onchange={(e) => {
								const v = parseFloat(e.currentTarget.value);
								magick.settings.cropY = isNaN(v) ? null : v;
							}}
						/>
					</div>
				</div>
			</div>

			<div>
				<div class="mb-1.5 font-mono text-[10px] text-muted-foreground/50 uppercase">
					Dimensions
				</div>
				<div class="grid grid-cols-2 gap-2">
					<div class="relative">
						<span
							class="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[11px] font-bold text-muted-foreground"
							>W</span
						>
						<Input
							type="number"
							value={t2(magick.settings.cropW)}
							placeholder="Auto"
							min="0"
							class="h-8 pl-8 font-mono text-xs"
							onchange={(e) => {
								const v = parseFloat(e.currentTarget.value);
								magick.settings.cropW = isNaN(v) ? null : v;
							}}
						/>
					</div>
					<div class="relative">
						<span
							class="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[11px] font-bold text-muted-foreground"
							>H</span
						>
						<Input
							type="number"
							value={t2(magick.settings.cropH)}
							placeholder="Auto"
							min="0"
							class="h-8 pl-8 font-mono text-xs"
							onchange={(e) => {
								const v = parseFloat(e.currentTarget.value);
								magick.settings.cropH = isNaN(v) ? null : v;
							}}
						/>
					</div>
				</div>
			</div>

			<div>
				<div class="mb-1.5 grid grid-cols-2 gap-2">
					<span class="font-mono text-[10px] text-muted-foreground/50 uppercase">Ratio</span>
					<span class="font-mono text-[10px] text-muted-foreground/50 uppercase">Gravity</span>
				</div>
				<div class="grid grid-cols-2 gap-2">
					<Select type="single" bind:value={magick.cropAspectRatio}>
						<SelectTrigger class="h-8 w-full font-mono text-[11px]">
							{CROP_RATIO_OPTIONS.find((o) => o.value === magick.cropAspectRatio)?.label ?? 'Free'}
						</SelectTrigger>
						<SelectContent>
							{#each CROP_RATIO_OPTIONS as opt (opt.value)}
								<SelectItem value={opt.value}>{opt.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
					<Select type="single" bind:value={magick.settings.cropGravity}>
						<SelectTrigger class="h-8 w-full font-mono text-[11px]">
							{GRAVITY_OPTIONS.find((o) => o.value === magick.settings.cropGravity)?.label ??
								magick.settings.cropGravity}
						</SelectTrigger>
						<SelectContent>
							{#each GRAVITY_OPTIONS as opt (opt.value)}
								<SelectItem value={opt.value}>{opt.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				</div>
			</div>
		</div>

		{#if magick.settings.cropX != null || magick.settings.cropY != null}
			<div class="mt-3 flex items-center justify-between border-t border-foreground/10 pt-3">
				<div class="font-mono text-[10px] text-muted-foreground/70">
					<span class="text-muted-foreground/50">Selection</span>
					<span class="ml-1.5"
						>{Math.round(magick.settings.cropW ?? 0)}×{Math.round(magick.settings.cropH ?? 0)}</span
					>
					<span class="ml-1 text-muted-foreground/40">
						@ {Math.round(magick.settings.cropX ?? 0)},{Math.round(magick.settings.cropY ?? 0)}
					</span>
				</div>
				<button
					type="button"
					class="flex h-6 cursor-pointer items-center gap-1 border border-foreground/30 px-2 font-mono text-[10px] text-muted-foreground transition-colors hover:border-foreground/50 hover:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					onclick={() => {
						magick.settings.cropX = null;
						magick.settings.cropY = null;
						magick.settings.cropW = null;
						magick.settings.cropH = null;
					}}
				>
					× Clear
				</button>
			</div>
		{/if}
	</SectionCard>

	<!-- Trim -->
	<SectionCard title="Trim" dirty={magick.settings.trimEdges}>
		<ToggleRow id="geo-trim" label="Trim Edges" bind:checked={magick.settings.trimEdges} />
	</SectionCard>

	<!-- Canvas Extent -->
	<SectionCard
		title="Canvas Extent"
		dirty={magick.settings.extentW != null || magick.settings.extentH != null}
	>
		<div class="mb-2 grid grid-cols-2 gap-2">
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
				<SelectTrigger class="h-9 flex-1 font-mono text-xs">
					{GRAVITY_OPTIONS.find((o) => o.value === magick.settings.extentGravity)?.label ??
						magick.settings.extentGravity}
				</SelectTrigger>
				<SelectContent>
					{#each GRAVITY_OPTIONS as opt (opt.value)}
						<SelectItem value={opt.value}>{opt.label}</SelectItem>
					{/each}
				</SelectContent>
			</Select>
			<div class="flex items-center gap-1.5">
				<div
					class="relative h-7 w-7 shrink-0 overflow-hidden border border-foreground/30 transition-all hover:border-foreground"
				>
					<input
						type="color"
						bind:value={magick.settings.extentBgColor}
						aria-label="Canvas background color"
						class="absolute inset-0 -top-1/2 -left-1/2 h-[200%] w-[200%] cursor-pointer border-0 p-0"
					/>
				</div>
				<span class="font-mono text-[10px] text-muted-foreground/50 uppercase"
					>{magick.settings.extentBgColor}</span
				>
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
				<span class="font-mono text-[10px] text-muted-foreground/50 uppercase"
					>{magick.settings.borderColor}</span
				>
			</div>
		</div>
	</SectionCard>
</div>
