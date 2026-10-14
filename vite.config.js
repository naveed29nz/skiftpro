import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Tailwind blue-950. Header, login mark, and the installed app chrome.
const NAVY = '#172554'

// Supabase REST, auth, storage, and functions stay on the network.
// NetworkOnly does not write a Cache Storage entry.
const supabaseNetworkOnly = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map((method) => ({
  urlPattern: /^https:\/\/(?:[a-z0-9-]+\.)?supabase\.co\//i,
  handler: 'NetworkOnly',
  method,
}))

export default defineConfig({
  logLevel: 'error',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'SkiftPro',
        short_name: 'SkiftPro',
        description: 'Vaktplan og timelister',
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
          /^\/workbox-/,
          /^\/registerSW\.js$/,
          /\/auth\/v1\//,
          /\/rest\/v1\//,
          /\/storage\/v1\//,
          /\/functions\/v1\//,
          /\/realtime\/v1\//,
        ],
        runtimeCaching: supabaseNetworkOnly,
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
