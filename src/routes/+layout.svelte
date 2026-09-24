<script lang="ts">
	import { onMount } from 'svelte';
	import Copy from 'phosphor-svelte/lib/Copy';
	import Minus from 'phosphor-svelte/lib/Minus';
	import Square from 'phosphor-svelte/lib/Square';
	import X from 'phosphor-svelte/lib/X';
	import { pwaInstall } from '$lib/stores/pwa.svelte';
	import { hasCustomTitleBar, resolveInitialTheme, watchSystemTheme } from '$lib/theme';
	import './layout.css';

	let { children } = $props();

	let showTitleBar = $state(false);
	let isLinux = $state(false);
	let isMaximized = $state(false);

	onMount(() => {
		pwaInstall.register();
		// Apply the stored theme mode (including `auto`) on every page, and
		// follow the OS color scheme while the mode is `auto`.
		resolveInitialTheme();
		const stopWatchingTheme = watchSystemTheme();
		showTitleBar = hasCustomTitleBar();
		if (window.wasmagick) {
			isLinux = window.wasmagick.platform === 'linux';
			window.wasmagick.onMaximizeChange((maximized) => (isMaximized = maximized));
			void window.wasmagick.isMaximized().then((maximized) => (isMaximized = maximized));
		}
		return () => stopWatchingTheme();
	});

	const controls = {
		minimize: () => window.wasmagick?.minimizeWindow(),
		toggleMaximize: () => window.wasmagick?.toggleMaximizeWindow(),
		close: () => window.wasmagick?.closeWindow()
	};
</script>

{#if showTitleBar}
	<div class="titlebar">
		<span aria-hidden="true">WASMAGICK</span>
		{#if isLinux}
			<div class="titlebar-controls">
				<button type="button" aria-label="Minimize window" onclick={controls.minimize}>
					<span class="titlebar-control-icon"><Minus size={12} /></span>
				</button>
				<button
					type="button"
					aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
					onclick={controls.toggleMaximize}
				>
					<span class="titlebar-control-icon"
						>{#if isMaximized}<Copy size={12} />{:else}<Square size={12} />{/if}</span
					>
				</button>
				<button type="button" class="close" aria-label="Close window" onclick={controls.close}>
					<span class="titlebar-control-icon"><X size={12} /></span>
				</button>
			</div>
		{/if}
	</div>
{/if}

<div class="app-frame {showTitleBar ? 'has-titlebar' : ''}">
	<div aria-live="polite" aria-atomic="true" class="sr-only">Image editor ready</div>
	{@render children()}
</div>
