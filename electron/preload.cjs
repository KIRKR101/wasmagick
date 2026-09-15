const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
	const listener = (_event, ...args) => callback(...args);
	ipcRenderer.on(channel, listener);
	return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('wasmagick', {
	platform: process.platform,
	markReady: () => ipcRenderer.invoke('renderer:ready'),
	listSystemFonts: () => ipcRenderer.invoke('fonts:list-system'),
	readSystemFont: (postscriptName) => ipcRenderer.invoke('fonts:read-system', postscriptName),
	isNativeAvailable: () => ipcRenderer.invoke('magick:native-available'),
	isNativeRawAvailable: () => ipcRenderer.invoke('magick:native-raw-available'),
	listNativeFormats: () => ipcRenderer.invoke('magick:native-formats'),
	processNativeImage: (payload) => ipcRenderer.invoke('magick:process-native', payload),
	getNativeFontMetrics: (payload) => ipcRenderer.invoke('magick:font-metrics', payload),
	saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
	revealSavedFile: () => ipcRenderer.send('file:reveal-saved'),
	openImage: () => ipcRenderer.invoke('file:open-dialog'),
	setTheme: (dark) => ipcRenderer.send('theme:set', dark),
	updateMenuState: (state) => ipcRenderer.send('menu:state', state),
	minimizeWindow: () => ipcRenderer.send('window:minimize'),
	toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
	closeWindow: () => ipcRenderer.send('window:close'),
	isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
	onMaximizeChange: (callback) => subscribe('window:maximized-changed', callback),
	onOpenFile: (callback) => subscribe('file:opened', callback)
});
