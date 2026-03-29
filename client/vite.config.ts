import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 4790,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 4791,
        }
      : undefined,
    proxy: {
      '/api': {
        target: 'http://localhost:4789',
        changeOrigin: true,
      },
    },
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'ES2022',
    rollupOptions: {
      output: {
        manualChunks: {
          'data-grid': ['@glideapps/glide-data-grid'],
          'codemirror': ['@codemirror/view', '@codemirror/state', '@codemirror/lang-sql', '@codemirror/lang-json', '@uiw/react-codemirror', 'codemirror'],
          'ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', '@radix-ui/react-select', '@radix-ui/react-context-menu', '@radix-ui/react-scroll-area'],
          'sql': ['sql-formatter'],
        },
      },
    },
  },
});
