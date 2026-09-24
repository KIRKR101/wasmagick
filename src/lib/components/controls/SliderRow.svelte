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
		resetValue = min <= 0 && max >= 0 ? 0 : min,
		disabled = false,
		class: className
	}: {
		label: string;
		value: number[];
		suffix?: string;
		min: number;
		max: number;
		step?: number;
		resetValue?: number;
		disabled?: boolean;
		class?: string;
	} = $props();

	let display = $derived(step < 1 ? value[0].toFixed(1) : String(value[0]));

	function resetValueToDefault() {
		value = [resetValue];
	}
</script>

<div class={cn('space-y-2', disabled && 'pointer-events-none opacity-50', className)}>
	<div class="flex items-center justify-between">
		<span class="font-mono text-xs text-foreground uppercase">{label}</span>
		<button
			type="button"
			class="cursor-pointer font-mono text-xs text-foreground tabular-nums hover:text-primary focus-visible:outline-1 focus-visible:outline-primary"
			aria-label="Reset {label} to default ({display}{suffix})"
			title="Click to reset"
			onclick={resetValueToDefault}
		>
			{display}{suffix}
		</button>
	</div>
	<Slider type="multiple" bind:value {min} {max} {step} {disabled} />
</div>
