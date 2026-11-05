import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      // A separate script file, because the CSP forbids inline scripts.
      injectRegister: 'script',
      manifest: {
        name: 'STKR',
        short_name: 'STKR',
        description: 'Rate anything on radar maps you define. Everything stays on this device.',
        start_url: '/',
        display: 'standalone',
        background_color: '#E4ECE3',
        theme_color: '#14284B',
        icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // Take control on the first visit, so a first search also caches the model.
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
        globIgnores: ['models/**', 'ort/**'],
        navigateFallback: '/index.html',
        // The large model files are cached after their first use, so search works offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/models/') || url.pathname.startsWith('/ort/'),
            handler: 'CacheFirst',
            options: { cacheName: 'stkr-model' },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // The WebGPU runtime's WebAssembly exceeds Cloudflare's 25 MiB asset limit.
      // Embeddings run fine on the CPU build, which is half the size.
      'onnxruntime-web/webgpu': fromRoot('./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs'),
    },
  },
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 1200,
  },
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
