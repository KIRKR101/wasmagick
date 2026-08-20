<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { stashPendingFile } from '$lib/pending-drop';
	import { applyTheme, resolveInitialTheme } from '$lib/theme';

	let isDarkMode = $state(false);

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			stashPendingFile(files[0]);
			void goto('/editor');
		}
	}

	onMount(() => {
		isDarkMode = resolveInitialTheme();
	});
</script>

<svelte:window
	ondragover={(e) => {
		e.preventDefault();
	}}
	ondrop={handleDrop}
/>

<div
	class="flex min-h-full flex-col items-center justify-center bg-[#f7f7f4] px-4 font-mono dark:bg-background"
>
	<div class="mb-8 text-center">
		<span class="inline-flex items-center text-[48px] leading-none text-muted-foreground/20">
			[
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 132 88"
				class="mx-2 h-[0.725em] w-auto text-muted-foreground"
				shape-rendering="crispEdges"
				aria-label="WASMagick logo"
			>
				<path
					d="M 0,0 H 16 V 72 H 41 V 56 H 66 V 72 H 116 V 0 H 132 V 88 H 66 V 72 H 41 V 88 H 0 Z"
					fill="currentColor"
				/>
			</svg>
			]
		</span>
	</div>

	<h1 class="mb-3 text-center text-lg tracking-wider text-muted-foreground uppercase">WASMAGICK</h1>

	<p class="mb-8 max-w-md text-center text-xs text-muted-foreground/60">
		image processing powered by <a
			href="https://github.com/dlemstra/magick-wasm"
			class="underline decoration-dashed underline-offset-3 transition-colors hover:text-foreground"
			>magick-wasm</a
		>, all processing happens locally in your browser
	</p>

	<div class="flex flex-col items-center gap-3">
		<a
			href="/editor"
			class="group cursor-pointer border border-foreground/30 px-8 py-3 text-xs tracking-wider text-muted-foreground uppercase transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			[<span class="group-hover:underline"> Enter editor </span>]
		</a>

		<div class="flex gap-3 text-xs text-muted-foreground/40">
			<button
				onclick={() => {
					isDarkMode = !isDarkMode;
					applyTheme(isDarkMode);
				}}
				class="group cursor-pointer border border-foreground/30 px-2 py-1 text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			>
				[{isDarkMode ? '~' : 'O'}] <span class="group-hover:underline">THEME</span>
			</button>
			<a
				href="https://github.com/KIRKR101/wasmagick-svelte"
				target="_blank"
				rel="noopener noreferrer"
				class="group cursor-pointer border border-foreground/30 px-2 py-1 text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			>
				[<span class="group-hover:underline"> GitHub </span>]
			</a>
		</div>
	</div>
</div>
