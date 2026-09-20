<script lang="ts">
	import type { SampleImage } from '$lib/editor-types';
	import { shortcutModifier } from '$lib/shortcuts';

	let {
		onBrowse,
		onPaste,
		onSelectSample
	}: {
		onBrowse: () => void;
		onPaste: (file: File) => void;
		onSelectSample: (s: SampleImage) => void;
	} = $props();
	let pasteError = $state('');

	const samples: SampleImage[] = [
		{ name: 'Circle Packing', url: '/samples/circle packing.png' },
		{ name: 'Geometric', url: '/samples/geometric.png' },
		{ name: 'Particle Burst', url: '/samples/particle burst.png' },
		{ name: 'Contour Bands', url: '/samples/contour bands.png' }
	];

	function pickRandom() {
		const s = samples[Math.floor(Math.random() * samples.length)];
		onSelectSample(s);
	}

	async function pasteImage() {
		pasteError = '';
		try {
			const items = await navigator.clipboard.read();
			for (const item of items) {
				const type = item.types.find((candidate) => candidate.startsWith('image/'));
				if (!type) continue;
				const blob = await item.getType(type);
				onPaste(new File([blob], `clipboard.${type.split('/')[1] || 'png'}`, { type }));
				return;
			}
			pasteError = 'No image found on the clipboard.';
		} catch {
			pasteError = 'Clipboard access was unavailable.';
		}
	}
</script>

<div class="flex w-full max-w-md flex-col items-center gap-6 p-8 text-center">
	<div class="font-mono text-[48px] text-muted-foreground/30">[ ]</div>

	<div class="space-y-1">
		<h2 class="font-mono text-xs tracking-wider text-muted-foreground uppercase">
			Drop an image to begin
		</h2>
		<p class="font-mono text-[11px] text-muted-foreground/60">
			Drag &amp; drop anywhere, paste from clipboard, or browse.
		</p>
	</div>

	<div class="flex flex-wrap items-center justify-center gap-2">
		<button
			onclick={onBrowse}
			class="cursor-pointer border border-foreground/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			[<span class="hover:underline"> Browse files </span>]
		</button>
		<button
			onclick={pasteImage}
			class="cursor-pointer border border-foreground/30 px-3 py-1.5 font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			[<span class="hover:underline">{shortcutModifier}+V Paste</span>]
		</button>
	</div>
	{#if pasteError}<p class="-mt-4 font-mono text-[11px] text-destructive" role="status">
			{pasteError}
		</p>{/if}

	<div class="w-full border-t border-foreground/30 pt-5">
		<button
			onclick={pickRandom}
			class="w-full cursor-pointer border border-foreground/30 px-3 py-2 font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			[<span class="hover:underline"> Random sample </span>]
		</button>
	</div>
</div>
