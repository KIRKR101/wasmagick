<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Select,
		SelectGroup,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select/index.js';
	import { Slider } from '$lib/components/ui/slider/index.js';
	import ToggleRow from '$lib/components/controls/ToggleRow.svelte';
	import { X } from 'lucide-svelte';
	import { applyThemeMode, getThemeMode, type ThemeMode } from '$lib/theme';
	import {
		APP_VERSION,
		DEFAULT_FILENAME_TEMPLATE,
		DEFAULT_HISTORY_LIMIT,
		MAX_HISTORY_LIMIT,
		MIN_HISTORY_LIMIT,
		MAGICK_WASM_URL,
		REPO_URL,
		buildOutputFilename,
		clearAllAppStorage,
		clearExportDefaults,
		getExportDefaults,
		getFilenameTemplate,
		getHistoryLimit,
		getStorageUsage,
		setExportDefaults,
		setFilenameTemplate,
		setHistoryLimit,
		type ExportDefaults,
		type StorageEntry
	} from '$lib/settings';
	import { PresetsState, BUILTIN_PRESETS, type UserPreset } from '$lib/hooks/usePresets.svelte';
	import { formatBytes } from '$lib/utils';
	import { buildGeneralIssueBody, buildIssueUrl } from '$lib/issue-report';
	import { FALLBACK_EXPORT_FORMATS } from '$lib/export-formats';

	let { onClose }: { onClose: () => void } = $props();

	const presets = new PresetsState();

	let themeMode = $state<ThemeMode>('auto');
	let exportDefaults = $state<ExportDefaults>({
		imageFormat: 'WebP',
		quality: [85],
		stripMeta: false
	});
	let filenameTemplate = $state(DEFAULT_FILENAME_TEMPLATE);
	let historyLimit = $state(DEFAULT_HISTORY_LIMIT);
	let storage = $state<StorageEntry[]>([]);
	let renameId = $state<string | null>(null);
	let renameValue = $state('');
	let importInput = $state<HTMLInputElement | null>(null);
	let armedAction = $state<string | null>(null);
	let armedTimer: ReturnType<typeof setTimeout> | null = null;

	function refreshStorage(): void {
		storage = getStorageUsage();
	}

	function onThemeChange(mode: ThemeMode): void {
		themeMode = mode;
		applyThemeMode(mode);
	}

	// Persist export defaults whenever any of them change (covers the format
	// select, quality slider, and metadata toggle uniformly).
	$effect(() => {
		const snapshot: ExportDefaults = {
			imageFormat: exportDefaults.imageFormat,
			quality: [...exportDefaults.quality],
			stripMeta: exportDefaults.stripMeta
		};
		setExportDefaults(snapshot);
	});

	function onFilenameInput(value: string): void {
		filenameTemplate = value;
		setFilenameTemplate(value);
	}

	function resetFilename(): void {
		filenameTemplate = DEFAULT_FILENAME_TEMPLATE;
		setFilenameTemplate(DEFAULT_FILENAME_TEMPLATE);
	}

	function onHistoryLimitInput(value: number): void {
		if (!Number.isFinite(value)) return;
		historyLimit = Math.min(MAX_HISTORY_LIMIT, Math.max(MIN_HISTORY_LIMIT, Math.round(value)));
		setHistoryLimit(historyLimit);
	}

	let issuesHref = $derived.by(() => {
		try {
			return buildIssueUrl('Bug report', buildGeneralIssueBody());
		} catch {
			return buildIssueUrl('Bug report', '');
		}
	});

	let filenamePreview = $derived.by(() => {
		try {
			return buildOutputFilename({
				name: 'photo',
				ext: 'webp',
				format: 'webp',
				at: new Date(2026, 4, 9, 15, 4, 7),
				width: 1600,
				height: 1067
			});
		} catch {
			return 'photo-edited.webp';
		}
	});

	let presetsBytes = $derived(
		storage.find((entry) => entry.key === 'wasmagick.presets.v1')?.bytes ?? 0
	);

	function startRename(preset: UserPreset): void {
		renameId = preset.id;
		renameValue = preset.name;
	}

	function commitRename(id: string): void {
		presets.renameUser(id, renameValue);
		renameId = null;
		refreshStorage();
	}

	function deletePreset(id: string): void {
		presets.deleteUser(id);
		refreshStorage();
	}

	function exportPresets(): void {
		const blob = new Blob([JSON.stringify(presets.userPresets, null, 2)], {
			type: 'application/json'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'wasmagick-presets.json';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	async function importPresetsFile(file: File): Promise<void> {
		let parsed: unknown;
		try {
			parsed = JSON.parse(await file.text());
		} catch {
			return;
		}
		if (parsed == null) return;
		presets.importUsers(parsed);
		refreshStorage();
	}

	function armOrRun(action: string, run: () => void): void {
		if (armedAction === action) {
			if (armedTimer) clearTimeout(armedTimer);
			armedAction = null;
			run();
			return;
		}
		if (armedTimer) clearTimeout(armedTimer);
		armedAction = action;
		armedTimer = setTimeout(() => (armedAction = null), 3000);
	}

	function clearPresets(): void {
		presets.clearUsers();
		refreshStorage();
	}

	function resetExportDefaults(): void {
		clearExportDefaults();
		exportDefaults = getExportDefaults();
	}

	function resetAllSettings(): void {
		clearAllAppStorage();
		themeMode = getThemeMode();
		applyThemeMode(themeMode);
		filenameTemplate = getFilenameTemplate();
		historyLimit = getHistoryLimit();
		exportDefaults = getExportDefaults();
		presets.clearUsers();
		refreshStorage();
	}

	onMount(() => {
		themeMode = getThemeMode();
		exportDefaults = getExportDefaults();
		filenameTemplate = getFilenameTemplate();
		historyLimit = getHistoryLimit();
		presets.load();
		refreshStorage();
	});
</script>

<div class="settings-page font-mono">
	<div class="mb-1 flex items-center justify-between">
		<h2 class="text-lg tracking-wider text-foreground uppercase">[SETTINGS]</h2>
		<button
			type="button"
			onclick={onClose}
			aria-label="Close settings"
			class="group cursor-pointer px-1 font-mono text-xs text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			<X class="size-4 transition-colors group-hover:text-foreground" />
		</button>
	</div>
	<p class="mb-6 max-w-md text-xs text-muted-foreground/60">
		Changes save automatically and apply right away. The editor behind this panel is untouched — no
		reloads, nothing discarded.
	</p>

	<!-- Appearance -->
	<section class="mb-6 border border-foreground/30 p-4">
		<h3 class="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			/APPEARANCE
		</h3>
		<p class="mb-3 text-[11px] text-muted-foreground/60">
			Auto follows your operating system's color scheme.
		</p>
		<div class="grid grid-cols-3 gap-1.5" role="group" aria-label="Theme">
			{#each [{ id: 'light', label: 'LIGHT', glyph: 'O' }, { id: 'dark', label: 'DARK', glyph: '~' }, { id: 'auto', label: 'AUTO', glyph: '*' }] as option (option.id)}
				<button
					type="button"
					aria-pressed={themeMode === option.id}
					onclick={() => onThemeChange(option.id as ThemeMode)}
					class="cursor-pointer border px-2 py-2 text-xs transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {themeMode ===
					option.id
						? 'border-foreground bg-muted/50 text-foreground'
						: 'border-foreground/30 text-muted-foreground hover:border-foreground/60'}"
				>
					[{option.glyph}]
					<span class={themeMode === option.id ? 'underline' : ''}>{option.label}</span>
				</button>
			{/each}
		</div>
	</section>

	<!-- Export defaults -->
	<section class="mb-6 border border-foreground/30 p-4">
		<h3 class="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			/EXPORT DEFAULTS
		</h3>
		<p class="mb-3 text-[11px] text-muted-foreground/60">
			Starting point for every new editor session.
		</p>
		<div class="grid grid-cols-2 gap-3">
			<div class="flex flex-col gap-2">
				<span class="text-[11px] tracking-wide text-muted-foreground uppercase">Format</span>
				<Select type="single" bind:value={exportDefaults.imageFormat}>
					<SelectTrigger class="h-9 w-full font-mono text-xs uppercase">
						{exportDefaults.imageFormat}
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{#each FALLBACK_EXPORT_FORMATS as format (format.value)}
								<SelectItem value={format.value}>{format.label}</SelectItem>
							{/each}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
			<div class="flex flex-col gap-2">
				<div class="flex h-4 items-center justify-between">
					<span class="text-[11px] tracking-wide text-muted-foreground uppercase">Quality</span>
					<span class="font-mono text-xs text-foreground tabular-nums"
						>{exportDefaults.quality[0]}%</span
					>
				</div>
				<div class="flex h-9 items-center">
					<Slider type="multiple" bind:value={exportDefaults.quality} min={1} max={100} step={1} />
				</div>
			</div>
		</div>
		<ToggleRow
			id="settings-strip-meta"
			label="Strip Metadata"
			description="Remove EXIF / profiles by default"
			bind:checked={exportDefaults.stripMeta}
		/>
		<button
			type="button"
			onclick={resetExportDefaults}
			class="group mt-2 cursor-pointer border border-foreground/30 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			[&olarr;] <span class="group-hover:underline">RESET EXPORT DEFAULTS</span>
		</button>
	</section>

	<!-- Output filename -->
	<section class="mb-6 border border-foreground/30 p-4">
		<h3 class="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			/OUTPUT FILENAME
		</h3>
		<p class="mb-3 text-[11px] text-muted-foreground/60">
			Tokens: <span class="text-foreground/80">{'{name} {ext} {format} {date} {time} {w} {h}'}</span
			>
		</p>
		<input
			type="text"
			value={filenameTemplate}
			oninput={(e) => onFilenameInput(e.currentTarget.value)}
			spellcheck={false}
			autocomplete="off"
			aria-label="Output filename format"
			class="h-9 w-full border border-dashed border-foreground/30 bg-transparent px-2 font-mono text-xs text-foreground"
		/>
		<div class="mt-2 flex items-center justify-between gap-3 font-mono text-[11px]">
			<span class="truncate text-muted-foreground"
				>Preview: <span class="text-foreground">{filenamePreview}</span></span
			>
			<button
				type="button"
				onclick={resetFilename}
				class="group shrink-0 cursor-pointer text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			>
				[&olarr;] <span class="group-hover:underline">RESET</span>
			</button>
		</div>
	</section>

	<!-- Presets -->
	<section class="mb-6 border border-foreground/30 p-4">
		<h3 class="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			/PRESETS
		</h3>
		<p class="mb-3 text-[11px] text-muted-foreground/60">
			{BUILTIN_PRESETS.length} built-in &middot; {presets.userPresets.length} saved
			{#if presetsBytes > 0}({formatBytes(presetsBytes)} locally){/if}. Manage your saved presets
			here — the editor's Presets panel stays for applying them mid-edit.
		</p>
		{#if presets.userPresets.length === 0}
			<p
				class="border border-dashed border-foreground/20 px-3 py-6 text-center text-[11px] text-muted-foreground/60"
			>
				No saved presets yet — save one from the editor's Presets panel, or import a backup below.
			</p>
		{:else}
			<ul class="space-y-1.5">
				{#each presets.userPresets as preset (preset.id)}
					<li class="flex items-center gap-2 border border-foreground/30 px-3 py-2">
						{#if renameId === preset.id}
							<input
								type="text"
								bind:value={renameValue}
								aria-label="Preset name"
								class="h-8 w-full min-w-0 border border-foreground/50 bg-transparent px-2 font-mono text-xs text-foreground"
								onkeydown={(e) => {
									if (e.key === 'Enter') commitRename(preset.id);
									else if (e.key === 'Escape') renameId = null;
								}}
								onblur={() => commitRename(preset.id)}
							/>
						{:else}
							<div class="min-w-0 flex-1">
								<div class="truncate text-xs font-semibold text-foreground">{preset.name}</div>
								<div class="truncate text-[11px] text-muted-foreground">
									{preset.settings.imageFormat} &middot; q{preset.settings.quality[0]}
								</div>
							</div>
							<button
								type="button"
								onclick={() => startRename(preset)}
								aria-label="Rename preset {preset.name}"
								class="group shrink-0 cursor-pointer px-1 font-mono text-xs text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
							>
								[<span class="group-hover:underline">RENAME</span>]
							</button>
							<button
								type="button"
								onclick={() => deletePreset(preset.id)}
								aria-label="Delete preset {preset.name}"
								class="shrink-0 cursor-pointer px-1 font-mono text-xs text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
							>
								[x]
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<div class="mt-3 flex flex-wrap gap-1.5">
			<button
				type="button"
				onclick={exportPresets}
				disabled={presets.userPresets.length === 0}
				class="group cursor-pointer border border-foreground/30 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				[&darr;] <span class="group-hover:underline">EXPORT JSON</span>
			</button>
			<button
				type="button"
				onclick={() => importInput?.click()}
				class="group cursor-pointer border border-foreground/30 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			>
				[&uarr;] <span class="group-hover:underline">IMPORT JSON</span>
			</button>
			<button
				type="button"
				onclick={() => armOrRun('clear-presets', clearPresets)}
				disabled={presets.userPresets.length === 0}
				class="group cursor-pointer border border-foreground/30 px-3 py-1.5 font-mono text-xs transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 {armedAction ===
				'clear-presets'
					? 'border-destructive text-destructive'
					: 'text-muted-foreground'}"
			>
				[x] <span class="group-hover:underline"
					>{armedAction === 'clear-presets' ? 'CONFIRM DELETE' : 'DELETE ALL'}</span
				>
			</button>
			<input
				bind:this={importInput}
				type="file"
				accept="application/json,.json"
				class="hidden"
				onchange={(e) => {
					const file = e.currentTarget.files?.[0];
					if (file) void importPresetsFile(file);
					e.currentTarget.value = '';
				}}
			/>
		</div>
	</section>

	<!-- History & storage -->
	<section class="mb-6 border border-foreground/30 p-4">
		<h3 class="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			/HISTORY &amp; STORAGE
		</h3>
		<p class="mb-3 text-[11px] text-muted-foreground/60">
			Undo history lives in memory per editor session and clears on reload — this controls how many
			states each session keeps.
		</p>
		<div class="mb-3 flex items-center justify-between gap-3">
			<label for="history-limit" class="text-[11px] tracking-wide text-muted-foreground uppercase">
				Max history entries ({MIN_HISTORY_LIMIT}–{MAX_HISTORY_LIMIT})
			</label>
			<input
				id="history-limit"
				type="number"
				min={MIN_HISTORY_LIMIT}
				max={MAX_HISTORY_LIMIT}
				step={1}
				value={historyLimit}
				oninput={(e) => onHistoryLimitInput(e.currentTarget.valueAsNumber)}
				class="h-8 w-20 border border-dashed border-foreground/30 bg-transparent px-2 text-right font-mono text-xs text-foreground"
			/>
		</div>
		<div class="border-t border-foreground/20 pt-3">
			<div class="mb-2 text-[11px] tracking-wide text-muted-foreground uppercase">
				Local storage
			</div>
			{#if storage.length === 0}
				<p class="text-[11px] text-muted-foreground/60">Nothing stored yet.</p>
			{:else}
				<ul class="mb-3 space-y-1 font-mono text-[11px]">
					{#each storage as entry (entry.key)}
						<li class="flex justify-between gap-3">
							<span class="truncate text-muted-foreground">{entry.key}</span>
							<span class="shrink-0 text-foreground tabular-nums">{formatBytes(entry.bytes)}</span>
						</li>
					{/each}
				</ul>
			{/if}
			<button
				type="button"
				onclick={() => armOrRun('reset-all', resetAllSettings)}
				class="group cursor-pointer border border-foreground/30 px-3 py-1.5 font-mono text-xs transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {armedAction ===
				'reset-all'
					? 'border-destructive text-destructive'
					: 'text-muted-foreground'}"
			>
				[x] <span class="group-hover:underline"
					>{armedAction === 'reset-all' ? 'CONFIRM RESET' : 'RESET ALL SETTINGS'}</span
				>
			</button>
		</div>
	</section>

	<!-- About -->
	<section class="border border-foreground/30 p-4">
		<h3 class="mb-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			/ABOUT
		</h3>
		<p class="mb-3 text-[11px] leading-relaxed text-muted-foreground/80">
			WASMagick v{APP_VERSION} — client-side image editor. All processing happens locally in your browser
			or desktop app; images never leave your device.
		</p>
		<ul class="mb-3 space-y-1 font-mono text-[11px] text-muted-foreground">
			<li class="flex justify-between gap-3">
				<span>UI</span><span class="text-right text-foreground"
					>SvelteKit + Svelte 5 + Tailwind CSS</span
				>
			</li>
			<li class="flex justify-between gap-3">
				<span>Engine</span><span class="text-right text-foreground"
					>ImageMagick via magick-wasm</span
				>
			</li>
			<li class="flex justify-between gap-3">
				<span>Desktop</span><span class="text-right text-foreground"
					>Electron + native ImageMagick bundle</span
				>
			</li>
			<li class="flex justify-between gap-3">
				<span>Offline</span><span class="text-right text-foreground">PWA with service worker</span>
			</li>
			<li class="flex justify-between gap-3">
				<span>License</span><span class="text-right text-foreground">see GitHub repository</span>
			</li>
		</ul>
		<div class="flex flex-wrap gap-1.5">
			<a
				href={REPO_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="group border border-foreground/30 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			>
				[<span class="group-hover:underline">GitHub</span>]
			</a>
			<a
				href={issuesHref}
				target="_blank"
				rel="noopener noreferrer"
				class="group border border-foreground/30 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			>
				[<span class="group-hover:underline">Issues</span>]
			</a>
			<a
				href={MAGICK_WASM_URL}
				target="_blank"
				rel="noopener noreferrer"
				class="group border border-foreground/30 px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			>
				[<span class="group-hover:underline">magick-wasm</span>]
			</a>
		</div>
	</section>
</div>
