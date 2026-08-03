import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			registerType: 'autoUpdate',
			includeAssets: ['favicon.svg', 'robots.txt', 'fonts/*.ttf', 'samples/*.png'],
			manifest: {
				name: 'WASMagick',
				short_name: 'WASMagick',
				description:
					'Client-side image editor powered by WebAssembly ImageMagick. Resize, rotate, apply filters, adjust colors, and convert formats entirely in your browser.',
				start_url: '/',
				scope: '/',
				display: 'standalone',
				background_color: '#18181b',
				theme_color: '#18181b',
				icons: [
					{
						src: '/icons/icon-144.png',
						sizes: '144x144',
						type: 'image/png'
					},
					{
						src: '/icons/icon-192.png',
						sizes: '192x192',
						type: 'image/png'
					},
					{
						src: '/icons/icon-512.png',
						sizes: '512x512',
						type: 'image/png'
					},
					{
						src: '/icons/icon-maskable.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}
				],
				share_target: {
					action: '/editor?shared=true',
					method: 'POST',
					enctype: 'multipart/form-data',
					params: {
						files: [{ name: 'image', accept: ['image/*'] }]
					}
				},
				id: '/editor',
				categories: ['photo', 'utilities']
			},
			workbox: {
				maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
				globPatterns: ['**/*.{html,js,css,wasm,ttf,woff2,png,svg,ico,json}'],
				navigateFallback: null,
				importScripts: ['/share-handler.js', '/sw-warmup.js'],
				runtimeCaching: [
					{
						urlPattern: ({ request }) => request.mode === 'navigate',
						handler: 'StaleWhileRevalidate',
						options: {
							cacheName: 'pages',
							plugins: [
								{
									handlerDidError: async () => {
										const cached =
											(await caches.match('/offline.html')) ?? (await caches.match('/offline'));
										return cached ?? Response.error();
									}
								}
							]
						}
					},
					{
						urlPattern: /\/_app\/immutable\/.*/,
						handler: 'CacheFirst',
						options: {
							cacheName: 'app-immutable',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 30 * 24 * 60 * 60
							}
						}
					},
					{
						urlPattern: /^https:\/\/raw\.githubusercontent\.com\/.*\.ttf$/,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'annotation-fonts',
							expiration: {
								maxEntries: 10,
								maxAgeSeconds: 30 * 24 * 60 * 60
							}
						}
					}
				]
			}
		})
	],
	test: {
		expect: { requireAssertions: true },
		include: ['src/**/*.{test,spec}.{js,ts}', 'test/**/*.{test,spec}.{js,ts}'],
		exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
	}
});
