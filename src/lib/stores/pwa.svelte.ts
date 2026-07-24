let _deferredPrompt: BeforeInstallPromptEvent | null = $state(null);
let _registered = false;

export const pwaInstall = {
	get deferredPrompt(): BeforeInstallPromptEvent | null {
		return _deferredPrompt;
	},

	register(): void {
		if (_registered) return;
		_registered = true;

		window.addEventListener('beforeinstallprompt', (e) => {
			_deferredPrompt = e as BeforeInstallPromptEvent;
		});

		window.addEventListener('appinstalled', () => {
			_deferredPrompt = null;
		});
	},

	async install(): Promise<boolean> {
		if (!_deferredPrompt) return false;
		_deferredPrompt.prompt();
		const { outcome } = await _deferredPrompt.userChoice;
		_deferredPrompt = null;
		return outcome === 'accepted';
	}
};
