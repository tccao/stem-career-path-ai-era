import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Multi-page build: public landing, student SPA, admin SPA each get an entry HTML.
export default defineConfig({
  appType: 'mpa',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
    },
  },
});
