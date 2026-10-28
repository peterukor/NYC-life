// =====================================================================
// 🛵 Delivery Dash — a 90-second shift up 8th Avenue at dusk.
//
// Tap the left or right side (or swipe, or ← →) to change lanes; swipe up
// (or ↑ / Space) to hop. Hop 🕳️ potholes, 🚧 sawhorses and 📦 boxes;
// steer round 🚕 cabs (watch the blinker), 🚌 buses, double-parked 🚚
// trucks, Con Ed steam stacks, 🚶 jaywalkers and opening car doors.
// 💵 tips in a row build a streak (×5), 🥡 orders pay big, 🧲 pulls tips
// in, 🪖 takes a hit for you, ⚡ turbo ploughs through everything (×2).
// Close calls score. Three hits and the shift's over.
// Drawn in perspective: blocks, cross streets, street signs, lamps.
// The rules (pure, tested): sim/arcade-dash.ts.
// =====================================================================

import { sfx } from '../audio.ts';
import { Fx } from '../juice.ts';
import { H, secs, W, type Run } from '../arcade-games.ts';
import { bar, clamp, finisher, keys, label, prerender } from './kit.ts';
import { blit, emojiSprite, glowSprite, hudOnce, qaExpose, REDUCED, rng, swipes } from './classic1-kit.ts';
import {
  createDash, dashHop, dashMult, dashSteer, dashUpdate, DASH_BLOCK, DASH_INFO, DASH_MAGNET_S, DASH_SECONDS, DASH_TURBO_S,
  type DashEvent, type DashKind, type DashObj,
} from '../../sim/arcade-dash.ts';

// Projection: z ahead of the scooter, X across (world units), Y up.
const HY = 170, GROUND = 452, CAM_H = GROUND - HY, D = 260;
const LANE = 96, ROAD = 150, CURB = 190, WALL = 240;
const ZFAR = 3300;
const INTER = 230; // length of an intersection (cross street + crosswalks)
const FIRST_ST = 14;

interface Bldg {
  side: number;
  z0: number;
  z1: number;
  h: number;
  wall: string;
  face: string;
  awn: string;
  seed: number;
}

const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const WALLS = ['#5b3b52', '#6e4433', '#3f4a66', '#5a5560', '#7a4a3a', '#46566b', '#6b5a48'];
const AWNS = ['#e63946', '#2a9d8f', '#f4a261', '#3a86ff', '#ff4fa3', '#06d6a0', '#ffd166'];

