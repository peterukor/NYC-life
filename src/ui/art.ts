// =====================================================================
// art.ts (ui) — the easel and the gallery wall at the Bowery Art Parlor.
//
// Easel: paint with your finger (or mouse): 10 colours, 3 brush sizes,
// eraser, undo, clear. Give it a title and hang it; likes come in over
// the next hours (sim/art.ts). Gallery: today's wall, most liked first,
// with your pieces and any collector offers.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { nycTime } from '../core/clock.ts';
import { artOf, galleryWall, likesNow, sellArt, submitArt } from '../sim/art.ts';
import type { GameState } from '../sim/types.ts';
import { sfx } from './audio.ts';
import { html, onAct, openSheet, root, toast } from './dom.ts';
import { Rng } from '../core/rng.ts';

export interface ArtHost {
  state: GameState;
  saved: () => void;
  /** A painting went up (challenges). */
  onArt?: () => void;
  /** Sold to a collector (Artist path). */
  onSold?: () => void;
  /** 🌐 Signed in: also hang it on the players' wall. */
  onHang?: (title: string, img: string) => void;
  /** 🌐 Signed in: the players' wall (likes). */
  net?: { loadWall: () => Promise<{ id: number; title: string; img: string; likes: number; artist: string; liked: boolean; mine: boolean }[]>; like: (id: number) => Promise<number | null>; report: (kind: 'art', target: string, reason: string) => Promise<void> };
}

const COLORS = ['#1c2340', '#ffffff', '#e63946', '#ff8fab', '#f4a261', '#ffd166', '#80b918', '#2a9d8f', '#3a86ff', '#9b5de5'];
const SIZE = 320;

