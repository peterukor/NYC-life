// =====================================================================
// textures.ts — ads, shop signs, banners and small helper textures,
// all DRAWN IN CODE on a canvas (no image files to download).
// Building facades, pavements, roads and roofs are in surfaces.ts.
// =====================================================================

import * as THREE from 'three';

// Building facades and ground surfaces now live in surfaces.ts.
export { facadeTextures, type FacadeStyle } from './surfaces.ts';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------
// Ads (placeholder parody brands until real advertisers buy slots)
// ---------------------------------------------------------------------

export interface AdCreative {
  id: string;
  brand: string;
  line: string;
  bg: string;
  fg: string;
  accent: string;
  /** Real advertiser link, if any (shown on the ad card when tapped). */
  link?: string;
}

/** Fictional brands for empty slots. Real ads replace these via the ad system. */
export const HOUSE_ADS: AdCreative[] = [
  { id: 'house-bodegabrew', brand: 'BODEGA BREW', line: 'Coffee that never sleeps.', bg: '#111111', fg: '#ffd400', accent: '#ff3b30' },
  { id: 'house-bigapple', brand: 'Big Apple Bank', line: 'Safer than your MetroCard.', bg: '#0b3d91', fg: '#ffffff', accent: '#ffcc00' },
  { id: 'house-sliceplus', brand: 'SLICE+', line: 'Hot slices in 15 minutes or it’s free-ish.', bg: '#d62828', fg: '#fff3e0', accent: '#fcbf49' },
  { id: 'house-liberty', brand: 'LIBERTY MOBILE', line: '5G underground. Sometimes.', bg: '#5a189a', fg: '#ffffff', accent: '#00f5d4' },
  { id: 'house-empirekicks', brand: 'EMPIRE KICKS', line: 'Sneakers built for the 6 train.', bg: '#f1faee', fg: '#1d3557', accent: '#e63946' },
  { id: 'house-hudson', brand: 'HUDSON & CO', line: 'Lofts with actual closets.', bg: '#2a9d8f', fg: '#ffffff', accent: '#e9c46a' },
  { id: 'house-gotham', brand: 'GOTHAM GYM', line: 'Leg day. Every day. No excuses.', bg: '#000000', fg: '#00ff85', accent: '#ffffff' },
  { id: 'house-borough', brand: 'Borough Burger', line: 'Five boroughs. One perfect smash.', bg: '#ff9f1c', fg: '#2b2d42', accent: '#ffffff' },
  { id: 'house-rideshare', brand: 'RIDESHARE', line: 'Tap. Ride. Tip your driver.', bg: '#00b4d8', fg: '#03045e', accent: '#ffffff' },
  { id: 'house-yourad', brand: 'YOUR AD HERE', line: 'Put your brand in Times Square — in NYC Life.', bg: '#ffffff', fg: '#111111', accent: '#ff2d55' },
];

const adCache = new Map<string, THREE.CanvasTexture>();

/** Draw an ad at a given aspect ratio (width / height). */
export function adTexture(ad: AdCreative, aspect: number): THREE.CanvasTexture {
  const key = `${ad.id}@${aspect.toFixed(2)}`;
  const hit = adCache.get(key);
  if (hit) return hit;
  const H = 256;
  const W = Math.max(128, Math.min(1024, Math.round(H * aspect)));
  const [c, g] = canvas(W, H);
  g.fillStyle = ad.bg;
  g.fillRect(0, 0, W, H);
  // A bold diagonal accent stripe for energy.
  g.fillStyle = ad.accent;
  g.globalAlpha = 0.9;
  g.beginPath();
  g.moveTo(W * 0.72, 0);
  g.lineTo(W, 0);
  g.lineTo(W, H);
  g.lineTo(W * 0.58, H);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;

  const pad = Math.round(H * 0.1);
  g.fillStyle = ad.fg;
  g.textBaseline = 'top';
  fitText(g, ad.brand, `900 ${Math.round(H * 0.3)}px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`, W * 0.66 - pad, pad, pad, H * 0.32);
  fitText(g, ad.line, `600 ${Math.round(H * 0.12)}px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`, W * 0.66 - pad, pad, H * 0.5, H * 0.14, true);
  // Small "AD" marker: sponsored content is always labelled.
  g.font = `700 ${Math.round(H * 0.07)}px system-ui, sans-serif`;
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(W - pad * 2.4, H - pad * 1.2, pad * 2.1, pad * 0.9);
  g.fillStyle = '#fff';
  g.fillText('AD', W - pad * 2.0, H - pad * 1.08);

  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  adCache.set(key, t);
  return t;
}

/** Draw text that shrinks to fit a width; optionally wraps onto two lines. */
function fitText(g: CanvasRenderingContext2D, text: string, font: string, maxW: number, x: number, y: number, size: number, wrap = false): void {
  let px = size;
  const family = font.replace(/^\d+\s+\d+px\s+/, '');
  const weight = font.split(' ')[0];
  g.font = `${weight} ${px}px ${family}`;
  if (wrap && g.measureText(text).width > maxW) {
    const words = text.split(' ');
    const mid = Math.ceil(words.length / 2);
    const lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    while (Math.max(...lines.map((l) => g.measureText(l).width)) > maxW && px > 8) {
      px -= 1;
      g.font = `${weight} ${px}px ${family}`;
    }
    g.fillText(lines[0], x, y);
    g.fillText(lines[1], x, y + px * 1.15);
    return;
  }
  while (g.measureText(text).width > maxW && px > 8) {
    px -= 1;
    g.font = `${weight} ${px}px ${family}`;
  }
  g.fillText(text, x, y);
}

/** A storefront sign with the place's name. */
export function signTexture(name: string, bg: string, fg = '#ffffff'): THREE.CanvasTexture {
  const [c, g] = canvas(512, 96);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(0, 0, 512, 10);
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  let px = 56;
  g.font = `800 ${px}px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
  while (g.measureText(name).width > 480 && px > 14) {
    px -= 2;
    g.font = `800 ${px}px system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif`;
  }
  g.fillText(name, 256, 50);
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** "COMING SOON" fence banner for vacant expansion lots. */
export function comingSoonTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#f4a261';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#1d1d1d';
  for (let x = -128; x < 512; x += 48) {
    g.beginPath();
    g.moveTo(x, 128);
    g.lineTo(x + 24, 128);
    g.lineTo(x + 152, 0);
    g.lineTo(x + 128, 0);
    g.fill();
  }
  g.fillStyle = '#ffffff';
  g.fillRect(70, 30, 372, 68);
  g.fillStyle = '#1d1d1d';
  g.font = '900 40px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('COMING SOON', 256, 66);
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Soft round "blob" shadow used under people and cars (much cheaper than real shadows). */
export function blobShadowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
