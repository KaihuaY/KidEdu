import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => ({
  // GitHub Pages serves this project from /KidEdu/, so production
  // builds need that base path. The dev server (and any other non-build
  // command) stays at '/' so local paths and HMR keep working.
  base: command === 'build' ? '/KidEdu/' : '/',
  server: {
    // Listen on all interfaces so a phone/iPad on the same Wi-Fi can open
    // the dev server (e.g. http://<your-computer-ip>:5173, or
    // https://<your-computer-ip>:5173 via `npm run dev:https`) for quick
    // testing.
    host: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    // Only active for `npm run dev:https` (mode === 'https'): Safari on
    // iPad requires a secure origin to grant microphone access, so this
    // self-signs a certificate for the LAN dev server. Not used for
    // production builds or the plain `npm run dev`.
    ...(mode === 'https' ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Practice',
        short_name: 'Practice',
        description: "Nora's daily practice hub: Rubik's cube and piano.",
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
