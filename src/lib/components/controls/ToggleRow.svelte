<script lang="ts">
	import CaretRight from 'phosphor-svelte/lib/CaretRight';
	import { cn } from '$lib/utils';

	let {
		id,
		label,
		description = '',
		checked = $bindable(),
		chevron = false,
		disabled = false,
		class: className
	}: {
		id: string;
		label: string;
		description?: string;
		checked: boolean;
		chevron?: boolean;
		disabled?: boolean;
		class?: string;
	} = $props();
</script>

<button
	type="button"
	{id}
	{disabled}
	class={cn(
		'flex w-full cursor-pointer items-center justify-between gap-3 px-1 py-1.5 text-left transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	onclick={() => (checked = !checked)}
>
	<span class="flex min-w-0 items-center gap-2">
		<span class="shrink-0 font-mono text-sm text-foreground">[{checked ? '*' : ' '}]</span>
		<span
			class="block font-mono text-xs whitespace-nowrap text-foreground uppercase hover:underline"
			>{label}</span
		>
		{#if description}
			<span
				class="ml-2 hidden text-[11px] whitespace-nowrap text-muted-foreground uppercase @min-[20rem]:block"
				>({description})</span
			>
		{/if}
	</span>
	{#if chevron}
		<span class="inline-flex text-muted-foreground" aria-hidden="true"
			><CaretRight class="size-3.5 transition-transform {checked ? 'rotate-90' : ''}" /></span
		>
	{/if}
</button>
