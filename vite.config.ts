// Vite build settings.
//
// We build the whole game into ONE self-contained index.html file
// (all JavaScript and CSS inlined). That makes it trivial to host
// anywhere — a static host, a CDN, or a private preview link — and
// means a phone downloads a single file on first load.
//
// When the game grows (3D models, sounds, map data), those large
// assets will be served as separate cached files instead of being
// inlined; see docs/ARCHITECTURE.md.
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    // Inlined builds produce one big chunk on purpose; silence the size warning.
    chunkSizeWarningLimit: 2000,
    reportCompressedSize: true,
  },
});