// ---------------------------------------------------------------- sprites
/** Rear view of a yellow cab (base 80 wide, 64 tall, world units = px at scale 1). */
function cabSprite(): HTMLCanvasElement {
  return prerender(84, 76, (c) => {
    c.translate(2, 10);
    c.fillStyle = '#1a1a1a';
    c.fillRect(6, 52, 14, 12);
    c.fillRect(60, 52, 14, 12);
    c.fillStyle = '#f7c600';
    c.beginPath();
    c.roundRect(0, 18, 80, 40, 8);
    c.fill();
    c.fillStyle = '#e0b000';
    c.fillRect(0, 44, 80, 14);
    c.fillStyle = '#f7c600';
    c.beginPath();
    c.moveTo(12, 20);
    c.lineTo(20, 2);
    c.lineTo(60, 2);
    c.lineTo(68, 20);
    c.fill();
    c.fillStyle = '#26323d';
    c.beginPath();
    c.moveTo(17, 18);
    c.lineTo(23, 6);
    c.lineTo(57, 6);
    c.lineTo(63, 18);
    c.fill();
    // TAXI light.
    c.fillStyle = '#fff3b0';
    c.fillRect(30, -8, 20, 9);
    c.fillStyle = '#222';
    c.font = '900 7px "Arial Black", system-ui';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('TAXI', 40, -3.5);
    // Checker band, tail lights, plate.
    for (let x = 2; x < 78; x += 6) {
      c.fillStyle = (x / 6) % 2 < 1 ? '#111' : '#fff';
      c.fillRect(x, 34, 6, 4);
    }
    c.fillStyle = '#ff2a2a';
    c.fillRect(2, 24, 10, 8);
    c.fillRect(68, 24, 10, 8);
    c.fillStyle = '#fff';
    c.fillRect(30, 46, 20, 8);
    c.fillStyle = '#e8e8e8';
    c.fillRect(0, 56, 80, 3);
  });
}
function busSprite(): HTMLCanvasElement {
  return prerender(96, 128, (c) => {
    c.translate(2, 6);
    c.fillStyle = '#1a1a1a';
    c.fillRect(8, 108, 16, 12);
    c.fillRect(68, 108, 16, 12);
    c.fillStyle = '#f1f3f5';
    c.beginPath();
    c.roundRect(0, 0, 92, 112, 8);
    c.fill();
    c.fillStyle = '#1f6fd1';
    c.fillRect(0, 62, 92, 14);
    c.fillStyle = '#26323d';
    c.fillRect(8, 20, 76, 36);
    c.fillStyle = '#111';
    c.fillRect(14, 4, 64, 12);
    c.fillStyle = '#ffb703';
    c.font = '900 10px "Arial Black", system-ui';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('M15 SBS', 46, 10.5);
    c.fillStyle = '#ff2a2a';
    c.fillRect(4, 84, 10, 14);
    c.fillRect(78, 84, 10, 14);
    c.fillStyle = '#fff';
    c.fillRect(34, 90, 24, 9);
  });
}
function truckSprite(): HTMLCanvasElement {
  return prerender(96, 138, (c) => {
    c.translate(2, 4);
    c.fillStyle = '#1a1a1a';
    c.fillRect(8, 118, 16, 14);
    c.fillRect(68, 118, 16, 14);
    c.fillStyle = '#eceae4';
    c.fillRect(0, 0, 92, 122);
    c.fillStyle = '#cfccc3';
    for (let y = 8; y < 112; y += 9) c.fillRect(4, y, 84, 2);
    c.fillStyle = '#c1121f';
    c.fillRect(0, 36, 92, 22);
    c.fillStyle = '#fff';
    c.font = '900 13px "Arial Black", system-ui';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('FRESH DELI', 46, 47.5);
    c.fillStyle = '#333';
    c.fillRect(0, 112, 92, 8);
  });
}
function steamSprite(): HTMLCanvasElement {
  return prerender(36, 84, (c) => {
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? '#fff' : '#ff6a13';
      c.beginPath();
      const y = 4 + i * 13;
      const w0 = 10 + i * 2.2, w1 = 10 + (i + 1) * 2.2;
      c.moveTo(18 - w0, y);
      c.lineTo(18 + w0, y);
      c.lineTo(18 + w1, y + 13);
      c.lineTo(18 - w1, y + 13);
      c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.fillRect(18, 4, 16, 78);
  });
}
function barrierSprite(): HTMLCanvasElement {
  return prerender(76, 40, (c) => {
    c.fillStyle = '#333';
    c.fillRect(6, 14, 4, 26);
    c.fillRect(66, 14, 4, 26);
    for (let x = 0; x < 76; x += 12) {
      c.fillStyle = (x / 12) % 2 ? '#fff' : '#ff6a13';
      c.beginPath();
      c.moveTo(x, 4);
      c.lineTo(x + 12, 4);
      c.lineTo(x + 6, 18);
      c.lineTo(x - 6, 18);
      c.fill();
    }
    c.fillStyle = 'rgba(0,0,0,.2)';
    c.fillRect(0, 16, 76, 2);
    c.fillStyle = '#ffd60a';
    c.beginPath();
    c.arc(38, 3, 3, 0, Math.PI * 2);
    c.fill();
  });
}
function sedanSprite(color: string): HTMLCanvasElement {
  return prerender(84, 62, (c) => {
    c.translate(2, 4);
    c.fillStyle = '#1a1a1a';
    c.fillRect(6, 44, 14, 12);
    c.fillRect(60, 44, 14, 12);
    c.fillStyle = color;
    c.beginPath();
    c.roundRect(0, 16, 80, 34, 8);
    c.fill();
    c.beginPath();
    c.moveTo(12, 18);
    c.lineTo(20, 2);
    c.lineTo(60, 2);
    c.lineTo(68, 18);
    c.fill();
    c.fillStyle = '#26323d';
    c.beginPath();
    c.moveTo(18, 16);
    c.lineTo(24, 6);
    c.lineTo(56, 6);
    c.lineTo(62, 16);
    c.fill();
    c.fillStyle = '#ff2a2a';
    c.fillRect(2, 22, 10, 7);
    c.fillRect(68, 22, 10, 7);
  });
}
/** You, from behind: helmet, the insulated bag, the tail light. */
function riderSprite(): HTMLCanvasElement {
  return prerender(80, 120, (c) => {
    c.translate(40, 116);
    // Rear wheel.
    c.fillStyle = '#121212';
    c.beginPath();
    c.roundRect(-7, -24, 14, 24, 6);
    c.fill();
    // Scooter body / fender.
    c.fillStyle = '#e63946';
    c.beginPath();
    c.moveTo(-16, -20);
    c.quadraticCurveTo(0, -34, 16, -20);
    c.lineTo(12, -12);
    c.lineTo(-12, -12);
    c.closePath();
    c.fill();
    c.fillStyle = '#ff2a2a';
    c.fillRect(-6, -22, 12, 5);
    c.fillStyle = '#ffe1e1';
    c.fillRect(-3, -21, 6, 2);
    // Legs.
    c.fillStyle = '#2b2d42';
    c.fillRect(-15, -40, 8, 20);
    c.fillRect(7, -40, 8, 20);
    // Torso.
    c.fillStyle = '#3a86ff';
    c.beginPath();
    c.roundRect(-14, -66, 28, 30, 8);
    c.fill();
    // The bag.
    c.fillStyle = '#2a9d8f';
    c.beginPath();
    c.roundRect(-17, -94, 34, 32, 4);
    c.fill();
    c.fillStyle = '#21867a';
    c.fillRect(-17, -70, 34, 6);
    c.fillStyle = '#fff';
    c.font = '900 9px "Arial Black", system-ui';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('DASH', 0, -82);
    // Arms out to the bars.
    c.strokeStyle = '#3a86ff';
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-12, -58);
    c.lineTo(-24, -44);
    c.moveTo(12, -58);
    c.lineTo(24, -44);
    c.stroke();
    c.fillStyle = '#222';
    c.fillRect(-30, -46, 60, 4);
    // Head and helmet above the bag.
    c.fillStyle = '#2b2d42';
    c.fillRect(-5, -98, 10, 6);
    c.fillStyle = '#ffd166';
    c.beginPath();
    c.arc(0, -104, 12, Math.PI * 0.95, Math.PI * 2.05);
    c.closePath();
    c.fill();
    c.fillStyle = '#f4a261';
    c.fillRect(-12, -101, 24, 4);
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.beginPath();
    c.arc(-4, -109, 3, 0, Math.PI * 2);
    c.fill();
  });
}

