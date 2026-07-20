<script lang="ts">
	/**
	 * SplitCompare - vertical before/after wipe overlay.
	 * Renders the original image on top of the processed image, clipped to the
	 * left of a draggable handle. Both images share the parent's transform
	 * (zoom/pan) so the wipe stays aligned at all zoom levels.
	 */

	let {
		originalUrl,
		processedUrl,
		imageStyle,
		originalLabel = '',
		processedLabel = ''
	}: {
		originalUrl: string;
		processedUrl: string;
		imageStyle: string;
		originalLabel?: string;
		processedLabel?: string;
	} = $props();

	let handlePct = $state(50);
	let dragging = $state(false);
	let containerRef = $state<HTMLDivElement | null>(null);

	function pctFromClientX(clientX: number): number {
		if (!containerRef) return 50;
		const rect = containerRef.getBoundingClientRect();
		const pct = ((clientX - rect.left) / rect.width) * 100;
		return Math.max(0, Math.min(100, pct));
	}

	function onHandlePointerDown(e: PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragging = true;
		handlePct = pctFromClientX(e.clientX);
	}

	function onPointerMove(e: PointerEvent) {
		if (!dragging) return;
		handlePct = pctFromClientX(e.clientX);
	}

	function onPointerUp() {
		dragging = false;
	}
</script>

<svelte:window onpointermove={onPointerMove} onpointerup={onPointerUp} />

<div bind:this={containerRef} class="pointer-events-none absolute inset-0 z-10 overflow-hidden">
	<!-- Bottom: processed -->
	<img
		src={processedUrl}
		style={imageStyle}
		alt={processedLabel}
		draggable="false"
		class="checkerboard max-h-none max-w-none origin-center object-contain will-change-transform"
	/>
	<!-- Top: original, clipped to left of handle -->
	<div class="absolute inset-0" style="clip-path: inset(0 {100 - handlePct}% 0 0)">
		<img
			src={originalUrl}
			style={imageStyle}
			alt={originalLabel}
			draggable="false"
			class="checkerboard max-h-none max-w-none origin-center object-contain will-change-transform"
		/>
	</div>
</div>

<!-- Handle line + grip -->
<div
	class="absolute inset-y-0 z-20 w-1 cursor-ew-resize bg-foreground/60 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none hover:bg-foreground/90 transition-colors {dragging
		? 'pointer-events-none bg-foreground'
		: ''}"
	style="left: {handlePct}%"
	role="slider"
	aria-label="Compare wipe handle"
	aria-orientation="vertical"
	aria-valuenow={Math.round(handlePct)}
	aria-valuemin={0}
	aria-valuemax={100}
	tabindex="0"
	onpointerdown={onHandlePointerDown}
	onkeydown={(e) => {
		if (e.key === 'ArrowLeft') handlePct = Math.max(0, handlePct - 2);
		else if (e.key === 'ArrowRight') handlePct = Math.min(100, handlePct + 2);
	}}
>
	<div
		class="absolute top-1/2 left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-2 border-foreground bg-[#f7f7f4] shadow-lg dark:bg-background hover:border-foreground/80"
	>
		<svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2">
			<path d="M8 7l-4 5 4 5M16 7l4 5-4 5" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</div>
</div>

<!-- Labels -->
<div
	class="pointer-events-none absolute top-3 z-30 border border-foreground/30 bg-[#f7f7f4] px-2 py-1 font-mono text-[11px] text-muted-foreground dark:bg-background"
	style="left: 12px"
>
	[ Before ]
</div>
<div
	class="pointer-events-none absolute top-3 z-30 border border-foreground/30 bg-[#f7f7f4] px-2 py-1 font-mono text-[11px] text-muted-foreground dark:bg-background"
	style="right: 12px"
>
	[ After ]
</div>
