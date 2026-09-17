const {
	app,
	BrowserWindow,
	Menu,
	dialog,
	ipcMain,
	nativeImage,
	protocol,
	screen,
	shell
} = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { registerMagickNative } = require('./magick-native.cjs');
const { listSystemFonts, readSystemFont } = require('./system-fonts.cjs');

const isDev = process.argv.includes('--dev');
const DEV_URL = 'http://localhost:5173';
const APP_HOST = 'wasmagick';
const APP_ID = 'com.wasmagick.app';
const GITHUB_URL = 'https://github.com/KIRKR101/wasmagick';
const TITLEBAR_HEIGHT = 40;
const TITLEBAR_COLORS = {
	light: { color: '#f7f7f4', symbolColor: '#18181b' },
	dark: { color: '#0a0a0a', symbolColor: '#f4f4f5' }
};

const BUILD_DIR = path.join(__dirname, '..', 'build');

function resolveIconPath() {
	const dirs = [
		path.join(process.resourcesPath, 'icons'),
		path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'icons'),
		path.join(__dirname, '..', 'static', 'icons'),
		path.join(BUILD_DIR, 'icons')
	];
	for (const dir of dirs) {
		if (process.platform === 'darwin' && fs.existsSync(path.join(dir, 'icon-mac-1024.png'))) {
			return path.join(dir, 'icon-mac-1024.png');
		}
		if (fs.existsSync(path.join(dir, 'icon-512.png'))) {
			return path.join(dir, 'icon-512.png');
		}
	}
	return null;
}

const IMAGE_EXTENSIONS = [
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'bmp',
	'tif',
	'tiff',
	'avif',
	'ico',
	'svg',
	'heic',
	'heif',
	'3fr',
	'arw',
	'cr2',
	'cr3',
	'crw',
	'dcr',
	'dng',
	'erf',
	'fff',
	'iiq',
	'k25',
	'kdc',
	'mef',
	'mos',
	'mrw',
	'nef',
	'nrw',
	'orf',
	'pef',
	'raf',
	'raw',
	'rmf',
	'rw2',
	'rwl',
	'sr2',
	'srf',
	'srw',
	'x3f'
];

const MIME_TYPES = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.wasm': 'application/wasm',
	'.ttf': 'font/ttf',
	'.woff2': 'font/woff2',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.bmp': 'image/bmp',
	'.tif': 'image/tiff',
	'.tiff': 'image/tiff',
	'.avif': 'image/avif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.heic': 'image/heic',
	'.heif': 'image/heif',
	'.txt': 'text/plain'
};

let mainWindow = null;
let pendingArgFiles = [];
let rendererReady = false;
let closeConfirmed = false;
let isDarkTheme = false;
let lastSavedPath = null;
let editorState = {
	hasImage: false,
	hasProcessedImage: false,
	hasUnsavedEdits: false,
	canUndo: false,
	canRedo: false,
	fileName: ''
};

const WINDOW_STATE_FILE = 'window-state.json';
const DEFAULT_WINDOW_BOUNDS = { width: 1440, height: 900 };
const MAC_QUICK_ACTION_NAME = 'Edit with WASMagick.workflow';

function windowStatePath() {
	return path.join(app.getPath('userData'), WINDOW_STATE_FILE);
}

function readWindowState() {
	try {
		const state = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
		if (!state || !Number.isFinite(state.x) || !Number.isFinite(state.y)) return null;
		if (!Number.isFinite(state.width) || !Number.isFinite(state.height)) return null;

		const display = screen.getDisplayMatching(state);
		const { x: areaX, y: areaY, width: areaWidth, height: areaHeight } = display.workArea;
		const width = Math.min(Math.max(state.width, 900), areaWidth);
		const height = Math.min(Math.max(state.height, 600), areaHeight);
		return {
			x: Math.min(Math.max(state.x, areaX - width + 80), areaX + areaWidth - 80),
			y: Math.min(Math.max(state.y, areaY), areaY + areaHeight - 80),
			width,
			height,
			isMaximized: Boolean(state.isMaximized)
		};
	} catch {
		return null;
	}
}

