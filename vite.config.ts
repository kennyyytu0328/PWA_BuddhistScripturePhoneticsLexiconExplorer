import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// '/' locally and in tests; the GitHub Pages workflow sets '/<repo>/'
const base = process.env.BASE_PATH ?? '/'

// Service worker global: its scope is the base path. urlPattern is serialised into sw.js, so it cannot close over `base`.
declare const registration: { scope: string }

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits until every app page is closed; no update UI (REQ-PWA-009, Q-PWA-005).
      // The generated sw.js still listens for SKIP_WAITING: never import virtual:pwa-register or post that message.
      registerType: 'prompt',
      injectRegister: 'script',
      // icons are already matched by globPatterns
      includeManifestIcons: false,
      workbox: {
        // control the page on first install without a reload (REQ-PWA-005)
        clientsClaim: true,
        // CLAUDE.md §5 — tier 1: App Shell, fonts, icons; tier 2: scripture, lexicon and its gaiji (Q-PWA-001).
        // Nothing else under data/ is matched, so future files there fall through to tier 3.
        globPatterns: [
          '*.{js,html,png,svg}',
          'assets/**/*.{js,css}',
          'fonts/*.{css,woff2}',
          'data/heart-sutra.ast.json',
          'data/lexicon.dfb.json',
          'data/gaiji/*.png',
        ],
        // tier 3: future sutras / dictionaries under <base>data/ that are not precached (Q-PWA-002)
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith(new URL('data/', registration.scope).pathname),
            handler: 'StaleWhileRevalidate',
            // no expiration yet: add an ExpirationPlugin limit once real extension content exists
            options: { cacheName: 'sutraflow-extensions' },
          },
        ],
      },
      // CLAUDE.md §5
      manifest: {
        name: '心經·逐字解讀沉浸器',
        lang: 'zh-Hant',
        short_name: '心經',
        start_url: base,
        display: 'standalone',
        background_color: '#0c0a09',
        theme_color: '#0c0a09',
        orientation: 'portrait',
        icons: [
          { src: `${base}pwa-192x192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}pwa-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
})
