<script lang="ts">
	import { shortcutModifier } from '$lib/shortcuts';

	let {
		onBrowse,
		onPaste
	}: {
		onBrowse: () => void;
		onPaste: (file: File) => void;
	} = $props();
	let pasteError = $state('');
	let cameraInputEl = $state<HTMLInputElement | null>(null);

	function onCameraChange(e: Event) {
		const target = e.target as HTMLInputElement;
		if (target.files && target.files.length > 0) {
			onPaste(target.files[0]);
		}
		target.value = '';
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
	<input
		bind:this={cameraInputEl}
		type="file"
		accept="image/*"
		capture="environment"
		onchange={onCameraChange}
		class="hidden"
		aria-hidden="true"
		tabindex="-1"
	/>
	<div class="font-mono text-[48px] text-muted-foreground/30">[ ]</div>

	<div class="space-y-1">
		<h2 class="font-mono text-xs tracking-wider text-muted-foreground uppercase">
			Drop an image to begin
		</h2>
		<p class="font-mono text-[11px] text-muted-foreground/60">
			Drag &amp; drop, paste from clipboard, or browse.
		</p>
	</div>

	<div class="flex flex-wrap items-center justify-center gap-2">
		<button
			onclick={onBrowse}
			class="cursor-pointer border border-divider px-3 py-1.5 font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			[<span class="hover:underline"> Browse files </span>]
		</button>
		<button
			onclick={() => cameraInputEl?.click()}
			class="cursor-pointer border border-divider px-3 py-1.5 font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none sm:hidden"
		>
			[<span class="hover:underline"> Take photo </span>]
		</button>
		<button
			onclick={pasteImage}
			class="cursor-pointer border border-divider px-3 py-1.5 font-mono text-[11px] text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			[<span class="hidden hover:underline sm:inline">{shortcutModifier}+V Paste</span><span
				class="hover:underline sm:hidden"
			>
				Paste image
			</span>]
		</button>
	</div>
	{#if pasteError}<p class="-mt-4 font-mono text-[11px] text-destructive" role="status">
			{pasteError}
		</p>{/if}
</div>
