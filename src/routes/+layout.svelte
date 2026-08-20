<script lang="ts">
	import { onMount } from 'svelte';
	import FaWindowClose from 'svelte-icons/fa/FaWindowClose.svelte';
	import FaWindowMaximize from 'svelte-icons/fa/FaWindowMaximize.svelte';
	import FaWindowMinimize from 'svelte-icons/fa/FaWindowMinimize.svelte';
	import FaWindowRestore from 'svelte-icons/fa/FaWindowRestore.svelte';
	import { pwaInstall } from '$lib/stores/pwa.svelte';
	import { hasCustomTitleBar } from '$lib/theme';
	import './layout.css';

	let { children } = $props();

	let showTitleBar = $state(false);
	let isLinux = $state(false);
	let isMaximized = $state(false);

	onMount(() => {
		pwaInstall.register();
		showTitleBar = hasCustomTitleBar();
		if (window.wasmagick) {
			isLinux = window.wasmagick.platform === 'linux';
			window.wasmagick.onMaximizeChange((maximized) => (isMaximized = maximized));
			void window.wasmagick.isMaximized().then((maximized) => (isMaximized = maximized));
		}
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
					<span class="titlebar-control-icon"><FaWindowMinimize /></span>
				</button>
				<button
					type="button"
					aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
					onclick={controls.toggleMaximize}
				>
					<span class="titlebar-control-icon"
						>{#if isMaximized}<FaWindowRestore />{:else}<FaWindowMaximize />{/if}</span
					>
				</button>
				<button type="button" class="close" aria-label="Close window" onclick={controls.close}>
					<span class="titlebar-control-icon"><FaWindowClose /></span>
				</button>
			</div>
		{/if}
	</div>
{/if}

<div class="app-frame {showTitleBar ? 'has-titlebar' : ''}">
	<div aria-live="polite" aria-atomic="true" class="sr-only">Image editor ready</div>
	{@render children()}
</div>
