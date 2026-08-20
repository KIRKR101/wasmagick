A browser-based image editor powered by WebAssembly for fast, client-side image processing.

WASMagick can be installed as a PWA for offline use on PC or mobile.

## Desktop app (Electron)

WASMagick also ships as a native desktop app:

- `npm run dev:electron` — run the app against the Vite dev server
- `npm run build:electron` — build a packaged installer into `release/`

The desktop build loads the static SPA through a custom `app://` protocol, uses a
themed custom title bar (no native menu bar on Windows/Linux), and adds native
file open/save dialogs, drag-and-drop from the OS, and keyboard shortcuts such
as `Ctrl+O`/`Ctrl+W`/`Ctrl+S`. The PWA and service-worker layers are excluded
from the desktop build.
