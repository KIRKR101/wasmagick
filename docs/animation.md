# Animated input handling

How multi-frame inputs (animated GIF/WebP frames, TIFF pages, PSD layers)
flow through the WASM, native ImageMagick, and VIPS backends.

## Input

Animated inputs are read as a frame collection, never a single image. GIF
and WebP inputs are **coalesced** to full frames before geometry, because
disposal-optimized animations store partial delta frames. Every frame then
goes through the full edit pipeline (crop, resize, color, effects). TIFF
pages and PSD layers are already full images and skip coalescing.

## Output routing

The output format decides between sequence and still
(`isSequenceOutputFormat()` in `src/lib/export-formats.ts`):

| Output                 | Behavior                                                 |
| ---------------------- | -------------------------------------------------------- |
| GIF, WebP, JXL         | Sequence preserved - all processed frames are written    |
| TIFF                   | Sequence preserved - all pages/frames kept as-is         |
| PSD, PDF               | Sequence preserved (layers/pages kept as-is)             |
| JPEG                   | Single still: last coalesced frame, flattened over white |
| PNG, AVIF, BMP, ICO, … | Single still: last coalesced frame, transparency kept    |

Stills use the **last** coalesced frame. Cumulative
animations often start on a blank transparent frame (nothing is visible at
t=0), so the first frame exports as an empty white canvas - or an empty
transparent canvas where the format supports alpha. PNG stays a still;
a multi-frame collection would otherwise encode as a blank-first APNG
for the same animations. TIFF keeps every frame as pages instead.

## Backend mechanics

- **WASM** (`src/lib/magick-process.ts`, mirrored in the
  `useMagick.svelte.ts` main-thread path; the worker shares
  `processImageSync`): sequence formats use `collection.write()`; stills
  write only the last frame (`stillFrameForOutput()`) via single-image
  `write()`. JPEG stills are composited over an opaque white canvas first
  (`flattenStillForOutput()`), a true `Over` flatten that matches the VIPS
  `flatten` step. Dimensions and the RGBA fallback preview come from the
  representative frame (first frame for sequences, last frame for stills).
- **Native ImageMagick CLI** (`src/lib/magick-args.ts`,
  `electron/magick-native.cjs`): static outputs append `-delete 0--2`
  (drops all scenes but the last; a no-op for single-image inputs) and JPEG
  adds `+repage -background white -flatten`. Numbered-sibling outputs
  resolve to the written file.
- **VIPS/sharp** (`electron/magick-native.cjs`): GIF/WebP outputs decode
  the animated sequence; multi-frame inputs with sequence outputs (GIF, WebP,
  TIFF) are routed to the magick backend instead, because sharp would apply
  geometry to the stacked frame strip. Static outputs decode one frame with
  `page: pages - 1` and JPEG flattens over `#ffffff`.

## Previews

Browser-renderable outputs (JPEG, PNG, GIF, WebP, AVIF, BMP, …) display the
exported bytes directly. Other formats get an RGBA pixel preview decoded
from the representative frame: stills (ICO, …) preview the exported last
frame, sequences (TIFF, PSD, PDF) preview the first frame.

## Tests

`test/gif-animation.test.ts` pins this contract with the
`anim-blankfirst.gif` fixture (blank frame 0, content frame 1): JPEG and PNG
stills must show content, GIF and TIFF must keep both frames, across the
WASM and native magick paths. Multi-frame inputs with sequence outputs
route to magick even when the VIPS plan allows it; VIPS keeps
single-frame-to-sequence inputs and static stills.