function saveWindowState(win) {
	if (!win || win.isDestroyed() || win.isMinimized()) return;
	const bounds = win.getNormalBounds();
	try {
		fs.mkdirSync(app.getPath('userData'), { recursive: true });
		fs.writeFileSync(
			windowStatePath(),
			JSON.stringify({ ...bounds, isMaximized: win.isMaximized() }),
			'utf8'
		);
	} catch {
		// A read-only profile should not prevent the app from closing.
	}
}

function mimeFromPath(filePath) {
	const ext = path.extname(filePath).toLowerCase();
	return MIME_TYPES[ext] ?? 'application/octet-stream';
}

function isImagePath(filePath) {
	const ext = path.extname(filePath).toLowerCase().replace('.', '');
	return IMAGE_EXTENSIONS.includes(ext);
}

function findImageArg(argv) {
	const args = argv.slice(1);
	for (const arg of args) {
		if (arg.startsWith('-')) continue;
		try {
			if (fs.statSync(arg).isFile() && isImagePath(arg)) return arg;
		} catch {
			// ignore non-path args
		}
	}
	return null;
}

async function readFilePayload(filePath) {
	const data = await fs.promises.readFile(filePath);
	return {
		name: path.basename(filePath),
		type: mimeFromPath(filePath),
		data: new Uint8Array(data)
	};
}

function pushFilePayload(win, payload) {
	if (rendererReady && win && !win.webContents.isDestroyed()) {
		win.webContents.send('file:opened', payload);
	} else {
		pendingArgFiles.push(payload);
	}
}

function trackOpenedFile(filePath) {
	if (process.platform === 'darwin' || process.platform === 'win32') {
		app.addRecentDocument(filePath);
	}
}

function installMacQuickAction() {
	if (process.platform !== 'darwin' || isDev) return;

	const source = path.join(process.resourcesPath, 'WASMagick.workflow');
	const destination = path.join(app.getPath('home'), 'Library', 'Services', MAC_QUICK_ACTION_NAME);
	try {
		if (!fs.existsSync(source)) return;
		fs.mkdirSync(path.dirname(destination), { recursive: true });
		fs.cpSync(source, destination, { recursive: true });

		const servicesDatabase = '/System/Library/CoreServices/pbs';
		if (fs.existsSync(servicesDatabase)) {
			execFile(servicesDatabase, ['-update'], { timeout: 5000 }, () => {});
		}
	} catch (err) {
		console.warn('Could not install the Finder Quick Action:', err);
	}
}

async function pushFilePath(win, filePath) {
	try {
		const payload = await readFilePayload(filePath);
		trackOpenedFile(filePath);
		pushFilePayload(win, payload);
	} catch (err) {
		dialog.showErrorBox('Open failed', String(err));
	}
}

async function openFileWithDialog(win) {
	const result = await dialog.showOpenDialog(win, {
		title: 'Open Image',
		properties: ['openFile'],
		filters: [
			{ name: 'Images', extensions: IMAGE_EXTENSIONS },
			{ name: 'All Files', extensions: ['*'] }
		]
	});
	if (result.canceled || result.filePaths.length === 0) return;

	await pushFilePath(win, result.filePaths[0]);
}

function registerAppProtocol() {
	protocol.registerSchemesAsPrivileged([
		{
			scheme: 'app',
			privileges: {
				standard: true,
				secure: true,
				supportFetchAPI: true,
				corsEnabled: true,
				stream: true
			}
		}
	]);

	app.whenReady().then(() => {
		const buildRoot = path.resolve(BUILD_DIR);

		protocol.handle('app', async (request) => {
			const { pathname } = new URL(request.url);
			const rel = decodeURIComponent(pathname).replace(/^\/+/, '');

			const resolved = path.resolve(buildRoot, rel);
			if (resolved !== buildRoot && !resolved.startsWith(buildRoot + path.sep)) {
				return new Response('Forbidden', { status: 403 });
			}

			const candidates = [];
			if (rel) {
				candidates.push(resolved);
				candidates.push(path.join(resolved, 'index.html'));
				candidates.push(`${resolved}.html`);
			}
			candidates.push(path.join(buildRoot, 'index.html'));

			for (const candidate of candidates) {
				try {
					const data = await fs.promises.readFile(candidate);
					const ext = path.extname(candidate).toLowerCase();
					return new Response(new Uint8Array(data), {
						headers: { 'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream' }
					});
				} catch {
					// try next candidate
				}
			}

			return new Response('Not Found', { status: 404 });
		});
	});
}

