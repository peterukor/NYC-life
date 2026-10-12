// Turns the built map viewer (dist-map2d/map2d.html) into a page for an
// Artifact: the Artifact host adds its own <html>/<head>/<body>, so those
// tags (and the duplicate charset/viewport metas) are taken off.
//   npx vite build --config vite.map2d.config.ts && node scripts/make-map2d-page.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
let h = readFileSync('dist-map2d/map2d.html', 'utf8');
h = h
  .replace(/<!doctype html>/i, '')
  .replace(/<html[^>]*>/i, '')
  .replace(/<\/html>/i, '')
  .replace(/<head>/i, '')
  .replace(/<\/head>/i, '')
  .replace(/<body>/i, '')
  .replace(/<\/body>/i, '')
  .replace(/<meta charset="utf-8">/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '');
// The <title> must be in the first 8 KB: move it to the very top.
const t = h.match(/<title>[^<]*<\/title>/i)[0];
h = t + '\n' + h.replace(t, '');
mkdirSync('dist-map2d', { recursive: true });
writeFileSync('dist-map2d/manhattan-map.html', h.trim() + '\n');
console.log('dist-map2d/manhattan-map.html', (h.length / 1024).toFixed(0), 'KB');
