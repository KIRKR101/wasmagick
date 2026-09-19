# VIPS / libvips integration notes

## Context

WASMagick currently uses two processing paths:

- Browser/PWA: ImageMagick compiled to WebAssembly.
- Electron: a bundled native ImageMagick executable spawned by the Electron
  main process.

The Electron native path currently:

1. Builds ImageMagick CLI arguments in the renderer.
2. Sends a native request through Electron IPC.
3. Writes the source, optional CLUT, and optional font to a temporary directory.
4. Spawns the bundled `magick` binary.
5. Runs one ImageMagick invocation that writes both the encoded output and a
   raw RGBA preview.
6. Runs `identify` for output dimensions.
7. Reads the output and preview back into memory.
8. Removes the temporary directory.

The application does not currently process continuously while a slider moves.
Settings become stale and the user explicitly presses `PROCESS`. Therefore,
initial performance work should benchmark repeated explicit processing, not
assume Photoshop-style live slider rendering already exists.

Relevant locations:

- `src/lib/useMagick.svelte.ts` — chooses native/WASM and handles results.
- `src/lib/magick-args.ts` — translates settings into ImageMagick CLI args.
- `electron/magick-native.cjs` — native process, temp files, preview, and IPC.
- `electron/preload.cjs` — renderer/main-process bridge.
- `test/parity/operations.test.ts` — existing WASM/ImageMagick parity tests.

## Overall recommendation

The immediate priority should be the architecture underneath VIPS, not VIPS
itself. Introduce a backend-neutral edit recipe and separate preview rendering
from final export. Benchmark the improved existing ImageMagick path first,
then add VIPS where it produces a substantial measured improvement.

VIPS should remain a second Electron-native backend, not a replacement for
ImageMagick.

The preferred practical Node binding is `sharp`, which uses libvips. The
renderer should not know whether a native request uses VIPS or ImageMagick.
The main process should select the backend based on the complete processing
pipeline.

Recommended long-term flow:

```text
Source bytes + edit recipe
            |
            +--> preview renderer ----> screen-sized raw pixels
            |
            `--> export renderer  ----> full-resolution encoded file

Each renderer can select an implementation:

  VIPS/sharp       simple supported pipelines
  ImageMagick      advanced or parity-sensitive pipelines
```

Do not route individual operations independently unless output differences are
explicitly acceptable. A mixed pipeline can change results because operation
ordering, color precision, alpha handling, metadata, and encoder semantics
differ between engines.

## Best integration boundary

The current native request accepts ImageMagick-specific `args`. VIPS should
not be forced through that interface.

Move toward separate backend-neutral requests rather than one universal
request that always returns encoded output and preview data:

```ts
renderPreview({
	sourceRevision,
	plan,
	maxWidth,
	maxHeight
});

renderExport({
	sourceRevision,
	plan,
	format,
	quality
});
```

The preview request should return only what the canvas needs:

```ts
{
	(previewData, previewWidth, previewHeight);
}
```

The export request should return the encoded file and its dimensions. This
avoids encoding JPEG/WebP/PNG on every preview request.

Keep the original compressed source bytes and the edit recipe as the
authoritative state. Do not commit intermediate encoded images as the editing
model.

Suggested native layout:

```text
electron/
  native-engine.cjs       capability detection and backend selection
  vips-engine.cjs         VIPS/sharp implementation
  magick-engine.cjs       existing ImageMagick implementation
