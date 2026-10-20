# ImageMagick version parity

Keep the ImageMagick release used by the WebAssembly package and the bundled
native binary aligned. When upgrading either engine, update the other to the
same ImageMagick release, then run the parity tests to catch behavior
differences before shipping. The native release is pinned as `IM_VERSION` in
`tooling/setup-imagemagick.ts`; the `@imagemagick/magick-wasm` package version
is separate from the underlying ImageMagick release, so verify its build
version rather than matching package numbers.

On macOS, the setup script uses Homebrew's `imagemagick-full` only when its
binary reports the pinned release. The release workflow builds the pinned
versioned formula in `tooling/homebrew` so Homebrew updates cannot change the
ImageMagick version inside a desktop bundle.
