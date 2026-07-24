self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (url.pathname === '/editor' && url.searchParams.get('shared') === 'true' && event.request.method === 'POST') {
		event.respondWith(handleShareTarget(event.request));
	}
});

async function handleShareTarget(request) {
	try {
		const formData = await request.formData();
		const file = formData.get('image');
		if (!file) {
			return Response.redirect('/editor?shared=error', 303);
		}
		const data = Array.from(new Uint8Array(await file.arrayBuffer()));
		const serialized = { name: file.name, type: file.type, size: file.size, data };
		const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
		for (const client of clients) {
			client.postMessage({ type: 'SHARED_IMAGE', file: serialized });
		}
		return Response.redirect('/editor?shared=true', 303);
	} catch {
		return Response.redirect('/editor?shared=error', 303);
	}
}