```

`native-engine.cjs` should own common request validation, result validation,
timeouts, backend selection, and error normalization.

## Canonical processing plan

Introduce a small backend-neutral representation between settings and
execution, but do not duplicate the full settings model unnecessarily:

```ts
type ProcessingPlan = {
	orientation: boolean;
	geometry: GeometryStep[];
	color: ColorStep[];
	filters: FilterStep[];
	annotation?: AnnotationStep;
	output: OutputStep;
};
```

Both backends consume the same plan. The ImageMagick compiler can continue to
produce CLI arguments from it; the VIPS backend can build a sharp/libvips
pipeline from it. The plan is useful even if VIPS is never shipped because it
decouples the editing model from ImageMagick CLI syntax.

Once profiling justifies VIPS, the initial routing rule should be simple:

```text
Entire plan supported by VIPS  -> VIPS
Any unsupported step           -> ImageMagick
```

This prevents accidental semantic changes when a pipeline contains one
advanced ImageMagick operation. It also means performance can switch
discontinuously when an ImageMagick-only effect is enabled; that tradeoff is
acceptable for a first fast path, but should be measured and communicated in
the UI if it becomes noticeable.

## Good VIPS candidates

These operations are suitable for the first VIPS path:

- EXIF auto-orient
- resize
- crop/extract
- 90/180/-90 rotation
- flip/flop
- shave, where it maps cleanly to extraction
- canvas extent and borders
- basic blur
- basic sharpen
- JPEG encoding
- PNG encoding
- WebP encoding
- AVIF/TIFF encoding where the packaged build supports them
- quality settings
- metadata retention/removal

libvips is demand-driven, horizontally threaded, and designed for low memory
use. It supports common formats including JPEG, TIFF, PNG, WebP, HEIC, AVIF,
GIF, SVG input, and others. Its optional dependencies control some format and
feature support.

## Keep ImageMagick for now

These should remain ImageMagick-backed unless exact parity is deliberately
abandoned and separately validated:

- RAW input and camera-format edge cases
- deskew
- CLAHE
- Canny edge
- charcoal
- oil paint
- complex noise modes
- quantization and dithering
- exact ImageMagick color-space behavior
- annotation/font rendering with the current font-metric flow
- CLUT processing where output parity matters
- obscure input/output formats

libvips can use LibRaw when compiled with it, but the project already has
careful LibRaw detection and fallback logic. Standard sharp packages do not
advertise RAW as a supported format, so RAW should not silently switch to VIPS.

## Performance plan

Do not assume that process spawning and temp-file I/O dominate 24MP work.
Decoding, filtering, memory bandwidth, and encoding may be more expensive.
Instrument the current path before selecting a backend. Measure at least:

1. source temp-file write;
2. process startup;
3. decode and operation time;
4. encoded output write;
5. raw preview write/read;
6. `identify` time;
7. IPC transfer time;
8. peak memory.

The current ImageMagick invocation already writes encoded output and raw RGBA
preview in one process. The first useful optimization is therefore not “avoid
two full pipelines”; it is to add a preview-only request that does not encode
an output file and does not need `identify` unless dimensions are unavailable
from the preview path.

Recommended order:

1. Add timings and a reproducible 24MP benchmark.
2. Separate `renderPreview` from `renderExport`.
3. Make preview return only screen-sized raw pixels.
4. Keep source bytes and the edit recipe authoritative.
5. Optimize the existing ImageMagick preview path and benchmark it.
6. Add VIPS for simple previews and batch/simple pipelines if it wins
   substantially.
7. Expand VIPS to final export only after parity tests justify it.

During editing, a preview should normally be downscaled to the display size.
Full-resolution processing is reserved for export, explicit 100% inspection,
or operations whose result genuinely depends on full-resolution data.

Preview scaling needs defined semantics. Blur, sharpen, noise, thresholding,
quantization, deskew, and annotation can be resolution-dependent; they cannot
all be handled by blindly shrinking the source first.

The current native source cache stores source bytes by revision. Do not add a
full-resolution decoded-image cache until profiling demonstrates that decode
time is the bottleneck. A 24MP RGBA image is roughly 96 MB before additional
working buffers. A single screen-resolution preview cache plus the original
compressed bytes is a safer starting point.

VIPS is likely to provide its strongest payoff for large images, repeated
explicit processing, and future batch processing—not necessarily for the
current single-image flow.

## Packaging concerns

VIPS/sharp introduces native Node modules and platform-specific binaries.

Electron packaging must account for:

- externalizing `sharp` from Vite/Rollup;
- unpacking `sharp` and `@img` binaries from ASAR;
- installing the correct optional package for each target;
- Windows x64;
- macOS x64;
- macOS ARM64;
- Linux x64;
- native-module loading from the packaged application;
- code signing and release artifacts.

The sharp documentation specifically calls out Electron ASAR unpacking and
platform-aware installation. A packaged smoke test is required; a successful
development install is not enough.

The current project stages native ImageMagick under
`native-bundle/magick/`. VIPS should either be packaged as a normal unpacked
native dependency or staged through a similarly explicit native-bundle step.
Do not rely on a user's globally installed libvips.

## Backend error behavior

Distinguish these cases:

- unsupported operation: route to ImageMagick before execution;
- missing encoder/capability: report a configuration/backend error;
- corrupt input: report a user-facing decode error;
- runtime VIPS failure: either use a deliberate fallback policy or surface a
  useful native error.

Do not silently retry every VIPS failure through ImageMagick. That would hide
real bugs and make performance unpredictable.

## Test strategy

### 1. Processing-plan compiler tests

Add unit tests for:

```text
MagickSettings -> ProcessingPlan
```

Verify:

- supported settings produce a VIPS-compatible plan;
- unsupported settings are marked ImageMagick-only;
- operation order is preserved;
- defaults produce a no-op plan;
- output format and quality are preserved.

Representative routing cases:

```text
resize only              -> VIPS
resize + crop + WebP     -> VIPS
resize + CLAHE           -> ImageMagick
resize + annotation      -> ImageMagick
RAW + resize             -> ImageMagick/WASM
```

### 2. Direct VIPS engine tests

Add `test/vips-engine.test.ts` and call the engine without Electron.

Test:

- valid buffer input and output;
- dimensions;
- alpha preservation;
- format selection;
- preview dimensions and RGBA length;
- invalid input errors;
- quality settings;
- metadata stripping;
- odd dimensions;
- transparent PNGs;
- ICC-bearing images;
- EXIF-oriented JPEGs.

Reuse the existing fixtures in `test/fixtures/source`.

### 3. VIPS/ImageMagick parity tests

Extend the existing parity approach in `test/parity/operations.test.ts`.
Process the same source through both backends, decode outputs to RGBA, and
compare:

- dimensions;
- alpha behavior;
- pixel output using explicit tolerance.

Do not compare encoded bytes. JPEG and WebP encoders can produce different
bytes while producing visually equivalent images.

Suggested tolerance policy:

```text
resize/crop/rotate       exact dimensions, very low pixel tolerance
flip/flop                exact pixel match where possible
grayscale                small color tolerance
blur/sharpen             perceptual/pixel threshold
JPEG/WebP                decode and compare, never byte compare
```

For operations where ImageMagick is the product reference, compare both
backends against existing ImageMagick goldens. If a VIPS result is intentionally
different, store a VIPS-specific golden and document the difference.

### 4. Routing and fallback tests

Add explicit tests that verify:

- a supported plan invokes VIPS;
- an unsupported plan invokes ImageMagick;
- a RAW input uses the existing RAW path;
- VIPS unavailability does not prevent ImageMagick use;
- a deliberate VIPS fallback policy works;
- malformed native requests fail cleanly.

Mock backend functions at the native-engine boundary rather than spawning real
processes for routing tests.

### 5. Preview/export contract tests

Test both backends through the separate request contracts.

Preview requests should return:

```ts
{
	(previewData, previewWidth, previewHeight);
}
```

Export requests should return encoded data, dimensions, and format. Verify that
preview requests do not invoke an encoder and export requests do not require
preview data unless explicitly requested.

This prevents renderer code from becoming backend-specific while avoiding a
result contract that forces every request to produce both products.

### 6. Electron smoke test

Keep one small packaged/native smoke test that:

1. starts the native handler;
2. processes one fixture;
3. receives a valid result;
4. checks dimensions and format;
5. checks that the fallback backend still works;
6. checks that malformed input produces a clean failure.

Most coverage should stay in direct backend tests so the suite remains fast.

### 7. Packaging tests

Run a packaged-app smoke test for:

- Windows x64;
- macOS x64;
- macOS ARM64;
- Linux x64.

Verify that:

- the VIPS native module loads from the packaged app;
- ASAR unpacking is correct;
- a PNG can be resized and exported;
- ImageMagick fallback still works;
- missing VIPS capability does not prevent application startup.

### 8. Performance benchmarks

Keep performance tests separate from normal unit tests. Add a benchmark such
as `test/bench/native-backends.ts` measuring:

- 24MP JPEG resize;
- 24MP JPEG to WebP;
- transparent PNG to WebP;
- repeated explicit processing of the same source;
- ten images using one plan;
- cold-start latency;
- warm-start latency;
- peak memory.

Break timings down into decode, operation, encode, preview generation, process
startup, temp-file I/O, `identify`, and IPC where possible.

Compare:

```text
VIPS cold
VIPS warm
ImageMagick cold
ImageMagick warm
```

Do not make fragile machine-dependent timing thresholds part of ordinary CI.
Use benchmarks to decide whether the added backend is delivering a meaningful
gain.

## Suggested test files

```text
test/
  processing-plan.test.ts
  preview-export.test.ts
  vips-engine.test.ts
  native-routing.test.ts
  native-backends.test.ts
  parity/
    operations.test.ts
    vips-parity.test.ts
  packaging/
    native-smoke.test.ts
  bench/
    native-backends.ts
```

## Minimum acceptance bar

1. Preview and export are separate operations and contracts.
2. Preview requests do not encode output unnecessarily.
3. No VIPS-supported pipeline accidentally routes to ImageMagick once VIPS is
   enabled.
4. Unsupported pipelines never route to VIPS.
5. Simple VIPS outputs match dimensions, alpha, and acceptable visual parity.
6. Packaged builds load the correct native binaries.
7. ImageMagick remains a reliable advanced-operation and compatibility
   fallback.

## Final decision

The strongest immediate improvement is a canonical edit recipe plus separate
preview and export renderers. That architectural change is worthwhile even if
VIPS is never shipped.

VIPS is a plausible optimization for the Electron native path, particularly
for large JPEG/PNG/WebP images, screen-sized previews, and future batch/simple
pipelines. It should not be introduced merely because it may make resize
faster.

Keep ImageMagick as the reference and advanced-operation implementation. First
benchmark and optimize preview-only ImageMagick requests; then add VIPS where
profiling shows a substantial UX or throughput improvement. Expand VIPS to
final export only when parity testing proves the result is acceptable.
