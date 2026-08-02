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
	import { Crop } from 'lucide-svelte';

	let { magick } = $props<{ magick: MagickState }>();

	let cropInputMode = $state<'visual' | 'manual'>('visual');
	let isPositionCrop = $derived(magick.settings.cropX != null || magick.settings.cropY != null);

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
		<div class="space-y-3">
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
				bind:checked={magick.settings.autoOrient}
			/>
		</div>
	</SectionCard>

	<!-- Deskew / Trim -->
	<SectionCard
		title="Deskew / Trim"
		dirty={magick.settings.deskewThreshold[0] > 0 ||
			magick.settings.deskewAutoCrop ||
			magick.settings.trimEdges}
	>
		<div class="space-y-3">
			<SliderRow
				label="Threshold"
				bind:value={magick.settings.deskewThreshold}
				suffix="%"
				min={0}
				max={100}
			/>
			<ToggleRow
				id="geo-deskew-crop"
				label="Auto Crop"
				description="Trim after straightening"
				bind:checked={magick.settings.deskewAutoCrop}
			/>
			<!-- Trim -->
			<div class="border-t border-foreground/10 pt-3">
				<ToggleRow
					id="geo-trim"
					label="Trim Edges"
					description="Remove boring borders"
					bind:checked={magick.settings.trimEdges}
				/>
			</div>
		</div>
	</SectionCard>

	<!-- Crop -->
	<SectionCard
		title="Crop"
		dirty={magick.settings.cropW != null ||
			magick.settings.cropH != null ||
			magick.settings.cropX != null ||
			magick.settings.cropY != null}
	>
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<span class="font-mono text-[10px] text-muted-foreground/60 uppercase">Source</span>
				<span class="font-mono text-[10px] text-muted-foreground/40">
					{magick.originalWidth} × {magick.originalHeight}
				</span>
			</div>

			<!-- Mode tabs -->
			<div class="flex border border-foreground/20">
				<button
					type="button"
					class="flex-1 cursor-pointer py-1 font-mono text-[11px] uppercase transition-colors {cropInputMode ===
					'visual'
						? 'bg-muted font-bold text-foreground'
						: 'text-muted-foreground hover:bg-muted/50'}"
					onclick={() => {
						if (cropInputMode !== 'visual') {
							cropInputMode = 'visual';
							magick.cancelCrop();
							// Drop any gravity crop so the viewport shows the full
							// pre-crop image and the visual selection starts fresh.
							magick.settings.cropW = null;
							magick.settings.cropH = null;
						}
					}}
				>
					Select Region
				</button>
				<div class="w-px bg-foreground/20"></div>
				<button
					type="button"
					class="flex-1 cursor-pointer py-1 font-mono text-[11px] uppercase transition-colors {cropInputMode ===
					'manual'
						? 'bg-muted font-bold text-foreground'
						: 'text-muted-foreground hover:bg-muted/50'}"
					onclick={() => {
						if (cropInputMode !== 'manual') {
							cropInputMode = 'manual';
							magick.cancelCrop();
							magick.settings.cropX = null;
							magick.settings.cropY = null;
						}
					}}
				>
					Gravity
				</button>
			</div>

			{#if cropInputMode === 'visual'}
				<!-- Visual mode: Select Region + Ratio + Position bar -->
				<button
					type="button"
					class="flex w-full cursor-pointer items-center justify-center gap-2 border py-2 font-mono text-[11px] uppercase transition-all focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {magick.cropMode
						? 'border-foreground bg-foreground text-background shadow-sm'
						: 'border-foreground/30 bg-transparent text-muted-foreground hover:border-foreground/60 hover:bg-muted hover:text-foreground'}"
					onclick={() => magick.toggleCropMode()}
				>
					<Crop class="size-3.5" />
					{magick.cropMode ? 'Cancel Selection' : 'Select Region'}
				</button>

				<div>
					<div class="mb-1.5 font-mono text-[10px] text-muted-foreground/50 uppercase">Ratio</div>
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
				</div>

				{#if isPositionCrop}
					<div class="flex items-center justify-between border-t border-foreground/10 pt-3">
						<div class="font-mono text-[10px] text-muted-foreground/70">
							<span class="text-muted-foreground/50">Selection</span>
							<span class="ml-1.5"
								>{Math.round(magick.settings.cropW ?? 0)}×{Math.round(
									magick.settings.cropH ?? 0
								)}</span
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
			{:else}
				<!-- Gravity mode: W/H + Gravity -->
				<div class="space-y-3">
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
									oninput={(e) => {
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
									oninput={(e) => {
										const v = parseFloat(e.currentTarget.value);
										magick.settings.cropH = isNaN(v) ? null : v;
									}}
								/>
							</div>
						</div>
					</div>

					<div>
						<div class="mb-1.5 font-mono text-[10px] text-muted-foreground/50 uppercase">
							Gravity
						</div>
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
			{/if}
		</div>
	</SectionCard>

	<!-- Shave -->
	<SectionCard
		title="Shave"
		dirty={magick.settings.shaveX != null || magick.settings.shaveY != null}
	>
		<div class="grid grid-cols-2 gap-2">
			<div class="relative">
				<span
					class="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[11px] font-bold text-muted-foreground"
					>X</span
				>
				<Input
					type="number"
					bind:value={magick.settings.shaveX}
					placeholder="0"
					min="0"
					class="h-9 pl-8 font-mono text-xs"
				/>
			</div>
			<div class="relative">
				<span
					class="absolute top-1/2 left-3 -translate-y-1/2 font-mono text-[11px] font-bold text-muted-foreground"
					>Y</span
				>
				<Input
					type="number"
					bind:value={magick.settings.shaveY}
					placeholder="0"
					min="0"
					class="h-9 pl-8 font-mono text-xs"
				/>
			</div>
		</div>
	</SectionCard>

	<!-- Canvas Extent -->
	<SectionCard
		title="Canvas Extent"
		dirty={magick.settings.extentW != null || magick.settings.extentH != null}
	>
		<div class="space-y-3">
			<div class="grid grid-cols-2 gap-2">
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
		</div></SectionCard
	>

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
