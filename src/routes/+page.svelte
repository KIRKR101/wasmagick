<script lang="ts">
	import { onMount } from 'svelte';
	import DownloadSimple from 'phosphor-svelte/lib/DownloadSimple';
	import Globe from 'phosphor-svelte/lib/Globe';
	import { resolveInitialTheme } from '$lib/theme';

	let platform = $state<'windows' | 'macos' | 'linux' | 'unknown'>('unknown');

	const releasesUrl = 'https://github.com/KIRKR101/wasmagick/releases/latest';

	onMount(() => {
		resolveInitialTheme();

		const ua = navigator.userAgent.toLowerCase();

		if (ua.includes('windows')) platform = 'windows';
		else if (ua.includes('mac')) platform = 'macos';
		else if (ua.includes('linux')) platform = 'linux';
	});

	const platformLabel = $derived(
		platform === 'windows'
			? 'Windows'
			: platform === 'macos'
				? 'macOS'
				: platform === 'linux'
					? 'Linux'
					: 'Desktop'
	);
</script>

<div class="relative h-full overflow-y-auto bg-background">
	<!-- Mobile: image as full background -->
	<img
		src="/images/lake.jpg"
		alt=""
		aria-hidden="true"
		class="fixed inset-0 h-full w-full object-cover sm:hidden"
	/>
	<div
		class="fixed inset-0 bg-gradient-to-b from-background/70 via-background/20 to-background/80 sm:hidden"
		aria-hidden="true"
	></div>

	<div class="grid-bg hidden sm:block" aria-hidden="true"></div>
	<div class="grain-bg hidden sm:block" aria-hidden="true"></div>
	<div
		class="pointer-events-none absolute -top-[300px] -left-[220px] hidden h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--foreground)_4%,transparent),transparent_68%)] sm:block"
		aria-hidden="true"
	></div>

	<main
		id="main"
		class="relative z-10 mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col justify-center px-3 py-6 text-foreground sm:px-6 sm:py-16"
	>
		<section class="relative sm:overflow-hidden sm:rounded-3xl sm:border sm:border-border">
			<img
				src="/images/lake.jpg"
				alt=""
				aria-hidden="true"
				class="absolute inset-0 hidden h-full w-full object-cover sm:block"
			/>

			<div
				class="relative mx-auto my-2 w-full max-w-xl overflow-hidden rounded-xl border border-border bg-card p-5 text-card-foreground shadow-xl sm:my-10 sm:rounded-2xl sm:p-10 sm:shadow-none"
			>
				<div class="card-grain" aria-hidden="true"></div>
				<div class="relative z-10">
					<section class="pb-6 text-left sm:pb-12">
						<p
							class="-ml-[0.16em] font-mono text-4xl leading-none text-muted-foreground/30 sm:text-5xl"
						>
							[<span
								class="font-sans text-3xl leading-none tracking-tighter text-foreground sm:text-5xl"
							>
								WASMagick
							</span>]
						</p>

						<p
							class="mt-3 max-w-prose text-sm leading-relaxed text-muted-foreground sm:mt-4 sm:text-base"
						>
							Edit and convert images in your browser or on your desktop. Nothing leaves your
							device.
						</p>

						<div
							class="mt-4 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3"
						>
							<a
								href={releasesUrl}
								class="hidden h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85 sm:inline-flex sm:h-10 dark:bg-white dark:text-black"
							>
								<DownloadSimple size={17} weight="bold" />
								Download for {platformLabel}
							</a>

							<a
								href="/editor"
								class="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-85 sm:h-10 sm:border sm:border-border sm:bg-white sm:text-black sm:backdrop-blur-sm sm:hover:bg-muted sm:hover:opacity-100 dark:bg-white dark:text-black sm:dark:bg-secondary sm:dark:text-secondary-foreground sm:dark:hover:bg-muted"
							>
								<Globe size={17} weight="bold" />
								Open web app
							</a>
						</div>
					</section>

					<section
						class="grid divide-y divide-border border-y border-border"
						aria-label="WASMagick features"
					>
						<article class="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-8 sm:py-6">
							<h2 class="text-sm font-semibold tracking-tight text-foreground">Private</h2>

							<p class="max-w-prose text-sm leading-relaxed text-muted-foreground">
								Images are decoded, processed, and exported on your device and never sent to a
								server. There are no accounts, cookies, or analytics.
							</p>
						</article>

						<article class="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-8 sm:py-6">
							<h2 class="text-sm font-semibold tracking-tight text-foreground">Fast</h2>

							<p class="max-w-prose text-sm leading-relaxed text-muted-foreground">
								Common operations run on libvips, built to be fast and light on memory.
							</p>
						</article>

						<article class="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-8 sm:py-6">
							<h2 class="text-sm font-semibold tracking-tight text-foreground">Any format</h2>

							<p class="max-w-prose text-sm leading-relaxed text-muted-foreground">
								Input 174
								<button
									type="button"
									class="group relative inline cursor-help bg-transparent p-0 align-baseline text-inherit"
									aria-label="Format support details"
								>
									<span class="underline decoration-dashed underline-offset-4">formats</span>
									<span
										role="tooltip"
										class="invisible absolute bottom-full left-0 z-50 mb-2 w-64 rounded-md border border-border bg-popover p-3 text-left text-xs leading-relaxed font-normal text-popover-foreground opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
									>
										<strong class="mb-1 block text-[13px]">Format support</strong>
										Reads JPEG, PNG, WebP, AVIF, JXL, HEIC, TIFF, GIF, PSD, PDF, SVG, EXR etc. plus 29
										camera RAW coders such as CR2, NEF, ARW and DNG. Writes 72 containers, from WebP and
										JPEG to ICO, TGA and PDF. RAW is read-only.
									</span>
								</button>
								and output 72. Convert between everyday formats like JPEG, PNG, and WebP and rarer ones
								like PSD, HEIC, and camera RAW.
							</p>
						</article>

						<article class="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-8 sm:py-6">
							<h2 class="text-sm font-semibold tracking-tight text-foreground">Web and desktop</h2>

							<p class="max-w-prose text-sm leading-relaxed text-muted-foreground">
								The web app processes through WebAssembly and works offline once loaded. The desktop
								app uses native processing for Windows, macOS, and Linux.
							</p>
						</article>
					</section>
				</div>
			</div>
		</section>
	</main>
</div>

<style>
	.grid-bg {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image:
			linear-gradient(
				to right,
				color-mix(in oklch, var(--foreground) 3%, transparent) 1px,
				transparent 1px
			),
			linear-gradient(
				to bottom,
				color-mix(in oklch, var(--foreground) 3%, transparent) 1px,
				transparent 1px
			);
		background-size: 32px 32px;
		mask-image: linear-gradient(to bottom, black 0%, black 76%, transparent 100%);
	}

	.grain-bg {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-size: 180px 180px;
		opacity: 0.35;
		image-rendering: pixelated;
	}

	.card-grain {
		position: absolute;
		inset: 0;
		z-index: 0;
		border-radius: inherit;
		pointer-events: none;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
		background-size: 180px 180px;
		opacity: 0.2;
		image-rendering: pixelated;
	}

	:global(.dark) .grid-bg {
		background-image:
			linear-gradient(
				to right,
				color-mix(in oklch, var(--foreground) 2.5%, transparent) 1px,
				transparent 1px
			),
			linear-gradient(
				to bottom,
				color-mix(in oklch, var(--foreground) 2.5%, transparent) 1px,
				transparent 1px
			);
	}

	:global(.dark) .grain-bg {
		opacity: 0.12;
	}

	:global(.dark) .card-grain {
		opacity: 0.08;
	}
</style>
