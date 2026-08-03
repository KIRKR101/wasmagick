<script lang="ts">
	import HoverTooltip from './HoverTooltip.svelte';

	/**
	 * TruncatedText - renders `text` ellipsis-truncated; hovering a truncated
	 * value shows the full text in a HoverTooltip. The tooltip only appears
	 * when the text actually overflows its container (measured via a hidden
	 * nowrap copy against the visible span's width, re-checked on resize and
	 * content changes).
	 */
	let { text, class: className = '' }: { text: string; class?: string } = $props();

	let triggerRef = $state<HTMLSpanElement | null>(null);
	let hiddenRef = $state<HTMLSpanElement | null>(null);
	let truncated = $state(false);

	$effect(() => {
		// Re-measure when the text changes (keyed rows are reused across
		// files) and when the trigger's box size changes.
		void text;
		if (!triggerRef || !hiddenRef) return;
		const measure = () => {
			truncated = hiddenRef!.scrollWidth > triggerRef!.clientWidth;
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(triggerRef);
		return () => observer.disconnect();
	});
</script>

<span class="relative block min-w-0">
	<span
		bind:this={hiddenRef}
		aria-hidden="true"
		class="pointer-events-none absolute top-0 left-0 max-w-full whitespace-nowrap opacity-0"
		>{text}</span
	>
	<span bind:this={triggerRef} class="block min-w-0 {className}">
		{#if truncated}
			<HoverTooltip label={text} class="max-w-80" triggerClass="max-w-full">
				<span class="block truncate">{text}</span>
			</HoverTooltip>
		{:else}
			<span class="block truncate">{text}</span>
		{/if}
	</span>
</span>
