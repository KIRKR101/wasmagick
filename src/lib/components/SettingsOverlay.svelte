<script lang="ts">
	import SettingsPanel from './SettingsPanel.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	function close(): void {
		open = false;
	}

	function onWindowKeydown(e: KeyboardEvent): void {
		if (!open || e.key !== 'Escape' || e.defaultPrevented) return;
		// Let text editing keep Escape for itself (e.g. cancelling a rename).
		const target = e.target;
		if (
			target instanceof HTMLInputElement ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement
		) {
			return;
		}
		close();
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
		<button
			type="button"
			aria-label="Close settings"
			onclick={close}
			class="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]"
		></button>
		<div
			role="dialog"
			aria-modal="true"
			aria-label="App settings"
			class="relative z-10 flex max-h-[min(88vh,52rem)] w-full max-w-2xl animate-in flex-col overflow-hidden border border-divider bg-chrome shadow-2xl fade-in-0 zoom-in-95"
		>
			<div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
				<SettingsPanel onClose={close} />
			</div>
		</div>
	</div>
{/if}
