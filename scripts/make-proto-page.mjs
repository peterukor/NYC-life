// Turn the built game (dist/index.html) into a page that opens straight
// into the 2.5D test map, for sharing as a link:
//   node scripts/make-proto-page.mjs <outDir>
// Writes <outDir>/index.html (head tags stripped: the host adds its own).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const html = readFileSync('dist/index.html', 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
const keep = [...head.matchAll(/<link href="https:\/\/fonts[^>]*>|<style[\s\S]*?<\/style>|<script type="module"[\s\S]*?<\/script>/g)].map((m) => m[0]);
const page = `<title>NYC Life 2.5D Test</title>
<style>html,body{height:100%;background:#bfe3f2;color:#1d3557;margin:0;overflow:hidden}</style>
<script>window.NYC_PROTO = true;</script>
${keep.filter((k) => !k.startsWith('<script')).join('\n')}
${body}
${keep.filter((k) => k.startsWith('<script')).join('\n')}
`;
writeFileSync(`${out}/index.html`, page);
console.log('wrote', `${out}/index.html`, (page.length / 1e6).toFixed(2), 'MB');
