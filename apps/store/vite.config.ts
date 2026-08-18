import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Igual que en el ERP: el service worker solo se activa en build de
      // producción, para no interferir con el HMR de Vite en desarrollo.
      devOptions: { enabled: false },
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'logo-icon.png'],
      manifest: {
        name: 'Tienda Marc',
        short_name: 'Tienda Marc',
        description: 'Compra online, recibe en tu puerta o recoge en tienda',
        theme_color: '#2460b4',
        background_color: '#2460b4',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // Sin runtimeCaching para la API ni /uploads a propósito: el backend
        // vive en otro origen (VITE_API_URL absoluto, apps/store/src/api.ts)
        // y se comprobó que interceptar esas peticiones cross-origin con
        // workbox (NetworkFirst/CacheFirst) rompe la carga del catálogo en
        // visitas repetidas (net::ERR_FAILED en categories/products). El SW
        // solo precachea el app shell (JS/CSS/HTML/íconos) para que la app
        // instale e inicie al toque — todo lo demás va siempre directo a
        // red, igual que sin service worker.
      },
    }),
  ],
  resolve: {
    alias: { '@': '/app/src' },
  },
})
