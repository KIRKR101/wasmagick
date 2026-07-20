<script lang="ts">
	import { onMount } from 'svelte';

	let isDarkMode = $state(false);

	onMount(() => {
		if (
			localStorage.getItem('theme') === 'dark' ||
			(!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
		) {
			document.documentElement.classList.add('dark');
			isDarkMode = true;
		} else {
			document.documentElement.classList.remove('dark');
			isDarkMode = false;
		}
	});
</script>

<div
	class="flex min-h-screen flex-col items-center justify-center bg-[#f7f7f4] px-4 font-mono dark:bg-background"
>
	<div class="mb-8 text-center">
		<div class="text-[48px] text-muted-foreground/20">[ ]</div>
	</div>

	<h1
		class="mb-3 text-center text-lg uppercase tracking-wider text-muted-foreground"
	>
		WASMAGICK
	</h1>

	<p class="mb-8 text-center text-sm text-muted-foreground/60">
		Browser-based image processing powered by ImageMagick/WASM
	</p>

	<div class="flex flex-col items-center gap-3">
		<a
			href="/editor"
			class="group cursor-pointer border border-foreground/30 px-8 py-3 text-xs uppercase tracking-wider text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
		>
			[<span class="group-hover:underline"> Enter editor </span>]
		</a>

		<div class="flex gap-3 text-xs text-muted-foreground/40">
			<button
				onclick={() => {
					isDarkMode = !isDarkMode;
					if (isDarkMode) {
						document.documentElement.classList.add('dark');
						localStorage.setItem('theme', 'dark');
					} else {
						document.documentElement.classList.remove('dark');
						localStorage.setItem('theme', 'light');
					}
				}}
				class="group cursor-pointer border border-foreground/30 text-muted-foreground px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				[{isDarkMode ? '~' : 'O'}] <span class="group-hover:underline">THEME</span>
			</button>
			<a
				href="https://github.com/KIRKR101/wasmagick-svelte"
				target="_blank"
				rel="noopener noreferrer"
				class="group cursor-pointer border border-foreground/30 text-muted-foreground px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			>
				[<span class="group-hover:underline"> GitHub </span>]
			</a>
		</div>
	</div>

	<!-- Quick-start shortcuts card -->
	<div class="mt-10 border border-foreground/30 px-6 py-4">
		<div class="mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">Quick Start</div>
		<div class="grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[11px] text-muted-foreground/70">
			<span class="flex items-center gap-2">
				<span class="border border-foreground/30 px-1.5 py-0.5 text-[10px] text-foreground/60">Ctrl+O</span>
				Upload image
			</span>
			<span class="flex items-center gap-2">
				<span class="border border-foreground/30 px-1.5 py-0.5 text-[10px] text-foreground/60">Ctrl+Enter</span>
				Process
			</span>
			<span class="flex items-center gap-2">
				<span class="border border-foreground/30 px-1.5 py-0.5 text-[10px] text-foreground/60">Ctrl+S</span>
				Download
			</span>
			<span class="flex items-center gap-2">
				<span class="border border-foreground/30 px-1.5 py-0.5 text-[10px] text-foreground/60">Space</span>
				Compare before/after
			</span>
			<span class="flex items-center gap-2">
				<span class="border border-foreground/30 px-1.5 py-0.5 text-[10px] text-foreground/60">Ctrl+Z</span>
				Undo
			</span>
			<span class="flex items-center gap-2">
				<span class="border border-foreground/30 px-1.5 py-0.5 text-[10px] text-foreground/60">Ctrl+0</span>
				Fit to screen
			</span>
		</div>
	</div>

	<div class="mt-8 text-center text-[11px] text-muted-foreground/30">
		powered by <a href="https://github.com/dlemstra/magick-wasm" class="underline decoration-dashed underline-offset-3 transition-colors hover:text-foreground">magick-wasm</a>, all processing happens locally in your browser
	</div>
</div>
