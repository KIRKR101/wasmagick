<script lang="ts">
	import {
		Dialog,
		DialogPortal,
		DialogOverlay,
		DialogContent
	} from '$lib/components/ui/dialog/index.js';
	import X from 'phosphor-svelte/lib/X';
	import { MAX_FILE_SIZE_MB, type LargeFileWarning } from '$lib/useMagick.svelte';

	let {
		warning,
		onContinue,
		onClose
	}: {
		warning: LargeFileWarning | null;
		onContinue: () => void;
		onClose: () => void;
	} = $props();

	let open = $derived(warning != null);

	function setOpen(next: boolean) {
		// The dialog forces an explicit choice: programmatic close attempts
		// (Escape, outside click) are ignored while the warning is active.
		// The X button routes to Continue explicitly below.
		if (!next && warning == null) return;
		if (!next) return;
	}

	function handleContinue() {
		onContinue();
	}

	function handleClose() {
		onClose();
	}
</script>

<Dialog {open} onOpenChange={setOpen}>
	<DialogPortal>
		<DialogOverlay
			class="fixed inset-0 isolate z-50 bg-black/5 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
		/>
		<DialogContent
			class="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-0 rounded-none border border-divider bg-chrome p-0 font-mono text-sm text-foreground duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
			showCloseButton={false}
		>
			<div
				class="border-b border-foreground/30 px-4 py-3 text-xs tracking-wider text-muted-foreground uppercase"
			>
				Large image
			</div>

			<div class="px-4 py-4 text-xs leading-relaxed text-muted-foreground">
				<span class="font-medium text-foreground">{warning?.fileName ?? 'This image'}</span>
				({warning?.sizeMB ?? '?'} MB) is over the {MAX_FILE_SIZE_MB} MB advisory limit. Processing may
				be slow or impossible on this device. You can continue anyway or close the image.
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-foreground/30 px-4 py-3">
				<button
					onclick={handleClose}
					class="cursor-pointer border border-foreground/30 px-3 py-1 font-mono text-[11px] text-muted-foreground uppercase focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				>
					[<span class="hover:underline"> Close image </span>]
				</button>
				<button
					onclick={handleContinue}
					class="cursor-pointer border border-foreground/30 px-3 py-1 font-mono text-[11px] text-muted-foreground uppercase focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
				>
					[<span class="hover:underline"> Continue anyway </span>]
				</button>
			</div>

			<button
				onclick={handleContinue}
				class="absolute top-2 right-2 flex size-5 cursor-pointer items-center justify-center font-mono text-[11px] text-muted-foreground/40 transition-colors duration-75 hover:text-foreground focus:outline-none"
				aria-label="Continue anyway"
			>
				<X class="size-3.5" />
			</button>
		</DialogContent>
	</DialogPortal>
</Dialog>
