<script lang="ts">
	import { onMount } from 'svelte';

	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';

	let { ...restProps }: SonnerProps = $props();

	let toastTheme = $state<'light' | 'dark'>('light');

	onMount(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const observer = new MutationObserver(() => {
			toastTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
		});
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
		toastTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
		mq.addEventListener('change', () => {
			toastTheme = mq.matches ? 'dark' : 'light';
		});
		return () => {
			observer.disconnect();
			mq.removeEventListener('change', () => {});
		};
	});
</script>

<Sonner
	theme={toastTheme}
	class="toaster group"
	style="--normal-bg: var(--background); --normal-text: var(--foreground); --normal-border: transparent; --success-bg: var(--background); --success-text: var(--foreground); --error-bg: var(--background); --error-text: var(--foreground); --warning-bg: var(--background); --warning-text: var(--foreground); --info-bg: var(--background); --info-text: var(--foreground);"
	{...restProps}
>
	{#snippet loadingIcon()}
		<span class="font-mono text-[11px] text-muted-foreground">[~]</span>
	{/snippet}
	{#snippet successIcon()}
		<span class="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">[*]</span>
	{/snippet}
	{#snippet errorIcon()}
		<span class="font-mono text-[11px] text-red-600 dark:text-red-400">[!]</span>
	{/snippet}
	{#snippet infoIcon()}
		<span class="font-mono text-[11px] text-muted-foreground">[i]</span>
	{/snippet}
	{#snippet warningIcon()}
		<span class="font-mono text-[11px] text-amber-600 dark:text-amber-400">[!]</span>
	{/snippet}
</Sonner>

<style>
	:global(.toaster[data-sonner-toaster]) {
		--font: inherit;
		font-family: var(--font-mono, 'Geist Mono', monospace);
	}

	:global(.toaster .sonner-toast) {
		border: none;
		border-radius: 0;
		box-shadow: none;
		font-size: 12px;
		padding: 12px;
		gap: 8px;
	}



	:global(.toaster .sonner-toast .sonner-toast-content) {
		font-family: var(--font-mono, 'Geist Mono', monospace);
		font-size: 12px;
	}

	:global(.toaster .sonner-toast .sonner-toast-description) {
		font-family: var(--font-mono, 'Geist Mono', monospace);
		font-size: 11px;
		color: var(--muted-foreground);
	}

	:global(.toaster .sonner-toast .sonner-toast-close-button) {
		font-family: var(--font-mono, 'Geist Mono', monospace);
		font-size: 11px;
		border: 1px dashed var(--muted-foreground);
		border-radius: 0;
		background: transparent;
		color: var(--muted-foreground);
		opacity: 0.5;
		width: 20px;
		height: 20px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.toaster .sonner-toast .sonner-toast-close-button:hover) {
		opacity: 1;
		background: var(--muted);
	}

	:global(.toaster .sonner-toast .sonner-toast-close-button::before) {
		content: '[X]';
		font-size: 10px;
	}

	:global(.toaster .sonner-toast .sonner-toast-close-button svg) {
		display: none;
	}

	@media (max-width: 767px) {
		:global(.toaster[data-sonner-toaster]) {
			font-size: 10px;
		}

		:global(.toaster .sonner-toast) {
			font-size: 10px;
			padding: 8px 10px;
			gap: 6px;
		}

		:global(.toaster .sonner-toast .sonner-toast-content) {
			font-size: 10px;
		}

		:global(.toaster .sonner-toast .sonner-toast-description) {
			font-size: 9px;
		}
	}
</style>
