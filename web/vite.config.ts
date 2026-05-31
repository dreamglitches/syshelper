import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-oxc';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
      '/auth': 'http://localhost:8787',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});