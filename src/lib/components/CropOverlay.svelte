<script lang="ts">
	import {
		normalizeRect,
		clampCropToImage,
		hitTestHandle,
		handleCursor,
		oppositeAnchor,
		resizeFromHandle,
		screenToImage,
		ensurePositiveDimensions,
		fitCropToImage,
		type CropRect
	} from '$lib/crop-utils';

	let _maskCounter = 0;

	let {
		imageWidth,
		imageHeight,
		zoom,
		imageX,
		imageY,
		viewportRef,
		aspectRatio: aspectPreset = 'free',
		initialCrop = null,
		onConfirm,
		onCancel,
		onAspectRatioChange = () => {}
	}: {
		imageWidth: number;
		imageHeight: number;
		zoom: number;
		imageX: number;
		imageY: number;
		viewportRef: HTMLDivElement;
		aspectRatio?: string;
		initialCrop?: { x: number; y: number; w: number; h: number } | null;
		onConfirm: (crop: CropRect) => void;
		onCancel: () => void;
		onAspectRatioChange?: (preset: string) => void;
	} = $props();

	const MIN_CROP_PX = 10;

	let _maskId = `crop-mask-${++_maskCounter}`;
	let cropRect = $state<CropRect | null>(null);

	// Pre-populate crop rect from initialCrop prop on mount
	$effect(() => {
		if (initialCrop && initialCrop.w > MIN_CROP_PX && initialCrop.h > MIN_CROP_PX) {
			cropRect = { ...initialCrop };
		}
	});
	let interaction = $state<'idle' | 'drawing' | 'moving' | 'resizing'>('idle');
	let activeHandle = $state<string | null>(null);
	let hoveredHandle = $state<string | null>(null);
	let startScreenX = 0;
	let startScreenY = 0;
	let startCrop = $state<CropRect>({ x: 0, y: 0, w: 0, h: 0 });
	let currentCursor = $state('crosshair');

	const RATIO_PRESETS = [
		{ id: 'free', label: 'Free', value: null },
		{ id: '1:1', label: '1:1', value: 1 },
		{ id: '4:3', label: '4:3', value: 4 / 3 },
		{ id: '3:2', label: '3:2', value: 3 / 2 },
		{ id: '16:9', label: '16:9', value: 16 / 9 },
		{ id: '9:16', label: '9:16', value: 9 / 16 }
	];

	let lockedRatio = $derived.by(() => {
		const preset = RATIO_PRESETS.find((p) => p.id === aspectPreset);
		return preset?.value ?? null;
	});

	let svgWidth = $derived(viewportRef?.clientWidth ?? 0);
	let svgHeight = $derived(viewportRef?.clientHeight ?? 0);

	// Convert crop rect from image coords to screen coords for rendering
	let cropScreen = $derived.by(() => {
		if (!cropRect || !viewportRef) return null;
		const rect = viewportRef.getBoundingClientRect();
		const scale = zoom / 100;
		const centerX = rect.width / 2;
		const centerY = rect.height / 2;
		return {
			x: (cropRect.x - imageWidth / 2) * scale + imageX + centerX,
			y: (cropRect.y - imageHeight / 2) * scale + imageY + centerY,
			w: cropRect.w * scale,
			h: cropRect.h * scale
		};
	});

	let handleSize = $derived(Math.max(6, Math.min(10, 8 * (zoom / 100))));
	let hitRadius = $derived(handleSize + 4);
	let overlayRef = $state<HTMLDivElement | null>(null);

	function getViewportRect(): DOMRect {
		return viewportRef!.getBoundingClientRect();
	}

	function viewportPoint(clientX: number, clientY: number): { x: number; y: number } {
		const r = getViewportRect();
		return { x: clientX - r.left, y: clientY - r.top };
	}

	// --- Pointer handlers ---

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();

		const pt = screenToImage(
			e.clientX,
			e.clientY,
			getViewportRect(),
			zoom,
			imageX,
			imageY,
			imageWidth,
			imageHeight
		);

		if (cropRect && interaction === 'idle') {
			if (cropScreen) {
				const screenPt = viewportPoint(e.clientX, e.clientY);
				const hit = hitTestHandle(screenPt, cropScreen, hitRadius);

				if (hit && hit !== 'move') {
					interaction = 'resizing';
					activeHandle = hit;
					startScreenX = e.clientX;
					startScreenY = e.clientY;
					startCrop = { ...cropRect };
					overlayRef?.setPointerCapture(e.pointerId);
					return;
				}
				if (hit === 'move') {
					interaction = 'moving';
					startScreenX = e.clientX;
					startScreenY = e.clientY;
					startCrop = { ...cropRect };
					overlayRef?.setPointerCapture(e.pointerId);
					return;
				}

				if (cropRect.w >= MIN_CROP_PX && cropRect.h >= MIN_CROP_PX) {
					onConfirm(cropRect);
					return;
				}
			}

			cropRect = null;
		}

		interaction = 'drawing';
		startScreenX = e.clientX;
		startScreenY = e.clientY;
		startCrop = { x: pt.x, y: pt.y, w: 0, h: 0 };
		cropRect = { x: pt.x, y: pt.y, w: 0, h: 0 };
		overlayRef?.setPointerCapture(e.pointerId);
	}

	function onPointerMove(e: PointerEvent) {
		if (interaction === 'idle') {
			// Update hover state and cursor
			if (cropRect && cropScreen) {
				const screenPt = viewportPoint(e.clientX, e.clientY);
				const hit = hitTestHandle(screenPt, cropScreen, hitRadius);
				hoveredHandle = hit;
				currentCursor = hit ? handleCursor(hit) : 'crosshair';
			} else {
				hoveredHandle = null;
				currentCursor = 'crosshair';
			}
			return;
		}

		e.preventDefault();
		e.stopPropagation();

		const pt = screenToImage(
			e.clientX,
			e.clientY,
			getViewportRect(),
			zoom,
			imageX,
			imageY,
			imageWidth,
			imageHeight
		);
		const startPt = screenToImage(
			startScreenX,
			startScreenY,
			getViewportRect(),
			zoom,
			imageX,
			imageY,
			imageWidth,
			imageHeight
		);

		if (interaction === 'drawing') {
			let rect: CropRect;

			if (lockedRatio) {
				rect = {
					x: startPt.x,
					y: startPt.y,
					w: pt.x - startPt.x,
					h: pt.y - startPt.y
				};

				let anchor: 'nw' | 'ne' | 'se' | 'sw' = 'nw';
				if (rect.w < 0 && rect.h >= 0) anchor = 'ne';
				else if (rect.w < 0 && rect.h < 0) anchor = 'se';
				else if (rect.w >= 0 && rect.h < 0) anchor = 'sw';

				rect = ensurePositiveDimensions(rect);
				rect = fitCropToImage(rect, lockedRatio, anchor, imageWidth, imageHeight);
			} else {
				rect = normalizeRect(startPt.x, startPt.y, pt.x, pt.y);
			}

			rect = clampCropToImage(rect, imageWidth, imageHeight);
			cropRect = rect;
		} else if (interaction === 'moving') {
			const dx = pt.x - startPt.x;
			const dy = pt.y - startPt.y;
			let newRect: CropRect = {
				x: startCrop.x + dx,
				y: startCrop.y + dy,
				w: startCrop.w,
				h: startCrop.h
			};
			newRect = clampCropToImage(newRect, imageWidth, imageHeight);
			cropRect = newRect;
		} else if (interaction === 'resizing' && activeHandle) {
			const dx = pt.x - startPt.x;
			const dy = pt.y - startPt.y;
			let newRect = resizeFromHandle(startCrop, activeHandle, dx, dy);
			newRect = ensurePositiveDimensions(newRect);

			if (lockedRatio) {
				const anchor = oppositeAnchor(activeHandle);
				newRect = fitCropToImage(newRect, lockedRatio, anchor, imageWidth, imageHeight);
			} else {
				newRect = clampCropToImage(newRect, imageWidth, imageHeight);
			}

			cropRect = newRect;
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (interaction !== 'idle') {
			e.preventDefault();
			e.stopPropagation();

			if (interaction === 'drawing' && cropRect) {
				// Minimum size check
				if (cropRect.w < MIN_CROP_PX || cropRect.h < MIN_CROP_PX) {
					cropRect = null;
				}
			}

			interaction = 'idle';
			activeHandle = null;

			if (overlayRef?.hasPointerCapture(e.pointerId)) {
				overlayRef.releasePointerCapture(e.pointerId);
			}
		}
	}

	function onPointerLeave() {
		if (interaction === 'idle') {
			hoveredHandle = null;
			currentCursor = 'crosshair';
		}
	}

	// --- Keyboard ---

	function onKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			onCancel();
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			if (cropRect && cropRect.w >= MIN_CROP_PX && cropRect.h >= MIN_CROP_PX) {
				onConfirm(cropRect);
			}
			return;
		}
		if (!cropRect) return;
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

		const step = e.shiftKey ? 10 : 1;
		let moved = false;
		let newRect = { ...cropRect };

		switch (e.key) {
			case 'ArrowLeft':
				newRect.x -= step;
				moved = true;
				break;
			case 'ArrowRight':
				newRect.x += step;
				moved = true;
				break;
			case 'ArrowUp':
				newRect.y -= step;
				moved = true;
				break;
			case 'ArrowDown':
				newRect.y += step;
				moved = true;
				break;
		}
		if (moved) {
			e.preventDefault();
			e.stopPropagation();
			cropRect = clampCropToImage(newRect, imageWidth, imageHeight);
		}
	}

	// Global keyboard listener
	$effect(() => {
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	});

	// svelte-ignore state_referenced_locally
	let _prevImageW = $state(imageWidth);
	// svelte-ignore state_referenced_locally
	let _prevImageH = $state(imageHeight);

	$effect(() => {
		if (imageWidth !== _prevImageW || imageHeight !== _prevImageH) {
			_prevImageW = imageWidth;
			_prevImageH = imageHeight;
			cropRect = null;
			interaction = 'idle';
			activeHandle = null;
		}
	});

	// Expose crop rect for external read
	export function getCropRect(): CropRect | null {
		return cropRect;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={overlayRef}
	class="absolute inset-0 z-30"
	style="cursor: {currentCursor}"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointerleave={onPointerLeave}
>
	<svg width={svgWidth} height={svgHeight} class="absolute inset-0" style="pointer-events: none">
		<defs>
			<mask id={_maskId}>
				<rect width="100%" height="100%" fill="white" />
				{#if cropScreen}
					<rect
						x={cropScreen.x}
						y={cropScreen.y}
						width={cropScreen.w}
						height={cropScreen.h}
						fill="black"
					/>
				{/if}
			</mask>
		</defs>

		<!-- Dark overlay with crop cutout -->
		<rect width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#{_maskId})" />

		{#if cropScreen}
			<!-- Dashed crop border -->
			<rect
				x={cropScreen.x}
				y={cropScreen.y}
				width={cropScreen.w}
				height={cropScreen.h}
				fill="none"
				stroke="white"
				stroke-width="1.5"
				stroke-dasharray="6 3"
				class="pointer-events-none"
			/>

			<!-- Hovered edge highlights -->
			{#if hoveredHandle === 'n'}
				<line
					x1={cropScreen.x}
					y1={cropScreen.y}
					x2={cropScreen.x + cropScreen.w}
					y2={cropScreen.y}
					stroke="rgba(59,130,246,0.8)"
					stroke-width="3"
					class="pointer-events-none"
				/>
			{:else if hoveredHandle === 's'}
				<line
					x1={cropScreen.x}
					y1={cropScreen.y + cropScreen.h}
					x2={cropScreen.x + cropScreen.w}
					y2={cropScreen.y + cropScreen.h}
					stroke="rgba(59,130,246,0.8)"
					stroke-width="3"
					class="pointer-events-none"
				/>
			{:else if hoveredHandle === 'w'}
				<line
					x1={cropScreen.x}
					y1={cropScreen.y}
					x2={cropScreen.x}
					y2={cropScreen.y + cropScreen.h}
					stroke="rgba(59,130,246,0.8)"
					stroke-width="3"
					class="pointer-events-none"
				/>
			{:else if hoveredHandle === 'e'}
				<line
					x1={cropScreen.x + cropScreen.w}
					y1={cropScreen.y}
					x2={cropScreen.x + cropScreen.w}
					y2={cropScreen.y + cropScreen.h}
					stroke="rgba(59,130,246,0.8)"
					stroke-width="3"
					class="pointer-events-none"
				/>
			{/if}

			<!-- Rule of thirds grid -->
			{#if cropScreen.w > 40 && cropScreen.h > 40}
				<line
					x1={cropScreen.x + cropScreen.w / 3}
					y1={cropScreen.y}
					x2={cropScreen.x + cropScreen.w / 3}
					y2={cropScreen.y + cropScreen.h}
					stroke="rgba(255,255,255,0.3)"
					stroke-width="0.5"
				/>
				<line
					x1={cropScreen.x + (cropScreen.w * 2) / 3}
					y1={cropScreen.y}
					x2={cropScreen.x + (cropScreen.w * 2) / 3}
					y2={cropScreen.y + cropScreen.h}
					stroke="rgba(255,255,255,0.3)"
					stroke-width="0.5"
				/>
				<line
					x1={cropScreen.x}
					y1={cropScreen.y + cropScreen.h / 3}
					x2={cropScreen.x + cropScreen.w}
					y2={cropScreen.y + cropScreen.h / 3}
					stroke="rgba(255,255,255,0.3)"
					stroke-width="0.5"
				/>
				<line
					x1={cropScreen.x}
					y1={cropScreen.y + (cropScreen.h * 2) / 3}
					x2={cropScreen.x + cropScreen.w}
					y2={cropScreen.y + (cropScreen.h * 2) / 3}
					stroke="rgba(255,255,255,0.3)"
					stroke-width="0.5"
				/>
			{/if}

			<!-- Resize handles -->
			{#each [{ id: 'nw', hx: cropScreen.x, hy: cropScreen.y }, { id: 'n', hx: cropScreen.x + cropScreen.w / 2, hy: cropScreen.y }, { id: 'ne', hx: cropScreen.x + cropScreen.w, hy: cropScreen.y }, { id: 'e', hx: cropScreen.x + cropScreen.w, hy: cropScreen.y + cropScreen.h / 2 }, { id: 'se', hx: cropScreen.x + cropScreen.w, hy: cropScreen.y + cropScreen.h }, { id: 's', hx: cropScreen.x + cropScreen.w / 2, hy: cropScreen.y + cropScreen.h }, { id: 'sw', hx: cropScreen.x, hy: cropScreen.y + cropScreen.h }, { id: 'w', hx: cropScreen.x, hy: cropScreen.y + cropScreen.h / 2 }] as handle (handle.id)}
				<rect
					x={handle.hx - handleSize / 2}
					y={handle.hy - handleSize / 2}
					width={handleSize}
					height={handleSize}
					fill={hoveredHandle === handle.id ? '#ffffff' : 'rgba(255,255,255,0.9)'}
					stroke={hoveredHandle === handle.id ? '#000000' : 'rgba(0,0,0,0.5)'}
					stroke-width="1"
					rx="1"
				/>
			{/each}

			<!-- Dimension label -->
			{#if cropRect}
				{@const labelX = cropScreen.x + cropScreen.w / 2}
				{@const labelY = cropScreen.y - 8}
				{@const label = `${Math.round(cropRect.w)} × ${Math.round(cropRect.h)}`}
				<text
					x={labelX}
					y={labelY > 16 ? labelY : cropScreen.y + cropScreen.h + 16}
					text-anchor="middle"
					fill="white"
					font-family="monospace"
					font-size="11"
					class="pointer-events-none select-none"
				>
					{label}
				</text>
			{/if}
		{/if}
	</svg>
</div>

<!-- Aspect ratio toolbar -->
<div
	role="toolbar"
	aria-label="Crop aspect ratio"
	tabindex="-1"
	class="pointer-events-auto absolute top-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-0 border border-foreground/30 bg-[#f7f7f4]/90 px-1 font-mono text-[11px] backdrop-blur-sm dark:bg-background/90"
	onpointerdown={(e) => e.stopPropagation()}
>
	<span class="px-1.5 text-[10px] text-muted-foreground uppercase">Ratio</span>
	<div class="mx-0.5 h-4 w-px bg-border"></div>
	{#each RATIO_PRESETS as preset (preset.id)}
		<button
			class="flex h-6 cursor-pointer items-center px-1.5 transition-colors hover:bg-muted {aspectPreset ===
			preset.id
				? 'bg-muted font-bold text-foreground'
				: 'text-muted-foreground'}"
			onclick={() => onAspectRatioChange(preset.id)}
		>
			{preset.label}
		</button>
	{/each}
</div>

<!-- Confirm / Cancel buttons -->
<div
	role="toolbar"
	aria-label="Crop actions"
	tabindex="-1"
	class="pointer-events-auto absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 border border-foreground/30 bg-[#f7f7f4]/90 px-2 py-1.5 font-mono text-[11px] backdrop-blur-sm dark:bg-background/90"
	onpointerdown={(e) => e.stopPropagation()}
>
	<button
		class="h-6 cursor-pointer border border-foreground/30 px-3 text-muted-foreground transition-colors hover:bg-muted"
		onclick={onCancel}
	>
		Cancel
	</button>
	<button
		class="h-6 cursor-pointer border border-foreground bg-foreground px-3 text-background transition-opacity hover:opacity-90 disabled:opacity-40"
		disabled={!cropRect || cropRect.w < MIN_CROP_PX || cropRect.h < MIN_CROP_PX}
		onclick={() => cropRect && onConfirm(cropRect)}
	>
		Apply Crop
	</button>
	<span class="ml-1 text-muted-foreground/60">
		{#if cropRect}
			{Math.round(cropRect.w)}×{Math.round(cropRect.h)}
		{:else}
			Drag to select
		{/if}
	</span>
</div>
