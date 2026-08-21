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
- `npm run build:electron` — build a packaged installer into `release/`

### Homebrew (macOS)

```bash
brew install --cask KIRKR101/tap/wasmagick
```

### Manual install

Download the installer for your platform from the
[releases page](https://github.com/KIRKR101/wasmagick/releases).
