<script lang="ts">
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select/index.js';
	import type { MagickState } from '$lib/useMagick.svelte';
	import SliderRow from '$lib/components/controls/SliderRow.svelte';
	import SectionCard from '$lib/components/controls/SectionCard.svelte';
	import { getClutPresets, getInterpolationOptions } from '$lib/luts';

	let { magick } = $props<{ magick: MagickState }>();

	const EFFECT_OPTIONS = [
		{ value: 'none', label: 'None (Original)' },
		{ value: 'grayscale', label: 'Grayscale' },
		{ value: 'sepia', label: 'Sepia Tone' },
		{ value: 'charcoal', label: 'Charcoal Sketch' },
		{ value: 'negate', label: 'Negative' },
		{ value: 'cannyEdge', label: 'Edge Detection' },
		{ value: 'oilpaint', label: 'Oil Paint' },
		{ value: 'solarize', label: 'Solarize' },
		{ value: 'bilateralBlur', label: 'Bilateral Blur' }
	];

	const CLUT_PRESETS = getClutPresets();
	const INTERPOLATION_OPTIONS = getInterpolationOptions();

	const DITHER_OPTIONS = [
		{ value: 'No', label: 'None', helper: 'Sharp edges; may show banding.' },
		{ value: 'Riemersma', label: 'Riemersma (default)', helper: 'Smooth, organic dither.' },
		{ value: 'FloydSteinberg', label: 'Floyd–Steinberg', helper: 'Classic grainy diffusion.' }
	];

	const COLOR_SPACE_OPTIONS = [
		{ value: 'sRGB', label: 'sRGB' },
		{ value: 'Lab', label: 'Lab' },
		{ value: 'Oklab', label: 'Oklab' },
		{ value: 'RGB', label: 'RGB (linear)' },
		{ value: 'Gray', label: 'Grayscale' },
		{ value: 'HSL', label: 'HSL' },
		{ value: 'HSV', label: 'HSV' }
	];

	const NOISE_OPTIONS = [
		{ value: 'Off', label: 'Off' },
		{ value: 'Uniform', label: 'Uniform' },
		{ value: 'Gaussian', label: 'Gaussian' },
		{ value: 'MultiplicativeGaussian', label: 'Multiplicative Gaussian' },
		{ value: 'Impulse', label: 'Impulse' },
		{ value: 'Laplacian', label: 'Laplacian' },
		{ value: 'Poisson', label: 'Poisson' }
	];
</script>