function registerIpc() {
	registerMagickNative(ipcMain);
	ipcMain.handle('fonts:list-system', () => listSystemFonts());
	ipcMain.handle('fonts:read-system', (_event, postscriptName) =>
		readSystemFont(String(postscriptName || ''))
	);

	ipcMain.handle('renderer:ready', () => {
		rendererReady = true;
		if (mainWindow && !mainWindow.webContents.isDestroyed()) {
			for (const payload of pendingArgFiles) {
				mainWindow.webContents.send('file:opened', payload);
			}
			pendingArgFiles = [];
		}
	});

	ipcMain.on('menu:state', (_event, state) => {
		editorState = {
			hasImage: Boolean(state?.hasImage),
			hasProcessedImage: Boolean(state?.hasProcessedImage),
			hasUnsavedEdits: Boolean(state?.hasUnsavedEdits),
			canUndo: Boolean(state?.canUndo),
			canRedo: Boolean(state?.canRedo),
			fileName: typeof state?.fileName === 'string' ? state.fileName : ''
		};
		updateWindowTitle();
	});

	ipcMain.on('theme:set', (_event, dark) => {
		isDarkTheme = Boolean(dark);
		applyTitleBarTheme();
	});

	ipcMain.handle('file:open-dialog', async (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		await openFileWithDialog(win);
	});

	ipcMain.on('window:minimize', (event) => {
		BrowserWindow.fromWebContents(event.sender)?.minimize();
	});

	ipcMain.on('window:toggle-maximize', (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (!win) return;
		if (win.isMaximized()) win.unmaximize();
		else win.maximize();
	});

	ipcMain.on('window:close', (event) => {
		BrowserWindow.fromWebContents(event.sender)?.close();
	});

	ipcMain.handle('window:is-maximized', (event) => {
		return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
	});

	ipcMain.handle('file:save', async (event, payload) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		const ext = path.extname(payload.name).replace('.', '').toLowerCase() || 'png';
		const previousPath =
			lastSavedPath && path.extname(lastSavedPath).toLowerCase() === `.${ext}`
				? lastSavedPath
				: lastSavedPath
					? path.join(path.dirname(lastSavedPath), payload.name)
					: null;

		const result = await dialog.showSaveDialog(win, {
			title: 'Save Image',
			defaultPath: previousPath || path.join(app.getPath('downloads'), payload.name),
			filters: [{ name: 'Image', extensions: [ext] }]
		});
		if (result.canceled || !result.filePath) return false;

		await fs.promises.writeFile(result.filePath, payload.data);
		lastSavedPath = result.filePath;
		trackOpenedFile(result.filePath);
		return true;
	});

	ipcMain.on('file:reveal-saved', () => {
		if (lastSavedPath) shell.showItemInFolder(lastSavedPath);
	});
}

function applyTitleBarTheme() {
	if (process.platform !== 'win32' || !mainWindow) return;
	const colors = isDarkTheme ? TITLEBAR_COLORS.dark : TITLEBAR_COLORS.light;
	mainWindow.setTitleBarOverlay({ ...colors, height: TITLEBAR_HEIGHT });
}

function updateWindowTitle() {
	if (!mainWindow || mainWindow.isDestroyed()) return;
	const file = editorState.fileName ? ` — ${editorState.fileName}` : '';
	const dirty = editorState.hasUnsavedEdits ? ' •' : '';
	mainWindow.setTitle(`WASMagick${file}${dirty}`);
}

