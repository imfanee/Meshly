import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    tailwindcss(),
    svelte(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'icons/*.png',
        'fonts/*.woff2',
        'sounds/*',
      ],
      manifest: {
        id: '/',
        name: 'Meshly',
        short_name: 'Meshly',
        description: 'Private meetings, peer to peer. No servers, no sign-up.',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        theme_color: '#0B1117',
        background_color: '#0B1117',
        categories: ['business', 'productivity', 'social'],
        shortcuts: [{ name: 'New meeting', url: '/?new=1' }],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3,ogg,webmanifest}'],
        navigateFallback: 'index.html',
        // sw.js itself is served no-cache by .htaccess.
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    outDir: '../web',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
});
