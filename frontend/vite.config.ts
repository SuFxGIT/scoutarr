import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 7291,
    proxy: {
      '/api': {
        target: 'http://localhost:5839',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          radix: ['@radix-ui/themes', '@radix-ui/react-icons', '@radix-ui/react-collapsible'],
          query: ['@tanstack/react-query'],
        }
      }
    }
  }
});