function createWindow() {
	const iconPath = resolveIconPath();
	const savedState = readWindowState();

	mainWindow = new BrowserWindow({
		width: savedState?.width ?? DEFAULT_WINDOW_BOUNDS.width,
		height: savedState?.height ?? DEFAULT_WINDOW_BOUNDS.height,
		...(savedState ? { x: savedState.x, y: savedState.y } : {}),
		minWidth: 900,
		minHeight: 600,
		show: false,
		backgroundColor: '#f7f7f4',
		...(iconPath ? { icon: iconPath } : {}),
		...(process.platform === 'win32'
			? {
					titleBarStyle: 'hidden',
					titleBarOverlay: { ...TITLEBAR_COLORS.light, height: TITLEBAR_HEIGHT }
				}
			: process.platform === 'linux'
				? { frame: false }
				: {}),
		webPreferences: {
			preload: path.join(__dirname, 'preload.cjs'),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false
		}
	});

	if (process.platform === 'linux' && iconPath) {
		mainWindow.setIcon(nativeImage.createFromPath(iconPath));
	}

	if (process.platform === 'darwin' && iconPath) {
		app.dock?.setIcon(nativeImage.createFromPath(iconPath));
	}

	const sendMaximizeState = () => {
		if (!mainWindow || mainWindow.webContents.isDestroyed()) return;
		mainWindow.webContents.send('window:maximized-changed', mainWindow.isMaximized());
	};
	mainWindow.on('maximize', () => {
		saveWindowState(mainWindow);
		sendMaximizeState();
	});
	mainWindow.on('unmaximize', () => {
		saveWindowState(mainWindow);
		sendMaximizeState();
	});
	mainWindow.on('resize', () => saveWindowState(mainWindow));
	mainWindow.on('move', () => saveWindowState(mainWindow));

	mainWindow.on('close', (event) => {
		saveWindowState(mainWindow);
		if (closeConfirmed || !editorState.hasUnsavedEdits) return;
		event.preventDefault();
		const choice = dialog.showMessageBoxSync(mainWindow, {
			type: 'warning',
			title: 'Unsaved changes',
			message: 'You have unsaved edits.',
			detail: 'Closing now will discard changes that have not been saved.',
			buttons: ['Cancel', 'Discard & Close'],
			defaultId: 0,
			cancelId: 0
		});
		if (choice === 1) {
			closeConfirmed = true;
			mainWindow.close();
		}
	});
	mainWindow.on('closed', () => {
		mainWindow = null;
		closeConfirmed = false;
	});

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith('http://') || url.startsWith('https://')) {
			shell.openExternal(url);
		}
		return { action: 'deny' };
	});

	mainWindow.webContents.on('will-navigate', (event, url) => {
		const isAppUrl = url.startsWith('app://') || (isDev && url.startsWith(DEV_URL));
		if (isAppUrl) return;
		event.preventDefault();
		if (url.startsWith('http://') || url.startsWith('https://')) {
			shell.openExternal(url);
		}
	});

	updateWindowTitle();
	mainWindow.once('ready-to-show', () => {
		if (savedState?.isMaximized) mainWindow.maximize();
		mainWindow.show();
		mainWindow.focus();
	});

	if (isDev) {
		mainWindow.loadURL(`${DEV_URL}/editor`);
	} else {
		mainWindow.loadURL(`app://${APP_HOST}/editor`);
	}
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
	app.quit();
} else {
	// Electron uses the executable name as the application identity when run
	// from the CLI. Set it explicitly so the macOS dock label is WASMagick in
	// development as well as in packaged builds.
	app.setName('WASMagick');
	app.setAppUserModelId(APP_ID);
	// Suppress Electron's default File/Edit/View/Window menu before ready.
	Menu.setApplicationMenu(null);
	if (process.platform === 'linux') app.setDesktopName('wasmagick.desktop');
	app.setAboutPanelOptions({
		applicationName: 'WASMagick',
		applicationVersion: app.getVersion(),
		website: GITHUB_URL
	});

	registerAppProtocol();
	registerIpc();

	app.on('second-instance', (_event, argv) => {
		const argFile = findImageArg(argv);
		if (argFile) void pushFilePath(mainWindow, argFile);
		if (argv.includes('--open-dialog')) void openFileWithDialog(mainWindow);
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}
	});

	app.on('open-file', (event, filePath) => {
		event.preventDefault();
		if (isImagePath(filePath)) void pushFilePath(mainWindow, filePath);
	});

	app.whenReady().then(() => {
		installMacQuickAction();
		createWindow();

		const argFile = findImageArg(process.argv);
		if (argFile) void pushFilePath(mainWindow, argFile);
		if (process.argv.includes('--open-dialog')) void openFileWithDialog(mainWindow);

		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) createWindow();
		});
	});

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') app.quit();
	});
}
