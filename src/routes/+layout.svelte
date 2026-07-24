<script lang="ts">
	import './layout.css';

	let { children } = $props();
</script>

<div aria-live="polite" aria-atomic="true" class="sr-only">Image editor ready</div>
{@render children()}
