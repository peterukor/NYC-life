// Render GLBs (one fresh page load each) and put them side by side.
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
const [out, ...files] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
const shots = [];
for (const f of files) {
  const p = await b.newPage(); await p.setViewport({ width: 900, height: 900 });
  await p.goto('file:///tmp/claude-0/viewer/close.html?f=' + f); await p.waitForFunction('window.done', { timeout: 180000 });
  const path = `/tmp/claude-0/viewer/_${f}.png`; await p.screenshot({ path }); shots.push(path); await p.close();
}
await b.close();
execFileSync('python3', ['-c', `
import sys
from PIL import Image
fs=sys.argv[2:]; ims=[Image.open(f).crop((100,100,800,800)).resize((450,450)) for f in fs]
W=Image.new('RGB',(450*len(ims),450),'white')
for i,im in enumerate(ims): W.paste(im,(i*450,0))
W.save(sys.argv[1])`, out, ...shots]);
console.log('wrote', out);
