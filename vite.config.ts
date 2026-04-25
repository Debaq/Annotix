import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  base: '',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 5174,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'i18n': ['react-i18next', 'i18next'],
          'radix': [
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-progress',
            '@radix-ui/react-radio-group',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slider',
            '@radix-ui/react-slot',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-tooltip',
          ],
          'charts': ['chart.js', 'react-chartjs-2', 'chartjs-plugin-annotation', 'chartjs-plugin-zoom'],
          'konva': ['konva', 'react-konva'],
          'pdf': ['jspdf', 'html2canvas'],
          'tauri': ['@tauri-apps/api', '@tauri-apps/plugin-dialog', '@tauri-apps/plugin-fs', '@tauri-apps/plugin-opener'],
        },
      },
    },
  },
})
