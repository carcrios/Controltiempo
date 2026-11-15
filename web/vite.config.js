import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base relativa: el mismo paquete funciona en cualquier repositorio de GitHub Pages sin cambios.
export default defineConfig({
  base: './', plugins: [react()],
  build: { outDir: '../docs', emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { proxy: { '/api-local': 'http://localhost:8787' } }
});
