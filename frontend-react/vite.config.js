import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Design images live once, in simulation/images, and are shared by the simulation and this app.
// They are served at /images/* in development and copied into dist/images by a build.
const IMAGES_DIR = resolve(__dirname, '../simulation/images');
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function sharedImages() {
  const serve = (req, res, next) => {
    if (!req.url?.startsWith('/images/')) return next();
    const file = normalize(join(IMAGES_DIR, decodeURIComponent(req.url.slice('/images/'.length).split('?')[0])));
    const type = TYPES[extname(file).toLowerCase()];
    if (!file.startsWith(IMAGES_DIR) || !type || !existsSync(file) || !statSync(file).isFile()) {
      res.statusCode = 404;
      return res.end();
    }
    res.setHeader('Content-Type', type);
    return res.end(readFileSync(file));
  };
  return {
    name: 'digivote-shared-images',
    configureServer(server) { server.middlewares.use(serve); },
    configurePreviewServer(server) { server.middlewares.use(serve); },
    closeBundle() {
      if (existsSync(IMAGES_DIR)) cpSync(IMAGES_DIR, resolve(__dirname, 'dist/images'), { recursive: true, filter: (f) => !f.endsWith('.md') });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), sharedImages()],
  server: {
    port: 5173,
    proxy: {
      // Local development: the API runs on :8080 (override with DIGIVOTE_API_PROXY, e.g. for the demo stack);
      // the browser talks only to the Vite origin.
      '/api': process.env.DIGIVOTE_API_PROXY || 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
});