export function openEasel(host: ArtHost): void {
  const el = html(`
    <div class="mg-wrap" role="dialog" aria-label="Easel">
      <div class="mg art">
        <div class="art-top"><b>🎨 Your canvas</b><button class="btn ghost" data-act="close" aria-label="Close">✕</button></div>
        <canvas class="art-canvas" width="${SIZE}" height="${SIZE}" aria-label="Canvas: draw with your finger"></canvas>
        <div class="art-colors">${COLORS.map((c, i) => `<button class="art-color${i === 0 ? ' on' : ''}" data-color="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>
        <div class="row art-tools"><button class="btn" data-size="4">•</button><button class="btn on" data-size="10">●</button><button class="btn" data-size="22">⬤</button><button class="btn" data-act="erase">🧽</button><button class="btn" data-act="undo">↩️</button><button class="btn" data-act="clear">🗑️</button></div>
        <input class="input" data-title maxlength="40" placeholder="Title (e.g. “Pigeon at Dawn”)" aria-label="Title" style="width:100%;margin:8px 0">
        <button class="btn primary block" data-act="hang">🖼️ Hang it on the wall</button>
      </div>
    </div>`);
  root().appendChild(el);
  const cv = el.querySelector<HTMLCanvasElement>('canvas')!;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fbf8f1';
  g.fillRect(0, 0, SIZE, SIZE);
  let color = COLORS[0];
  let size = 10;
  let erasing = false;
  let strokes = 0;
  const used = new Set<string>();
  const undo: ImageData[] = [];
  let drawing = false;
  let last: { x: number; y: number } | null = null;
  const pt = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };
  const dot = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    g.strokeStyle = erasing ? '#fbf8f1' : color;
    g.lineWidth = size;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
  };
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    undo.push(g.getImageData(0, 0, SIZE, SIZE));
    if (undo.length > 20) undo.shift();
    drawing = true;
    last = pt(e);
    dot(last, last);
    strokes++;
    if (!erasing) used.add(color);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drawing || !last) return;
    const p = pt(e);
    dot(last, p);
    last = p;
  });
  const stop = () => {
    drawing = false;
    last = null;
  };
  cv.addEventListener('pointerup', stop);
  cv.addEventListener('pointercancel', stop);
  el.querySelectorAll<HTMLButtonElement>('[data-color]').forEach((b) =>
    b.addEventListener('click', () => {
      color = b.dataset.color!;
      erasing = false;
      el.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
      el.querySelector('[data-act="erase"]')!.classList.remove('on');
    }),
  );
  el.querySelectorAll<HTMLButtonElement>('[data-size]').forEach((b) =>
    b.addEventListener('click', () => {
      size = Number(b.dataset.size);
      el.querySelectorAll('[data-size]').forEach((x) => x.classList.toggle('on', x === b));
    }),
  );
  onAct(el, (act, btn) => {
    if (act === 'close') return el.remove();
    if (act === 'erase') {
      erasing = !erasing;
      btn.classList.toggle('on', erasing);
    }
    if (act === 'undo' && undo.length) g.putImageData(undo.pop()!, 0, 0);
    if (act === 'clear') {
      undo.push(g.getImageData(0, 0, SIZE, SIZE));
      g.fillStyle = '#fbf8f1';
      g.fillRect(0, 0, SIZE, SIZE);
    }
    if (act === 'hang') {
      // How much of the canvas is painted (sampled).
      const data = g.getImageData(0, 0, SIZE, SIZE).data;
      let painted = 0, n = 0;
      for (let i = 0; i < data.length; i += 4 * 37) {
        n++;
        if (!(data[i] > 245 && data[i + 1] > 240 && data[i + 2] > 230)) painted++;
      }
      const coverage = painted / n;
      if (coverage < 0.02) return toast('Paint something first!', { icon: '🎨', tone: 'bad' });
      // Keep a small copy (the save stays light).
      const small = document.createElement('canvas');
      small.width = small.height = 160;
      small.getContext('2d')!.drawImage(cv, 0, 0, 160, 160);
      const img = small.toDataURL('image/jpeg', 0.72);
      const title = el.querySelector<HTMLInputElement>('[data-title]')!.value;
      const a = submitArt(host.state, title, img, { coverage, colors: used.size, strokes });
      host.onArt?.();
      host.onHang?.(a.title, img);
      host.saved();
      sfx.cheer();
      el.remove();
      toast(`🖼️ “${a.title}” is on the wall. Likes come in over the next few hours.`, { icon: '🎨', tone: 'good', ms: 4500 });
    }
  });
}

/** Today's gallery wall, most liked first; your pieces with offers to sell. */
export function openGallery(host: ArtHost): void {
  const s = host.state;
  const render = () => {
    const wall = galleryWall(s, nycTime().dateKey);
    const offers = artOf(s).filter((a) => a.offer && !a.sold);
    return `${offers.map((a) => `<div class="card" style="border:3px solid var(--ink)"><h3>💌 Offer for “${esc(a.title)}”</h3><p>A collector will pay <b>${money(a.offer!)}</b>.</p><button class="btn primary block" data-act="sell:${a.id}">Sell it</button></div>`).join('')}
      ${artOf(s).length ? `<h3 style="margin:6px 0">Your pieces</h3><div class="gallery">${artOf(s).map((a) => `<figure class="mine"><img src="${a.img}" alt="${esc(a.title)}"><figcaption><b>${esc(a.title)}</b><small>❤️ ${likesNow(a)}${a.sold ? ' · SOLD' : a.offer ? ' · 💌 offer' : ''}</small></figcaption></figure>`).join('')}</div>` : ''}
      <h3 style="margin:12px 0 6px">The wall today</h3>
      <p class="sub">Most liked first. Your pieces get likes over a few hours after you hang them.</p>
      <div class="gallery">${wall
        .map((w, i) => `<figure class="${w.mine ? 'mine' : ''}">${w.img ? `<img src="${w.img}" alt="${esc(w.title)}">` : `<div class="gal-gen" style="${genArt(w.seed ?? String(i))}"></div>`}<figcaption><b>${esc(w.title)}</b><small>${esc(w.artist)} · ❤️ ${w.likes}${w.mine && artOf(s).find((a) => a.id === w.id)?.sold ? ' · SOLD' : ''}</small></figcaption></figure>`)
        .join('')}</div>`;
  };
  const sheet = openSheet({ emoji: '🖼️', title: 'The gallery wall', sub: 'Bowery Art Parlor', body: render() });
  // 🌐 Real players' paintings, with likes.
  const net = host.net;
  const drawNet = async () => {
    if (!net || !sheet.body.isConnected) return;
    const wall = await net.loadWall();
    const box = sheet.body.querySelector<HTMLElement>('[data-netwall]') ?? sheet.body.insertAdjacentElement('afterbegin', Object.assign(document.createElement('section'), { className: 'netwall' })) as HTMLElement;
    box.dataset.netwall = '1';
    box.innerHTML = `<h3 style="margin:6px 0">🌐 Players’ wall</h3>${wall.length ? `<div class="gallery">${wall.map((w) => `<figure class="${w.mine ? 'mine' : ''}"><img src="${w.img}" alt="${esc(w.title)}"><figcaption><b>${esc(w.title)}</b><small>${esc(w.artist)} · ❤️ ${w.likes}</small>${w.mine ? '' : `<button class="btn" data-act="nlike:${w.id}" ${w.liked ? 'disabled' : ''}>${w.liked ? '❤️ Liked' : '🤍 Like'}</button><button class="btn ghost" data-act="nrep:${w.id}" aria-label="Report">🚩</button>`}</figcaption></figure>`).join('')}</div>` : '<p class="sub">Nobody’s hung anything in the last few days. Be the first!</p>'}`;
  };
  void drawNet();
  onAct(sheet.body, async (act) => {
    if (net && act.startsWith('nlike:')) {
      const n = await net.like(Number(act.slice(6)));
      if (n !== null) sfx.tap();
      return void drawNet();
    }
    if (net && act.startsWith('nrep:')) return void net.report('art', act.slice(5), 'From the gallery');
    if (!act.startsWith('sell:')) return;
    const why = sellArt(s, act.slice(5));
    if (why) return toast(why, { icon: '🎨', tone: 'bad' });
    sfx.cash();
    host.onSold?.();
    toast('Sold! Your art is in a collection now. 🖼️', { icon: '💰', tone: 'good', ms: 4000 });
    host.saved();
    sheet.body.innerHTML = render();
    void drawNet();
  });
}

/** Other artists' work: a seeded abstract (CSS gradients). */
function genArt(seed: string): string {
  const r = new Rng(seed);
  const c = () => COLORS[2 + Math.floor(r.next() * (COLORS.length - 2))];
  const a = Math.floor(r.next() * 360);
  return `background: radial-gradient(circle at ${Math.floor(r.next() * 100)}% ${Math.floor(r.next() * 100)}%, ${c()} 0 ${12 + Math.floor(r.next() * 20)}%, transparent 0), radial-gradient(circle at ${Math.floor(r.next() * 100)}% ${Math.floor(r.next() * 100)}%, ${c()} 0 ${10 + Math.floor(r.next() * 25)}%, transparent 0), linear-gradient(${a}deg, ${c()}, ${c()})`;
}

export { likesNow };
