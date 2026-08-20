const {
	app,
	BrowserWindow,
	Menu,
	dialog,
	ipcMain,
	nativeImage,
	protocol,
	shell
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const isDev = process.argv.includes('--dev');
const DEV_URL = 'http://localhost:5173';
const APP_HOST = 'wasmagick';
const APP_ID = 'com.wasmagick.app';
const GITHUB_URL = 'https://github.com/KIRKR101/wasmagick';
const TITLEBAR_HEIGHT = 40;
const TITLEBAR_COLORS = {
	light: { color: '#f7f7f4', symbolColor: '#18181b' },
	dark: { color: '#18181b', symbolColor: '#f4f4f5' }
};

const BUILD_DIR = path.join(__dirname, '..', 'build');

function resolveIconPath() {
	const isMac = process.platform === 'darwin';
	const dirs = [path.join(__dirname, '..', 'static', 'icons'), path.join(BUILD_DIR, 'icons')];
	for (const dir of dirs) {
		if (isMac && fs.existsSync(path.join(dir, 'icon-mac-512.png'))) {
			return path.join(dir, 'icon-mac-512.png');
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
	'heif'
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
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain'
};

let mainWindow = null;
let pendingArgFiles = [];
let rendererReady = false;
let closeConfirmed = false;
let isDarkTheme = false;
let editorState = { hasImage: false, hasUnsavedEdits: false, canUndo: false, canRedo: false };

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

	const filePath = result.filePaths[0];
	try {
		pushFilePayload(win, await readFilePayload(filePath));
	} catch (err) {
		dialog.showErrorBox('Open failed', String(err));
	}
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
			hasUnsavedEdits: Boolean(state?.hasUnsavedEdits),
			canUndo: Boolean(state?.canUndo),
			canRedo: Boolean(state?.canRedo)
		};
		updateMenuItems();
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

		const result = await dialog.showSaveDialog(win, {
			title: 'Save Image',
			defaultPath: path.join(app.getPath('downloads'), payload.name),
			filters: [{ name: 'Image', extensions: [ext] }]
		});
		if (result.canceled || !result.filePath) return false;

		await fs.promises.writeFile(result.filePath, payload.data);
		return true;
	});
}

function applyTitleBarTheme() {
	if (process.platform !== 'win32' || !mainWindow) return;
	const colors = isDarkTheme ? TITLEBAR_COLORS.dark : TITLEBAR_COLORS.light;
	mainWindow.setTitleBarOverlay({ ...colors, height: TITLEBAR_HEIGHT });
}

function updateMenuItems() {
	const menu = Menu.getApplicationMenu();
	if (!menu) return;
	const byId = (id) => menu.getMenuItemById(id);
	const items = [
		['menu-export', editorState.hasImage],
		['menu-close-image', editorState.hasImage],
		['menu-undo', editorState.canUndo],
		['menu-redo', editorState.canRedo]
	];
	for (const [id, enabled] of items) {
		const item = byId(id);
		if (item) item.enabled = enabled;
	}
}

function buildMenu(win) {
	const send = (channel) => () => {
		if (win && !win.webContents.isDestroyed()) win.webContents.send(channel);
	};

	const template = [
		{ role: 'appMenu' },
		{
			label: 'File',
			submenu: [
				{
					label: 'Open Image…',
					accelerator: 'CmdOrCtrl+O',
					click: () => openFileWithDialog(win)
				},
				{
					id: 'menu-close-image',
					label: 'Close Image',
					accelerator: 'CmdOrCtrl+W',
					enabled: false,
					click: send('menu:close-image')
				},
				{ type: 'separator' },
				{
					id: 'menu-export',
					label: 'Export Image…',
					accelerator: 'CmdOrCtrl+S',
					enabled: false,
					click: send('menu:export')
				},
				{ type: 'separator' },
				{ role: 'close', accelerator: 'Cmd+Shift+W' }
			]
		},
		{
			label: 'Edit',
			submenu: [
				{
					id: 'menu-undo',
					label: 'Undo',
					accelerator: 'CmdOrCtrl+Z',
					enabled: false,
					click: send('menu:undo')
				},
				{
					id: 'menu-redo',
					label: 'Redo',
					accelerator: 'CmdOrCtrl+Shift+Z',
					enabled: false,
					click: send('menu:redo')
				},
				{ type: 'separator' },
				{ role: 'cut' },
				{ role: 'copy' },
				{ role: 'paste' },
				{ role: 'selectAll' }
			]
		},
		{
			label: 'View',
			submenu: [
				...(isDev
					? [
							{ role: 'reload' },
							{ role: 'forceReload' },
							{ role: 'toggleDevTools' },
							{ type: 'separator' }
						]
					: []),
				{ role: 'togglefullscreen' }
			]
		},
		{ role: 'windowMenu' },
		{
			label: 'Help',
			submenu: [
				{
					label: 'About WASMagick',
					click: () =>
						dialog.showMessageBox(win, {
							title: 'About WASMagick',
							message: `WASMagick ${app.getVersion()}`,
							detail: 'Client-side image editor powered by WebAssembly ImageMagick.',
							buttons: ['OK']
						})
				},
				{ type: 'separator' },
				{ label: 'WASMagick on GitHub', click: () => shell.openExternal(GITHUB_URL) }
			]
		}
	];

	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
	const iconPath = resolveIconPath();

	mainWindow = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 900,
		minHeight: 600,
		show: false,
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

	mainWindow.once('ready-to-show', () => mainWindow.show());

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
	mainWindow.on('maximize', sendMaximizeState);
	mainWindow.on('unmaximize', sendMaximizeState);

	mainWindow.on('close', (event) => {
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
	});

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith('http://') || url.startsWith('https://')) {
			shell.openExternal(url);
		}
		return { action: 'deny' };
	});

	mainWindow.webContents.on('will-navigate', (event, url) => {
		const isAppUrl = url.startsWith('app://') || (isDev && url.startsWith(DEV_URL));
		if (!isAppUrl) {
			event.preventDefault();
			shell.openExternal(url);
		}
	});

	if (process.platform === 'darwin') {
		buildMenu(mainWindow);
	} else {
		Menu.setApplicationMenu(null);
	}

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
	app.setAppUserModelId(APP_ID);
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
		if (argFile) {
			readFilePayload(argFile)
				.then((payload) => pushFilePayload(mainWindow, payload))
				.catch(() => {});
		}
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		}
	});

	app.on('open-file', (event, filePath) => {
		event.preventDefault();
		if (isImagePath(filePath)) {
			readFilePayload(filePath)
				.then((payload) => pushFilePayload(mainWindow, payload))
				.catch(() => {});
		}
	});

	app.whenReady().then(() => {
		createWindow();

		const argFile = findImageArg(process.argv);
		if (argFile) {
			readFilePayload(argFile)
				.then((payload) => pushFilePayload(mainWindow, payload))
				.catch(() => {});
		}

		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) createWindow();
		});
	});

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') app.quit();
	});
}
