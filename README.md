A browser-based image editor powered by WebAssembly for fast, client-side image processing.

WASMagick can be installed as a PWA for offline use on PC or mobile.

## Web app

Install dependencies, then run the web app using:

- `npm install`
- `npm run dev`
- or: `npm run build`, `npm run preview`

## Desktop app (Electron)

WASMagick also ships as a native desktop app:

- `npm run dev:electron` — run the app against the Vite dev server
- `npm run dev:electron:native` — same, but with the bundled native ImageMagick
- `npm run build:electron` — build a packaged installer into `release/`

The desktop app processes images with a fully bundled native ImageMagick
binary (no system install needed, no WASM download). The web app and PWA
keep using the WebAssembly engine. Native binaries are fetched/assembled per
platform with `npm run setup:imagemagick` and staged for packaging with
`npm run stage:native` (runs automatically on `build:electron`).
The same setup step downloads the official precompiled WebP utilities and
bundles `cwebp` and `dwebp` alongside ImageMagick for future native paths.
ImageMagick's own WebP coder is also verified before packaging.

Packaged desktop builds also integrate with the host desktop:

- Windows NSIS installs an `Edit with WASMagick` Explorer context action for supported image files.
- macOS installs an `Edit with WASMagick` Finder Quick Action on first launch and registers the app as an image editor.
- Linux packages include image MIME registrations and an `Open Image…` desktop action.

Windows and macOS file actions pass paths to the existing single-instance open-file handling; the Linux launcher action opens the native image picker.

### Homebrew (macOS)

```bash
brew install --cask KIRKR101/tap/wasmagick
```

### Manual install

Download the installer for your platform from the
[releases page](https://github.com/KIRKR101/wasmagick/releases).
