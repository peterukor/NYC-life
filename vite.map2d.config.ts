// Builds the stand-alone 2D map viewer (map2d.html) into one file:
//   npx vite build --config vite.map2d.config.ts   -> dist-map2d/map2d.html
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    outDir: 'dist-map2d',
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: 'map2d.html' },
  },
});
