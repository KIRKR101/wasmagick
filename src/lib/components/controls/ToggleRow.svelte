<script lang="ts">
	import { cn } from '$lib/utils';
	import { CheckSquare, ChevronRight, Square } from 'lucide-svelte';

	let {
		id,
		label,
		description = '',
		checked = $bindable(),
		chevron = false,
		class: className
	}: {
		id: string;
		label: string;
		description?: string;
		checked: boolean;
		chevron?: boolean;
		class?: string;
	} = $props();
</script>

<button
	type="button"
	{id}
	class={cn(
		'flex w-full cursor-pointer items-center justify-between gap-3 px-1 py-1.5 text-left transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none',
		className
	)}
	onclick={() => (checked = !checked)}
>
	<span class="flex min-w-0 items-center gap-2">
		{#if checked}<CheckSquare class="size-4 shrink-0" />{:else}<Square
				class="size-4 shrink-0"
			/>{/if}
		<span
			class="block font-mono text-xs whitespace-nowrap text-foreground uppercase hover:underline"
			>{label}</span
		>
		{#if description}
			<span
				class="ml-2 hidden text-[10px] whitespace-nowrap text-muted-foreground uppercase @min-[20rem]:block"
				>({description})</span
			>
		{/if}
	</span>
	{#if chevron}
		<ChevronRight
			class="size-3.5 text-muted-foreground transition-transform {checked ? 'rotate-90' : ''}"
			aria-hidden="true"
		/>
	{/if}
</button>
