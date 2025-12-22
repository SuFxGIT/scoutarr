import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7291,
    proxy: {
      '/api': {
        target: 'http://localhost:5839',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist'
  }
});

