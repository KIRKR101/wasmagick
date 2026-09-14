<script lang="ts">
	import {
		Dialog,
		DialogPortal,
		DialogOverlay,
		DialogContent
	} from '$lib/components/ui/dialog/index.js';
	import type { MagickState } from '$lib/useMagick.svelte';
	import { ISSUES_URL } from '$lib/constants';

	let {
		magick,
		open = $bindable(false),
		onRetry
	}: {
		magick: MagickState;
		open?: boolean;
		onRetry?: () => void;
	} = $props();

	// Pop automatically when a new error lands; closing is sticky until the
	// next error (processImage clears hasError first, so retries re-trigger).
	$effect(() => {
		if (magick.hasError && magick.errorMessage) open = true;
	});

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;

	function close() {
		open = false;
	}

	function retry() {
		open = false;
		onRetry?.();
	}

	async function copyDetails() {
		const details = [
			'WASMagick error report',
			`Time: ${new Date().toISOString()}`,
			`Engine: ${magick.engine}`,
			`Error: ${magick.errorMessage ?? 'Unknown error'}`
		].join('\n');
		try {
			await navigator.clipboard.writeText(details);
			copied = true;
			if (copyTimer) clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard unavailable (permissions, non-secure context) — the
			// full text is still visible above for manual copying.
		}
	}

	let reportHref = $derived.by(() => {
		const title = encodeURIComponent('Error report');
		const body = encodeURIComponent(
			[
				'**Error**',
				magick.errorMessage ?? 'Unknown error',
				'',
				'**Engine**',
				magick.engine,
				'',
				'**Steps to reproduce**',
				'1. ',
				'2. '
			].join('\n')
		);
		return `${ISSUES_URL}/new?title=${title}&body=${body}`;
	});
</script>

<Dialog bind:open>
	<DialogPortal>
		<DialogOverlay
			class="fixed inset-0 isolate z-50 bg-black/5 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
		/>
		<DialogContent
			class="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-0 rounded-none border border-foreground/30 bg-[#f7f7f4] p-0 font-mono text-sm text-foreground duration-100 outline-none sm:max-w-md dark:bg-background data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
			showCloseButton={false}
		>
			<div
				class="border-b border-foreground/30 px-4 py-3 text-xs tracking-wider text-muted-foreground uppercase"
			>
				Error
			</div>

			<div class="max-h-[50vh] overflow-y-auto px-4 py-4">
				<p
					class="text-xs leading-relaxed break-words whitespace-pre-wrap text-foreground"
					role="alert"
				>
					{magick.errorMessage || 'Unknown error'}
				</p>
				<p class="mt-3 text-[11px] leading-relaxed text-muted-foreground">
					Your images never leave your device, only include details you want to.
				</p>
			</div>

			<div
				class="flex flex-wrap items-center justify-end gap-2 border-t border-foreground/30 px-4 py-3"
			>
				<button
					onclick={copyDetails}
					class="cursor-pointer border border-foreground/30 px-3 py-1 font-mono text-[11px] text-muted-foreground uppercase focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				>
					[<span class="hover:underline">{copied ? 'Copied' : 'Copy details'}</span>]
				</button>
				<a
					href={reportHref}
					target="_blank"
					rel="noreferrer"
					class="border border-foreground/30 px-3 py-1 font-mono text-[11px] text-muted-foreground uppercase focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				>
					[<span class="hover:underline">Report issue</span>]
				</a>
				{#if onRetry}
					<button
						onclick={retry}
						class="cursor-pointer border border-foreground/30 px-3 py-1 font-mono text-[11px] text-muted-foreground uppercase focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
					>
						[<span class="hover:underline">Retry</span>]
					</button>
				{/if}
				<button
					onclick={close}
					class="cursor-pointer border border-foreground/30 px-3 py-1 font-mono text-[11px] text-muted-foreground uppercase focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				>
					[<span class="hover:underline">Close</span>]
				</button>
			</div>

			<button
				onclick={close}
				class="absolute top-2 right-2 flex size-5 cursor-pointer items-center justify-center font-mono text-[11px] text-muted-foreground/40 focus:outline-none"
				aria-label="Close error dialog"
			>
				[X]
			</button>
		</DialogContent>
	</DialogPortal>
</Dialog>
