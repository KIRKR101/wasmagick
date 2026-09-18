# ImageMagick version parity

Keep the ImageMagick release used by the WebAssembly package and the bundled
native binary aligned. When upgrading either engine, update the other to the
same ImageMagick release, then run the parity tests to catch behavior
differences before shipping. The native release is pinned as `IM_VERSION` in
`tooling/setup-imagemagick.ts`; the `@imagemagick/magick-wasm` package version
is separate from the underlying ImageMagick release, so verify its build
version rather than matching package numbers.
