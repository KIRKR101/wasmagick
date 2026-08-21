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

To publish desktop installers, push a semantic-version tag such as `v0.0.2`.
GitHub Actions builds Linux AppImage/`.deb`, Windows NSIS, and Intel/Apple
Silicon macOS DMGs, attaches them to a GitHub Release, and updates the
Homebrew cask automatically.

The desktop build loads the static SPA through a custom `app://` protocol, uses a
themed custom title bar (no native menu bar on Windows/Linux), and adds native
file open/save dialogs, drag-and-drop from the OS, and keyboard shortcuts such
as `Ctrl+O`/`Ctrl+W`/`Ctrl+S`. The PWA and service-worker layers are excluded
from the desktop build.