<div class="space-y-5">
	<!-- Effect preset -->
	<div class="space-y-2">
		<span class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
			>Effect Preset</span
		>
		<Select type="single" bind:value={magick.settings.effect}>
			<SelectTrigger class="mt-2 h-9 w-full font-mono text-xs">
				{EFFECT_OPTIONS.find((o) => o.value === magick.settings.effect)?.label ??
					magick.settings.effect}
			</SelectTrigger>
			<SelectContent>
				{#each EFFECT_OPTIONS as opt (opt.value)}
					<SelectItem value={opt.value}>{opt.label}</SelectItem>
				{/each}
			</SelectContent>
		</Select>
	</div>

	{#if magick.settings.effect !== 'none'}
		<SectionCard>
			<div class="space-y-3">
				{#if magick.settings.effect === 'sepia'}
					<SliderRow
						label="Threshold"
						bind:value={magick.settings.sepiaThreshold}
						suffix="%"
						min={0}
						max={100}
						class="pb-1"
					/>
				{:else if magick.settings.effect === 'charcoal'}
					<SliderRow
						label="Intensity"
						bind:value={magick.settings.charcoalIntensity}
						min={0}
						max={10}
						step={0.5}
						class="pb-1"
					/>
				{:else if magick.settings.effect === 'oilpaint'}
					<SliderRow
						label="Radius"
						bind:value={magick.settings.oilpaintRadius}
						min={0}
						max={15}
						step={0.5}
						class="pb-1"
					/>
				{:else if magick.settings.effect === 'solarize'}
					<SliderRow
						label="Factor"
						bind:value={magick.settings.solarizeFactor}
						suffix="%"
						min={0}
						max={100}
						class="pb-1"
					/>
				{:else if magick.settings.effect === 'cannyEdge'}
					<SliderRow
						label="Strength"
						bind:value={magick.settings.cannyEdgeStrength}
						min={0}
						max={10}
						step={0.1}
					/>
					<SliderRow
						label="Lower Threshold"
						bind:value={magick.settings.cannyEdgeLower}
						suffix="%"
						min={0}
						max={100}
					/>
					<SliderRow
						label="Upper Threshold"
						bind:value={magick.settings.cannyEdgeUpper}
						suffix="%"
						min={0}
						max={100}
						class="pb-1"
					/>
				{:else if magick.settings.effect === 'bilateralBlur'}
					<SliderRow label="Width" bind:value={magick.settings.bilateralWidth} min={0} max={20} />
					<SliderRow
						label="Height"
						bind:value={magick.settings.bilateralHeight}
						min={0}
						max={20}
						class="pb-1"
					/>
				{:else if ['grayscale', 'negate'].includes(magick.settings.effect as string)}
					<p class="py-1 text-center text-[11px] text-muted-foreground">
						No additional parameters for this effect
					</p>
				{/if}
			</div>
		</SectionCard>
	{/if}

	<!-- Blur + Sharpen -->
	<SectionCard
		title="Blur / Sharpen"
		dirty={magick.settings.blur[0] > 0 || magick.settings.sharpen[0] > 0}
	>
		<div class="grid grid-cols-2 gap-3 pb-1">
			<SliderRow label="Blur" bind:value={magick.settings.blur} min={0} max={20} step={0.5} />
			<SliderRow label="Sharpen" bind:value={magick.settings.sharpen} min={0} max={10} step={0.5} />
		</div>
	</SectionCard>

	<!-- Adaptive Sharpen / Blur -->
	<SectionCard
		title="Adaptive Sharpen / Blur"
		dirty={magick.settings.adaptiveSharpenRadius[0] > 0 ||
			magick.settings.adaptiveBlurRadius[0] > 0}
	>
		<div class="space-y-3">
			<SliderRow
				label="Sharpen Radius"
				bind:value={magick.settings.adaptiveSharpenRadius}
				min={0}
				max={10}
				step={0.5}
			/>
			<SliderRow
				label="Sharpen Sigma"
				bind:value={magick.settings.adaptiveSharpenSigma}
				min={0.1}
				max={5}
				step={0.1}
				disabled={magick.settings.adaptiveSharpenRadius[0] === 0}
			/>
			<SliderRow
				label="Blur Radius"
				bind:value={magick.settings.adaptiveBlurRadius}
				min={0}
				max={10}
				step={0.5}
			/>
			<SliderRow
				label="Blur Sigma"
				bind:value={magick.settings.adaptiveBlurSigma}
				min={0.1}
				max={5}
				step={0.1}
				disabled={magick.settings.adaptiveBlurRadius[0] === 0}
				class="pb-1"
			/>
		</div>
	</SectionCard>

	<!-- Advanced Blur -->
	<SectionCard
		title="Advanced Blur"
		dirty={magick.settings.gaussianBlurRadius[0] > 0 || magick.settings.motionBlurRadius[0] > 0}
	>
		<div class="space-y-3">
			<SliderRow
				label="Gaussian Radius"
				bind:value={magick.settings.gaussianBlurRadius}
				min={0}
				max={20}
				step={0.5}
			/>
			<SliderRow
				label="Gaussian Sigma"
				bind:value={magick.settings.gaussianBlurSigma}
				min={0.1}
				max={10}
				step={0.1}
				disabled={magick.settings.gaussianBlurRadius[0] === 0}
			/>
			<SliderRow
				label="Motion Radius"
				bind:value={magick.settings.motionBlurRadius}
				min={0}
				max={20}
				step={0.5}
			/>
			<SliderRow
				label="Motion Sigma"
				bind:value={magick.settings.motionBlurSigma}
				min={0.1}
				max={10}
				step={0.1}
				disabled={magick.settings.motionBlurRadius[0] === 0}
			/>
			<SliderRow
				label="Motion Angle"
				bind:value={magick.settings.motionBlurAngle}
				suffix="°"
				min={0}
				max={360}
				disabled={magick.settings.motionBlurRadius[0] === 0}
				class="pb-1"
			/>
		</div>
	</SectionCard>

	<!-- Add Noise -->
	<SectionCard title="Add Noise" dirty={magick.settings.addNoiseType !== 'Off'}>
		<div class="space-y-3">
			<div class="space-y-1.5">
				<span class="font-mono text-[10px] text-muted-foreground uppercase">Noise Type</span>
				<Select type="single" bind:value={magick.settings.addNoiseType}>
					<SelectTrigger class="h-8 w-full font-mono text-xs">
						{magick.settings.addNoiseType}
					</SelectTrigger>
					<SelectContent>
						{#each NOISE_OPTIONS as opt (opt.value)}
							<SelectItem value={opt.value}>{opt.label}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>
			<SliderRow
				label="Attenuate"
				bind:value={magick.settings.addNoiseAttenuate}
				min={0.1}
				max={2}
				step={0.1}
				disabled={magick.settings.addNoiseType === 'Off'}
				class="pb-1"
			/>
		</div>
	</SectionCard>

	<!-- Color LUT -->
	<SectionCard title="Color LUT" dirty={magick.settings.clutMap !== 'identity'}>
		<div class="space-y-3">
			<div class="space-y-1.5">
				<span class="font-mono text-[10px] text-muted-foreground uppercase">Color Map</span>
				<Select type="single" bind:value={magick.settings.clutMap}>
					<SelectTrigger class="h-8 w-full font-mono text-xs">
						{CLUT_PRESETS.find((p) => p.id === magick.settings.clutMap)?.label ??
							magick.settings.clutMap}
					</SelectTrigger>
					<SelectContent>
						{#each CLUT_PRESETS as preset (preset.id)}
							<SelectItem value={preset.id}>
								<div>
									<div>{preset.label}</div>
									<div class="text-[10px] text-muted-foreground">{preset.description}</div>
								</div>
							</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>
			<div class="space-y-1.5">
				<span class="font-mono text-[10px] text-muted-foreground uppercase">Interpolation</span>
				<Select type="single" bind:value={magick.settings.clutInterpolation}>
					<SelectTrigger class="h-8 w-full font-mono text-xs">
						{INTERPOLATION_OPTIONS.find((o) => o.value === magick.settings.clutInterpolation)
							?.label ?? magick.settings.clutInterpolation}
					</SelectTrigger>
					<SelectContent>
						{#each INTERPOLATION_OPTIONS as opt (opt.value)}
							<SelectItem value={opt.value}>{opt.label}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>
		</div>
	</SectionCard>

	<!-- Quantize / Dithering -->
	<SectionCard title="Quantize / Dithering" dirty={magick.settings.quantizeColors[0] > 0}>
		<div class="space-y-3">
			<SliderRow
				label="Colors"
				bind:value={magick.settings.quantizeColors}
				min={0}
				max={256}
				class={magick.settings.quantizeColors[0] === 0 ? 'pb-1' : ''}
			/>

			{#if magick.settings.quantizeColors[0] > 0}
				<div class="space-y-1.5">
					<span class="font-mono text-[10px] text-muted-foreground uppercase">Dither Method</span>
					<Select type="single" bind:value={magick.settings.ditherMethod}>
						<SelectTrigger class="h-8 w-full font-mono text-xs">
							{DITHER_OPTIONS.find((o) => o.value === magick.settings.ditherMethod)?.label ??
								DITHER_OPTIONS[1].label}
						</SelectTrigger>
						<SelectContent>
							{#each DITHER_OPTIONS as opt (opt.value)}
								<SelectItem value={opt.value}>
									<div>
										<div>{opt.label}</div>
										<div class="text-[10px] text-muted-foreground">{opt.helper}</div>
									</div>
								</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				</div>

				<div class="space-y-1.5">
					<span class="font-mono text-[10px] text-muted-foreground uppercase">Color Space</span>
					<Select type="single" bind:value={magick.settings.quantizeColorSpace}>
						<SelectTrigger class="h-8 w-full font-mono text-xs">
							{magick.settings.quantizeColorSpace}
						</SelectTrigger>
						<SelectContent>
							{#each COLOR_SPACE_OPTIONS as opt (opt.value)}
								<SelectItem value={opt.value}>{opt.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				</div>

				<SliderRow
					label="Tree Depth"
					bind:value={magick.settings.quantizeTreeDepth}
					min={0}
					max={8}
					class="pb-1"
				/>
			{/if}
		</div>
	</SectionCard>
</div>
