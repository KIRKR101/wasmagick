<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';
	import TooltipPortal from './tooltip-portal.svelte';
	import type { ComponentProps } from 'svelte';
	import type { WithoutChildrenOrChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		side = 'top',
		children,
		arrowClasses,
		portalProps,
		...restProps
	}: TooltipPrimitive.ContentProps & {
		arrowClasses?: string;
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof TooltipPortal>>;
	} = $props();
</script>

<TooltipPortal {...portalProps}>
	<TooltipPrimitive.Content
		bind:ref
		data-slot="tooltip-content"
		role="tooltip"
		{sideOffset}
		{side}
		class={cn(
			'z-50 inline-flex w-fit max-w-48 origin-(--bits-tooltip-content-transform-origin) items-center gap-1.5 rounded-xs border bg-popover px-2 py-1 text-[11px] font-medium whitespace-normal text-popover-foreground shadow-md has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-none data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		<TooltipPrimitive.Arrow>
			{#snippet child({ props })}
				<div
					class={cn(
						'z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-none border-t border-l bg-popover fill-popover',
						'data-[side=top]:translate-x-1/2 data-[side=top]:translate-y-[calc(-50%+2px)]',
						'data-[side=bottom]:-translate-x-1/2 data-[side=bottom]:-translate-y-[calc(-50%+1px)]',
						'data-[side=right]:translate-x-[calc(50%+2px)] data-[side=right]:translate-y-1/2',
						'data-[side=left]:-translate-y-[calc(50%-3px)]',
						arrowClasses
					)}
					{...props}
				></div>
			{/snippet}
		</TooltipPrimitive.Arrow>
	</TooltipPrimitive.Content>
</TooltipPortal>
