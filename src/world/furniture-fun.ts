// =====================================================================
// furniture-fun.ts — pieces for the entertainment spots (Peter,
// 2026-10-14): 🕹️ Pixel Palace arcade, 🎰 Empire Casino, 🌳 the park
// and 🛋️ the club's sections.
//
// Same toy kit and conventions as furniture-work.ts: metres, centred on
// the footprint, sitting on y = 0, the front faces +z.
// =====================================================================

import * as THREE from 'three';
import type { Toy } from './landmarks/toy.ts';

const INK = '#1b1d22';
const STEEL = '#b8bec7';
const GOLD = '#e0b13a';
const FELT = '#1f6f43';
const WOOD = '#8a5a34';
const WOOD_DK = '#5c3a21';
const GRASS = '#5aa452';
const LEAF = ['#2d6a4f', '#40916c', '#52b788'];

function screen(t: Toy, w: number, h: number, x: number, y0: number, z: number, face: string, tilt = 0): void {
  t.add(new THREE.BoxGeometry(w, h, 0.05).rotateX(tilt).translate(x, y0 + h / 2, z), INK);
  t.inSlot(3, () => t.add(new THREE.BoxGeometry(w * 0.88, h * 0.82, 0.01).rotateX(tilt).translate(x, y0 + h / 2, z + 0.03), face));
}

/** An upright arcade cabinet in a colour, with a marquee and a screen. */
function cabinet(t: Toy, body: string, face: string, marquee: string): void {
  t.block(0.8, 1.15, 0.75, 0, 0, 0, body, 0.06);
  t.block(0.8, 0.5, 0.45, 0, 1.15, -0.15, body, 0.06);
  t.block(0.84, 0.26, 0.5, 0, 1.65, -0.12, marquee, 0.06); // marquee
  t.inSlot(3, () => t.block(0.7, 0.12, 0.02, 0, 1.72, 0.14, marquee, 0.05)); // its light
  screen(t, 0.62, 0.48, 0, 1.13, 0.1, face, -0.18);
  t.block(0.78, 0.08, 0.32, 0, 1.0, 0.3, INK, 0.05); // control panel
  t.cyl(0.03, 0.03, 0.1, -0.2, 1.06, 0.32, INK, 8);
  t.sphere(0.05, -0.2, 1.17, 0.32, '#e0283f');
  for (const [x, c] of [[0.1, '#36c5f0'], [0.24, '#ffd23f']] as [number, string][]) t.cyl(0.04, 0.04, 0.03, x, 1.08, 0.33, c, 10);
  t.block(0.18, 0.1, 0.02, 0, 0.55, 0.38, '#2b2d33', 0.2); // coin slot
}

