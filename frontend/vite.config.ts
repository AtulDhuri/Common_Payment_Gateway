// FILE: vite.config.ts
// PURPOSE: Vite + React + Tailwind. /api is proxied to the Nest backend so the browser stays same-origin (no CORS)
// DEPENDENCIES: vite, @vitejs/plugin-react, @tailwindcss/vite
// PHASE: 5 (payment sandbox)
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
