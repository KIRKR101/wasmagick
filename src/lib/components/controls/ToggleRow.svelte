<script lang="ts">
	import { cn } from '$lib/utils';

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
		'flex w-full cursor-pointer items-center justify-between gap-3 px-1 py-1.5 text-left transition-colors focus:outline-none',
		className
	)}
	onclick={() => (checked = !checked)}
>
	<span class="flex min-w-0 items-center gap-2">
		<span class="font-mono text-sm text-foreground">[{checked ? '*' : ' '}]</span>
		<span class="block font-mono text-xs text-foreground uppercase hover:underline">{label}</span>
		{#if description}
			<span class="ml-2 block text-[10px] text-muted-foreground uppercase">({description})</span>
		{/if}
	</span>
	{#if chevron}
		<span
			class="font-mono text-[10px] text-muted-foreground transition-transform {checked
				? 'rotate-90'
				: ''}"
			aria-hidden="true">[>]</span
		>
	{/if}
</button>
