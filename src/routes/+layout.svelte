<script lang="ts">
	import { onMount } from 'svelte';
	import { pwaInstall } from '$lib/stores/pwa.svelte';
	import './layout.css';

	let { children } = $props();

	onMount(() => {
		pwaInstall.register();
	});
</script>

<div aria-live="polite" aria-atomic="true" class="sr-only">Image editor ready</div>
{@render children()}
