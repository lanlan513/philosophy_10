import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // 墨与大理石后端（server/index.js，默认 8321）
      '/api': {
        target: 'http://localhost:8321',
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api': {
        target: 'http://localhost:8321',
        changeOrigin: true,
      },
    },
  },
});
