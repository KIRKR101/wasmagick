<script lang="ts">
	let { open = $bindable(false) } = $props<{ open?: boolean }>();

	const shortcuts = [
		{
			category: 'General',
			items: [
				{ keys: ['Ctrl', 'Enter'], description: 'Process Image' },
				{ keys: ['Ctrl', 'S'], description: 'Download Result' },
				{ keys: ['Ctrl', 'Z'], description: 'Undo' },
				{ keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo' },
				{ keys: ['V'], description: 'Open File Picker' },
				{ keys: ['Ctrl', 'Shift', '?'], description: 'Show Shortcuts' }
			]
		},
		{
			category: 'Sections',
			items: [
				{ keys: ['Alt', '1'], description: 'Geometry' },
				{ keys: ['Alt', '2'], description: 'Color' },
				{ keys: ['Alt', '3'], description: 'Filters' },
				{ keys: ['Alt', '4'], description: 'Annotate' },
				{ keys: ['Alt', '5'], description: 'Export' },
				{ keys: ['Alt', '6'], description: 'Presets' },
				{ keys: ['Alt', '7'], description: 'History' }
			]
		},
		{
			category: 'Viewport',
			items: [
				{ keys: ['Ctrl', '0'], description: 'Fit to Screen' },
				{ keys: ['Ctrl', '='], description: 'Zoom In' },
				{ keys: ['Ctrl', '-'], description: 'Zoom Out' },
				{ keys: ['Scroll'], description: 'Zoom In/Out' },
				{ keys: ['Drag'], description: 'Pan Image' },
				{ keys: ['B'], description: 'Toggle Split Compare' },
				{ keys: ['Space'], description: 'Hold to Compare (Before/After)' }
			]
		},
		{
			category: 'Clipboard',
			items: [{ keys: ['Ctrl', 'V'], description: 'Paste Image from Clipboard' }]
		}
	];

	let previousActiveElement: HTMLElement | null = null;

	$effect(() => {
		if (open) {
			previousActiveElement = document.activeElement as HTMLElement;
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
			previousActiveElement?.focus();
		}
	});

	function handleOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) open = false;
	}

	function handleOverlayKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			return;
		}
		if (e.key === 'Tab') {
			const focusable = (e.currentTarget as HTMLElement).querySelectorAll(
				'button, [href], [tabindex]:not([tabindex="-1"])'
			);
			const first = focusable[0] as HTMLElement;
			const last = focusable[focusable.length - 1] as HTMLElement;
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last?.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first?.focus();
			}
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/5"
		onclick={handleOverlayClick}
		onkeydown={handleOverlayKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="shortcuts-title"
		tabindex="-1"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="relative w-full max-w-lg animate-in border border-foreground/30 bg-[#f7f7f4] p-4 fade-in-0 zoom-in-95 dark:bg-background"
			tabindex="-1"
		>
			<div class="mb-6 flex items-center gap-2 border-b border-foreground/30 pb-3">
				<h2
					id="shortcuts-title"
					class="font-mono text-xs tracking-wider text-muted-foreground uppercase"
				>
					Keyboard Shortcuts
				</h2>
			</div>

			<div class="max-h-[60vh] space-y-6 overflow-y-auto">
				{#each shortcuts as section}
					<div class="space-y-3">
						<h3
							class="font-mono text-[11px] font-semibold tracking-wider text-muted-foreground uppercase"
						>
							/{section.category}
						</h3>
						<div class="space-y-2">
							{#each section.items as shortcut}
								<div class="flex items-center justify-between font-mono text-[11px]">
									<span class="text-muted-foreground">{shortcut.description}</span>
									<div class="flex items-center gap-1">
										{#each shortcut.keys as key, kindex}
											<kbd
												class="border border-foreground/30 px-2 py-0.5 font-mono text-[11px] text-foreground"
											>
												{key}
											</kbd>
											{#if kindex < shortcut.keys.length - 1}
												<span class="text-xs text-muted-foreground">+</span>
											{/if}
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>

			<button
				class="absolute top-3 right-3 flex size-6 cursor-pointer items-center justify-center font-mono text-[11px] text-muted-foreground/40 focus:outline-none"
				onclick={() => (open = false)}
				aria-label="Close"
			>
				[X]
			</button>
		</div>
	</div>
{/if}
