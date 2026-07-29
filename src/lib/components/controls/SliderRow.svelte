<script lang="ts">
	import { Slider } from '$lib/components/ui/slider/index.js';
	import { cn } from '$lib/utils';

	let {
		label,
		value = $bindable(),
		suffix = '',
		min,
		max,
		step = 1,
		disabled = false,
		class: className
	}: {
		label: string;
		value: number[];
		suffix?: string;
		min: number;
		max: number;
		step?: number;
		disabled?: boolean;
		class?: string;
	} = $props();

	let display = $derived(step < 1 ? value[0].toFixed(1) : String(value[0]));
</script>

<div class={cn('space-y-2', disabled && 'opacity-50 pointer-events-none', className)}>
	<div class="flex items-center justify-between">
		<span class="font-mono text-xs uppercase text-foreground">{label}</span>
		<span class="font-mono text-xs text-foreground tabular-nums"
			>{display}{suffix}</span
		>
	</div>
	<Slider type="multiple" bind:value {min} {max} {step} {disabled} />
</div>
