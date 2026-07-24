self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open('pages');
			const urls = ['/', '/editor'];
			for (const url of urls) {
				try {
					const response = await self.fetch(url);
					if (response.ok) {
						await cache.put(url, response.clone());
					}
				} catch {
					// offline, skip warming this URL
				}
			}
		})()
	);
});
