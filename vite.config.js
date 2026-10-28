import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Tailwind blue-950. Header, login mark, and the installed app chrome.
const NAVY = '#172554'

// Supabase REST, auth, storage, and functions stay on the network.
// NetworkOnly does not write a Cache Storage entry. The service worker is
// not what made employee shifts stick on []. Safari's HTTP cache can still
// replay a GET, so the Supabase client also sends cache: 'no-store'.
const supabaseNetworkOnly = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((method) => ({
  urlPattern: /^https:\/\/(?:[a-z0-9-]+\.)?supabase\.co\//i,
  handler: 'NetworkOnly',
  method,
}))

export default defineConfig({
  logLevel: 'error',
  define: {
    'import.meta.env.VITE_VERCEL_ENV': JSON.stringify(process.env.VERCEL_ENV || process.env.VITE_VERCEL_ENV || ''),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'SkiftPro',
        short_name: 'SkiftPro',
        description: 'Vaktplan, stempling, dagsoppgjør og loddtelling for kiosk og convenience.',
        lang: 'nb',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: NAVY,
        theme_color: NAVY,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallbackDenylist: [
          /^\/manifest\.webmanifest$/,
          /^\/sw\.js$/,
          /^\/push-handler\.js$/,
          /^\/workbox-/,
          /^\/registerSW\.js$/,
          /\/auth\/v1\//,
          /\/rest\/v1\//,
          /\/storage\/v1\//,
          /\/functions\/v1\//,
          /\/realtime\/v1\//,
        ],
        runtimeCaching: supabaseNetworkOnly,
        importScripts: ['/push-handler.js'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
})
