<script lang="ts">
	import { Magick } from '@imagemagick/magick-wasm';
	import packageJson from '../../../package.json';
	import {
		Dialog,
		DialogPortal,
		DialogOverlay,
		DialogContent
	} from '$lib/components/ui/dialog/index.js';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	let nativeVersion = $state<string | null>(null);
	let wasmEngineVersion = $derived.by(() => {
		try {
			return Magick.imageMagickVersion.match(/\bImageMagick\s+([^\s]+)/)?.[1] ?? 'Not loaded';
		} catch {
			return 'Not loaded';
		}
	});

	$effect(() => {
		if (open && window.wasmagick?.getNativeVersion) {
			window.wasmagick.getNativeVersion().then((version) => (nativeVersion = version));
		}
	});
</script>

<Dialog bind:open>
	<DialogPortal>
		<DialogOverlay class="fixed inset-0 isolate z-50 bg-black/5" />
		<DialogContent
			class="fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-0 rounded-none border border-foreground/30 bg-[#f7f7f4] p-0 font-mono text-sm text-foreground shadow-sm sm:max-w-md dark:bg-background"
			showCloseButton={false}
		>
			<div
				class="border-b border-foreground/30 px-4 py-3 text-xs tracking-wider text-muted-foreground uppercase"
			>
				Build details
			</div>
			<div class="grid gap-2 px-4 py-4 text-xs">
				<div class="flex justify-between gap-4">
					<span class="text-muted-foreground">App</span><span>{packageJson.version}</span>
				</div>
				<div class="flex justify-between gap-4">
					<span class="text-muted-foreground">Native ImageMagick</span><span
						>{nativeVersion ?? 'Unavailable'}</span
					>
				</div>
				<div class="flex justify-between gap-4">
					<span class="text-muted-foreground">WASM package</span><span>0.0.43</span>
				</div>
				<div class="flex justify-between gap-4">
					<span class="text-muted-foreground">WASM engine</span><span>{wasmEngineVersion}</span>
				</div>
				<div class="flex justify-between gap-4">
					<span class="text-muted-foreground">Electron</span><span
						>{window.wasmagick?.electronVersion ?? 'Unknown'}</span
					>
				</div>
				<div class="flex justify-between gap-4">
					<span class="text-muted-foreground">Platform</span><span
						>{window.wasmagick?.platform ?? 'Web'}</span
					>
				</div>
			</div>
			<button
				onclick={() => (open = false)}
				class="absolute top-2 right-2 flex size-5 cursor-pointer items-center justify-center font-mono text-[11px] text-muted-foreground/40 focus:outline-none"
				aria-label="Close build details"
			>
				[X]
			</button>
		</DialogContent>
	</DialogPortal>
</Dialog>
