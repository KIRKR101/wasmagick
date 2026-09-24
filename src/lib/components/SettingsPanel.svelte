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
	import ArrowCounterClockwise from 'phosphor-svelte/lib/ArrowCounterClockwise';
	import Desktop from 'phosphor-svelte/lib/Desktop';
	import DownloadSimple from 'phosphor-svelte/lib/DownloadSimple';
	import Moon from 'phosphor-svelte/lib/Moon';
	import PencilSimple from 'phosphor-svelte/lib/PencilSimple';
	import Sun from 'phosphor-svelte/lib/Sun';
	import Trash from 'phosphor-svelte/lib/Trash';
	import UploadSimple from 'phosphor-svelte/lib/UploadSimple';
	import X from 'phosphor-svelte/lib/X';
	import { applyThemeMode, getThemeMode, type ThemeMode } from '$lib/theme';
	import {
		APP_VERSION,
		DEFAULT_FILENAME_TEMPLATE,
		DEFAULT_HISTORY_LIMIT,
		MAX_HISTORY_LIMIT,
		MIN_HISTORY_LIMIT,
		MAGICK_WASM_VERSION,
		clearAllAppStorage,
		clearExportDefaults,
		formatOutputFilename,
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
	const isElectron = typeof window !== 'undefined' && Boolean(window.wasmagick);
	let nativeVersions = $state<WasmagickNativeVersions>({
		magick: null,
		sharp: null,
		vips: null
	});
	// Loaded lazily on open so importing settings does not pull
	// `@imagemagick/magick-wasm` into the initial chunk.
	let wasmEngineVersion = $state('Not loaded');
	let renameId = $state<string | null>(null);
	let renameValue = $state('');
	let importInput = $state<HTMLInputElement | null>(null);
	let armedAction = $state<string | null>(null);
	let armedTimer: ReturnType<typeof setTimeout> | null = null;
	const themeOptions = [
		{ id: 'light', label: 'LIGHT', icon: Sun },
		{ id: 'dark', label: 'DARK', icon: Moon },
		{ id: 'auto', label: 'AUTO', icon: Desktop }
	] as const;

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

	let filenamePreview = $derived.by(() => {
		try {
			return formatOutputFilename(filenameTemplate, {
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

		let cancelled = false;
		import('@imagemagick/magick-wasm')
			.then(({ Magick }) => {
				if (cancelled) return;
				try {
					wasmEngineVersion =
						Magick.imageMagickVersion.match(/\bImageMagick\s+([^\s]+)/)?.[1] ?? 'Not loaded';
				} catch {
					wasmEngineVersion = 'Not loaded';
				}
			})
			.catch(() => {
				if (!cancelled) wasmEngineVersion = 'Not loaded';
			});
		if (window.wasmagick?.getNativeVersions) {
			window.wasmagick
				.getNativeVersions()
				.then((versions) => {
					if (!cancelled && versions) nativeVersions = versions;
				})
				.catch(() => {});
		} else if (window.wasmagick?.getNativeVersion) {
			window.wasmagick
				.getNativeVersion()
				.then((version) => {
					if (!cancelled) nativeVersions = { magick: version, sharp: null, vips: null };
				})
				.catch(() => {});
		}
		return () => {
			cancelled = true;
		};
	});
</script>

<div class="settings-page space-y-2 font-mono sm:space-y-3">
	<div class="flex items-center justify-between gap-3 border-b border-divider pb-2">
		<h2 class="text-[11px] tracking-wider text-muted-foreground uppercase">Settings</h2>
		<button
			type="button"
			onclick={onClose}
			aria-label="Close settings"
			class="flex size-8 shrink-0 cursor-pointer items-center justify-center text-muted-foreground/60 transition-colors duration-75 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
		>
			<X class="size-4" />
		</button>
	</div>

	<!-- Appearance -->
	<section class="border border-divider p-2.5 sm:p-3">
		<h3 class="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
			Appearance
		</h3>
		<div class="grid grid-cols-3 gap-1" role="group" aria-label="Theme">
			{#each themeOptions as option (option.id)}
				<button
					type="button"
					aria-pressed={themeMode === option.id}
					onclick={() => onThemeChange(option.id as ThemeMode)}
					class="flex cursor-pointer items-center justify-center gap-1.5 border px-1 py-2 text-[11px] transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {themeMode ===
					option.id
						? 'border-foreground bg-muted/50 text-foreground'
						: 'border-divider text-muted-foreground hover:border-foreground/60'}"
				>
					<option.icon class="size-3.5 shrink-0" />
					<span class={themeMode === option.id ? 'underline' : ''}>{option.label}</span>
				</button>
			{/each}
		</div>
	</section>

	<!-- Export defaults -->
	<section class="border border-divider p-2.5 sm:p-3">
		<div class="mb-2 flex items-baseline justify-between gap-2">
			<h3 class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
				Export defaults
			</h3>
			<button
				type="button"
				onclick={resetExportDefaults}
				class="group flex shrink-0 cursor-pointer items-center gap-1 text-[11px] text-muted-foreground/70 transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			>
				<ArrowCounterClockwise class="size-3" />
				<span class="group-hover:underline">RESET</span>
			</button>
		</div>
		<div class="grid grid-cols-1 gap-2 min-[440px]:grid-cols-2">
			<div class="flex min-w-0 flex-col gap-1">
				<span class="text-[10px] tracking-wide text-muted-foreground uppercase">Format</span>
				<Select type="single" bind:value={exportDefaults.imageFormat}>
					<SelectTrigger class="h-8 w-full font-mono text-[11px] uppercase">
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
			<div class="flex min-w-0 flex-col gap-1">
				<div class="flex h-4 items-center justify-between">
					<span class="text-[10px] tracking-wide text-muted-foreground uppercase">Quality</span>
					<span class="font-mono text-[11px] text-foreground tabular-nums"
						>{exportDefaults.quality[0]}%</span
					>
				</div>
				<div class="flex h-8 items-center">
					<Slider type="multiple" bind:value={exportDefaults.quality} min={1} max={100} step={1} />
				</div>
			</div>
		</div>
		<ToggleRow
			id="settings-strip-meta"
			label="Strip Metadata"
			description="EXIF / profiles"
			bind:checked={exportDefaults.stripMeta}
			class="mt-1"
		/>
	</section>

	<!-- Output filename -->
	<section class="border border-divider p-2.5 sm:p-3">
		<h3 class="mb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
			Filename
		</h3>
		<p class="mb-2 text-[10px] break-all text-muted-foreground/60">
			<span class="text-foreground/70">{'{name} {ext} {format} {date} {time} {w} {h}'}</span>
		</p>
		<input
			type="text"
			value={filenameTemplate}
			oninput={(e) => onFilenameInput(e.currentTarget.value)}
			spellcheck={false}
			autocomplete="off"
			aria-label="Output filename format"
			class="h-8 w-full border border-dashed border-divider bg-transparent px-2 font-mono text-[11px] text-foreground"
		/>
		<div
			class="mt-1.5 flex flex-col gap-1 font-mono text-[10px] min-[440px]:flex-row min-[440px]:items-center min-[440px]:justify-between"
		>
			<span class="min-w-0 truncate text-muted-foreground"
				>→ <span class="text-foreground">{filenamePreview}</span></span
			>
			<button
				type="button"
				onclick={resetFilename}
				class="group flex shrink-0 cursor-pointer items-center gap-1 self-start text-muted-foreground/70 transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none min-[440px]:self-auto"
			>
				<ArrowCounterClockwise class="size-3" />
				<span class="group-hover:underline">RESET</span>
			</button>
		</div>
	</section>

	<!-- Presets -->
	<section class="border border-divider p-2.5 sm:p-3">
		<div class="mb-2 flex items-baseline justify-between gap-2">
			<h3 class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
				Presets
			</h3>
			<span class="shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
				{BUILTIN_PRESETS.length} built-in · {presets.userPresets.length} saved{#if presetsBytes > 0}
					· {formatBytes(presetsBytes)}{/if}
			</span>
		</div>
		{#if presets.userPresets.length === 0}
			<p
				class="border border-dashed border-foreground/20 px-2 py-4 text-center text-[10px] text-muted-foreground/60"
			>
				No saved presets yet, save one from the editor, or import a backup.
			</p>
		{:else}
			<ul class="space-y-1">
				{#each presets.userPresets as preset (preset.id)}
					<li class="flex items-center gap-1.5 border border-divider px-2 py-1.5">
						{#if renameId === preset.id}
							<input
								type="text"
								bind:value={renameValue}
								aria-label="Preset name"
								class="h-7 w-full min-w-0 border border-foreground/50 bg-transparent px-2 font-mono text-[11px] text-foreground"
								onkeydown={(e) => {
									if (e.key === 'Enter') commitRename(preset.id);
									else if (e.key === 'Escape') renameId = null;
								}}
								onblur={() => commitRename(preset.id)}
							/>
						{:else}
							<div class="min-w-0 flex-1">
								<div class="truncate text-[11px] font-semibold text-foreground">{preset.name}</div>
								<div class="truncate text-[10px] text-muted-foreground">
									{preset.settings.imageFormat} · q{preset.settings.quality[0]}
								</div>
							</div>
							<button
								type="button"
								onclick={() => startRename(preset)}
								aria-label="Rename preset {preset.name}"
								class="group flex shrink-0 cursor-pointer items-center gap-1 px-1.5 py-1 font-mono text-[11px] text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
							>
								<PencilSimple class="size-3.5" />
								<span class="group-hover:underline">RENAME</span>
							</button>
							<button
								type="button"
								onclick={() => deletePreset(preset.id)}
								aria-label="Delete preset {preset.name}"
								class="flex size-7 shrink-0 cursor-pointer items-center justify-center text-muted-foreground transition-colors duration-75 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
							>
								<Trash class="size-3.5" />
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<div class="mt-2 flex flex-wrap gap-1">
			<button
				type="button"
				onclick={exportPresets}
				disabled={presets.userPresets.length === 0}
				class="group flex cursor-pointer items-center gap-1 border border-divider px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				<DownloadSimple class="size-3" />
				<span class="group-hover:underline">EXPORT</span>
			</button>
			<button
				type="button"
				onclick={() => importInput?.click()}
				class="group flex cursor-pointer items-center gap-1 border border-divider px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
			>
				<UploadSimple class="size-3" />
				<span class="group-hover:underline">IMPORT</span>
			</button>
			<button
				type="button"
				onclick={() => armOrRun('clear-presets', clearPresets)}
				disabled={presets.userPresets.length === 0}
				class="group flex cursor-pointer items-center gap-1 border border-divider px-2 py-1 font-mono text-[11px] transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 {armedAction ===
				'clear-presets'
					? 'border-destructive text-destructive'
					: 'text-muted-foreground'}"
			>
				<Trash class="size-3" />
				<span class="group-hover:underline"
					>{armedAction === 'clear-presets' ? 'CONFIRM' : 'DELETE ALL'}</span
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

	<!-- History and storage -->
	<section class="border border-divider p-2.5 sm:p-3">
		<h3 class="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
			History &amp; storage
		</h3>
		<p class="mb-3 text-[11px] text-muted-foreground/70">
			Undo history stays in memory for each editor session and clears on reload.
		</p>
		<div class="mb-3 flex items-center justify-between gap-3">
			<label for="history-limit" class="text-[11px] text-muted-foreground uppercase">
				Max entries ({MIN_HISTORY_LIMIT}–{MAX_HISTORY_LIMIT})
			</label>
			<input
				id="history-limit"
				type="number"
				min={MIN_HISTORY_LIMIT}
				max={MAX_HISTORY_LIMIT}
				step={1}
				value={historyLimit}
				oninput={(e) => onHistoryLimitInput(e.currentTarget.valueAsNumber)}
				class="h-8 w-20 border border-dashed border-foreground/30 bg-transparent px-2 text-right text-xs text-foreground"
			/>
		</div>
		<div class="border-t border-divider pt-3">
			<div class="mb-2 text-[11px] text-muted-foreground uppercase">Local storage</div>
			{#if storage.length === 0}
				<p class="mb-3 text-[11px] text-muted-foreground/60">Nothing stored yet.</p>
			{:else}
				<ul class="mb-3 space-y-1 text-[11px]">
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
				class="group flex cursor-pointer items-center gap-1.5 border border-divider px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none {armedAction === 'reset-all' ? 'border-destructive text-destructive' : ''}"
			>
				<ArrowCounterClockwise class="size-3" />
				<span class="group-hover:underline">{armedAction === 'reset-all' ? 'CONFIRM RESET' : 'RESET ALL SETTINGS'}</span>
			</button>
		</div>
	</section>

	<!-- Build -->
	<section class="border border-divider p-2.5 sm:p-3">
		<h3 class="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
			Build
		</h3>
		<div class="grid gap-1 text-[11px]">
			<div class="flex justify-between gap-4">
				<span class="text-muted-foreground">App</span><span>{APP_VERSION}</span>
			</div>
			{#if isElectron}
				<div class="flex justify-between gap-4">
					<span class="text-muted-foreground">Native ImageMagick</span><span
						>{nativeVersions.magick ?? 'Unavailable'}</span
					>
				</div>
				<div class="flex justify-between gap-4">
					<span class="text-muted-foreground">Sharp</span><span
						>{nativeVersions.sharp ?? 'Unavailable'}</span
					>
				</div>
				<div class="flex justify-between gap-4">
					<span class="text-muted-foreground">libvips</span><span
						>{nativeVersions.vips ?? 'Unavailable'}</span
					>
				</div>
				<div class="flex justify-between gap-4">
					<span class="text-muted-foreground">Electron</span><span
						>{window.wasmagick?.electronVersion ?? 'Unknown'}</span
					>
				</div>
			{/if}
			<div class="flex justify-between gap-4">
				<span class="text-muted-foreground">WASM package</span><span>{MAGICK_WASM_VERSION}</span>
			</div>
			<div class="flex justify-between gap-4">
				<span class="text-muted-foreground">WASM engine</span><span>{wasmEngineVersion}</span>
			</div>
			<div class="flex justify-between gap-4">
				<span class="text-muted-foreground">Platform</span><span
					>{window.wasmagick?.platform ?? 'Web'}</span
				>
			</div>
		</div>
	</section>
</div>
