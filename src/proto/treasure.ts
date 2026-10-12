// =====================================================================
// treasure.ts — the "whole world" map: New York City drawn like an old
// treasure map, from the REAL borough outlines (NYC Open Data, in
// src/data/geo). Shown when you zoom out past the whole borough or tap
// the map button. Tap a borough to go there (only Manhattan is built;
// the others say "coming soon").
// =====================================================================

import { NYC_GEO } from '../data/geo/nyc-boroughs.ts';

const NAMES: Record<string, string> = {
  manhattan: 'Manhattan',
  brooklyn: 'Brooklyn',
  queens: 'Queens',
  bronx: 'The Bronx',
  statenIsland: 'Staten Island',
};
const OPEN = new Set(['manhattan']);

type Ring = [number, number][];

function inside(rings: Ring[], x: number, y: number): boolean {
  let hit = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** Open the treasure map. onPick runs when the player chooses Manhattan. */
export function openTreasureMap(host: HTMLElement, onPick: (borough: string) => void): void {
  if (host.querySelector('.tm-wrap')) return;
  if (!document.getElementById('tm-css')) {
    const st = document.createElement('style');
    st.id = 'tm-css';
    st.textContent = `
      .tm-wrap{position:fixed;inset:0;z-index:20;background:#e8cf98;animation:tmIn .35s ease-out}
      @keyframes tmIn{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:none}}
      @media (prefers-reduced-motion: reduce){.tm-wrap{animation:none}}
      .tm-canvas{width:100%;height:100%;display:block;touch-action:manipulation}
      .tm-close{position:absolute;top:max(12px,env(safe-area-inset-top));right:12px;width:40px;height:40px;border-radius:50%;border:2px solid #5b3a1e;background:#f4e4bc;color:#3d2410;font-size:16px}
      .tm-toast{position:absolute;left:50%;bottom:calc(30px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#3d2410;color:#f4e4bc;font:italic 14px Georgia,serif;padding:10px 16px;border-radius:12px;max-width:80vw;text-align:center}
    `;
    document.head.appendChild(st);
  }
  const wrap = document.createElement('div');
  wrap.className = 'tm-wrap';
  wrap.innerHTML = `<canvas class="tm-canvas"></canvas><button class="tm-close" aria-label="Close map">✕</button><div class="tm-toast" hidden></div>`;
  host.appendChild(wrap);
  const cv = wrap.querySelector<HTMLCanvasElement>('canvas')!;
  const toast = wrap.querySelector<HTMLDivElement>('.tm-toast')!;
  const close = () => wrap.remove();
  wrap.querySelector<HTMLButtonElement>('.tm-close')!.onclick = close;

  const boroughs = NYC_GEO.boroughs as Record<string, Ring[]>;
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (const rings of Object.values(boroughs))
    for (const r of rings)
      for (const [x, y] of r) {
        mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mny = Math.min(mny, y); mxy = Math.max(mxy, y);
      }

  let view = { s: 1, ox: 0, oy: 0 };
  const draw = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const g = cv.getContext('2d')!;
    g.scale(dpr, dpr);
    const pad = 46;
    const s = Math.min((W - pad * 2) / (mxx - mnx), (H - pad * 2 - 40) / (mxy - mny));
    view = { s, ox: (W - (mxx - mnx) * s) / 2 - mnx * s, oy: (H - (mxy - mny) * s) / 2 - mny * s + 16 };
    const P = (x: number, y: number): [number, number] => [x * view.s + view.ox, y * view.s + view.oy];

    // Parchment.
    const bg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.2, W / 2, H / 2, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#f4e4bc');
    bg.addColorStop(0.7, '#e8cf98');
    bg.addColorStop(1, '#b98b4e');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    let k = 9;
    const rnd = () => ((k = (k * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(110,70,30,${rnd() * 0.06})`;
      g.beginPath();
      g.arc(rnd() * W, rnd() * H, rnd() * 3 + 0.5, 0, Math.PI * 2);
      g.fill();
    }
    // Sea: little ink waves.
    g.strokeStyle = 'rgba(70,90,110,0.35)';
    g.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 6, y - 4, x + 12, y);
      g.quadraticCurveTo(x + 18, y + 4, x + 24, y);
      g.stroke();
    }

    // Boroughs.
    for (const [key, rings] of Object.entries(boroughs)) {
      const open = OPEN.has(key);
      g.save();
      g.beginPath();
      for (const r of rings) {
        r.forEach(([x, y], i) => {
          const [px, py] = P(x, y);
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        });
        g.closePath();
      }
      g.fillStyle = open ? '#c9d98f' : '#e3cf9c';
      g.shadowColor = 'rgba(80,50,20,0.35)';
      g.shadowBlur = 8;
      g.fill('evenodd');
      g.shadowBlur = 0;
      g.lineJoin = 'round';
      g.lineWidth = open ? 2 : 1.3;
      g.strokeStyle = '#5b3a1e';
      g.stroke();
      g.restore();
    }

    // Labels at each borough's centre of mass.
    for (const [key, rings] of Object.entries(boroughs)) {
      let sx = 0, sy = 0, n = 0;
      for (const r of rings) for (const [x, y] of r) { sx += x; sy += y; n++; }
      let [px, py] = P(sx / n, sy / n);
      const open = OPEN.has(key);
      g.textAlign = 'center';
      // Manhattan is thin: put its name beside it, over the Hudson.
      if (key === 'manhattan') {
        px -= 26;
        g.textAlign = 'right';
      }
      g.fillStyle = '#3d2410';
      g.font = `italic 700 ${open ? 20 : 16}px Georgia, 'Times New Roman', serif`;
      g.fillText(NAMES[key] ?? key, px, py);
      g.font = `italic 12px Georgia, serif`;
      g.fillStyle = open ? '#2d6a4f' : '#7a5230';
      g.fillText(open ? '✕ tap to go' : 'coming soon', px, py + 16);
    }

    // Compass rose.
    const cx = W - 52, cy = H - 70, R = 28;
    g.save();
    g.translate(cx, cy);
    g.strokeStyle = '#5b3a1e';
    g.fillStyle = '#5b3a1e';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -R - 6);
      g.lineTo(5, 0);
      g.lineTo(-5, 0);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.font = 'italic 700 13px Georgia, serif';
    g.fillStyle = '#3d2410';
    g.textAlign = 'center';
    g.fillText('N', cx, cy - R - 12);

    // Title banner.
    g.font = "italic 700 26px Georgia, 'Times New Roman', serif";
    g.fillStyle = '#3d2410';
    g.fillText('New York City', W / 2, 44);
    g.font = 'italic 13px Georgia, serif';
    g.fillText('Choose where to go', W / 2, 64);
  };
  requestAnimationFrame(draw);
  const onResize = () => (wrap.isConnected ? draw() : window.removeEventListener('resize', onResize));
  window.addEventListener('resize', onResize);

  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left - view.ox) / view.s;
    const y = (e.clientY - r.top - view.oy) / view.s;
    for (const [key, rings] of Object.entries(boroughs)) {
      if (!inside(rings, x, y)) continue;
      if (OPEN.has(key)) {
        close();
        onPick(key);
      } else {
        toast.textContent = `${NAMES[key] ?? key} is coming soon. Take the subway there once it opens.`;
        toast.hidden = false;
        setTimeout(() => (toast.hidden = true), 2200);
      }
      return;
    }
  });

}
