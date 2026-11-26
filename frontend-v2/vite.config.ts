import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'
import { chunkCycleGuard, vendorChunkFor } from './vendorChunks'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    chunkCycleGuard(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.png',
        'apple-touch-icon.png',
        'pwa-icon-192.png',
        'pwa-icon-512.png',
        'pwa-icon-maskable.png',
      ],
      manifest: {
        id: '/',
        name: 'Kdy na chatu',
        short_name: 'Kdy na chatu',
        description: 'Rodinná aplikace pro správu chaty — rezervace, galerie, deník, nástěnka',
        lang: 'cs',
        dir: 'ltr',
        // Ladí s --brand-primary / --bg-app z variables.css
        theme_color: '#3f7b63',
        background_color: '#f4f7f5',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        // /login přesměruje přihlášeného rovnou do appky; nepřihlášený nevidí landing page
        start_url: '/login',
        categories: ['lifestyle', 'utilities'],
        // Dlouhý stisk ikony na ploše (Android) → rychlé zkratky
        shortcuts: [
          { name: 'Rezervace', short_name: 'Rezervace', url: '/reservations', icons: [{ src: 'pwa-icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Nástěnka', short_name: 'Nástěnka', url: '/notes', icons: [{ src: 'pwa-icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Nákupy', short_name: 'Nákupy', url: '/shopping', icons: [{ src: 'pwa-icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        icons: [
          {
            src: 'pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache jen app shell (+ ikony z includeAssets). Obrázky a ilustrace v public/
        // mají dohromady přes 20 MB — telefon by je stahoval celé při první návštěvě,
        // proto se cachují až při zobrazení (runtimeCaching 'images' níže).
        // Pixel art scény chaty (assets/*.png, asi 50 kB, menší soubory jsou vložené v JS) patří k app shellu,
        // aby scéna offline nepřišla o pozadí v počasí, které se ještě nezobrazilo.
        globPatterns: ['**/*.{js,css,html,woff2}', 'assets/*.png'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // 8 MB
        // API (/api) se záměrně necachuje — odpovědi závisí na přihlášeném uživateli
        // a chatě; offline čtení řeší TanStack Query, zápisy lib/offlineQueue.
        runtimeCaching: [
          {
            // Fotky a náhledy (jen s cookie přihlášeného člena chaty, #487; názvy se nemění)
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/uploads/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'uploads',
              expiration: { maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Ilustrace, pozadí a ikony aplikace — po prvním zobrazení dostupné i offline
            urlPattern: ({ request, url, sameOrigin }) =>
              sameOrigin && request.destination === 'image' && !url.pathname.startsWith('/uploads/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-images',
              expiration: { maxEntries: 120, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
      },
    }),
  ],
  build: {
    outDir: '../dist/frontend',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: vendorChunkFor,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
