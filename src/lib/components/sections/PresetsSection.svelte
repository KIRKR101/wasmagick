<script lang="ts">
	import { Check } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import type { MagickState } from '$lib/useMagick.svelte';
	import {
		PresetsState,
		BUILTIN_PRESETS,
		type BuiltInPreset,
		type UserPreset
	} from '$lib/hooks/usePresets.svelte';

	let { magick, presets }: { magick: MagickState; presets: PresetsState } = $props();

	let newName = $state('');

	function applyBuiltIn(p: BuiltInPreset) {
		presets.applyBuiltIn(magick, p);
		toast.success('Preset applied', { description: p.name });
	}
	function applyUser(p: UserPreset) {
		presets.applyUser(magick, p);
		toast.success('Preset applied', { description: p.name });
	}
	function save() {
		if (!newName.trim()) return;
		presets.saveUser(newName, magick);
		newName = '';
	}
</script>

<div class="space-y-5">
	<div class="space-y-2">
		<span class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
			>Built-in</span
		>
		<div class="grid grid-cols-1 gap-1.5 mt-2">
			{#each BUILTIN_PRESETS as p (p.id)}
				{@const active = presets.isBuiltInActive(magick, p)}
				<button
					onclick={() => applyBuiltIn(p)}
					aria-pressed={active}
					class="group flex items-center justify-between gap-3 border px-3 py-2 text-left transition-colors focus:outline-none {active
						? 'border-foreground bg-muted/50'
						: 'border-foreground/30 bg-transparent hover:border-foreground/60 hover:bg-muted/30'}"
				>
					<span class="min-w-0">
						<span
							class="block text-xs font-semibold {active ? 'text-foreground' : 'text-foreground'}"
							>{p.name}</span
						>
						<span class="block text-[11px] text-muted-foreground">{p.description}</span>
					</span>
					<Check
						class="size-3.5 shrink-0 text-primary transition-opacity {active
							? 'opacity-100'
							: 'opacity-0 group-hover:opacity-100'}"
					/>
				</button>
			{/each}
		</div>
	</div>

	<div class="space-y-2 border-t border-border/60 pt-4">
		<div class="flex items-center gap-1.5">
			<span class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
				>My Presets</span
			>
		</div>

		<div class="flex gap-2">
			<input
				bind:value={newName}
				type="text"
				placeholder="Preset name"
				class="h-8 text-xs font-mono w-full px-2 placeholder:text-muted-foreground/50"
				onkeydown={(e) => {
					if (e.key === 'Enter') save();
				}}
			/>
			<button onclick={save} class="group shrink-0 cursor-pointer font-mono text-xs border border-foreground/30 px-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
				[+] <span class="group-hover:underline">SAVE</span>
			</button>
		</div>
		<p class="text-[11px] text-muted-foreground">
			Saves the current settings as a reusable preset.
		</p>

		{#if presets.userPresets.length === 0}
			<p class="py-6 text-center text-[11px] text-muted-foreground/60">No saved presets yet</p>
		{:else}
			<div class="grid grid-cols-1 gap-1.5">
				{#each presets.userPresets as p (p.id)}
					{@const active = presets.isUserActive(magick, p)}
					<div
						class="group flex items-center gap-2 border px-3 py-2 transition-colors {active
							? 'border-foreground bg-muted/50'
							: 'border-foreground/30 bg-transparent hover:bg-muted/30 hover:border-foreground/60'}"
					>
						<button
							onclick={() => applyUser(p)}
							aria-pressed={active}
							class="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
						>
							<span class="min-w-0">
								<span class="block truncate text-xs font-semibold text-foreground">{p.name}</span>
								<span class="block text-[11px] text-muted-foreground"
									>{p.settings.imageFormat} · q{p.settings.quality[0]}</span
								>
							</span>
							{#if active}
								<Check class="size-3.5 shrink-0 text-primary" />
							{/if}
						</button>
						<button
							onclick={() => presets.deleteUser(p.id)}
							class="shrink-0 cursor-pointer text-muted-foreground font-mono text-xs focus:outline-none"
							aria-label="Delete preset"
						>
							[x]
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
