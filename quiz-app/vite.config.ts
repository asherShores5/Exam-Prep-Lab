// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { examBankRuntimeCaching } from './src/lib/examBankCaching'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      // Icons live in public/ and are copied to the build root as-is.
      includeAssets: ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Exam Prep Lab',
        short_name: 'Exam Prep',
        description: 'Study certification exam questions with quizzes, flashcards, and spaced repetition — fully offline.',
        theme_color: '#020817',
        background_color: '#020817',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache only the app shell (JS/CSS/HTML/icons). Exam JSON is
        // deliberately NOT in this glob (no `.json`) so the ~4MB of banks don't
        // bloat the install — they're runtime-cached on first view instead.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // The Admin Page chunk (src/admin/AdminApp.tsx, lazy) is not precached, so a Learner's
        // service worker never downloads it (SPEC §9.3).
        globIgnores: ['**/AdminApp-*.js'],
        navigateFallback: '/index.html',
        // Exam index + per-exam banks: NetworkFirst with offline cache fallback,
        // JSON-only (see src/lib/examBankCaching.ts, B11).
        runtimeCaching: [examBankRuntimeCaching],
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
