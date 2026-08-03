<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * HoverTooltip - CSS-only popover tooltip that matches the ToolRail style.
	 *
	 * Wraps a trigger element in a `group relative` container and renders a
	 * popover-style tooltip next to it. Reveals on hover and keyboard focus.
	 *
	 * The tooltip is `position: fixed` (viewport coordinates, very high
	 * z-index) so it can escape overflow containers — e.g. the properties
	 * panel's scroll area — without being clipped, and stays above canvas
	 * overlays. It is edge-clamped: when the chosen side would push the
	 * tooltip off the viewport, it is nudged back so it always stays on
	 * screen. On viewports < 768px wide the tooltip is hidden entirely
	 * (matching the original ToolRail `max-md:hidden` behavior).
	 *
	 * `side` controls visual placement:
	 *   - `auto` (default) — pick the side with the most viewport space
	 *   - `right` — to the right of the trigger, vertically centered
	 *   - `bottom` — below the trigger, horizontally centered
	 *   - `top`    — above the trigger, horizontally centered
	 *   - `left`   — to the left of the trigger, vertically centered
	 *
	 * Pass `label` for a plain string, or `labelChildren` for rich content
	 * (e.g. mixed text styles for shortcut hints). If both are provided,
	 * `labelChildren` wins.
	 */
	let {
		label,
		labelChildren,
		side = 'auto',
		class: className = '',
		triggerClass = '',
		children
	}: {
		label?: string;
		labelChildren?: Snippet;
		side?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
		class?: string;
		triggerClass?: string;
		children: Snippet;
	} = $props();

	type Side = 'top' | 'bottom' | 'left' | 'right';

	/** Gap between trigger and tooltip, in px */
	const GAP = 4;

	let wrapperRef = $state<HTMLSpanElement | null>(null);
	let tooltipRef = $state<HTMLSpanElement | null>(null);

	let positionStyle = $state('');

	function measure() {
		if (!wrapperRef || !tooltipRef) return;
		const trigger = wrapperRef.getBoundingClientRect();
		const tip = tooltipRef.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		// Decide which side to use. For 'auto', prefer the orientation that
		// matches the trigger's shape (wide triggers want top/bottom, tall
		// triggers want left/right). A side "fits" when the tooltip can sit
		// without any clamping in the parallel axis — i.e. it naturally
		// fits on the screen without being pushed against an edge. If the
		// preferred side doesn't fit, try the next, falling back to the
		// first preference with clamping.
		let chosen: Side;
		if (side === 'auto') {
			const space: Record<Side, number> = {
				top: trigger.top,
				bottom: vh - trigger.bottom,
				left: trigger.left,
				right: vw - trigger.right
			};
			const horizontal = trigger.width >= trigger.height;
			const preferred: Side[] = horizontal
				? ['bottom', 'top', 'right', 'left']
				: ['right', 'left', 'bottom', 'top'];
			const requiredPerp = horizontal ? tip.height + GAP : tip.width + GAP;
			const fits = (s: Side) => {
				if (space[s] < requiredPerp) return false;
				// No clamping needed along the parallel axis.
				if (horizontal && (s === 'bottom' || s === 'top')) {
					const idealLeft = trigger.left + trigger.width / 2 - tip.width / 2;
					return idealLeft >= 0 && idealLeft + tip.width <= vw;
				}
				if (!horizontal && (s === 'left' || s === 'right')) {
					const idealTop = trigger.top + trigger.height / 2 - tip.height / 2;
					return idealTop >= 0 && idealTop + tip.height <= vh;
				}
				return true;
			};
			chosen = (preferred.find((s) => fits(s)) ?? preferred[0]) as Side;
		} else {
			chosen = side;
		}

		// Position the tooltip in viewport coordinates, a small GAP from the
		// trigger, then shift within the viewport so it never overflows. The
		// tooltip is centered on the trigger when there's room; if centering
		// would push the tooltip off-screen, anchor its near edge to the
		// trigger's near edge so it stays visually attached.
		let left: number;
		let top: number;
		if (chosen === 'top' || chosen === 'bottom') {
			const triggerCenterX = trigger.left + trigger.width / 2;
			const centeredLeft = triggerCenterX - tip.width / 2;
			const maxLeft = vw - tip.width;
			// Can the centered tooltip fit horizontally? If yes, center it.
			// If not, anchor the tooltip's near edge to the trigger's near
			// edge so it extends rightward from the button (clamped to the
			// right edge of the screen).
			const centeredFits = centeredLeft >= 0 && centeredLeft + tip.width <= vw;
			left = centeredFits ? centeredLeft : Math.max(0, Math.min(maxLeft, trigger.left));
			top = chosen === 'top' ? trigger.top - tip.height - GAP : trigger.bottom + GAP;
		} else {
			const triggerCenterY = trigger.top + trigger.height / 2;
			const centeredTop = triggerCenterY - tip.height / 2;
			const maxTop = vh - tip.height;
			const centeredFits = centeredTop >= 0 && centeredTop + tip.height <= vh;
			top = centeredFits ? centeredTop : Math.max(0, Math.min(maxTop, trigger.top));
			left = chosen === 'left' ? trigger.left - tip.width - GAP : trigger.right + GAP;
		}
		positionStyle = `left: ${left.toFixed(1)}px; top: ${top.toFixed(1)}px;`;
	}

	$effect(() => {
		// Re-measure when the tooltip text or the trigger size changes.
		void label;
		void labelChildren;
		void side;
		// Wait one frame so the tooltip has its final dimensions.
		queueMicrotask(measure);
	});
</script>

<svelte:window onresize={measure} onscrollcapture={measure} />

<span
	bind:this={wrapperRef}
	role="group"
	class="group relative inline-flex {triggerClass}"
	onmouseenter={measure}
>
	{@render children()}
	<span
		bind:this={tooltipRef}
		role="tooltip"
		aria-hidden="true"
		style={positionStyle}
		class="pointer-events-none fixed z-[9999] max-w-48 rounded-xs border bg-popover px-2 py-1 text-[11px] font-medium whitespace-normal text-popover-foreground opacity-0 shadow-md transition-opacity duration-100 group-focus-within:opacity-100 group-hover:opacity-100 max-md:hidden {className}"
	>
		{#if labelChildren}
			{@render labelChildren()}
		{:else}
			{label}
		{/if}
	</span>
</span>
