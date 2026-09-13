<script lang="ts">
	import { AlertTriangle, Columns2, Images, Maximize, ZoomIn, ZoomOut } from 'lucide-svelte';
	import FileDropzone from './FileDropzone.svelte';
	import SplitCompare from './SplitCompare.svelte';
	import CropOverlay from './CropOverlay.svelte';
	import type { SampleImage } from '$lib/editor-types';
	import type { CropRect } from '$lib/crop-utils';
	import {
		annotationPlacementFromPoint,
		topLeftFromAnnotationPlacement,
		type AnnotationPlacement,
		type AnnotationTextMetrics
	} from '$lib/annotation-utils';

	let {
		originalImageUrl = null,
		processedImageUrl = null,
		originalPreviewFailed = false,
		isLoading = false,
		wasmLoaded = true,
		magickSettings = null,
		annotationMetrics = null,
		annotationPlacementActive = false,
		annotationMenuActive = false,
		cropActive = false,
		cropAspectRatio = 'free',
		initialCrop = null,
		onBrowse = () => {},
		onSelectSample = () => {},
		onStateChange = () => {},
		onAnnotationPlace = () => {},
		onAnnotationPlacementChange = () => {},
		onCropConfirm = () => {},
		onCropCancel = () => {},
		onCropChange = () => {},
		onCropAspectRatioChange = () => {}
	}: {
		originalImageUrl?: string | null;
		processedImageUrl?: string | null;
		originalPreviewFailed?: boolean;
		isLoading?: boolean;
		wasmLoaded?: boolean;
		magickSettings?: {
			rotate?: string;
			resizeW?: number | null;
			resizeH?: number | null;
			annotateText?: string;
			annotateFontFamily?: string;
			annotateFontSize?: [number];
			annotateGravity?: AnnotationPlacement['gravity'];
			annotateOffsetX?: number;
			annotateOffsetY?: number;
			annotateAngle?: [number];
		} | null;
		annotationMetrics?: AnnotationTextMetrics | null;
		currentProcessingStep?: string | null;
		annotationPlacementActive?: boolean;
		annotationMenuActive?: boolean;
		cropActive?: boolean;
		cropAspectRatio?: string;
		initialCrop?: { x: number; y: number; w: number; h: number } | null;
		onBrowse?: () => void;
		onSelectSample?: (s: SampleImage) => void;
		onStateChange?: (s: { zoom: number }) => void;
		onAnnotationPlace?: (placement: AnnotationPlacement) => void;
		onAnnotationPlacementChange?: (active: boolean) => void;
		onCropConfirm?: (crop: CropRect) => void;
		onCropCancel?: () => void;
		onCropChange?: (crop: CropRect | null) => void;
		onCropAspectRatioChange?: (preset: string) => void;
	} = $props();

	let showPlaceholder = $derived(!originalImageUrl);
	let isInitializing = $derived(!wasmLoaded);
	let isComparing = $state(false);
	let splitMode = $state(false);
	let skipNextFit = false;

	// Zoom & Pan
	let currentZoom = $state(100);
	let isPanning = $state(false);
	let imageX = $state(0);
	let imageY = $state(0);
	let startPointerX = 0;
	let startPointerY = 0;
	let initialImageX = 0;
	let initialImageY = 0;
	let capturedPointerId = $state<number | null>(null);

	let previewImageRef = $state<HTMLImageElement | null>(null);
	let viewportRef = $state<HTMLDivElement | null>(null);
	let loadedOriginalUrl: string | null | undefined = null;
	let displayedWidth = $state(0);
	let displayedHeight = $state(0);
	let annotationFontReady = $state(0);

	$effect(() => {
		const fontFamily = magickSettings?.annotateFontFamily?.trim();
		const fontSize = magickSettings?.annotateFontSize?.[0] ?? 24;
		if (typeof document === 'undefined' || !fontFamily) return;
		let active = true;
		void document.fonts.load(`${fontSize}px "${fontFamily}"`).then(() => {
			if (active) annotationFontReady += 1;
		});
		return () => {
			active = false;
		};
	});

	function measureAnnotationText(_fontReady: number): AnnotationTextMetrics {
		const text = magickSettings?.annotateText ?? '';
		if (!text) {
			return {
				advanceWidth: 0,
				layoutHeight: 0,
				inkWidth: 0,
				inkHeight: 0,
				inkOffsetX: 0,
				inkOffsetYNorth: 0,
				inkOffsetYCenter: 0,
				inkOffsetYSouth: 0
			};
		}
		const fontSize = magickSettings?.annotateFontSize?.[0] ?? 24;
		const fontFamily = magickSettings?.annotateFontFamily?.trim() || 'sans-serif';
		const lines = text.split(/\r?\n/);
		let advanceWidth = Math.max(
			1,
			fontSize * 0.6 * Math.max(...lines.map((line) => line.length), 1)
		);
		let inkWidth = advanceWidth;
		let lineHeight = fontSize * 1.2;
		let inkHeight = lineHeight * lines.length;

		if (typeof document !== 'undefined') {
			const canvas = document.createElement('canvas');
			const context = canvas.getContext('2d');
			if (context) {
				context.font = `${fontSize}px "${fontFamily}"`;
				let measuredInkHeight = 0;
				advanceWidth = Math.max(1, ...lines.map((line) => context.measureText(line || ' ').width));
				inkWidth = Math.max(
					1,
					...lines.map((line) => {
						const metrics = context.measureText(line || ' ');
						const lineInkWidth =
							(metrics.actualBoundingBoxLeft || 0) +
							(metrics.actualBoundingBoxRight || metrics.width);
						measuredInkHeight = Math.max(
							measuredInkHeight,
							(metrics.actualBoundingBoxAscent || fontSize * 0.8) +
								(metrics.actualBoundingBoxDescent || fontSize * 0.2)
						);
						return lineInkWidth;
					})
				);
				if (measuredInkHeight > 0) {
					lineHeight = measuredInkHeight;
					inkHeight = measuredInkHeight * lines.length;
				}
			}
		}

		const angle = Math.abs(magickSettings?.annotateAngle?.[0] ?? 0) * (Math.PI / 180);
		const layoutHeight = lineHeight * lines.length;
		const rotatedAdvanceWidth =
			Math.abs(advanceWidth * Math.cos(angle)) + Math.abs(layoutHeight * Math.sin(angle));
		const rotatedLayoutHeight =
			Math.abs(advanceWidth * Math.sin(angle)) + Math.abs(layoutHeight * Math.cos(angle));
		const rotatedInkWidth =
			Math.abs(inkWidth * Math.cos(angle)) + Math.abs(inkHeight * Math.sin(angle));
		const rotatedInkHeight =
			Math.abs(inkWidth * Math.sin(angle)) + Math.abs(inkHeight * Math.cos(angle));
		const horizontalInkInset = Math.max(0, (advanceWidth - inkWidth) / 2);
		const verticalInkInset = Math.max(0, (layoutHeight - inkHeight) / 2);
		return {
			advanceWidth: rotatedAdvanceWidth,
			layoutHeight: rotatedLayoutHeight,
			inkWidth: rotatedInkWidth,
			inkHeight: rotatedInkHeight,
			inkOffsetX: horizontalInkInset,
			inkOffsetYNorth: 0,
			inkOffsetYCenter: verticalInkInset,
			inkOffsetYSouth: verticalInkInset
		};
	}

	let annotationTextMetrics = $derived(
		annotationMetrics ?? measureAnnotationText(annotationFontReady)
	);

	$effect(() => {
		if (splitMode && annotationPlacementActive) onAnnotationPlacementChange(false);
	});

	let annotationPoint = $derived.by(() => {
		if (
			!magickSettings?.annotateGravity ||
			!displayedWidth ||
			!displayedHeight ||
			magickSettings.annotateOffsetX == null ||
			magickSettings.annotateOffsetY == null
		) {
			return null;
		}
		return topLeftFromAnnotationPlacement(
			{
				gravity: magickSettings.annotateGravity,
				offsetX: magickSettings.annotateOffsetX,
				offsetY: magickSettings.annotateOffsetY
			},
			displayedWidth,
			displayedHeight,
			annotationTextMetrics
		);
	});

	let annotationMarkerStyle = $derived.by(() => {
		if (!annotationPoint || !viewportRef) return '';
		const scale = currentZoom / 100;
		const x = imageX + (annotationPoint.x - displayedWidth / 2) * scale;
		const y = imageY + (annotationPoint.y - displayedHeight / 2) * scale;
		return `left: calc(50% + ${x}px); top: calc(50% + ${y}px);`;
	});

	let imageStyle = $derived(`
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(calc(-50% + ${imageX}px), calc(-50% + ${imageY}px)) scale(${currentZoom / 100});
		display: ${showPlaceholder ? 'none' : 'block'};
		cursor: ${
			annotationPlacementActive && annotationMenuActive
				? 'crosshair'
				: isPanning
					? 'grabbing'
					: 'grab'
		};
	`);

	let displayedImage = $derived(
		isComparing ? originalImageUrl : processedImageUrl || originalImageUrl
	);

	// Warn exactly while the original (which the browser cannot render) is the
	// image on screen — before processing, and in compare/split views.
	let imageFailed = $derived(
		!!originalPreviewFailed && displayedImage === originalImageUrl && !!originalImageUrl
	);

	let canSplit = $derived(
		!!processedImageUrl && !!originalImageUrl && processedImageUrl !== originalImageUrl
	);

	let rotationLabel = $derived.by(() => {
		if (!magickSettings) return '';
		const r = parseInt(magickSettings.rotate ?? '0');
		if (r === 0) return '';
		return r > 0 ? `${r}° CW` : `${Math.abs(r)}° CCW`;
	});
	// Report state (zoom) to parent for the status bar.
	$effect(() => {
		onStateChange({ zoom: currentZoom });
	});

	function zoomAt(clientX: number, clientY: number, targetZoom: number) {
		const oldZoom = currentZoom;
		const newZoom = Math.max(10, Math.min(5000, targetZoom));
		if (newZoom === oldZoom) return;
		if (!viewportRef) return;
		const rect = viewportRef.getBoundingClientRect();
		const cx = rect.left + rect.width / 2;
		const cy = rect.top + rect.height / 2;
		const Px = clientX - cx;
		const Py = clientY - cy;
		const r = newZoom / oldZoom;
		imageX = Px * (1 - r) + imageX * r;
		imageY = Py * (1 - r) + imageY * r;
		currentZoom = newZoom;
	}

	function getFitZoom(): number {
		if (!previewImageRef || !viewportRef) return 100;
		const img = previewImageRef;
		const container = viewportRef;
		if (!img.naturalWidth || !img.naturalHeight) return 100;
		const padding = 12;
		const cw = container.clientWidth - padding;
		const ch = container.clientHeight - padding;
		const iw = img.naturalWidth;
		const ih = img.naturalHeight;
		const scale = Math.min(cw / iw, ch / ih);
		return Math.max(10, Math.min(5000, scale * 100));
	}

	export function fitImageToScreen() {
		if (isComparing) return;
		if (!previewImageRef || !viewportRef) return;
		imageX = 0;
		imageY = 0;
		if (!previewImageRef.naturalWidth || !previewImageRef.naturalHeight) return;
		currentZoom = getFitZoom();
	}

	export function resetView() {
		fitImageToScreen();
	}

	function getViewportCenter() {
		if (!viewportRef) return { x: 0, y: 0 };
		const rect = viewportRef.getBoundingClientRect();
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
	}

	export function zoomIn() {
		const { x, y } = getViewportCenter();
		zoomAt(x, y, currentZoom * 1.1);
	}
	export function zoomOut() {
		const { x, y } = getViewportCenter();
		zoomAt(x, y, currentZoom / 1.1);
	}
	export function startCompare() {
		if (processedImageUrl) isComparing = true;
	}
	export function endCompare() {
		skipNextFit = true;
		isComparing = false;
	}
	export function toggleSplitCompare() {
		if (canSplit) {
			splitMode = !splitMode;
			if (splitMode && annotationPlacementActive) onAnnotationPlacementChange(false);
		}
	}
	export function zoomToOneToOne() {
		const { x, y } = getViewportCenter();
		zoomAt(x, y, 100);
	}
	export function getZoom() {
		return currentZoom;
	}

	function handleImageLoad() {
		if (isComparing) return;
		if (previewImageRef) {
			displayedWidth = previewImageRef.naturalWidth;
			displayedHeight = previewImageRef.naturalHeight;
		}
		if (skipNextFit) {
			skipNextFit = false;
			loadedOriginalUrl = processedImageUrl;
			return;
		}
		loadedOriginalUrl = processedImageUrl;
		fitImageToScreen();
	}

	// Re-fit when the processed image changes (history navigation can swap
	// the <img src> to a cached copy, in which case onload may not refire
	// and the previous fit would be stale for the new dimensions).
	// Only refit for the processed image — toggling between processed and
	// original for hold-to-compare must not reset zoom/pan.
	$effect(() => {
		const url = processedImageUrl;
		if (!url) return;
		if (loadedOriginalUrl === url) return;
		let frame = 0;
		const tryFit = () => {
			if (!previewImageRef) return;
			if (previewImageRef.naturalWidth > 0 && previewImageRef.naturalHeight > 0) {
				loadedOriginalUrl = url;
				fitImageToScreen();
				return;
			}
			frame = requestAnimationFrame(tryFit);
		};
		frame = requestAnimationFrame(tryFit);
		return () => cancelAnimationFrame(frame);
	});

	function handleResize() {
		if (!showPlaceholder) fitImageToScreen();
	}

	function onWheel(e: WheelEvent) {
		if (showPlaceholder || cropActive) return;
		e.preventDefault();
		zoomAt(e.clientX, e.clientY, currentZoom * Math.exp(-e.deltaY * 0.001));
	}

	function onPointerDown(e: PointerEvent) {
		if (showPlaceholder || e.button !== 0 || cropActive) return;
		if (annotationPlacementActive && annotationMenuActive) {
			e.preventDefault();
			e.stopPropagation();
			placeAnnotationAt(e.clientX, e.clientY);
			return;
		}
		isPanning = true;
		startPointerX = e.clientX;
		startPointerY = e.clientY;
		initialImageX = imageX;
		initialImageY = imageY;
		if (viewportRef) {
			viewportRef.setPointerCapture(e.pointerId);
			capturedPointerId = e.pointerId;
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!isPanning || cropActive) return;
		imageX = initialImageX + (e.clientX - startPointerX);
		imageY = initialImageY + (e.clientY - startPointerY);
	}

	function finishPan() {
		if (capturedPointerId !== null && viewportRef) {
			if (viewportRef.hasPointerCapture(capturedPointerId)) {
				viewportRef.releasePointerCapture(capturedPointerId);
			}
			capturedPointerId = null;
		}
		isPanning = false;
	}

	function onPointerUp() {
		finishPan();
	}

	// Touch state
	let touchMode = $state<'none' | 'pan' | 'pinch'>('none');
	let touchPanStartX = 0;
	let touchPanStartY = 0;
	let touchPanInitialImageX = 0;
	let touchPanInitialImageY = 0;
	let lastTouchDistance = $state<number | null>(null);

	function onTouchStart(e: TouchEvent) {
		if (showPlaceholder || cropActive) return;
		if (annotationPlacementActive && annotationMenuActive) {
			e.preventDefault();
			const touch = e.touches[0];
			if (touch) placeAnnotationAt(touch.clientX, touch.clientY);
			return;
		}
		if (e.touches.length === 1) {
			touchMode = 'pan';
			touchPanStartX = e.touches[0].clientX;
			touchPanStartY = e.touches[0].clientY;
			touchPanInitialImageX = imageX;
			touchPanInitialImageY = imageY;
			isPanning = true;
		} else if (e.touches.length === 2) {
			touchMode = 'pinch';
			isPanning = false;
			const dx = e.touches[0].clientX - e.touches[1].clientX;
			const dy = e.touches[0].clientY - e.touches[1].clientY;
			lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
		}
	}

	function onTouchMove(e: TouchEvent) {
		if (showPlaceholder) return;
		if (touchMode === 'pan' && e.touches.length >= 1) {
			e.preventDefault();
			imageX = touchPanInitialImageX + (e.touches[0].clientX - touchPanStartX);
			imageY = touchPanInitialImageY + (e.touches[0].clientY - touchPanStartY);
		} else if (touchMode === 'pinch' && e.touches.length >= 2 && lastTouchDistance !== null) {
			e.preventDefault();
			const dx = e.touches[0].clientX - e.touches[1].clientX;
			const dy = e.touches[0].clientY - e.touches[1].clientY;
			const newDistance = Math.sqrt(dx * dx + dy * dy);
			const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
			const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
			const scaleFactor = newDistance / lastTouchDistance;
			zoomAt(centerX, centerY, currentZoom * scaleFactor);
			lastTouchDistance = newDistance;
		}
	}

	function onTouchEnd(e: TouchEvent) {
		if (e.touches.length === 0) {
			touchMode = 'none';
			lastTouchDistance = null;
			isPanning = false;
		} else if (e.touches.length === 1 && touchMode === 'pinch') {
			touchMode = 'pan';
			lastTouchDistance = null;
			touchPanStartX = e.touches[0].clientX;
			touchPanStartY = e.touches[0].clientY;
			touchPanInitialImageX = imageX;
			touchPanInitialImageY = imageY;
			isPanning = true;
		}
	}

	function onDblClick(e: MouseEvent) {
		if (showPlaceholder || (annotationPlacementActive && annotationMenuActive)) return;
		e.preventDefault();
		if (Math.abs(currentZoom - getFitZoom()) < 1) {
			zoomAt(e.clientX, e.clientY, 100);
		} else {
			fitImageToScreen();
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.code === 'Escape' && annotationPlacementActive && annotationMenuActive) {
			e.preventDefault();
			onAnnotationPlacementChange(false);
			return;
		}
		if (showPlaceholder || !processedImageUrl) return;
		if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
		if (e.code === 'Space') {
			e.preventDefault();
			if (!isComparing) isComparing = true;
		}
	}

	function handleKeyUp(e: KeyboardEvent) {
		if (e.code === 'Space') {
			e.preventDefault();
			endCompare();
		}
	}

	function placeAnnotationAt(clientX: number, clientY: number): void {
		if (!previewImageRef || !displayedWidth || !displayedHeight) return;
		const rect = previewImageRef.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom)
			return;

		const x = ((clientX - rect.left) / rect.width) * displayedWidth;
		const y = ((clientY - rect.top) / rect.height) * displayedHeight;
		onAnnotationPlace(
			annotationPlacementFromPoint({ x, y }, displayedWidth, displayedHeight, annotationTextMetrics)
		);
	}
