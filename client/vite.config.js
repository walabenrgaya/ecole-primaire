import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_API_URL || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: +(process.env.VITE_PORT || 5173),
    proxy: { '/api': API, '/uploads': API }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: { charts: ['recharts'], react: ['react', 'react-dom'], icons: ['lucide-react'] }
      }
    }
  }
});
