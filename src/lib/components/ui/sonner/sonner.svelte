<script lang="ts">
	import { dismissToast, toastState } from './toast.svelte';
</script>

{#if toastState.items.length > 0}
	<div class="toast-viewport" aria-live="polite" aria-atomic="false">
		{#each toastState.items as item (item.id)}
			<div class="toast-card" role="status">
				{#if item.loading}
					<span class="toast-spinner" aria-hidden="true"></span>
				{/if}
				<span class="toast-message">{item.message}</span>
				{#if item.action}
					<button
						type="button"
						class="toast-action"
						onclick={() => {
							item.action?.onClick();
							dismissToast(item.id);
						}}
					>
						{item.action.label}
					</button>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.toast-viewport {
		position: fixed;
		z-index: 100;
		right: 1rem;
		bottom: 3rem;
		max-width: min(28rem, calc(100vw - 2rem));
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.5rem;
		pointer-events: none;
	}

	.toast-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--background);
		padding: 0.625rem 0.75rem;
		color: var(--foreground);
		box-shadow: 0 4px 14px rgb(0 0 0 / 12%);
		font-family: var(--font-mono, monospace);
		font-size: 0.75rem;
		line-height: 1.25rem;
		pointer-events: auto;
	}

	.toast-message {
		min-width: 0;
	}

	.toast-spinner {
		width: 0.75rem;
		height: 0.75rem;
		flex: none;
		border: 1px solid color-mix(in oklch, var(--muted-foreground) 30%, transparent);
		border-top-color: var(--primary);
		border-radius: 9999px;
		animation: toast-spin 0.8s linear infinite;
	}

	@keyframes toast-spin {
		to {
			transform: rotate(360deg);
		}
	}

	.toast-action {
		flex: none;
		cursor: pointer;
		border: 0;
		border-left: 1px solid var(--border);
		background: transparent;
		padding: 0 0 0 0.75rem;
		color: var(--muted-foreground);
		text-decoration: underline dashed;
		text-underline-offset: 3px;
		transition: color 120ms ease;
	}

	.toast-action:hover,
	.toast-action:focus-visible {
		color: var(--foreground);
	}

	.toast-action:focus-visible {
		border-radius: 2px;
		outline: 1px solid var(--ring);
		outline-offset: 2px;
	}

	@media (max-width: 1199px) {
		.toast-viewport {
			top: max(1rem, env(safe-area-inset-top));
			right: 0;
			bottom: auto;
			left: 0;
			width: 100%;
			max-width: none;
			display: flex;
			justify-content: center;
			padding: 0 1rem;
		}

		.toast-card {
			max-width: 100%;
		}

		.toast-viewport {
			align-items: center;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.toast-action,
		.toast-spinner {
			transition: none;
			animation: none;
		}
	}
</style>
