import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves this project from /Rubik-Self-study/, so production
  // builds need that base path. The dev server (and any other non-build
  // command) stays at '/' so local paths and HMR keep working.
  base: command === 'build' ? '/Rubik-Self-study/' : '/',
  server: {
    // Listen on all interfaces so a phone on the same Wi-Fi can open the
    // dev server (e.g. http://<your-computer-ip>:5173) for quick testing.
    host: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'CubeClimb',
        short_name: 'CubeClimb',
        description: "A Rubik's cube teaching app for kids and their coach.",
        theme_color: '#0b122e',
        background_color: '#0b122e',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
}))
