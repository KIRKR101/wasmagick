<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * HoverTooltip - the app's single consistent tooltip.
	 *
	 * - Shows after a short delay (`delayMs`, default 500ms) on hover or
	 *   keyboard focus, hides immediately on leave / blur / scroll / resize /
	 *   Escape / pointer-down so it never lingers in the way.
	 * - `position: fixed` with viewport edge-clamping so it escapes overflow
	 *   containers without being clipped.
	 * - Hidden on touch / coarse pointers and small viewports where hover
	 *   doesn't exist.
	 * - Never renders when there is no content, and never uses the native
	 *   `title` attribute (callers must not set `title` alongside this).
	 *
	 * `side` controls visual placement (`auto` picks the roomiest side).
	 * Pass `label` for plain text or `labelChildren` for rich content.
	 * Set `enabled={false}` to suppress the tooltip entirely.
	 */
	let {
		label,
		labelChildren,
		side = 'auto',
		class: className = '',
		triggerClass = '',
		delayMs = 500,
		enabled = true,
		children
	}: {
		label?: string;
		labelChildren?: Snippet;
		side?: 'auto' | 'top' | 'bottom' | 'left' | 'right';
		class?: string;
		triggerClass?: string;
		delayMs?: number;
		enabled?: boolean;
		children: Snippet;
	} = $props();

	type Side = 'top' | 'bottom' | 'left' | 'right';

	/** Gap between trigger and tooltip, in px */
	const GAP = 4;

	let wrapperRef = $state<HTMLSpanElement | null>(null);
	let tooltipRef = $state<HTMLSpanElement | null>(null);

	let positionStyle = $state('');
	let visible = $state(false);
	let showTimer: ReturnType<typeof setTimeout> | null = null;

	let hasContent = $derived(
		enabled && (labelChildren != null || (label != null && label.trim().length > 0))
	);

	function clearTimer() {
		if (showTimer !== null) {
			clearTimeout(showTimer);
			showTimer = null;
		}
	}

	function measure() {
		if (!wrapperRef || !tooltipRef) return;
		const trigger = wrapperRef.getBoundingClientRect();
		const tip = tooltipRef.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;

		// Decide which side to use. For 'auto', prefer the orientation that
		// matches the trigger's shape (wide triggers want top/bottom, tall
		// triggers want left/right). A side "fits" when the tooltip can sit
		// without any clamping in the parallel axis. If the preferred side
		// doesn't fit, try the next, falling back to the first with clamping.
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
		// trigger, then clamp so it never overflows. Center on the trigger
		// when there's room; otherwise anchor the near edge to the trigger.
		let left: number;
		let top: number;
		if (chosen === 'top' || chosen === 'bottom') {
			const triggerCenterX = trigger.left + trigger.width / 2;
			const centeredLeft = triggerCenterX - tip.width / 2;
			const maxLeft = vw - tip.width;
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

	function requestShow() {
		clearTimer();
		if (!hasContent) return;
		// Measure now so the tooltip appears in the right place on time.
		queueMicrotask(measure);
		showTimer = setTimeout(() => {
			if (!hasContent) return;
			measure();
			visible = true;
		}, delayMs);
	}

	function hide() {
		clearTimer();
		visible = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') hide();
	}

	$effect(() => {
		// Re-measure when the tooltip text or the trigger size changes.
		void label;
		void labelChildren;
		void side;
		queueMicrotask(measure);
	});

	$effect(() => {
		// Suppress a stale visible tooltip when content goes away.
		if (!hasContent) visible = false;
	});
</script>

<svelte:window onresize={hide} onscrollcapture={hide} onkeydown={handleKeydown} />

<span
	bind:this={wrapperRef}
	role="group"
	class="relative inline-flex {triggerClass}"
	onmouseenter={requestShow}
	onmouseleave={hide}
	onfocusin={requestShow}
	onfocusout={hide}
	onpointerdown={hide}
>
	{@render children()}
	{#if hasContent}
		<span
			bind:this={tooltipRef}
			role="tooltip"
			aria-hidden="true"
			style={positionStyle}
			class="pointer-events-none fixed z-50 max-w-48 rounded-xs border bg-popover px-2 py-1 text-[11px] font-medium whitespace-normal text-popover-foreground opacity-0 shadow-md transition-opacity duration-100 {visible
				? 'opacity-100'
				: ''} max-md:hidden [@media(hover:none)]:hidden {className}"
		>
			{#if labelChildren}
				{@render labelChildren()}
			{:else}
				{label}
			{/if}
		</span>
	{/if}
</span>
