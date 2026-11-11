/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages 網址：https://peiyulin0520.github.io/VideoClip/
export default defineConfig({
  base: '/VideoClip/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.png'],
      manifest: {
        name: 'VideoClip 剪輯',
        short_name: 'VideoClip',
        description: '手機瀏覽器就能用的影片剪輯：多專案、多圖層、字卡、特效。',
        lang: 'zh-TW',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/VideoClip/',
        scope: '/VideoClip/',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // 字體（Phase 3）另外用 Cache Storage 管理，不放進預快取
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // 貼圖（約 400 個 SVG、4.7 MB）用到才下載，不放進預快取
        globIgnores: ['**/stickers/**'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
