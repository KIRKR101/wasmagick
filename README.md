A browser-based image editor powered by WebAssembly for fast, client-side image processing.

WASMagick can be installed as a PWA for offline use on PC or mobile.

## Web app

Install dependencies, then run the web app using:

- `npm install`
- `npm run dev`
- or: `npm run build`, `npm run preview`

## Desktop app (Electron)

WASMagick also ships as a native desktop app:

- `npm run dev:electron` - run the app against the dev server
- `npm run dev:electron:native` - same, but with the bundled native ImageMagick
- `npm run build:electron` - build a packaged installer into `release/`

The desktop app processes images with a fully bundled native ImageMagick
binary (no system install needed, no WASM download). The web app and PWA
keep using the WebAssembly engine.

### Homebrew (macOS)

```bash
brew install --cask KIRKR101/tap/wasmagick
```

### Manual install

Download the installer for your platform from the
[releases page](https://github.com/KIRKR101/wasmagick/releases).