export const dash: Run = (cv, g, done, hud) => {
  const fx = new Fx(W, H);
  const fin = finisher(done);
  const say = hudOnce(hud);
  const rand = rng((Math.random() * 2 ** 31) | 0);
  const s = createDash(secs(DASH_SECONDS));
  qaExpose('dash', s);
  const events: DashEvent[] = [];
  let hudKey = -1, raf = 0, over = false, ready = 1.0, camX = 0, lean = 0, land = 0, exhaust = 0, hitFlash = 0, lastMult = 1, lastSec = -1, timeText = '1:30';

  // ------------------------------------------------------------ art
  const sky = prerender(W + 80, HY + 10, (c) => {
    const r = rng(3);
    const gr = c.createLinearGradient(0, 0, 0, HY);
    gr.addColorStop(0, '#120a2e');
    gr.addColorStop(0.55, '#4b1d5e');
    gr.addColorStop(0.85, '#c2456b');
    gr.addColorStop(1, '#ff9a5a');
    c.fillStyle = gr;
    c.fillRect(0, 0, W + 80, HY + 10);
    c.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 40; i++) c.fillRect(r() * (W + 80), r() * HY * 0.5, 1, 1);
    // Midtown far away, the Empire State dead ahead.
    c.fillStyle = 'rgba(40,16,60,.85)';
    for (let x = 0; x < W + 80; ) {
      const w = 8 + r() * 16, h = 10 + r() * 34;
      c.fillRect(x, HY - h, w, h);
      x += w;
    }
    const cx = (W + 80) / 2;
    c.fillRect(cx - 9, HY - 70, 18, 70);
    c.fillRect(cx - 5, HY - 84, 10, 14);
    c.fillRect(cx - 1, HY - 100, 2, 16);
    c.fillStyle = 'rgba(255,200,120,.5)';
    for (let i = 0; i < 70; i++) c.fillRect(r() * (W + 80), HY - 2 - r() * 30, 1.5, 1.5);
    c.fillStyle = 'rgba(255,170,90,.35)';
    c.fillRect(0, HY - 2, W + 80, 12);
  });
  const SPR = {
    cab: cabSprite(),
    bus: busSprite(),
    truck: truckSprite(),
    steam: steamSprite(),
    barrier: barrierSprite(),
    parked: [sedanSprite('#6c757d'), sedanSprite('#1d3557'), sedanSprite('#8d0801'), sedanSprite('#e9ecef')],
    rider: riderSprite(),
    walker: emojiSprite('🚶', 64),
    box: emojiSprite('📦', 48),
    cash: emojiSprite('💵', 48),
    order: emojiSprite('🥡', 48),
    magnet: emojiSprite('🧲', 48),
    helmet: emojiSprite('🪖', 48),
    turbo: emojiSprite('⚡', 48),
    heart: emojiSprite('❤️', 32),
    helm: emojiSprite('🪖', 32),
  };
  const lampGlow = glowSprite(40, 'rgba(255,214,140,.9)');
  const tailGlow = glowSprite(24, 'rgba(255,40,40,.9)');
  const powerGlow = glowSprite(32, 'rgba(120,220,255,.85)');
  const orderGlow = glowSprite(32, 'rgba(255,210,80,.85)');
  const blinkGlow = glowSprite(16, 'rgba(255,170,0,1)');
  const asphalt = g.createLinearGradient(0, HY, 0, H);
  asphalt.addColorStop(0, '#3a3346');
  asphalt.addColorStop(1, '#25222c');
  const signs = new Map<number, HTMLCanvasElement>();
  const sign = (street: number) => {
    let c = signs.get(street);
    if (!c) {
      c = prerender(110, 30, (k) => {
        k.fillStyle = '#0b6e3a';
        k.beginPath();
        k.roundRect(0, 0, 110, 30, 4);
        k.fill();
        k.strokeStyle = '#fff';
        k.lineWidth = 2;
        k.strokeRect(3, 3, 104, 24);
        k.fillStyle = '#fff';
        k.font = '700 16px Helvetica, Arial, sans-serif';
        k.textAlign = 'center';
        k.textBaseline = 'middle';
        k.fillText(`W ${street} St`, 55, 16);
      });
      signs.set(street, c);
      if (signs.size > 6) signs.delete(signs.keys().next().value!);
    }
    return c;
  };
  // Buildings per block, made when the block comes into view.
  const blocks = new Map<number, Bldg[]>();
  const block = (b: number) => {
    let list = blocks.get(b);
    if (list) return list;
    list = [];
    for (const side of [-1, 1]) {
      let z = b * DASH_BLOCK + INTER;
      let i = 0;
      while (z < (b + 1) * DASH_BLOCK - 20) {
        const len = Math.min((b + 1) * DASH_BLOCK - z, 260 + hash(b * 2 + side, i) * 300);
        const h = 150 + hash(b + side * 7, i * 3) * 320;
        const wi = Math.floor(hash(b, i * 5 + side) * WALLS.length);
        list.push({ side, z0: z, z1: z + len, h, wall: WALLS[wi], face: WALLS[(wi + 2) % WALLS.length], awn: AWNS[Math.floor(hash(i, b * 3 + side) * AWNS.length)], seed: b * 31 + i * 7 + side });
        z += len;
        i++;
      }
    }
    // Far ones first (drawing order).
    list.sort((a, c) => c.z0 - a.z0);
    blocks.set(b, list);
    if (blocks.size > 6) blocks.delete(blocks.keys().next().value!);
    return list;
  };

  // ------------------------------------------------------------ projection
  const sc = (z: number) => D / (z + D);
  const X = (x: number, z: number) => W / 2 + (x - camX) * sc(z);
  const Y = (y: number, z: number) => HY + (CAM_H - y) * sc(z);
  const quad = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    // A vertical wall from (x0,z0) to (x1,z1), heights y0..y1.
    g.moveTo(X(x0, z0), Y(y0, z0));
    g.lineTo(X(x0, z0), Y(y1, z0));
    g.lineTo(X(x1, z1), Y(y1, z1));
    g.lineTo(X(x1, z1), Y(y0, z1));
    g.closePath();
  };
  const ground = (x0: number, x1: number, z0: number, z1: number) => {
    g.moveTo(X(x0, z0), Y(0, z0));
    g.lineTo(X(x1, z0), Y(0, z0));
    g.lineTo(X(x1, z1), Y(0, z1));
    g.lineTo(X(x0, z1), Y(0, z1));
    g.closePath();
  };

  // ------------------------------------------------------------ input
  const steer = (d: number) => {
    if (fin.ended) return;
    const before = s.lane;
    dashSteer(s, d);
    if (s.lane !== before) sfx.tick();
  };
  const hop = () => {
    if (fin.ended) return;
    if (s.hop <= 0.01) sfx.whoosh();
    dashHop(s);
  };
  const offS = swipes(cv, {
    swipe: (dx, dy) => (dx ? steer(dx) : dy < 0 ? hop() : undefined),
    tap: (x) => steer(x < W / 2 ? -1 : 1),
  }, 16);
  const offK = keys((k) => {
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') steer(-1);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') steer(1);
    else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') hop();
  });

  // ------------------------------------------------------------ events
  const PX = () => X((s.pl - 1) * LANE, 0);
  const SHOUT: Partial<Record<DashKind, string>> = {
    walker: 'HEY, I’M WALKIN’ HERE!',
    door: 'DOORED!',
    pothole: 'POTHOLE!',
    cab: 'HONK HONK',
    bus: 'BUS LANE!',
    truck: 'DOUBLE-PARKED!',
    steam: 'TOO STEAMY',
    barrier: 'ROADWORK!',
    box: 'WHOSE BOX?!',
  };
  const handle = (e: DashEvent) => {
    const x = PX(), y = GROUND - 60;
    switch (e.type) {
      case 'grab': {
        const order = e.kind === 'order';
        fx.pop(x, y - 20, `+${e.pts}${order ? ' 🥡' : ''}`, order ? '#ffd166' : '#7bd88f', order ? 24 : 16);
        fx.burst(x, y, { colors: order ? ['#ffd166', '#fff'] : ['#7bd88f', '#c7f9cc'], n: order ? 14 : 5, size: 3, speed: 140, life: 0.4, up: true });
        if (order) sfx.cash();
        else sfx.coin();
        const m = dashMult(s.streak, s.turbo > 0);
        if (m > lastMult && s.turbo <= 0) {
          fx.pop(x, y - 56, `TIPS ×${m}!`, '#ffd166', 22);
          sfx.good();
        }
        break;
      }
      case 'power':
        fx.stamp(e.kind === 'magnet' ? '🧲 MAGNET' : e.kind === 'helmet' ? '🪖 HELMET ON' : '⚡ TURBO ×2', '#5ec8ff', 0.8);
        fx.flash(e.kind === 'turbo' ? '#ffd166' : '#5ec8ff', 0.18);
        sfx.chime();
        break;
      case 'hit': {
        fx.stop(0.1);
        fx.shake(13, 0.4);
        fx.flash('#e0283f', 0.25);
        fx.burst(x, y, { emoji: ['💥', '📦'], n: 5, size: 20, speed: 200 });
        fx.burst(x, y, { colors: ['#fff', '#ffd166', '#e0283f'], n: 14, size: 3, speed: 240 });
        fx.pop(W / 2, HY + 70, SHOUT[e.kind] ?? 'OUCH!', '#ff6b6b', e.kind === 'walker' ? 17 : 22);
        hitFlash = 1;
        sfx.punch();
        if (e.kind === 'cab' || e.kind === 'bus' || e.kind === 'truck') sfx.honk();
        break;
      }
      case 'saved':
        fx.stamp('🪖 SAVED!', '#5ec8ff', 0.8);
        fx.shake(7, 0.2);
        fx.burst(x, y, { colors: ['#5ec8ff', '#fff'], n: 12, size: 3, speed: 200 });
        sfx.punch();
        break;
      case 'smash':
        fx.burst(x, y - 20, { colors: ['#ffd166', '#fff', '#ff6a13'], n: 16, size: 4, speed: 260 });
        fx.pop(x, y - 40, `SMASH +${e.pts}`, '#ffd166', 18);
        fx.shake(5, 0.12);
        sfx.punch();
        break;
      case 'close':
        fx.pop(X((e.lane - 1) * LANE, 0), y - 30, `CLOSE! +${e.pts}`, '#ffd166', 16);
        sfx.whoosh();
        break;
      case 'hopped':
        fx.pop(x, y - 34, `+${e.pts}`, '#fff', 14);
        break;
      case 'land':
        land = 1;
        fx.burst(x, GROUND - 2, { colors: ['#9a96a6', '#c9c5d3'], n: 6, size: 3, speed: 70, life: 0.35, up: true });
        sfx.tap();
        break;
      case 'block':
        break;
      case 'end':
        if (e.reason === 'time') {
          fx.stamp('SHIFT OVER!', '#7bd88f', 1.4);
          if (e.bonus) fx.pop(W / 2, HY + 120, `❤️ bonus +${e.bonus}`, '#ff8fab', 22);
          fx.burst(W / 2, HY + 60, { emoji: ['🎉', '💵', '🥡'], n: 16, size: 18, speed: 240 });
          sfx.cheer();
          fin.end(s.score, 1700);
        } else {
          fx.stamp('WIPEOUT!', '#e0283f', 1.3);
          fin.end(s.score, 1500);
        }
        break;
    }
  };

  // ------------------------------------------------------------ drawing
  const drawBuilding = (b: Bldg) => {
    const z0 = b.z0 - s.dist, z1 = b.z1 - s.dist;
    if (z1 < -80 || z0 > ZFAR) return;
    const zn = Math.max(z0, -80);
    const xw = b.side * WALL;
    const fade = clamp((ZFAR - z0) / 900, 0, 1);
    g.globalAlpha = fade;
    // Front face (visible where it pokes out past what's nearer).
    g.fillStyle = b.face;
    g.beginPath();
    quad(xw, 0, z0, xw + b.side * 900, b.h, z0);
    g.fill();
    // Side wall along the avenue.
    g.fillStyle = b.wall;
    g.beginPath();
    quad(xw, 0, zn, xw, b.h, z1);
    g.fill();
    // Floors of windows: dark glass bands with a few lit ones.
    const near = sc(Math.max(0, zn)) > 0.16;
    g.fillStyle = 'rgba(20,16,36,.55)';
    g.beginPath();
    for (let y = 60; y < b.h - 16; y += 30) quad(xw, y, zn, xw, y + 14, z1);
    g.fill();
    if (near) {
      g.fillStyle = 'rgba(255,214,140,.85)';
      g.beginPath();
      let k = 0;
      for (let y = 60; y < b.h - 16; y += 30)
        for (let wz = b.z0 + 16; wz < b.z1 - 30; wz += 46) {
          k++;
          if (hash(b.seed, k) > 0.34) continue;
          const a = wz - s.dist;
          if (a < zn || a > ZFAR) continue;
          quad(xw, y + 2, a, xw, y + 12, a + 26);
        }
      g.fill();
    }
    // Storefront: lit glass and an awning.
    g.fillStyle = 'rgba(255,200,120,.55)';
    g.beginPath();
    quad(xw, 4, zn, xw, 32, z1);
    g.fill();
    g.fillStyle = b.awn;
    g.beginPath();
    quad(xw, 34, zn, xw - b.side * 14, 44, z1);
    g.fill();
    // Roof line.
    g.strokeStyle = 'rgba(255,255,255,.12)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(X(xw, zn), Y(b.h, zn));
    g.lineTo(X(xw, z1), Y(b.h, z1));
    g.stroke();
    g.globalAlpha = 1;
  };

  const drawObj = (o: DashObj, now: number) => {
    const z = o.z;
    if (z > ZFAR || z < -200) return;
    const k = sc(z);
    const info = DASH_INFO[o.kind];
    const lx = (o.lane - 1) * LANE;
    const x = X(lx, z), y = Y(0, z);
    const fade = clamp((ZFAR - z) / 500, 0, 1);
    g.globalAlpha = fade;
    // Shadow on the road.
    if (o.kind !== 'pothole') {
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.ellipse(x, y, (info.type === 'tall' ? 44 : 26) * k, 7 * k, 0, 0, Math.PI * 2);
      g.fill();
    }
    switch (o.kind) {
      case 'cab': {
        g.drawImage(SPR.cab, x - 42 * k, y - 76 * k, 84 * k, 76 * k);
        if (o.to !== o.lane0 && z < 1500 && Math.floor(now / 180) % 2) {
          // The blinker (towards where it's going).
          g.globalCompositeOperation = 'lighter';
          const bx = x + (o.to > o.lane0 ? 34 : -34) * k;
          g.drawImage(blinkGlow, bx - 16 * k, y - 50 * k, 32 * k, 32 * k);
          g.globalCompositeOperation = 'source-over';
        }
        break;
      }
      case 'bus':
        g.drawImage(SPR.bus, x - 48 * k, y - 128 * k, 96 * k, 128 * k);
        break;
      case 'truck':
        g.drawImage(SPR.truck, x - 48 * k, y - 138 * k, 96 * k, 138 * k);
        if (Math.floor(now / 300) % 2) {
          g.globalCompositeOperation = 'lighter';
          g.drawImage(blinkGlow, x - 52 * k, y - 26 * k, 24 * k, 24 * k);
          g.drawImage(blinkGlow, x + 28 * k, y - 26 * k, 24 * k, 24 * k);
          g.globalCompositeOperation = 'source-over';
        }
        break;
      case 'steam': {
        g.drawImage(SPR.steam, x - 18 * k, y - 84 * k, 36 * k, 84 * k);
        // Steam rolling out the top.
        g.fillStyle = 'rgba(235,235,245,.55)';
        for (let i = 0; i < 4; i++) {
          const t = ((now / 900 + i / 4) % 1);
          g.beginPath();
          g.arc(x + Math.sin(t * 6 + i) * 8 * k, y - (84 + t * 70) * k, (8 + t * 16) * k, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'walker': {
        const dir = o.lane0 < 1 ? 1 : -1;
        const bob = Math.abs(Math.sin(now / 140)) * 3 * k;
        g.save();
        g.translate(x, y - 34 * k - bob);
        g.scale(-dir, 1);
        blit(g, SPR.walker, 0, 0, 62 * k);
        g.restore();
        break;
      }
      case 'door': {
        // A parked car at the curb, its door swinging out into the lane.
        const cx = X(170, z);
        g.drawImage(SPR.parked[o.seed % 4], cx - 42 * k, y - 62 * k, 84 * k, 62 * k);
        const open = clamp((1100 - z) / 300, 0, 1);
        const reach = 150 - open * 52;
        g.fillStyle = '#8d0801';
        g.beginPath();
        g.moveTo(X(150, z + 10), Y(8, z + 10));
        g.lineTo(X(reach, z + 10 + (1 - open) * 50), Y(8, z + 10 + (1 - open) * 50));
        g.lineTo(X(reach, z + 10 + (1 - open) * 50), Y(44, z + 10 + (1 - open) * 50));
        g.lineTo(X(150, z + 10), Y(44, z + 10));
        g.closePath();
        g.fill();
        g.fillStyle = 'rgba(160,200,230,.7)';
        g.beginPath();
        g.moveTo(X(150, z + 10), Y(30, z + 10));
        g.lineTo(X(reach + 8, z + 10 + (1 - open) * 42), Y(30, z + 10 + (1 - open) * 42));
        g.lineTo(X(reach + 8, z + 10 + (1 - open) * 42), Y(42, z + 10 + (1 - open) * 42));
        g.lineTo(X(150, z + 10), Y(42, z + 10));
        g.closePath();
        g.fill();
        break;
      }
      case 'pothole':
        g.fillStyle = '#16131b';
        g.beginPath();
        g.ellipse(x, y - 4 * k, 34 * k, 9 * k, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#4c4656';
        g.lineWidth = Math.max(1, 3 * k);
        g.stroke();
        break;
      case 'barrier':
        g.drawImage(SPR.barrier, x - 38 * k, y - 40 * k, 76 * k, 40 * k);
        break;
      case 'box':
        blit(g, SPR.box, x, y - 18 * k, 40 * k);
        break;
      default: {
        // Pickups float and spin.
        const yy = y - (34 + Math.sin(now / 220 + o.z * 0.01) * 4) * k;
        if (o.kind === 'cash') {
          g.save();
          g.translate(x, yy);
          g.scale(0.35 + Math.abs(Math.cos(now / 260 + o.z * 0.02)) * 0.65, 1);
          blit(g, SPR.cash, 0, 0, 34 * k);
          g.restore();
        } else {
          g.globalCompositeOperation = 'lighter';
          const gl = o.kind === 'order' ? orderGlow : powerGlow;
          g.drawImage(gl, x - 40 * k, yy - 40 * k, 80 * k, 80 * k);
          g.globalCompositeOperation = 'source-over';
          blit(g, SPR[o.kind as 'order'], x, yy, 40 * k);
        }
      }
    }
    g.globalAlpha = 1;
  };

  const byZ = (a: DashObj, b: DashObj) => b.z - a.z;
  const draw = (now: number) => {
    const shiftX = -camX * 0.08;
    g.drawImage(sky, -40 + shiftX, 0);
    // Sidewalk base, then the avenue, cross streets, paint.
    g.fillStyle = '#4a4456';
    g.fillRect(-20, HY, W + 40, H - HY + 20);
    g.fillStyle = asphalt;
    g.beginPath();
    ground(-CURB, CURB, -120, ZFAR);
    g.fill();
    const b0 = Math.floor((s.dist - 150) / DASH_BLOCK), b1 = Math.floor((s.dist + ZFAR) / DASH_BLOCK);
    for (let b = b1; b >= b0; b--) {
      const zi = b * DASH_BLOCK - s.dist;
      if (zi + INTER < -120 || zi > ZFAR) continue;
      // Cross street.
      g.fillStyle = asphalt;
      g.beginPath();
      ground(-1400, 1400, Math.max(-120, zi + 40), zi + INTER - 40);
      g.fill();
      // Crosswalks (zebra) on both sides of it.
      g.fillStyle = 'rgba(240,240,245,.8)';
      g.beginPath();
      for (const cz of [zi + 6, zi + INTER - 34]) {
        if (cz < -120) continue;
        for (let xx = -ROAD + 6; xx < ROAD; xx += 24) ground(xx, xx + 13, cz, cz + 28);
      }
      g.fill();
    }
    // Lane dashes and the curbs.
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.beginPath();
    const off = s.dist % 140;
    for (let z = -off - 20; z < ZFAR; z += 140) {
      const inBlock = (((z + s.dist) % DASH_BLOCK) + DASH_BLOCK) % DASH_BLOCK;
      if (inBlock < INTER) continue;
      for (const lx of [-LANE / 2, LANE / 2]) ground(lx - 3, lx + 3, z, z + 64);
    }
    g.fill();
    g.fillStyle = '#ffd166';
    g.beginPath();
    ground(-ROAD - 4, -ROAD, -120, ZFAR);
    ground(ROAD, ROAD + 4, -120, ZFAR);
    g.fill();
    // Buildings, signs and lamps, far to near.
    for (let b = b1; b >= b0; b--) {
      for (const bl of block(b)) drawBuilding(bl);
      const zi = b * DASH_BLOCK - s.dist;
      if (zi > -60 && zi < 1800) {
        // The street sign on the corner.
        const k = sc(zi);
        const px = X(CURB + 6, zi), top = Y(150, zi);
        g.fillStyle = '#2c2c34';
        g.fillRect(px - 2 * k, top, 4 * k, Y(0, zi) - top);
        g.drawImage(sign(FIRST_ST + b), px - 104 * k, top - 8 * k, 104 * k, 28 * k);
      }
    }
    // Street lamps every 360.
    const loff = s.dist % 360;
    g.strokeStyle = '#26232e';
    for (let z = ZFAR - ((ZFAR + loff) % 360); z > -100; z -= 360) {
      const k = sc(z);
      g.lineWidth = Math.max(1, 4 * k);
      g.beginPath();
      for (const side of [-1, 1]) {
        const x = X(side * (CURB + 10), z);
        g.moveTo(x, Y(0, z));
        g.lineTo(x, Y(140, z));
        g.lineTo(X(side * (CURB - 20), z), Y(146, z));
      }
      g.stroke();
      g.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        const x = X(side * (CURB - 20), z);
        g.drawImage(lampGlow, x - 40 * k, Y(146, z) - 40 * k, 80 * k, 80 * k);
      }
      g.globalCompositeOperation = 'source-over';
    }
    // Traffic, far to near.
    s.objs.sort(byZ);
    for (const o of s.objs) drawObj(o, now);
    // Speed lines (turbo, or once you're flying).
    const fast = s.turbo > 0 || s.v > 950;
    if (fast && !REDUCED) {
      g.strokeStyle = s.turbo > 0 ? 'rgba(255,220,120,.45)' : 'rgba(255,255,255,.18)';
      g.lineWidth = 2;
      g.beginPath();
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + 0.2;
        const t = ((now / (s.turbo > 0 ? 160 : 260) + i * 0.37) % 1);
        const r0 = 120 + t * 260;
        g.moveTo(W / 2 + Math.cos(a) * r0, HY + 80 + Math.sin(a) * r0 * 0.8);
        g.lineTo(W / 2 + Math.cos(a) * (r0 + 40), HY + 80 + Math.sin(a) * (r0 + 40) * 0.8);
      }
      g.stroke();
    }
    // You.
    const px = PX();
    const lift = s.hop;
    const sq = land * 0.12;
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.beginPath();
    g.ellipse(px, GROUND, 24 * (1 - lift / 120), 6, 0, 0, Math.PI * 2);
    g.fill();
    const blink = !s.dead && s.invuln > 0 && Math.floor(now / 80) % 2 === 0;
    if (s.dead) {
      // Wiped out: the scooter on its side.
      g.save();
      g.translate(px + 18, GROUND - 6);
      g.rotate(1.25);
      g.drawImage(SPR.rider, -40, -116);
      g.restore();
    } else if (!blink) {
      g.save();
      g.translate(px, GROUND - lift + (REDUCED ? 0 : Math.sin(now / 45) * 0.6));
      g.rotate(lean);
      g.scale(1 + sq, 1 - sq);
      g.drawImage(SPR.rider, -40, -116);
      g.restore();
      g.globalCompositeOperation = 'lighter';
      g.drawImage(tailGlow, px - 24, GROUND - lift - 42, 48, 48);
      g.globalCompositeOperation = 'source-over';
    }
    if (s.helmet) {
      g.strokeStyle = 'rgba(94,200,255,.7)';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(px, GROUND - lift - 58, 42, 64, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (s.magnet > 0) blit(g, SPR.magnet, px + 32, GROUND - lift - 110, 20);
    if (hitFlash > 0) {
      g.fillStyle = 'rgba(255,40,60,.18)';
      g.globalAlpha = hitFlash;
      g.fillRect(-20, -20, W + 40, H + 40);
      g.globalAlpha = 1;
    }
    // ---- HUD on the glass
    const left = Math.max(0, s.end - s.t);
    bar(g, 10, 10, W - 20, left / s.end, left < 10 ? '#ff5a5a' : '#7bd88f');
    label(g, timeText, 12, 30, 16, left < 10 ? '#ff5a5a' : '#fff', 'left');
    for (let i = 0; i < s.lives; i++) blit(g, SPR.heart, W - 18 - i * 20, 30, 16);
    if (s.helmet) blit(g, SPR.helm, W - 18 - s.lives * 20, 30, 16);
    label(g, `${s.score}`, W / 2, 34, 24, '#fff');
    const m = dashMult(s.streak, s.turbo > 0);
    if (m > 1) label(g, `💵 ×${m}`, W / 2, 58, 16, s.turbo > 0 ? '#ffd166' : '#7bd88f');
    if (s.turbo > 0) bar(g, W / 2 - 50, 70, 100, s.turbo / DASH_TURBO_S, '#ffd166');
    else if (s.magnet > 0) bar(g, W / 2 - 50, 70, 100, s.magnet / DASH_MAGNET_S, '#5ec8ff');
    if (ready > 0) {
      label(g, ready > 0.45 ? 'READY…' : 'GO!', W / 2, HY + 90, 30, ready > 0.45 ? '#fff' : '#7bd88f');
      label(g, '◀ tap · swipe ▶   ⬆ swipe up to hop', W / 2, HY + 126, 13, '#fff');
    }
  };

  // ------------------------------------------------------------ loop
  const loop = (now: number) => {
    if (over) return;
    const dt = fx.begin(g);
    if (!fx.frozen && !fin.ended) {
      if (ready > 0) {
        ready -= dt;
        if (ready <= 0) sfx.chime();
      } else {
        events.length = 0;
        dashUpdate(s, dt, rand, events);
        for (const e of events) handle(e);
        lastMult = dashMult(s.streak, s.turbo > 0);
        // Exhaust puffs.
        exhaust -= dt;
        if (exhaust <= 0 && !REDUCED) {
          exhaust = s.turbo > 0 ? 0.03 : 0.12;
          fx.burst(PX(), GROUND - s.hop - 14, s.turbo > 0 ? { colors: ['#ffd166', '#ff6a13'], n: 2, size: 4, speed: 60, gravity: 200, life: 0.3 } : { colors: ['rgba(200,200,210,.5)'], n: 1, size: 5, speed: 30, gravity: -40, life: 0.5 });
        }
      }
      const sec = Math.ceil(Math.max(0, s.end - s.t));
      if (sec !== lastSec) {
        if (sec <= 5 && sec > 0 && lastSec !== -1 && ready <= 0) sfx.tick();
        lastSec = sec;
        timeText = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      }
    }
    camX += ((s.pl - 1) * LANE * 0.25 - camX) * Math.min(1, dt * (REDUCED ? 4 : 8));
    lean += (clamp((s.lane - s.pl) * 0.35, -0.3, 0.3) - lean) * Math.min(1, dt * 14);
    land = Math.max(0, land - dt * 6);
    hitFlash = Math.max(0, hitFlash - dt * 2.5);
    draw(now);
    fx.end(g);
    const hk = s.score * 64 + lastSec * 8 + s.lives * 2 + (s.helmet ? 1 : 0);
    if (hk !== hudKey) {
      hudKey = hk;
      say(`🛵 ${s.score} · ⏱ ${timeText} · ${s.lives > 0 ? '❤️'.repeat(s.lives) : '💥'}${s.helmet ? '🪖' : ''}`);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    over = true;
    fin.cancel();
    cancelAnimationFrame(raf);
    offS();
    offK();
  };
};
