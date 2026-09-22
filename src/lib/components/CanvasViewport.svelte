<script lang="ts">
	import { Columns2, Images, Maximize, ZoomIn, ZoomOut } from 'lucide-svelte';
	import FileDropzone from './FileDropzone.svelte';
	import HoverTooltip from './controls/HoverTooltip.svelte';
	import { shortcutModifier } from '$lib/shortcuts';
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
		originalPreviewData = null,
		originalWidth = 0,
		originalHeight = 0,
		originalPreviewWidth = 0,
		originalPreviewHeight = 0,
		originalPreviewLoading = false,
		originalPreviewFull = false,
		processedImageUrl = null,
		processedPreviewUrl = null,
		processedWidth = 0,
		processedHeight = 0,
		processedPreviewData = null,
		processedPreviewWidth = 0,
		processedPreviewHeight = 0,
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
		onPaste = () => {},
		onSelectSample = () => {},
		onStateChange = () => {},
		onAnnotationPlace = () => {},
		onAnnotationPlacementChange = () => {},
		onCropConfirm = () => {},
		onCropCancel = () => {},
		onCropChange = () => {},
		onCropAspectRatioChange = () => {},
		onRequestOriginalFullPreview = () => {},
		onOriginalImageError = () => {}
	}: {
		originalImageUrl?: string | null;
		originalPreviewData?: Uint8Array | null;
		originalWidth?: number;
		originalHeight?: number;
		originalPreviewWidth?: number;
		originalPreviewHeight?: number;
		originalPreviewLoading?: boolean;
		originalPreviewFull?: boolean;
		processedImageUrl?: string | null;
		processedPreviewUrl?: string | null;
		processedWidth?: number;
		processedHeight?: number;
		processedPreviewData?: Uint8Array | null;
		processedPreviewWidth?: number;
		processedPreviewHeight?: number;
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
		onPaste?: (file: File) => void;
		onSelectSample?: (s: SampleImage) => void;
		onStateChange?: (s: { zoom: number }) => void;
		onAnnotationPlace?: (placement: AnnotationPlacement) => void;
		onAnnotationPlacementChange?: (active: boolean) => void;
		onCropConfirm?: (crop: CropRect) => void;
		onCropCancel?: () => void;
		onCropChange?: (crop: CropRect | null) => void;
		onCropAspectRatioChange?: (preset: string) => void;
		onRequestOriginalFullPreview?: () => void;
		onOriginalImageError?: () => void;
	} = $props();

	let showPlaceholder = $derived(!originalImageUrl);
	let isInitializing = $derived(!wasmLoaded);
	let isComparing = $state(false);
	// Locked compare (toggled by tapping the compare button); independent of
	// the momentary hold. A quick tap toggles, a longer press just peeks.
	let compareLocked = $state(false);
	let comparePressStart = 0;
	let compareActive = $derived(isComparing || compareLocked);
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
	let previewCanvasRef = $state<HTMLCanvasElement | null>(null);
	let viewportRef = $state<HTMLDivElement | null>(null);
	let loadedOriginalUrl: string | null | undefined = null;
	let displayedWidth = $state(0);
	let displayedHeight = $state(0);
	let processedPreviewNaturalWidth = $state(0);
	let processedPreviewNaturalHeight = $state(0);

	$effect(() => {
		void processedPreviewUrl;
		void processedImageUrl;
		processedPreviewNaturalWidth = 0;
		processedPreviewNaturalHeight = 0;
	});
	let annotationFontReady = $state(0);
	let displayedPreviewData = $derived(
		compareActive
			? originalPreviewData?.length
				? originalPreviewData
				: null
			: processedPreviewData?.length
				? processedPreviewData
				: processedImageUrl
					? null
					: originalPreviewData
	);
	let displayedPreviewWidth = $derived(
		compareActive
			? originalPreviewWidth
			: processedImageUrl && processedPreviewNaturalWidth
				? processedPreviewNaturalWidth
				: processedPreviewData?.length
					? processedPreviewWidth
					: originalPreviewWidth
	);
	let displayedPreviewHeight = $derived(
		compareActive
			? originalPreviewHeight
			: processedImageUrl && processedPreviewNaturalHeight
				? processedPreviewNaturalHeight
				: processedPreviewData?.length
					? processedPreviewHeight
					: originalPreviewHeight
	);
	let displayedLogicalWidth = $derived(
		(compareActive ? originalWidth : processedImageUrl ? processedWidth : originalWidth) ||
			displayedPreviewWidth
	);
	let displayedLogicalHeight = $derived(
		(compareActive ? originalHeight : processedImageUrl ? processedHeight : originalHeight) ||
			displayedPreviewHeight
	);
	let previewUnavailable = $derived(
		!displayedPreviewData && !originalImageUrl && !processedImageUrl
	);

	function confirmCropFromPreview(crop: CropRect): void {
		const width = displayedWidth || 0;
		const height = displayedHeight || 0;
		if (!width || !height || !originalWidth || !originalHeight) {
			onCropConfirm(crop);
			return;
		}
		onCropConfirm({
			x: (crop.x * originalWidth) / width,
			y: (crop.y * originalHeight) / height,
			w: (crop.w * originalWidth) / width,
			h: (crop.h * originalHeight) / height
		});
	}
	let lastFittedPreview: Uint8Array | null = null;
	let lastSourceUrl: string | null = null;
	let fullPreviewTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		if (originalImageUrl === lastSourceUrl) return;
		lastSourceUrl = originalImageUrl;
		currentZoom = 100;
		imageX = 0;
		imageY = 0;
		lastFittedPreview = null;
		if (fullPreviewTimer) {
			clearTimeout(fullPreviewTimer);
			fullPreviewTimer = null;
		}
	});

	$effect(() => {
		const preview = displayedPreviewData;
		if (!preview || preview === lastFittedPreview) return;
		lastFittedPreview = preview;
		if (
			(originalPreviewFull && preview === originalPreviewData) ||
			(currentZoom === 100 && imageX === 0 && imageY === 0)
		) {
			let attempts = 0;
			const fitWhenReady = () => {
				if (preview !== displayedPreviewData) return;
				if (viewportRef?.clientWidth && viewportRef.clientHeight) {
					fitImageToScreen();
					return;
				}
				if (attempts++ < 10) requestAnimationFrame(fitWhenReady);
			};
			requestAnimationFrame(fitWhenReady);
		}
	});

	$effect(() => {
		if (!previewCanvasRef || !displayedPreviewData) return;
		const usingProcessedPreview = !compareActive && !!processedPreviewData?.length;
		const data = displayedPreviewData;
		const width = usingProcessedPreview ? processedPreviewWidth : originalPreviewWidth;
		const height = usingProcessedPreview ? processedPreviewHeight : originalPreviewHeight;
		if (!data || !width || !height) return;
		const canvas = previewCanvasRef;
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (context) {
			context.putImageData(
				new ImageData(new Uint8ClampedArray(data), canvas.width, canvas.height),
				0,
				0
			);
		}
	});

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
	let annotationCoordinateWidth = $derived(
		(processedImageUrl ? processedWidth : originalWidth) || displayedWidth
	);
	let annotationCoordinateHeight = $derived(
		(processedImageUrl ? processedHeight : originalHeight) || displayedHeight
	);

	$effect(() => {
		if (splitMode && annotationPlacementActive) onAnnotationPlacementChange(false);
	});

	let annotationPoint = $derived.by(() => {
		if (
			!magickSettings?.annotateGravity ||
			!annotationCoordinateWidth ||
			!annotationCoordinateHeight ||
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
			annotationCoordinateWidth,
			annotationCoordinateHeight,
			annotationTextMetrics
		);
	});

	let annotationMarkerStyle = $derived.by(() => {
		if (!annotationPoint || !viewportRef) return '';
		const scale = currentZoom / 100;
		const x =
			imageX +
			(annotationPoint.x * (displayedWidth / annotationCoordinateWidth) - displayedWidth / 2) *
				scale;
		const y =
			imageY +
			(annotationPoint.y * (displayedHeight / annotationCoordinateHeight) - displayedHeight / 2) *
				scale;
		return `left: calc(50% + ${x}px); top: calc(50% + ${y}px);`;
	});

	let imageStyle = $derived(`
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(calc(-50% + ${imageX}px), calc(-50% + ${imageY}px)) scale(${currentZoom / 100});
		width: ${displayedLogicalWidth ? `${displayedLogicalWidth}px` : 'auto'};
		height: ${displayedLogicalHeight ? `${displayedLogicalHeight}px` : 'auto'};
		display: ${showPlaceholder || previewUnavailable ? 'none' : 'block'};
		cursor: ${
			annotationPlacementActive && annotationMenuActive
				? 'crosshair'
				: isPanning
					? 'grabbing'
					: 'grab'
		};
	`);

	let displayedImage = $derived(
		compareActive
			? originalImageUrl
			: processedPreviewUrl
				? processedPreviewUrl
				: processedImageUrl || originalImageUrl
	);

	// Warn exactly while the original (which the browser cannot render) is the
	// image on screen — before processing, and in compare/split views.
	let imageFailed = $derived(
		!!originalPreviewFailed &&
			!originalPreviewData &&
			displayedImage === originalImageUrl &&
			!!originalImageUrl
	);
	let originalPreviewPending = $derived(
		originalPreviewLoading &&
			!originalPreviewData &&
			displayedImage === originalImageUrl &&
			!!originalImageUrl
	);

	let canSplit = $derived(
		!!processedImageUrl &&
			!!originalImageUrl &&
			!originalPreviewFailed &&
			processedImageUrl !== originalImageUrl
	);

	// Report state (zoom) to parent for the status bar.
	$effect(() => {
		onStateChange({ zoom: currentZoom });
	});

	function zoomAt(clientX: number, clientY: number, targetZoom: number) {
		if (previewUnavailable) return;
		if (fullPreviewTimer) {
			clearTimeout(fullPreviewTimer);
			fullPreviewTimer = null;
		}
		const oldZoom = currentZoom;
		const newZoom = Math.max(10, Math.min(5000, targetZoom));
		if (newZoom === oldZoom) return;
		if (!viewportRef) return;
		if (
			newZoom > 115 &&
			displayedImage === originalImageUrl &&
			displayedPreviewData &&
			!originalPreviewLoading
		) {
			fullPreviewTimer = setTimeout(() => {
				fullPreviewTimer = null;
				if (currentZoom > 115 && displayedImage === originalImageUrl && !originalPreviewLoading) {
					onRequestOriginalFullPreview();
				}
			}, 2000);
		}
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
		if (!viewportRef) return 100;
		const container = viewportRef;
		const iw = displayedLogicalWidth || previewImageRef?.naturalWidth || 0;
		const ih = displayedLogicalHeight || previewImageRef?.naturalHeight || 0;
		if (!iw || !ih) return 100;
		const padding = 12;
		const cw = container.clientWidth - padding;
		const ch = container.clientHeight - padding;
		const scale = Math.min(cw / iw, ch / ih);
		return Math.max(10, Math.min(5000, scale * 100));
	}

	export function fitImageToScreen() {
		if (previewUnavailable) return;
		if (isComparing) return;
		if (!viewportRef) return;
		imageX = 0;
		imageY = 0;
		displayedWidth = displayedLogicalWidth || previewImageRef?.naturalWidth || 0;
		displayedHeight = displayedLogicalHeight || previewImageRef?.naturalHeight || 0;
		if (!displayedWidth || !displayedHeight) return;
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
	/** Press-and-hold entry point: tap toggles a locked compare, hold just peeks. */
	export function pressCompareDown() {
		if (!processedImageUrl) return;
		comparePressStart = performance.now();
		startCompare();
	}
	export function pressCompareUp() {
		const quickTap = performance.now() - comparePressStart < 250;
		endCompare();
		if (quickTap && processedImageUrl) compareLocked = !compareLocked;
	}
	export function isCompareActive() {
		return compareActive;
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
		if (previewImageRef && processedImageUrl && displayedImage !== originalImageUrl) {
			processedPreviewNaturalWidth = previewImageRef.naturalWidth;
			processedPreviewNaturalHeight = previewImageRef.naturalHeight;
		}
		const preservingZoomedFullImage =
			!!processedPreviewUrl && displayedImage === processedImageUrl && currentZoom >= 110;
		if (previewImageRef) {
			displayedWidth = displayedLogicalWidth || previewImageRef.naturalWidth;
			displayedHeight = displayedLogicalHeight || previewImageRef.naturalHeight;
		}
		if (skipNextFit) {
			skipNextFit = false;
			loadedOriginalUrl = processedImageUrl;
			return;
		}
		loadedOriginalUrl = processedImageUrl;
		if (preservingZoomedFullImage) return;
		fitImageToScreen();
	}

	function handleImageError(): void {
		if (displayedImage === originalImageUrl && !originalPreviewData) onOriginalImageError();
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
		if (!showPlaceholder && !previewUnavailable) fitImageToScreen();
	}

	function onWheel(e: WheelEvent) {
		if (showPlaceholder || previewUnavailable || cropActive) return;
		e.preventDefault();
		zoomAt(e.clientX, e.clientY, currentZoom * Math.exp(-e.deltaY * 0.001));
	}

	function onPointerDown(e: PointerEvent) {
		if (showPlaceholder || previewUnavailable || e.button !== 0 || cropActive) return;
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
		if (showPlaceholder || previewUnavailable || cropActive) return;
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
		if (showPlaceholder || previewUnavailable) return;
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
		if (
			showPlaceholder ||
			previewUnavailable ||
			(annotationPlacementActive && annotationMenuActive)
		)
			return;
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
		if (showPlaceholder || previewUnavailable || !processedImageUrl) return;
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			e.target instanceof HTMLSelectElement ||
			e.target instanceof HTMLButtonElement
		)
			return;
		if (e.code === 'Space') {
			e.preventDefault();
			if (!isComparing) isComparing = true;
		}
	}

	function handleKeyUp(e: KeyboardEvent) {
		if (e.code === 'Space') {
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement ||
				e.target instanceof HTMLButtonElement
			)
				return;
			e.preventDefault();
			endCompare();
		}
	}

	function placeAnnotationAt(clientX: number, clientY: number): void {
		if (!displayedWidth || !displayedHeight) return;
		const preview = displayedPreviewData ? previewCanvasRef : previewImageRef;
		if (!preview) return;
		const rect = preview.getBoundingClientRect();
		if (!rect.width || !rect.height) return;
		if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom)
			return;

		const x = ((clientX - rect.left) / rect.width) * annotationCoordinateWidth;
		const y = ((clientY - rect.top) / rect.height) * annotationCoordinateHeight;
		onAnnotationPlace(
			annotationPlacementFromPoint(
				{ x, y },
				annotationCoordinateWidth,
				annotationCoordinateHeight,
				annotationTextMetrics
			)
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
		class="viewport relative flex h-full min-h-0 w-full flex-grow items-center justify-center overflow-hidden select-none {!showPlaceholder &&
		!previewUnavailable
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
			<FileDropzone {onBrowse} {onPaste} {onSelectSample} />
		{:else if previewUnavailable}
			<div class="text-center text-muted-foreground" role="status" aria-live="polite">
				<div class="mx-auto mb-4 flex size-16 items-center justify-center">
					<div class="relative size-12">
						<div class="absolute inset-0 rounded-full border-2 border-muted/30"></div>
						<div class="absolute inset-0 animate-spin rounded-full border-2 border-t-primary"></div>
					</div>
				</div>
				<p class="font-mono text-xs">Preparing preview…</p>
			</div>
		{:else if splitMode && canSplit}
			<SplitCompare
				originalUrl={originalImageUrl!}
				{originalPreviewData}
				{originalPreviewWidth}
				{originalPreviewHeight}
				processedUrl={processedImageUrl!}
				{processedPreviewUrl}
				{originalWidth}
				{originalHeight}
				{processedWidth}
				{processedHeight}
				{onOriginalImageError}
				{imageStyle}
				originalLabel="Original"
				processedLabel="Processed"
			/>
			<!-- keep a hidden img for fit-to-screen natural-size probing -->
			<img
				bind:this={previewImageRef}
				src={displayedImage ?? ''}
				onload={handleImageLoad}
				onerror={handleImageError}
				style="display:none"
				alt=""
				aria-hidden="true"
			/>
		{:else if originalPreviewPending || (imageFailed && !originalPreviewData)}
			<div class="text-center text-muted-foreground" role="status" aria-live="polite">
				<div class="mx-auto mb-4 flex size-16 items-center justify-center">
					<div class="relative size-12">
						<div class="absolute inset-0 rounded-full border-2 border-muted/30"></div>
						<div class="absolute inset-0 animate-spin rounded-full border-2 border-t-primary"></div>
					</div>
				</div>
				<p class="font-mono text-xs">Loading preview…</p>
			</div>
		{:else}
			<img
				bind:this={previewImageRef}
				src={displayedImage ?? ''}
				onload={handleImageLoad}
				onerror={handleImageError}
				style={imageStyle}
				alt={compareActive ? 'Original image before processing' : 'Processed image preview'}
				draggable="false"
				class="checkerboard max-h-none max-w-none origin-center object-contain {processedImageUrl ||
				originalImageUrl
					? 'opacity-100'
					: 'opacity-0'} {displayedPreviewData ? 'invisible' : ''} {isLoading
					? 'animate-opacity-pulse'
					: ''}"
			/>
			{#if displayedPreviewData}
				<canvas
					bind:this={previewCanvasRef}
					style={imageStyle}
					class="checkerboard max-h-none max-w-none origin-center object-contain"
					aria-label="Processed image preview"
				></canvas>
			{/if}
			{#if originalPreviewLoading && displayedPreviewData}
				<div
					class="pointer-events-none fixed right-3 bottom-12 z-50 max-w-[calc(100%-1.5rem)] sm:right-4"
				>
					<div
						class="flex items-center gap-2 border border-divider bg-background px-3 py-2 font-mono text-xs text-foreground shadow-sm"
						role="status"
					>
						<span
							class="size-3 animate-spin rounded-full border border-muted-foreground/30 border-t-primary"
						></span>
						Loading higher-resolution preview…
					</div>
				</div>
			{/if}
			{#if annotationMenuActive && annotationPoint && (annotationPlacementActive || magickSettings?.annotateText?.trim()) && !compareActive}
				<div
					class="pointer-events-none absolute z-30 size-5 -translate-x-1/2 -translate-y-1/2 mix-blend-difference"
					style={annotationMarkerStyle}
					aria-hidden="true"
				>
					<span class="absolute top-1/2 left-0 h-px w-5 -translate-y-1/2 bg-white"></span>
					<span class="absolute top-0 left-1/2 h-5 w-px -translate-x-1/2 bg-white"></span>
				</div>
			{/if}
			{#if annotationMenuActive && annotationPlacementActive && !compareActive}
				<div
					class="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2 border border-divider bg-chrome/90 px-2 py-1 font-mono text-[11px] text-foreground backdrop-blur-sm"
					role="status"
				>
					CLICK TO PLACE · ESC TO EXIT
				</div>
			{/if}
			{#if compareActive}
				<div
					class="pointer-events-none absolute top-3 z-30 border border-divider bg-chrome px-2 py-1 font-mono text-[11px] text-muted-foreground"
					style="left: 12px"
				>
					[ Before ]
				</div>
			{/if}
			{#if originalImageUrl}
				<span class="sr-only" role="status"
					>{compareActive ? 'Showing original image' : 'Showing processed preview'}</span
				>
			{/if}
			{#if cropActive}
				<CropOverlay
					imageWidth={displayedWidth || 100}
					imageHeight={displayedHeight || 100}
					zoom={currentZoom}
					{imageX}
					{imageY}
					{viewportRef}
					fullResolutionScaleX={originalWidth / Math.max(1, displayedWidth)}
					fullResolutionScaleY={originalHeight / Math.max(1, displayedHeight)}
					aspectRatio={cropAspectRatio}
					{initialCrop}
					resetKey={displayedImage}
					onConfirm={confirmCropFromPreview}
					onCancel={onCropCancel}
					onChange={onCropChange}
					onAspectRatioChange={onCropAspectRatioChange}
				/>
			{/if}
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
				class="pointer-events-auto absolute bottom-3 left-1/2 z-20 hidden -translate-x-1/2 animate-in items-center gap-0 border border-divider bg-chrome/85 px-1 font-mono text-[11px] backdrop-blur-sm duration-200 fade-in slide-in-from-bottom-2 md:flex"
			>
				<HoverTooltip label={`Zoom out (${shortcutModifier}+-)`} side="top">
					<button
						onclick={zoomOut}
						class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
						aria-label={`Zoom out (${shortcutModifier}+-)`}
					>
						<ZoomOut class="size-3.5" />
					</button>
				</HoverTooltip>
				<HoverTooltip label="Zoom level — click to reset to 100%" side="top">
					<button
						onclick={zoomToOneToOne}
						class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
						aria-label="Zoom level — click to reset to 100%"
					>
						<span class="tabular-nums">{Math.round(currentZoom)}%</span>
					</button>
				</HoverTooltip>
				<HoverTooltip label={`Zoom in (${shortcutModifier}+=)`} side="top">
					<button
						onclick={zoomIn}
						class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
						aria-label={`Zoom in (${shortcutModifier}+=)`}
					>
						<ZoomIn class="size-3.5" />
					</button>
				</HoverTooltip>
				<HoverTooltip
					label={imageFailed && !originalPreviewData
						? 'Fit unavailable (preview failed)'
						: `Fit to screen (${shortcutModifier}+0)`}
					side="top"
				>
					<button
						onclick={resetView}
						disabled={imageFailed && !originalPreviewData}
						class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
						aria-label={imageFailed && !originalPreviewData
							? 'Fit unavailable (preview failed)'
							: `Fit to screen (${shortcutModifier}+0)`}
					>
						<Maximize class="size-3.5" />
					</button>
				</HoverTooltip>
				<div class="mx-0.5 h-4 w-px bg-border"></div>
				<HoverTooltip
					label={processedImageUrl
						? 'Hold to compare original (Space)'
						: 'Compare unavailable — process image first'}
					side="top"
				>
					<button
						onpointerdown={(e) => {
							e.stopPropagation();
							pressCompareDown();
						}}
						onpointerup={(e) => {
							e.stopPropagation();
							pressCompareUp();
						}}
						onpointerleave={(e) => {
							e.stopPropagation();
							pressCompareUp();
						}}
						disabled={!processedImageUrl}
						class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 {compareActive
							? 'bg-muted text-foreground'
							: ''}"
						aria-pressed={compareActive}
						aria-label={processedImageUrl
							? 'Hold to compare original (Space)'
							: 'Compare unavailable — process image first'}
					>
						<Images class="size-3.5" />
					</button>
				</HoverTooltip>
				<HoverTooltip
					label={canSplit ? 'Split compare (B)' : 'Split unavailable — process image first'}
					side="top"
				>
					<button
						onclick={toggleSplitCompare}
						disabled={!canSplit}
						class="flex size-7 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 {splitMode
							? 'bg-muted text-foreground'
							: ''}"
						aria-pressed={splitMode}
						aria-label={canSplit ? 'Split compare (B)' : 'Split unavailable — process image first'}
					>
						<Columns2 class="size-3.5" />
					</button>
				</HoverTooltip>
			</div>
		{/if}
	</div>
</main>