export const FUN_TOYS: Record<string, (t: Toy) => void> = {
  // ============================================================ 🕹️ arcade
  toyCabSnake: (t) => cabinet(t, '#1b998b', '#0b1320', '#2ec4b6'),
  toyCabPigeons: (t) => cabinet(t, '#5c6470', '#8d99ae', '#adb5bd'),
  toyCabBeats: (t) => {
    cabinet(t, '#c9184a', '#2a0a3d', '#ff4fa3');
    // A dance pad in front.
    const cols = ['#ff4fa3', '#36c5f0', '#ffd23f', '#7bd88f'];
    t.block(0.9, 0.06, 0.6, 0, 0, 0.75, '#2b2d33', 0.05);
    cols.forEach((c, i) => t.block(0.18, 0.02, 0.18, -0.3 + i * 0.2, 0.06, 0.75, c, 0.2));
  },
  /** Hoop Shot: a long lane with a hoop and a net cage. */
  toyCabHoops(t) {
    t.block(0.9, 0.85, 1.6, 0, 0, 0, '#ff7f11', 0.06);
    t.block(0.82, 0.04, 1.5, 0, 0.85, 0, '#c47a3a', 0.1); // the ramp
    for (const x of [-0.42, 0.42]) t.block(0.04, 1.4, 1.5, x, 0.85, 0, '#ffffff33', 0.1); // net sides
    t.block(0.84, 0.6, 0.06, 0, 1.55, -0.72, '#f1f1f1', 0.05); // backboard
    t.add(new THREE.TorusGeometry(0.16, 0.025, 6, 18).rotateX(Math.PI / 2).translate(0, 1.6, -0.55), '#ff6a00');
    for (let i = 0; i < 4; i++) t.sphere(0.09, -0.25 + i * 0.16, 0.98, 0.55, '#e36414');
    t.block(0.9, 0.3, 0.06, 0, 2.2, -0.72, '#1b1d22', 0.05);
    t.block(0.6, 0.14, 0.02, 0, 2.28, -0.68, '#ffd23f', 0.05); // score
  },
  /** Claw machine: glass box of prizes. */
  toyClawMachine(t) {
    t.block(0.9, 0.85, 0.9, 0, 0, 0, '#7b2cbf', 0.06);
    t.block(0.86, 1.0, 0.86, 0, 0.85, 0, '#cfe8f340', 0.04); // glass
    const prizes = ['#ff8fab', '#ffd23f', '#90e0ef', '#b9fbc0', '#f4a261', '#cdb4db'];
    for (let i = 0; i < 9; i++) t.sphere(0.11, -0.28 + (i % 3) * 0.28, 0.98, -0.28 + Math.floor(i / 3) * 0.28, prizes[i % prizes.length]);
    t.block(0.9, 0.12, 0.9, 0, 1.85, 0, '#7b2cbf', 0.05);
    t.block(0.7, 0.16, 0.04, 0, 1.97, 0.4, '#ff4fa3', 0.05);
    t.cyl(0.01, 0.01, 0.4, 0.1, 1.45, 0.05, STEEL, 4);
    t.cyl(0.06, 0.03, 0.08, 0.1, 1.38, 0.05, STEEL, 6); // the claw
  },
  /** Prize counter: a glass case of plushies and a wall of prizes. */
  toyPrizeCounter(t) {
    t.block(2.4, 0.95, 0.7, 0, 0, 0, '#3a0ca3', 0.06);
    t.block(2.3, 0.35, 0.55, 0, 0.95, 0.04, '#cfe8f3', 0.06);
    const c = ['#ff8fab', '#ffd23f', '#90e0ef', '#b9fbc0', '#f4a261', '#cdb4db', '#ffadad'];
    for (let i = 0; i < 7; i++) t.sphere(0.11, -0.95 + i * 0.32, 1.1, 0.05, c[i]);
    t.block(2.4, 1.3, 0.12, 0, 1.4, -0.32, '#240046', 0.04); // the back wall of prizes
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) t.sphere(0.1, -0.9 + i * 0.36, 1.6 + r * 0.38, -0.22, c[(r + i) % c.length]);
    t.block(0.6, 0.2, 0.03, 0.8, 2.75, -0.26, '#ffd23f', 0.1); // TICKETS sign
  },
  /** Air hockey table (for show; the puck is always somewhere under the table). */
  toyAirHockey(t) {
    t.block(1.2, 0.75, 2.0, 0, 0, 0, '#0353a4', 0.06);
    t.block(1.1, 0.03, 1.9, 0, 0.75, 0, '#e9f5ff', 0.05);
    t.block(1.1, 0.01, 0.02, 0, 0.78, 0, '#e0283f', 0.1);
    t.cyl(0.08, 0.08, 0.05, 0, 0.78, 0.6, '#e0283f', 14);
    t.cyl(0.08, 0.08, 0.05, 0, 0.78, -0.6, '#36c5f0', 14);
    t.cyl(0.04, 0.04, 0.01, 0.2, 0.78, 0.1, INK, 10);
  },

  // ============================================================ 🕹️ more cabinets (2026-10-27)
  toyCabBreakout: (t) => cabinet(t, '#8d2c1d', '#120a08', '#ff6a3d'),
  toyCabRooftop: (t) => cabinet(t, '#2d5aa0', '#0d1a33', '#7bd8ff'),
  /** A pinball machine: legs, a sloped glass playfield with bumpers, a lit backbox. */
  toyPinball(t) {
    for (const [x, z] of [[-0.3, -0.55], [0.3, -0.55], [-0.3, 0.55], [0.3, 0.55]]) t.cyl(0.03, 0.03, 0.8, x, 0, z, STEEL, 6);
    t.add(new THREE.BoxGeometry(0.72, 0.18, 1.3).rotateX(-0.12).translate(0, 0.88, 0), '#7b2cbf');
    t.add(new THREE.BoxGeometry(0.64, 0.01, 1.2).rotateX(-0.12).translate(0, 0.98, 0), '#1b1035');
    for (const [x, z, c] of [[-0.12, -0.25, '#ffd23f'], [0.12, -0.3, '#ff4fa3'], [0, -0.05, '#36c5f0']] as [number, number, string][]) t.cyl(0.06, 0.06, 0.06, x, 0.98 - z * 0.12, z, c, 12);
    t.block(0.1, 0.02, 0.03, -0.12, 1.02, 0.45, '#ffffff', 0.2);
    t.block(0.1, 0.02, 0.03, 0.12, 1.02, 0.45, '#ffffff', 0.2);
    t.block(0.72, 0.62, 0.14, 0, 0.98, -0.66, '#7b2cbf', 0.04);
    t.inSlot(3, () => t.block(0.62, 0.48, 0.02, 0, 1.05, -0.58, '#ff4fa3', 0.04));
    t.inSlot(3, () => t.block(0.4, 0.08, 0.02, 0, 1.38, -0.57, '#ffd23f', 0.2));
  },
  /** A skee-ball lane: a long ramp up to rings in a net cage. */
  toySkeeBall(t) {
    t.block(0.8, 0.6, 2.4, 0, 0, 0, '#c1121f', 0.05);
    t.add(new THREE.BoxGeometry(0.66, 0.04, 1.6).rotateX(-0.18).translate(0, 0.78, 0.25), '#d9a066');
    t.block(0.8, 0.9, 0.6, 0, 0.6, -0.9, '#c1121f', 0.05);
    for (const [r, y, c] of [[0.28, 1.0, '#ffd23f'], [0.18, 1.12, '#36c5f0'], [0.1, 1.24, '#ff4fa3']] as [number, number, string][]) t.add(new THREE.TorusGeometry(r, 0.02, 6, 20).rotateX(Math.PI / 2 - 0.5).translate(0, y, -0.85), c);
    for (const x of [-0.4, 0.4]) t.block(0.02, 1.2, 1.8, x, 0.6, 0, '#ffffff22', 0.05);
    t.block(0.8, 0.3, 0.1, 0, 1.6, -1.15, '#1b1d22', 0.05);
    t.block(0.6, 0.18, 0.02, 0, 1.66, -1.09, '#ffd23f', 0.1);
    for (let i = 0; i < 5; i++) t.sphere(0.05, -0.2 + i * 0.1, 0.66, 1.1, '#8a5a34');
  },

  // ============================================================ 🎰 more tables (2026-10-27)
  /** Poker: an oval table, rail, chip stacks at each seat, the dealer's button. */
  toyPokerTable(t) {
    t.cyl(0.18, 0.28, 0.72, 0, 0, 0, INK, 12);
    const oval = (r: number, h: number, y: number, c: string) => t.add(new THREE.CylinderGeometry(r, r, h, 32).scale(1.45, 1, 1).translate(0, y, 0), c);
    oval(0.95, 0.06, 0.74, WOOD_DK);
    oval(0.84, 0.06, 0.76, '#145a32');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      t.cyl(0.04, 0.04, 0.06 + (i % 3) * 0.03, Math.cos(a) * 0.95, 0.79, Math.sin(a) * 0.6, ['#e0283f', '#36c5f0', GOLD][i % 3], 10);
      t.block(0.1, 0.01, 0.14, Math.cos(a) * 0.7, 0.8, Math.sin(a) * 0.42, '#fffdf5', 0.05);
    }
    for (let i = 0; i < 5; i++) t.block(0.1, 0.01, 0.14, -0.26 + i * 0.13, 0.8, 0, '#fffdf5', 0.05);
    t.cyl(0.05, 0.05, 0.02, 0.4, 0.8, 0.2, '#ffffff', 12);
  },
  /** Craps: a long tub table with the layout and a pair of dice. */
  toyCrapsTable(t) {
    t.block(2.6, 0.8, 1.3, 0, 0, 0, WOOD_DK, 0.08);
    t.block(2.4, 0.04, 1.1, 0, 0.72, 0, '#14532d', 0.05);
    t.block(2.6, 0.12, 0.1, 0, 0.8, 0.62, WOOD, 0.2);
    t.block(2.6, 0.12, 0.1, 0, 0.8, -0.62, WOOD, 0.2);
    t.block(0.9, 0.01, 0.18, -0.5, 0.77, 0.3, '#ffffff', 0.05); // PASS LINE
    t.block(0.5, 0.01, 0.3, 0.6, 0.77, 0, '#ffd23f', 0.05); // FIELD
    for (const [x, z] of [[0.1, -0.2], [0.22, -0.1]]) t.block(0.08, 0.08, 0.08, x, 0.76, z, '#e0283f', 0.15);
    t.cyl(0.02, 0.02, 0.5, -1.1, 0.8, -0.3, WOOD, 6); // the stick
  },
  /** Baccarat: a kidney table, numbered seats, the shoe, cards dealt. */
  toyBaccaratTable(t) {
    t.cyl(0.1, 0.15, 0.72, 0, 0, 0, INK, 10);
    t.add(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 28, 1, false, -Math.PI / 2, Math.PI).translate(0, 0.76, 0), '#7a1430');
    t.add(new THREE.TorusGeometry(1.2, 0.06, 6, 28, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI).translate(0, 0.8, 0), GOLD);
    t.block(2.4, 0.08, 0.16, 0, 0.76, -0.04, WOOD_DK, 0.2);
    t.block(0.22, 0.12, 0.3, -0.7, 0.82, 0.12, '#2b2d33', 0.1); // the shoe
    for (const x of [-0.25, 0.25]) for (const dx of [0, 0.1]) t.block(0.12, 0.01, 0.17, x + dx, 0.81, 0.4 + dx, '#fffdf5', 0.05);
  },
  /** The Big Six money wheel: a tall wheel of coloured segments on a stand, a clapper on top. */
  toyBigSix(t) {
    t.block(1.0, 0.25, 0.6, 0, 0, 0, WOOD_DK, 0.05);
    t.block(0.14, 1.0, 0.14, 0, 0.25, 0, GOLD, 0.05);
    const cols = ['#e0283f', '#ffd23f', '#36c5f0', '#7bd88f', '#ff4fa3', '#ffffff'];
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2;
      t.add(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 2, 1, false, a0, (Math.PI * 2) / 24).rotateX(Math.PI / 2).translate(0, 2.05, 0.08), cols[i % cols.length]);
    }
    t.add(new THREE.TorusGeometry(0.92, 0.05, 6, 40).translate(0, 2.05, 0.1), GOLD);
    t.cyl(0.12, 0.12, 0.1, 0, 2.0, 0.08, GOLD, 16);
    t.block(0.06, 0.2, 0.06, 0, 2.97, 0.12, '#e0283f', 0.1);
    t.block(1.4, 0.75, 0.6, 0, 0, 0.8, '#14532d', 0.05); // betting board
    for (let i = 0; i < 6; i++) t.block(0.18, 0.01, 0.4, -0.55 + i * 0.22, 0.76, 0.8, cols[i], 0.05);
  },
  /** Plinko: a tall upright board of pegs with lit slots at the bottom. */
  toyPlinko(t) {
    t.block(1.4, 0.9, 0.5, 0, 0, 0, '#1b1d22', 0.05);
    t.block(1.4, 1.9, 0.12, 0, 0.9, -0.15, '#0d1030', 0.03);
    for (let r = 0; r < 9; r++) for (let c = 0; c <= r; c++) t.sphere(0.025, -r * 0.065 + c * 0.13, 2.55 - r * 0.17, -0.07, '#e9ecef');
    const cols = ['#e0283f', '#ff7f11', '#ffd23f', '#7bd88f', '#36c5f0', '#7bd88f', '#ffd23f', '#ff7f11', '#e0283f'];
    t.inSlot(3, () => cols.forEach((c, i) => t.block(0.13, 0.14, 0.02, -0.56 + i * 0.14, 0.95, -0.08, c, 0.1)));
    t.inSlot(3, () => t.block(1.5, 0.22, 0.2, 0, 2.8, -0.15, '#ff4fa3', 0.06));
  },
  /** A scratch-card kiosk: a lit stand of cards and a counter. */
  toyScratchKiosk(t) {
    t.block(1.2, 1.0, 0.6, 0, 0, 0, '#ffd23f', 0.06);
    t.block(1.2, 0.04, 0.65, 0, 1.0, 0, '#ffffff', 0.05);
    t.block(1.1, 0.9, 0.12, 0, 1.04, -0.24, '#1b1d22', 0.05);
    const cols = ['#e0283f', '#36c5f0', '#7bd88f', '#ff4fa3', '#ffd23f', '#9b5de5'];
    for (let i = 0; i < 12; i++) t.block(0.14, 0.2, 0.01, -0.4 + (i % 6) * 0.16, 1.15 + Math.floor(i / 6) * 0.32, -0.17, cols[i % 6], 0.05);
    t.inSlot(3, () => t.block(1.2, 0.2, 0.14, 0, 2.0, -0.24, '#e0283f', 0.06));
  },
  /** A video poker machine: a bar-top cabinet with a big screen and five hold buttons. */
  toyVideoPoker(t) {
    t.block(0.7, 0.95, 0.65, 0, 0, 0, '#1d3557', 0.06);
    t.block(0.7, 0.8, 0.4, 0, 0.95, -0.1, '#1d3557', 0.06);
    screen(t, 0.58, 0.46, 0, 1.08, 0.12, '#0b3d2e', -0.12);
    for (let i = 0; i < 5; i++) t.block(0.08, 0.04, 0.06, -0.2 + i * 0.1, 0.96, 0.28, '#ffd23f', 0.2);
    for (let i = 0; i < 5; i++) t.block(0.08, 0.12, 0.01, -0.2 + i * 0.1, 1.3, 0.16, '#fffdf5', 0.05);
    t.inSlot(3, () => t.block(0.72, 0.16, 0.42, 0, 1.75, -0.1, '#e0283f', 0.06));
  },
  /** A keno board: a big wall of 80 numbers, the drawn ones lit. */
  toyKenoBoard(t) {
    t.block(2.4, 1.3, 0.08, 0, 1.2, 0, '#0b0b16', 0.03);
    for (let i = 0; i < 80; i++) {
      const lit = (i * 37) % 4 === 0;
      if (lit) t.inSlot(3, () => t.block(0.2, 0.1, 0.01, -1.0 + (i % 10) * 0.222, 1.3 + Math.floor(i / 10) * 0.14, 0.05, '#ffd23f', 0.1));
      else t.block(0.2, 0.1, 0.01, -1.0 + (i % 10) * 0.222, 1.3 + Math.floor(i / 10) * 0.14, 0.05, '#2b2d44', 0.1);
    }
    t.inSlot(3, () => t.block(2.4, 0.18, 0.1, 0, 2.5, 0, '#e0283f', 0.05));
  },

  // ============================================================ 🎰 casino
  /** A slot machine: three reels, a lever, lights on top. */
  toySlotMachine(t) {
    t.block(0.7, 1.0, 0.6, 0, 0, 0, '#9d0208', 0.06);
    t.block(0.7, 0.75, 0.45, 0, 1.0, -0.07, '#d00000', 0.06);
    t.inSlot(3, () => t.block(0.56, 0.3, 0.02, 0, 1.25, 0.16, '#fff8e1', 0.05)); // reels window
    for (const [x, c] of [[-0.17, '#e0283f'], [0, GOLD], [0.17, '#2a9d8f']] as [number, string][]) t.block(0.12, 0.14, 0.02, x, 1.33, 0.17, c, 0.2);
    t.block(0.74, 0.18, 0.5, 0, 1.75, -0.07, GOLD, 0.06);
    t.inSlot(3, () => { for (let i = 0; i < 5; i++) t.sphere(0.04, -0.28 + i * 0.14, 1.95, 0.15, ['#ffd23f', '#fff', '#ff4fa3', '#fff', '#ffd23f'][i]); });
    t.cyl(0.02, 0.02, 0.45, 0.4, 1.05, 0, STEEL, 6); // lever
    t.sphere(0.07, 0.4, 1.52, 0, '#e0283f');
    t.block(0.6, 0.06, 0.25, 0, 0.95, 0.25, INK, 0.05);
  },
  /** Blackjack table: half-moon felt, chip rack, cards. */
  toyBlackjackTable(t) {
    t.cyl(0.08, 0.12, 0.72, 0, 0, 0, INK, 10);
    t.add(new THREE.CylinderGeometry(1.1, 1.1, 0.08, 24, 1, false, -Math.PI / 2, Math.PI).translate(0, 0.76, 0), FELT);
    t.add(new THREE.TorusGeometry(1.1, 0.06, 6, 24, Math.PI).rotateX(-Math.PI / 2).rotateY(Math.PI).translate(0, 0.8, 0), WOOD_DK);
    t.block(2.2, 0.08, 0.16, 0, 0.76, -0.04, WOOD_DK, 0.2);
    t.block(0.5, 0.06, 0.12, 0, 0.84, 0.06, '#2b2d33', 0.2); // chip rack
    for (let i = 0; i < 6; i++) t.cyl(0.03, 0.03, 0.04, -0.2 + i * 0.08, 0.86, 0.06, ['#e0283f', '#36c5f0', '#fff', GOLD, '#111', '#7bd88f'][i], 10);
    for (const [x, z] of [[-0.5, 0.5], [0, 0.65], [0.5, 0.5]]) {
      t.block(0.12, 0.01, 0.17, x - 0.04, 0.81, z, '#fffdf5', 0.05);
      t.block(0.12, 0.01, 0.17, x + 0.05, 0.815, z + 0.02, '#fffdf5', 0.05);
    }
  },
  /** Roulette: the wheel set into a long table with the betting layout. */
  toyRouletteTable(t) {
    t.block(2.4, 0.75, 1.1, 0, 0, 0, WOOD_DK, 0.06);
    t.block(2.3, 0.04, 1.0, 0, 0.75, 0, FELT, 0.05);
    // Betting grid.
    for (let i = 0; i < 12; i++) for (let j = 0; j < 3; j++) t.block(0.11, 0.01, 0.2, -0.1 + i * 0.11, 0.79, -0.25 + j * 0.24, (i + j) % 2 ? '#c1272d' : '#1b1d22', 0.05);
    // The wheel.
    t.cyl(0.42, 0.42, 0.14, -0.78, 0.75, 0, WOOD, 28);
    t.cyl(0.36, 0.33, 0.06, -0.78, 0.84, 0, '#1b1d22', 37);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      t.block(0.07, 0.01, 0.07, -0.78 + Math.cos(a) * 0.3, 0.9, Math.sin(a) * 0.3, k % 2 ? '#c1272d' : '#1b1d22', 0.1);
    }
    t.cyl(0.08, 0.1, 0.12, -0.78, 0.88, 0, GOLD, 12);
    t.sphere(0.025, -0.48, 0.92, 0.1, '#fff');
  },
  /** The Rocket game: a big screen with a climbing curve and the rocket. */
  toyRocketScreen(t) {
    t.block(0.2, 2.2, 0.2, -1.1, 0, -0.2, INK, 0.1);
    t.block(0.2, 2.2, 0.2, 1.1, 0, -0.2, INK, 0.1);
    screen(t, 2.4, 1.4, 0, 1.3, -0.2, '#0d1030');
    t.inSlot(3, () => { for (let i = 0; i < 8; i++) t.block(0.24, 0.05, 0.02, -0.9 + i * 0.26, 1.5 + (i * i) * 0.018, -0.15, '#36c46b', 0.2); }); // the curve
    t.block(0.16, 0.16, 0.02, 0.95, 2.4, -0.14, '#ff4fa3', 0.3); // the rocket
    t.block(1.0, 0.7, 0.5, 0, 0, 0.3, '#2b2d33', 0.06); // betting podium
    t.block(0.8, 0.04, 0.4, 0, 0.7, 0.3, '#ffd23f', 0.1);
  },
  /** The cashier cage: brass bars and a window. */
  toyCashierCage(t) {
    t.block(2.2, 1.0, 0.7, 0, 0, 0, WOOD_DK, 0.06);
    t.block(2.2, 0.05, 0.75, 0, 1.0, 0, '#e9d8a6', 0.05);
    for (let i = 0; i < 12; i++) t.cyl(0.015, 0.015, 1.2, -1.05 + i * 0.19, 1.05, 0.2, GOLD, 6);
    t.block(2.2, 0.12, 0.1, 0, 2.25, 0.2, GOLD, 0.05);
    t.block(0.7, 0.18, 0.02, 0, 2.45, 0.24, '#c1272d', 0.1); // CASHIER sign
    for (let i = 0; i < 4; i++) t.cyl(0.05, 0.05, 0.12 + i * 0.03, -0.6 + i * 0.12, 1.05, -0.1, ['#e0283f', '#36c5f0', '#111', GOLD][i], 12); // chip stacks
  },
  /** A crystal chandelier (decor). */
  toyChandelier(t) {
    t.cyl(0.01, 0.01, 0.6, 0, 2.4, 0, GOLD, 4);
    t.cyl(0.5, 0.3, 0.12, 0, 2.3, 0, GOLD, 16);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      t.add(new THREE.OctahedronGeometry(0.06).translate(Math.cos(a) * 0.45, 2.15, Math.sin(a) * 0.45), '#e0f4ff');
    }
    t.add(new THREE.OctahedronGeometry(0.12).translate(0, 2.05, 0), '#e0f4ff');
  },

  // ============================================================== 🌳 park
  /** A green park bench with iron legs. */
  toyParkBench(t) {
    for (const x of [-0.7, 0.7]) t.block(0.08, 0.45, 0.5, x, 0, 0, INK, 0.2);
    for (let i = 0; i < 3; i++) t.block(1.6, 0.05, 0.14, 0, 0.45, -0.15 + i * 0.16, '#2d6a4f', 0.2);
    for (let i = 0; i < 2; i++) t.block(1.6, 0.12, 0.04, 0, 0.62 + i * 0.16, -0.27, '#2d6a4f', 0.2);
  },
  /** A round pond with lily pads (ducks swim on it: world/venue-life.ts). */
  toyPond(t) {
    t.cyl(1.9, 2.0, 0.12, 0, 0, 0, '#8a817c', 32); // stone rim
    t.cyl(1.75, 1.75, 0.04, 0, 0.09, 0, '#4ea8de', 32);
    for (const [x, z] of [[0.8, 0.5], [-0.6, -0.9], [-1.1, 0.4]]) t.cyl(0.18, 0.18, 0.01, x, 0.13, z, '#52b788', 10);
    t.sphere(0.05, 0.85, 0.16, 0.5, '#ff8fab'); // a lily
  },
  /** A leafy tree. */
  toyParkTree(t) {
    t.cyl(0.14, 0.2, 1.4, 0, 0, 0, '#6b4527', 10);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      t.add(new THREE.IcosahedronGeometry(0.6 + (i % 2) * 0.15, 0).translate(Math.cos(a) * 0.45, 1.8 + (i % 3) * 0.3, Math.sin(a) * 0.45), LEAF[i % 3]);
    }
    t.add(new THREE.IcosahedronGeometry(0.7, 0).translate(0, 2.4, 0), LEAF[1]);
  },
  /** An old-fashioned park lamp. */
  toyParkLamp(t) {
    t.cyl(0.12, 0.16, 0.2, 0, 0, 0, INK, 10);
    t.cyl(0.04, 0.05, 2.4, 0, 0.2, 0, INK, 8);
    t.cyl(0.16, 0.1, 0.3, 0, 2.6, 0, INK, 10);
    t.cyl(0.13, 0.13, 0.22, 0, 2.42, 0, '#fff3b0', 10);
  },
  /** Ice cream cart with an umbrella. */
  toyIceCreamCart(t) {
    t.block(1.2, 0.8, 0.6, 0, 0.2, 0, '#f1f1f1', 0.08);
    t.block(1.2, 0.2, 0.62, 0, 0.55, 0, '#ff8fab', 0.08);
    for (const x of [-0.45, 0.45]) t.cyl(0.18, 0.18, 0.06, x, 0.18, 0.32, INK, 14);
    t.cyl(0.02, 0.02, 1.4, 0.3, 1.0, 0, STEEL, 6);
    t.add(new THREE.ConeGeometry(0.8, 0.35, 8).translate(0.3, 2.55, 0), '#ffd23f');
    t.sphere(0.08, -0.3, 1.08, 0.1, '#ffd6e0');
    t.add(new THREE.ConeGeometry(0.05, 0.14, 8).rotateX(Math.PI).translate(-0.3, 0.97, 0.1), '#e9b872');
  },
  /** A soft lawn patch to lie on (flat: walk over it). */
  toyLawn(t) {
    t.block(3.2, 0.03, 2.4, 0, 0, 0, GRASS, 0.3);
    for (let i = 0; i < 9; i++) t.sphere(0.04, -1.3 + Math.random() * 2.6, 0.05, -1 + Math.random() * 2, ['#fff', '#ffd23f', '#ff8fab'][i % 3]);
    t.block(0.9, 0.02, 0.7, 0.6, 0.03, 0.3, '#e63946', 0.2); // a picnic blanket
  },
  /** A stone chess table with two stools. */
  toyChessTable(t) {
    t.cyl(0.1, 0.16, 0.7, 0, 0, 0, '#9a8c98', 10);
    t.cyl(0.45, 0.45, 0.06, 0, 0.7, 0, '#c9c3bc', 16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) t.block(0.12, 0.01, 0.12, -0.18 + i * 0.12, 0.76, -0.18 + j * 0.12, (i + j) % 2 ? INK : '#f1ede4', 0.05);
    for (const z of [-0.6, 0.6]) t.cyl(0.16, 0.16, 0.45, 0, 0, z, '#9a8c98', 10);
  },
  /** A fountain with an angel on top (water bubbles: venue-life steam). */
  toyFountain(t) {
    t.cyl(1.3, 1.35, 0.4, 0, 0, 0, '#bfb6ad', 28);
    t.cyl(1.15, 1.15, 0.05, 0, 0.36, 0, '#4ea8de', 28);
    t.cyl(0.18, 0.25, 0.9, 0, 0.4, 0, '#bfb6ad', 12);
    t.cyl(0.55, 0.4, 0.12, 0, 1.25, 0, '#bfb6ad', 18);
    t.cyl(0.08, 0.1, 0.5, 0, 1.35, 0, '#a8a29e', 8);
    t.sphere(0.12, 0, 1.95, 0, '#a8a29e');
    t.add(new THREE.ConeGeometry(0.35, 0.12, 3).rotateZ(Math.PI / 2).translate(0, 1.9, -0.05), '#a8a29e'); // wings
  },

  // ======================================================== 🛋️ club section
  /** A reserved VIP section: a big curved sofa, a low table and a RESERVED sign. */
  toySectionSofa(t) {
    t.add(new THREE.TorusGeometry(1.4, 0.32, 8, 24, Math.PI).rotateX(-Math.PI / 2).scale(1, 1, 0.85).translate(0, 0.32, 0.2), '#3c096c');
    t.add(new THREE.TorusGeometry(1.4, 0.12, 6, 24, Math.PI).rotateX(-Math.PI / 2).scale(1, 1, 0.85).translate(0, 0.66, 0.2), '#7b2cbf');
    t.cyl(0.6, 0.6, 0.06, 0, 0.45, 0.7, '#e0aaff', 22);
    t.cyl(0.08, 0.12, 0.45, 0, 0, 0.7, INK, 8);
    t.cyl(0.14, 0.11, 0.16, 0.2, 0.5, 0.75, STEEL, 12); // ice bucket
    t.cyl(0.035, 0.045, 0.3, 0.2, 0.55, 0.75, '#2d6a4f', 8);
    t.block(0.36, 0.14, 0.04, -0.25, 0.51, 0.8, GOLD, 0.2); // RESERVED
  },
};

/** Decor that hangs (none on walls; the chandelier hangs from the ceiling at its own height). */
export const FUN_ON_WALL: string[] = [];
