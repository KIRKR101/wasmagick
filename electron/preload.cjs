const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
	const listener = (_event, ...args) => callback(...args);
	ipcRenderer.on(channel, listener);
	return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('wasmagick', {
	platform: process.platform,
	markReady: () => ipcRenderer.invoke('renderer:ready'),
	saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
	openImage: () => ipcRenderer.invoke('file:open-dialog'),
	setTheme: (dark) => ipcRenderer.send('theme:set', dark),
	updateMenuState: (state) => ipcRenderer.send('menu:state', state),
	minimizeWindow: () => ipcRenderer.send('window:minimize'),
	toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
	closeWindow: () => ipcRenderer.send('window:close'),
	isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
	onMaximizeChange: (callback) => subscribe('window:maximized-changed', callback),
	onOpenFile: (callback) => subscribe('file:opened', callback),
	onMenuExport: (callback) => subscribe('menu:export', callback),
	onMenuUndo: (callback) => subscribe('menu:undo', callback),
	onMenuRedo: (callback) => subscribe('menu:redo', callback),
	onMenuClose: (callback) => subscribe('menu:close-image', callback)
});
