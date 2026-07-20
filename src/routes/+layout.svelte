<script lang="ts">
	import './layout.css';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { MOBILE_BREAKPOINT } from '$lib/constants.js';
	import { onMount } from 'svelte';

	let { children } = $props();
	let toastPosition = $state<'bottom-center' | 'top-center'>('bottom-center');

	onMount(() => {
		const mql = window.matchMedia(MOBILE_BREAKPOINT);
		toastPosition = mql.matches ? 'top-center' : 'bottom-center';
		const handler = (e: MediaQueryListEvent) => {
			toastPosition = e.matches ? 'top-center' : 'bottom-center';
		};
		mql.addEventListener('change', handler);
		return () => mql.removeEventListener('change', handler);
	});
</script>

<Toaster position={toastPosition} />
<div aria-live="polite" aria-atomic="true" class="sr-only">Image editor ready</div>
{@render children()}