</script>

<svelte:window onkeydown={handleKeyDown} onkeyup={handleKeyUp} onresize={handleResize} />

<main class="canvas-area relative flex h-full min-h-0 w-full flex-col bg-canvas">
	<div
		bind:this={viewportRef}
		role="img"
		aria-label="Image preview viewport. Use mouse wheel to zoom, drag to pan."
		onwheel={onWheel}
		ondblclick={onDblClick}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointerleave={finishPan}
		ontouchstart={onTouchStart}
		ontouchmove={onTouchMove}
		ontouchend={onTouchEnd}
		ontouchcancel={onTouchEnd}
		class="viewport relative flex h-full min-h-0 w-full flex-grow items-center justify-center overflow-hidden select-none {!showPlaceholder
			? 'touch-none'
			: ''}"
	>
		{#if isInitializing}
			<div class="text-center text-muted-foreground">
				<div class="mx-auto mb-4 flex size-16 items-center justify-center">
					<div class="relative size-12">
						<div class="absolute inset-0 rounded-full border-2 border-muted/30"></div>
						<div class="absolute inset-0 animate-spin rounded-full border-2 border-t-primary"></div>
					</div>
				</div>
				<h3 class="mb-1 font-mono text-xs font-semibold tracking-wider text-foreground uppercase">
					Initializing Image Engine
				</h3>
				<p class="font-mono text-[11px]">Loading ImageMagick…</p>
			</div>
		{:else if showPlaceholder}
			<FileDropzone {onBrowse} {onSelectSample} />
		{:else if splitMode && canSplit}
			<SplitCompare
				originalUrl={originalImageUrl!}
				processedUrl={processedImageUrl!}
				{imageStyle}
				originalLabel="Original"
				processedLabel="Processed"
			/>
			<!-- keep a hidden img for fit-to-screen natural-size probing -->
			<img
				bind:this={previewImageRef}
				src={displayedImage ?? ''}
				onload={handleImageLoad}
				style="display:none"
				alt=""
				aria-hidden="true"
			/>
		{:else if imageFailed}
			<div
				class="checkerboard flex items-center justify-center p-36 text-xl font-medium text-foreground lg:p-64"
				style={imageStyle}
			>
				PLACEHOLDER
			</div>
		{:else}
			<img
				bind:this={previewImageRef}
				src={displayedImage ?? ''}
				onload={handleImageLoad}
				style={imageStyle}
				alt={isComparing ? 'Original image before processing' : 'Processed image preview'}
				draggable="false"
				class="checkerboard max-h-none max-w-none origin-center object-contain {processedImageUrl ||
				originalImageUrl
					? 'opacity-100'
					: 'opacity-0'} {isLoading ? 'animate-opacity-pulse' : ''}"
			/>
			{#if annotationMenuActive && annotationPoint && (annotationPlacementActive || magickSettings?.annotateText?.trim()) && !isComparing}
				<div
					class="pointer-events-none absolute z-30 size-5 -translate-x-1/2 -translate-y-1/2 mix-blend-difference"
					style={annotationMarkerStyle}
					aria-hidden="true"
				>
					<span class="absolute top-1/2 left-0 h-px w-5 -translate-y-1/2 bg-white"></span>
					<span class="absolute top-0 left-1/2 h-5 w-px -translate-x-1/2 bg-white"></span>
				</div>
			{/if}
			{#if annotationMenuActive && annotationPlacementActive && !isComparing}
				<div
					class="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 border border-foreground/30 bg-[#f7f7f4]/90 px-2 py-1 font-mono text-[11px] text-foreground backdrop-blur-sm dark:bg-background/90"
					role="status"
				>
					CLICK TO PLACE · ESC TO EXIT
				</div>
			{/if}
			{#if isComparing}
				<div
					class="pointer-events-none absolute top-3 z-30 border border-foreground/30 bg-[#f7f7f4] px-2 py-1 font-mono text-[11px] text-muted-foreground dark:bg-background"
					style="left: 12px"
				>
					[ Before ]
				</div>
			{/if}
			{#if rotationLabel && !isComparing}
				<div
					class="pointer-events-none absolute top-3 right-3 z-30 border border-foreground/30 bg-[#f7f7f4] px-2 py-1 font-mono text-[11px] text-muted-foreground dark:bg-background"
				>
					↻ {rotationLabel}
				</div>
			{/if}
			{#if cropActive}
				<CropOverlay
					imageWidth={displayedWidth || 100}
					imageHeight={displayedHeight || 100}
					zoom={currentZoom}
					{imageX}
					{imageY}
					{viewportRef}
					aspectRatio={cropAspectRatio}
					{initialCrop}
					resetKey={displayedImage}
					onConfirm={onCropConfirm}
					onCancel={onCropCancel}
					onChange={onCropChange}
					onAspectRatioChange={onCropAspectRatioChange}
				/>
			{/if}
		{/if}

		{#if imageFailed}
			<div
				class="pointer-events-none absolute top-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 border border-amber-600/40 bg-amber-50/90 px-2 py-1 font-mono text-[11px] text-amber-700 backdrop-blur-sm dark:bg-amber-950/80 dark:text-amber-400"
				role="status"
			>
				<AlertTriangle class="size-3 shrink-0" />
				<span class="pl-2"
					>Original not renderable in this browser - it will appear after processing</span
				>
			</div>
		{/if}

		<!-- Floating zoom/compare toolbar -->
		{#if !showPlaceholder && !isInitializing}
			<div
				role="toolbar"
				aria-label="Image controls"
				tabindex="-1"
				ondblclick={(e) => e.stopPropagation()}
				onpointerdown={(e) => e.stopPropagation()}
				onpointerup={(e) => e.stopPropagation()}
				onpointerleave={(e) => e.stopPropagation()}
				class="pointer-events-auto absolute bottom-3 left-1/2 z-20 hidden -translate-x-1/2 animate-in items-center gap-0 border border-foreground/30 bg-[#f7f7f4]/85 px-1 font-mono text-[11px] backdrop-blur-sm duration-200 fade-in slide-in-from-bottom-2 md:flex dark:bg-background/85"
			>
				<button
					onclick={zoomOut}
					class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					aria-label="Zoom out (Ctrl+-)"
				>
					<ZoomOut class="size-3.5" />
				</button>
				<button
					onclick={zoomToOneToOne}
					class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					aria-label="Reset zoom to 100%"
				>
					<span class="tabular-nums">{Math.round(currentZoom)}%</span>
				</button>
				<button
					onclick={zoomIn}
					class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					aria-label="Zoom in (Ctrl+=)"
				>
					<ZoomIn class="size-3.5" />
				</button>
				<button
					onclick={resetView}
					disabled={imageFailed}
					class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
					aria-label="Fit to screen (Ctrl+0)"
				>
					<Maximize class="size-3.5" />
				</button>
				<div class="mx-0.5 h-4 w-px bg-border"></div>
				<button
					onpointerdown={(e) => {
						e.stopPropagation();
						startCompare();
					}}
					onpointerup={(e) => {
						e.stopPropagation();
						endCompare();
					}}
					onpointerleave={(e) => {
						e.stopPropagation();
						endCompare();
					}}
					disabled={!processedImageUrl}
					class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 {isComparing
						? 'bg-muted text-foreground'
						: ''}"
					aria-label="Hold to compare (Space)"
				>
					<Images class="size-3.5" />
				</button>
				<button
					onclick={toggleSplitCompare}
					disabled={!canSplit}
					class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 {splitMode
						? 'bg-muted text-foreground'
						: ''}"
					aria-label="Split compare (B)"
				>
					<Columns2 class="size-3.5" />
				</button>
			</div>
		{/if}
	</div>
</main>
