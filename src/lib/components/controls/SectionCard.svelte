<script lang="ts">
	import { cn } from '$lib/utils';

	let props = $props<{
		title?: string;
		dirty?: boolean;
		children?: import('svelte').Snippet;
		class?: string;
	}>();
</script>

<section class={cn('border border-foreground/30 bg-transparent p-3', props.class)}>
	{#if props.title}
		<h4 class="mb-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
			{props.title} <span class="font-mono">{props.dirty ? '*' : ''}</span>
		</h4>
	{/if}
	{@render props.children?.()}
</section>
