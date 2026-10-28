// =====================================================================
// furniture-town.ts — pieces for eating out, shopping, the research
// centre, the Chess House, 🎳 the bowling alley, 🎬 the cinema, ⛳
// rooftop mini golf and 🪓 the axe lanes (Peter, 2026-10-28).
//
// Same toy kit and conventions as furniture-work.ts: metres, centred on
// the footprint, sitting on y = 0, the front faces +z. Slot 3 glows.
// =====================================================================

import * as THREE from 'three';
import type { Toy } from './landmarks/toy.ts';

const INK = '#1b1d22';
const STEEL = '#b8bec7';
const DARK = '#3a3f4b';
const BRICK = '#a4462f';
const WOOD = '#8a5a34';
const WOOD_LT = '#c99a63';
const WOOD_DK = '#5c3a21';
const GLASS = '#cfe8f3';

function glow(t: Toy, w: number, h: number, x: number, y: number, z: number, color: string, d = 0.01): void {
  t.inSlot(3, () => t.add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
}
function barX(t: Toy, len: number, x: number, y: number, z: number, r = 0.02, color = STEEL): void {
  t.add(new THREE.CylinderGeometry(r, r, len, 8).rotateZ(Math.PI / 2).translate(x, y, z), color);
}
/** A little pizza (flat disc with toppings). */
function pie(t: Toy, r: number, x: number, y: number, z: number): void {
  t.cyl(r, r, 0.03, x, y, z, '#e9b872', 18);
  t.cyl(r * 0.88, r * 0.88, 0.01, x, y + 0.03, z, '#d62828', 18);
  t.cyl(r * 0.82, r * 0.82, 0.01, x, y + 0.04, z, '#ffe8a3', 18);
  for (let i = 0; i < 5; i++) { const a = i * 1.25; t.cyl(r * 0.12, r * 0.12, 0.012, x + Math.cos(a) * r * 0.5, y + 0.05, z + Math.sin(a) * r * 0.5, '#9d0208', 8); }
}
/** One pin, standing (a slim white skittle with a red stripe). */
function pin(t: Toy, x: number, y: number, z: number, s = 1): void {
  t.add(new THREE.CylinderGeometry(0.03 * s, 0.05 * s, 0.22 * s, 8).translate(x, y + 0.11 * s, z), '#fbfbf7');
  t.sphere(0.035 * s, x, y + 0.26 * s, z, '#fbfbf7');
  t.cyl(0.032 * s, 0.032 * s, 0.02 * s, x, y + 0.2 * s, z, '#d62828', 8);
}

/** A shop clothes rail with hangers (the thrift's racks). */
function rail(t: Toy): void {
  for (const x of [-0.8, 0.8]) t.block(0.05, 1.5, 0.4, x, 0, 0, STEEL, 0.3);
  barX(t, 1.7, 0, 1.45, 0);
  const c = ['#e63946', '#f1faee', '#457b9d', '#ffb703', '#8338ec', '#06d6a0', '#3d405b', '#f4a261'];
  for (let i = 0; i < 12; i++) t.block(0.08, 0.75, 0.42, -0.7 + i * 0.125, 0.65, 0, c[i % c.length], 0.2);
}

export const TOWN_TOYS: Record<string, (t: Toy) => void> = {
  // ============================================================ 🍝 eating out
  /** A brick wood-fired pizza oven with a glowing mouth. */
  toyPizzaOven(t) {
    t.block(1.8, 0.9, 1.5, 0, 0, 0, BRICK, 0.06);
    t.add(new THREE.SphereGeometry(0.85, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.8, 0.85).translate(0, 0.9, -0.05), '#b5563c');
    t.block(0.7, 0.45, 0.1, 0, 0.95, 0.66, INK, 0.3);
    glow(t, 0.56, 0.32, 0, 1.12, 0.72, '#ff7b00', 0.02);
    t.cyl(0.14, 0.18, 0.9, 0.45, 1.4, -0.3, BRICK, 10);
    t.block(1.6, 0.06, 0.4, 0, 0.88, 0.8, '#d6ccc2', 0.2); // ledge
    t.block(0.08, 0.02, 1.0, -0.6, 0.94, 0.95, WOOD_LT, 0.3); // a peel
  },
  /** A glass pizza counter with pies on display and a register. */
  toyPizzaCounter(t) {
    t.block(2.6, 0.9, 0.8, 0, 0, 0, '#f1faee', 0.05);
    t.block(2.6, 0.12, 0.82, 0, 0.3, 0, '#d62828', 0.2);
    t.block(2.5, 0.35, 0.7, 0, 0.9, 0, GLASS, 0.05);
    for (const x of [-0.85, 0, 0.85]) pie(t, 0.28, x, 0.94, 0);
    t.block(0.36, 0.25, 0.3, 1.05, 1.25, -0.15, INK, 0.2);
    glow(t, 0.3, 0.12, 1.05, 1.42, 0.0, '#9ef01a');
  },
  /** A soul-food steam table: trays of greens, mac, yams and fried chicken under a sneeze guard. */
  toySteamTable(t) {
    t.block(2.8, 0.9, 0.8, 0, 0, 0, STEEL, 0.05);
    const food = ['#2d6a4f', '#ffb703', '#e76f51', '#9c6644', '#bc6c25', '#ffd166'];
    for (let i = 0; i < 6; i++) t.block(0.4, 0.06, 0.5, -1.1 + i * 0.44, 0.9, 0, food[i], 0.3);
    t.add(new THREE.BoxGeometry(2.7, 0.02, 0.5).rotateX(-0.6).translate(0, 1.3, 0.22), GLASS);
    glow(t, 2.6, 0.04, 0, 1.55, -0.1, '#ffbe0b', 0.08);
    for (const x of [-1.3, 1.3]) t.block(0.04, 0.7, 0.04, x, 0.9, -0.1, STEEL, 0.3);
  },
  /** A red-check trattoria table for four with a candle in a bottle. */
  toyTrattoriaTable(t) {
    t.block(1.1, 0.05, 0.9, 0, 0.72, 0, '#f8f9fa', 0.2);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) if ((i + j) % 2) t.block(0.18, 0.005, 0.18, -0.45 + i * 0.18, 0.775, -0.36 + j * 0.18, '#d62828', 0.1);
    for (const [x, z] of [[-0.48, -0.38], [0.48, -0.38], [-0.48, 0.38], [0.48, 0.38]]) t.block(0.05, 0.72, 0.05, x, 0, z, WOOD_DK, 0.3);
    t.cyl(0.04, 0.05, 0.18, 0, 0.775, 0, '#2d6a4f', 8).cyl(0.012, 0.012, 0.08, 0, 0.955, 0, '#fff3b0', 6);
    glow(t, 0.02, 0.03, 0, 1.05, 0, '#ffb703', 0.02);
    for (const [x, z] of [[-0.3, -0.75], [0.3, -0.75], [-0.3, 0.75], [0.3, 0.75]]) {
      t.block(0.4, 0.05, 0.4, x, 0.45, z, WOOD, 0.3).block(0.4, 0.45, 0.04, x, 0.5, z + (z > 0 ? 0.18 : -0.18), WOOD, 0.3);
      for (const dx of [-0.16, 0.16]) t.block(0.035, 0.45, 0.035, x + dx, 0, z, WOOD_DK, 0.3);
    }
  },
  /** A wall of wine bottles in a dark wood rack. */
  toyWineWall(t) {
    t.block(2.4, 2.2, 0.4, 0, 0, 0, WOOD_DK, 0.04);
    for (let r = 0; r < 7; r++) for (let c = 0; c < 10; c++) {
      t.add(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6).rotateX(Math.PI / 2).translate(-1.0 + c * 0.22, 0.25 + r * 0.28, 0.08), ['#3c1518', '#6a040f', '#ffe8a3', '#2d6a4f'][(r * 3 + c) % 4]);
    }
    glow(t, 2.3, 0.03, 0, 2.15, 0.21, '#ffd6a5', 0.03);
  },
  /** A host stand with a little lamp and the reservations book. */
  toyHostStand(t) {
    t.block(0.7, 1.05, 0.45, 0, 0, 0, WOOD_DK, 0.08);
    t.block(0.75, 0.04, 0.5, 0, 1.05, 0, '#d4a373', 0.3);
    t.block(0.35, 0.03, 0.25, -0.1, 1.09, 0.05, '#f8f9fa', 0.3);
    t.cyl(0.015, 0.015, 0.25, 0.25, 1.09, -0.1, '#b08d57', 6).cyl(0.08, 0.05, 0.08, 0.25, 1.34, -0.1, '#b08d57', 10);
    glow(t, 0.08, 0.04, 0.25, 1.33, -0.1, '#fff3b0', 0.08);
  },
  /** An open-kitchen pass: steel counter, heat lamps, plates waiting. */
  toyChefPass(t) {
    t.block(3.0, 1.0, 0.7, 0, 0, 0, STEEL, 0.04);
    t.block(3.1, 0.05, 0.75, 0, 1.0, 0, '#e9ecef', 0.2);
    for (let i = 0; i < 5; i++) {
      const x = -1.2 + i * 0.6;
      t.cyl(0.13, 0.13, 0.02, x, 1.05, 0.05, '#ffffff', 16).sphere(0.04, x, 1.09, 0.05, ['#e76f51', '#2a9d8f', '#f4a261', '#9d0208', '#80b918'][i]);
      t.cyl(0.01, 0.01, 0.55, x, 1.25, -0.25, INK, 6);
      t.cyl(0.12, 0.06, 0.12, x, 1.75, -0.25, INK, 10);
      glow(t, 0.16, 0.02, x, 1.74, -0.25, '#ff4800', 0.16);
    }
    barX(t, 3.0, 0, 1.85, -0.25, 0.02, INK);
  },
  /** A white-tablecloth table for two with candles and wine glasses. */
  toyFineTable(t) {
    t.cyl(0.55, 0.55, 0.04, 0, 0.74, 0, '#ffffff', 22);
    t.cyl(0.57, 0.62, 0.6, 0, 0.14, 0, '#f8f9fa', 22);
    t.cyl(0.06, 0.08, 0.14, 0, 0, 0, INK, 10);
    for (const z of [-0.25, 0.25]) {
      t.cyl(0.11, 0.11, 0.01, 0, 0.78, z, '#ffffff', 14);
      t.cyl(0.03, 0.01, 0.12, 0.2, 0.78, z * 0.6, GLASS, 8);
    }
    t.cyl(0.015, 0.015, 0.14, -0.08, 0.78, 0, '#fff3b0', 6);
    glow(t, 0.02, 0.04, -0.08, 0.94, 0, '#ffb703', 0.02);
    for (const z of [-0.8, 0.8]) {
      t.block(0.46, 0.06, 0.44, 0, 0.45, z, '#3c1518', 0.3);
      t.block(0.46, 0.55, 0.06, 0, 0.5, z + (z > 0 ? 0.2 : -0.2), '#3c1518', 0.3);
      for (const dx of [-0.18, 0.18]) t.block(0.04, 0.45, 0.04, dx, 0, z, INK, 0.3);
    }
  },
  /** A bakery case: three shelves of pastries behind curved glass. */
  toyPastryCase(t) {
    t.block(2.2, 0.85, 0.75, 0, 0, 0, '#f1e3c8', 0.06);
    t.block(2.2, 0.6, 0.7, 0, 0.85, 0, GLASS, 0.05);
    const c = ['#e9c46a', '#f4a261', '#ffafcc', '#bc6c25', '#ffffff', '#e76f51'];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) t.add(new THREE.SphereGeometry(0.08, 8, 6).scale(1.3, 0.7, 1).translate(-0.9 + i * 0.3, 0.95 + r * 0.25, 0), c[(i + r * 2) % c.length]);
    glow(t, 2.1, 0.02, 0, 1.44, 0, '#fff3b0', 0.6);
  },
  /** A chalkboard menu on the wall. */
  toyMenuBoard(t) {
    t.block(2.0, 1.0, 0.06, 0, 1.4, 0, WOOD_DK, 0.1);
    t.block(1.88, 0.88, 0.01, 0, 1.46, 0.035, '#22333b', 0.1);
    for (let i = 0; i < 6; i++) t.block(0.6 + (i % 3) * 0.2, 0.04, 0.005, -0.4, 1.78 - i * 0.12, 0.04, '#f8f9fa', 0.3).block(0.18, 0.04, 0.005, 0.65, 1.78 - i * 0.12, 0.04, '#ffd166', 0.3);
  },

  // ================================================================ 👕 shops
  toyShopRail(t) {
    rail(t);
  },
  /** Bargain bins piled with clothes. */
  toyBargainBin(t) {
    t.block(1.6, 0.7, 0.9, 0, 0, 0, '#2a9d8f', 0.06);
    const c = ['#e63946', '#f1faee', '#457b9d', '#ffb703', '#8338ec', '#06d6a0'];
    for (let i = 0; i < 14; i++) t.add(new THREE.BoxGeometry(0.3, 0.08, 0.22).rotateY(i * 0.7).translate(-0.6 + (i % 5) * 0.3, 0.72 + Math.floor(i / 5) * 0.05, -0.25 + ((i * 3) % 4) * 0.17), c[i % c.length]);
    t.block(0.5, 0.25, 0.02, 0, 0.3, 0.46, '#ffd60a', 0.2);
  },
  /** A mannequin wearing a fit. */
  toyMannequin(t) {
    t.cyl(0.2, 0.22, 0.04, 0, 0, 0, INK, 14).cyl(0.02, 0.02, 0.5, 0, 0.04, 0, STEEL, 6);
    t.add(new THREE.CylinderGeometry(0.12, 0.1, 0.45, 10).translate(0, 0.75, 0), '#264653'); // trousers
    t.add(new THREE.CylinderGeometry(0.17, 0.14, 0.5, 10).translate(0, 1.2, 0), '#e76f51'); // jacket
    t.sphere(0.1, 0, 1.58, 0, '#f1e3c8');
    for (const s of [-1, 1]) t.add(new THREE.CylinderGeometry(0.045, 0.04, 0.45, 8).rotateZ(s * 0.15).translate(s * 0.21, 1.2, 0), '#e76f51');
  },
  /** Two fitting rooms with curtains and a mirror. */
  toyFittingRooms(t) {
    t.block(2.4, 2.2, 1.2, 0, 0, -0.1, '#f1faee', 0.03);
    for (const x of [-0.6, 0.6]) t.block(1.0, 1.8, 0.04, x, 0.2, 0.5, ['#e63946', '#457b9d'][x < 0 ? 0 : 1], 0.2);
    t.block(2.4, 0.12, 0.1, 0, 2.05, 0.52, WOOD, 0.2);
    t.block(0.4, 0.2, 0.02, 0, 2.25, 0.5, '#ffd60a', 0.2);
  },
  /** A storage unit with its roll-up door half open and junk inside. */
  toyStorageUnit(t) {
    t.block(2.6, 2.4, 2.4, 0, 0, 0, '#adb5bd', 0.02);
    t.block(2.3, 1.1, 0.04, 0, 1.25, 1.2, '#e76f51', 0.05);
    for (let i = 0; i < 6; i++) t.block(2.3, 0.02, 0.05, 0, 1.3 + i * 0.18, 1.22, '#c44536', 0.3);
    t.block(2.3, 1.2, 0.02, 0, 0.05, 1.18, '#22223b', 0.05);
    for (const [x, y, w, h, c] of [[-0.7, 0.05, 0.6, 0.5, '#c9955a'], [-0.7, 0.55, 0.5, 0.4, '#b08968'], [0.1, 0.05, 0.5, 0.8, WOOD], [0.7, 0.05, 0.5, 0.3, '#ffd166']] as [number, number, number, number, string][]) t.block(w, h, 0.5, x, y, 0.8, c, 0.1);
    t.cyl(0.05, 0.05, 0.6, 0.7, 0.35, 0.8, '#e63946', 8); // a lamp, obviously
    t.block(0.2, 0.15, 0.02, 0, 2.2, 1.21, '#212529', 0.2);
  },
  /** An auctioneer's podium with a gavel and a SOLD sign. */
  toyAuctionPodium(t) {
    t.block(0.9, 1.1, 0.6, 0, 0, 0, WOOD_DK, 0.06);
    t.add(new THREE.BoxGeometry(0.95, 0.05, 0.55).rotateX(-0.25).translate(0, 1.15, 0.02), '#d4a373');
    t.add(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8).rotateZ(Math.PI / 2).translate(0.2, 1.24, 0.1), WOOD);
    t.cyl(0.01, 0.01, 0.14, 0.2, 1.1, 0.1, WOOD, 6);
    t.block(0.5, 0.3, 0.03, -0.1, 0.5, 0.31, '#d62828', 0.2);
  },
  /** Rows of folding chairs for the bidders. */
  toyBidderChairs(t) {
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
      const x = -0.9 + i * 0.6, z = r * 0.8;
      t.block(0.42, 0.04, 0.4, x, 0.44, z, '#495057', 0.3);
      t.block(0.42, 0.4, 0.04, x, 0.48, z - 0.18, '#495057', 0.3);
      for (const dx of [-0.18, 0.18]) t.block(0.03, 0.44, 0.03, x + dx, 0, z, INK, 0.3);
    }
    t.block(0.2, 0.12, 0.02, -0.3, 0.75, 0.8, '#ffd166', 0.2); // a paddle
  },

  // ======================================================= 🧪 research centre
  /** A lab bench with a microscope, beakers and a centrifuge. */
  toyLabBench(t) {
    t.block(2.4, 0.9, 0.75, 0, 0, 0, '#e9ecef', 0.05).block(2.5, 0.05, 0.8, 0, 0.9, 0, INK, 0.2);
    t.block(0.2, 0.05, 0.3, -0.8, 0.95, 0, '#495057', 0.2).cyl(0.04, 0.04, 0.35, -0.8, 1.0, -0.05, '#495057', 8);
    for (const [x, c] of [[-0.2, '#06d6a0'], [0.0, '#ef476f'], [0.2, '#118ab2']] as [number, string][]) { t.cyl(0.06, 0.07, 0.2, x, 0.95, 0.1, GLASS, 10); t.cyl(0.055, 0.065, 0.1, x, 0.95, 0.1, c, 10); }
    t.cyl(0.18, 0.2, 0.25, 0.8, 0.95, -0.05, '#f8f9fa', 16);
    glow(t, 0.1, 0.05, 0.8, 1.1, 0.14, '#80ed99');
  },
  /** An exam chair with a monitor on a stand. */
  toyExamChair(t) {
    t.block(0.7, 0.45, 1.6, 0, 0, 0, '#adb5bd', 0.2);
    t.add(new THREE.BoxGeometry(0.66, 0.1, 0.9).rotateX(0.5).translate(0, 0.75, -0.45), '#90e0ef');
    t.block(0.66, 0.1, 0.9, 0, 0.45, 0.35, '#90e0ef', 0.4);
    t.cyl(0.03, 0.03, 1.3, 0.55, 0, -0.6, STEEL, 6);
    t.block(0.35, 0.25, 0.04, 0.55, 1.3, -0.6, INK, 0.2);
    glow(t, 0.3, 0.2, 0.55, 1.42, -0.575, '#72efdd', 0.02);
  },

  // ============================================================ ♟️ chess
  /** A wooden chess table with a clock and two chairs. */
  toyChessTableWood(t) {
    t.block(0.9, 0.05, 0.9, 0, 0.72, 0, WOOD, 0.2);
    for (const [x, z] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) t.block(0.06, 0.72, 0.06, x, 0, z, WOOD_DK, 0.3);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) t.block(0.08, 0.005, 0.08, -0.28 + i * 0.08, 0.77, -0.28 + j * 0.08, (i + j) % 2 ? '#3a2618' : '#e9d8a6', 0.1);
    for (let i = 0; i < 6; i++) t.cyl(0.02, 0.025, 0.07, -0.2 + i * 0.08, 0.775, -0.24, '#f8f9fa', 6).cyl(0.02, 0.025, 0.07, -0.2 + i * 0.08, 0.775, 0.24, INK, 6);
    t.block(0.22, 0.1, 0.08, 0.36, 0.77, 0, WOOD_DK, 0.2); // clock
    for (const z of [-0.75, 0.75]) {
      t.block(0.42, 0.05, 0.4, 0, 0.45, z, WOOD_DK, 0.3).block(0.42, 0.45, 0.04, 0, 0.5, z + (z > 0 ? 0.18 : -0.18), WOOD_DK, 0.3);
      for (const dx of [-0.17, 0.17]) t.block(0.04, 0.45, 0.04, dx, 0, z, INK, 0.3);
    }
  },
  /** A glass case of chess sets for sale. */
  toyChessCase(t) {
    t.block(1.8, 0.9, 0.6, 0, 0, 0, WOOD_DK, 0.05).block(1.8, 0.4, 0.55, 0, 0.9, 0, GLASS, 0.05);
    for (let i = 0; i < 3; i++) {
      const x = -0.55 + i * 0.55;
      t.block(0.42, 0.03, 0.42, x, 0.92, 0, i % 2 ? '#e9d8a6' : '#3a2618', 0.2);
      t.cyl(0.03, 0.04, 0.14, x - 0.08, 0.95, 0, '#f8f9fa', 6).cyl(0.03, 0.04, 0.18, x + 0.08, 0.95, 0, INK, 6);
    }
    glow(t, 1.7, 0.02, 0, 1.28, 0, '#fff3b0', 0.5);
  },

  // ============================================================ 🎳 bowling
  /** A bowling lane: approach, glossy boards with arrows, gutters, ten pins and the pinsetter hood. */
  toyBowlingLane(t) {
    const L = 12, W = 1.1;
    t.block(W, 0.06, L, 0, 0, 0, '#d9a066', 0.02);
    for (let i = 0; i < 6; i++) t.block(0.005, 0.005, L, -0.45 + i * 0.18, 0.06, 0, '#c58b55', 0.3);
    for (const s of [-1, 1]) t.block(0.18, 0.04, L, s * (W / 2 + 0.09), 0, 0, '#3a3f4b', 0.2); // gutters
    for (let i = 0; i < 5; i++) t.add(new THREE.ConeGeometry(0.04, 0.12, 3).rotateX(-Math.PI / 2).translate(-0.4 + i * 0.2, 0.065, 2.4 - Math.abs(i - 2) * 0.15), '#7b2cbf');
    t.block(W, 0.005, 0.03, 0, 0.065, 4.5, '#1b1d22', 0.3); // foul line
    // Pins (a triangle at the far end), and the pinsetter hood with a glowing strip.
    const z0 = -L / 2 + 0.7;
    for (let r = 0; r < 4; r++) for (let k = 0; k <= r; k++) pin(t, (k - r / 2) * 0.22, 0.06, z0 + 0.5 - r * 0.19, 1.2);
    t.block(W + 0.4, 0.5, 1.2, 0, 0.9, z0 - 0.2, '#22223b', 0.06);
    glow(t, W + 0.3, 0.12, 0, 1.05, z0 + 0.41, '#c77dff', 0.02);
    t.block(W + 0.4, 1.4, 0.1, 0, 0, z0 - 0.75, '#22223b', 0.04);
  },
  /** A ball return between two lanes, with three balls. */
  toyBallReturn(t) {
    t.block(0.5, 0.5, 1.4, 0, 0, 0, '#3a0ca3', 0.1);
    t.add(new THREE.TorusGeometry(0.25, 0.05, 8, 16, Math.PI).rotateY(Math.PI / 2).translate(0, 0.5, 0), '#4361ee');
    for (const [z, c] of [[-0.35, '#f72585'], [0, '#4cc9f0'], [0.35, '#ffd60a']] as [number, string][]) t.sphere(0.11, 0, 0.62, z, c);
  },
  /** A rack of house balls in every colour. */
  toyBallRack(t) {
    t.block(1.6, 0.06, 0.4, 0, 0.4, 0, DARK, 0.2).block(1.6, 0.06, 0.4, 0, 0.9, 0, DARK, 0.2);
    for (const x of [-0.78, 0.78]) t.block(0.05, 1.1, 0.4, x, 0, 0, INK, 0.2);
    const c = ['#f72585', '#7209b7', '#3a0ca3', '#4361ee', '#4cc9f0', '#06d6a0', '#ffd60a', '#ef476f'];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) t.sphere(0.11, -0.62 + i * 0.25, 0.57 + r * 0.5, 0, c[(i + r * 3) % c.length]);
  },
  /** The shoe counter: cubbies of rental shoes and a register. */
  toyShoeCounter(t) {
    t.block(2.6, 1.0, 0.7, 0, 0, 0.4, '#7209b7', 0.05).block(2.7, 0.05, 0.8, 0, 1.0, 0.4, INK, 0.2);
    t.block(2.6, 2.1, 0.4, 0, 0, -0.4, WOOD_DK, 0.03);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) t.block(0.3, 0.12, 0.25, -1.05 + i * 0.42, 0.3 + r * 0.42, -0.25, ['#e63946', '#457b9d', '#ffd166'][(r + i) % 3], 0.3);
    t.block(0.35, 0.22, 0.3, 0.9, 1.05, 0.4, INK, 0.2);
    glow(t, 2.5, 0.06, 0, 0.6, 0.76, '#c77dff', 0.02);
  },
  /** A curved seating pod behind the lanes with a little table. */
  toyBowlingSeats(t) {
    t.add(new THREE.TorusGeometry(0.9, 0.22, 8, 18, Math.PI).rotateX(-Math.PI / 2).translate(0, 0.25, 0.25), '#f72585');
    t.add(new THREE.TorusGeometry(0.9, 0.1, 6, 18, Math.PI).rotateX(-Math.PI / 2).translate(0, 0.55, 0.25), '#b5179e');
    t.cyl(0.32, 0.32, 0.05, 0, 0.5, 0.6, '#f8f9fa', 16).cyl(0.06, 0.08, 0.5, 0, 0, 0.6, INK, 8);
  },

  // ============================================================ 🎬 cinema
  /** The big screen with red curtains and a glowing picture (videos play in the phone overlay). */
  toyCinemaScreen(t) {
    t.block(9.4, 4.4, 0.2, 0, 0.5, 0, INK, 0.02);
    glow(t, 8.6, 3.8, 0, 2.7, 0.11, '#9ad1ff', 0.02);
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) t.cyl(0.13, 0.13, 4.7, s * (4.55 + i * 0.12), 0.2, 0.2, i % 2 ? '#9d0208' : '#6a040f', 8);
    t.block(10.2, 0.4, 0.4, 0, 4.9, 0.2, '#9d0208', 0.1);
    t.block(9.6, 0.5, 0.6, 0, 0, 0.4, '#3c1518', 0.05); // stage lip
  },
  /** A row of red cinema seats with cup holders, raked by the riser under it. */
  toyCinemaRow(t) {
    t.block(6.4, 0.25, 1.2, 0, 0, 0, '#3c1518', 0.05);
    for (let i = 0; i < 8; i++) {
      const x = -2.8 + i * 0.8;
      t.block(0.66, 0.12, 0.6, x, 0.6, 0.05, '#c1121f', 0.4);
      t.block(0.66, 0.65, 0.14, x, 0.65, -0.3, '#c1121f', 0.4);
      t.block(0.08, 0.35, 0.6, x + 0.38, 0.4, 0.05, INK, 0.3);
    }
    t.block(6.4, 0.04, 0.04, 0, 0.27, 0.6, '#ffd166', 0.3);
    glow(t, 6.3, 0.02, 0, 0.26, 0.62, '#ffd166', 0.02);
  },
  /** The concession stand: popcorn machine, soda fountain, candy case. */
  toyConcessions(t) {
    t.block(3.2, 1.0, 0.8, 0, 0, 0.2, '#9d0208', 0.05).block(3.3, 0.06, 0.9, 0, 1.0, 0.2, '#ffd166', 0.2);
    t.block(0.7, 0.9, 0.6, -1.1, 1.06, -0.05, '#e63946', 0.08);
    t.block(0.6, 0.6, 0.5, -1.1, 1.2, 0.0, GLASS, 0.05);
    for (let i = 0; i < 18; i++) t.sphere(0.04, -1.32 + (i % 6) * 0.09, 1.25 + Math.floor(i / 6) * 0.06, -0.05 + ((i * 7) % 5) * 0.06, '#fff3b0');
    glow(t, 0.5, 0.04, -1.1, 1.75, 0.0, '#ffd166', 0.4);
    t.block(0.8, 0.8, 0.5, 0.2, 1.06, -0.1, STEEL, 0.06);
    for (let i = 0; i < 4; i++) t.block(0.12, 0.2, 0.06, -0.05 + i * 0.17, 1.4, 0.16, ['#e63946', '#ff9f1c', '#2ec4b6', '#011627'][i], 0.3);
    t.block(0.9, 0.5, 0.6, 1.2, 0.4, 0.3, GLASS, 0.05);
    for (let i = 0; i < 8; i++) t.block(0.15, 0.06, 0.1, 0.9 + (i % 4) * 0.2, 0.5 + Math.floor(i / 4) * 0.15, 0.3, ['#ff006e', '#8338ec', '#ffbe0b', '#3a86ff'][i % 4], 0.3);
    glow(t, 3.0, 0.1, 0, 2.15, -0.05, '#ff4d6d', 0.04);
    t.block(3.2, 0.5, 0.08, 0, 1.95, -0.1, INK, 0.1);
  },
  /** A lit "now showing" poster box. */
  toyPosterBox(t) {
    t.block(1.0, 1.5, 0.12, 0, 0.3, 0, '#b08d57', 0.05);
    glow(t, 0.86, 1.34, 0, 1.05, 0.07, '#ffd6a5', 0.01);
    t.block(0.7, 0.5, 0.005, 0, 1.25, 0.08, '#1d3557', 0.1).block(0.7, 0.12, 0.005, 0, 0.75, 0.08, '#e63946', 0.1);
  },

  // ============================================================ ⛳ mini golf
  /** A putting hole on turf: borders, a cup with a flag, and a themed obstacle (variant by colour). */
  toyGolfHole(t) {
    t.block(4.0, 0.1, 2.2, 0, 0, 0, '#3a5a40', 0.05);
    t.block(3.8, 0.02, 2.0, 0, 0.1, 0, '#57cc99', 0.1);
    for (const [w, d, x, z] of [[4.0, 0.12, 0, -1.04], [4.0, 0.12, 0, 1.04], [0.12, 2.2, -1.94, 0], [0.12, 2.2, 1.94, 0]] as [number, number, number, number][]) t.block(w, 0.12, d, x, 0.1, z, '#f1faee', 0.3);
    t.cyl(0.07, 0.07, 0.01, 1.4, 0.12, 0, INK, 12);
    t.cyl(0.012, 0.012, 0.8, 1.4, 0.12, 0, '#f8f9fa', 6);
    t.add(new THREE.BoxGeometry(0.3, 0.18, 0.01).translate(1.55, 0.83, 0), '#e63946');
    t.sphere(0.04, -1.5, 0.16, 0, '#ffffff');
    // A little yellow cab to bank off.
    t.block(0.5, 0.18, 0.28, 0, 0.12, 0.4, '#ffd60a', 0.3).block(0.28, 0.12, 0.26, -0.03, 0.3, 0.4, '#ffd60a', 0.3);
  },
  /** A hole with a spinning water tower to putt under. */
  toyGolfTower(t) {
    t.block(3.0, 0.1, 3.0, 0, 0, 0, '#3a5a40', 0.05).block(2.8, 0.02, 2.8, 0, 0.1, 0, '#80ed99', 0.1);
    for (const [x, z] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) t.cyl(0.04, 0.04, 1.4, x, 0.1, z, WOOD_DK, 6);
    t.cyl(0.6, 0.6, 0.8, 0, 1.5, 0, '#a47148', 14);
    t.add(new THREE.ConeGeometry(0.66, 0.4, 14).translate(0, 2.5, 0), '#5c3a21');
    for (let i = 0; i < 4; i++) t.cyl(0.62, 0.62, 0.03, 0, 1.6 + i * 0.2, 0, INK, 14);
    t.cyl(0.07, 0.07, 0.01, 1.0, 0.12, 1.0, INK, 12).cyl(0.012, 0.012, 0.8, 1.0, 0.12, 1.0, '#f8f9fa', 6);
    t.add(new THREE.BoxGeometry(0.3, 0.18, 0.01).translate(1.15, 0.83, 1.0), '#3a86ff');
  },
  /** A hole with a little Brooklyn-Bridge-ish arch over the green. */
  toyGolfBridge(t) {
    t.block(4.0, 0.1, 2.2, 0, 0, 0, '#3a5a40', 0.05).block(3.8, 0.02, 2.0, 0, 0.1, 0, '#38b000', 0.1);
    for (const x of [-0.8, 0.8]) {
      t.block(0.3, 1.6, 0.4, x, 0.1, 0, '#b5838d', 0.05);
      t.add(new THREE.BoxGeometry(0.1, 0.5, 0.08).translate(x - 0.06, 1.2, 0), '#22223b').add(new THREE.BoxGeometry(0.1, 0.5, 0.08).translate(x + 0.06, 1.2, 0), '#22223b');
    }
    t.block(2.4, 0.1, 0.6, 0, 0.9, 0, '#6d6875', 0.2);
    for (let i = 0; i < 7; i++) t.add(new THREE.CylinderGeometry(0.008, 0.008, 0.8, 4).rotateZ(0.5 - i * 0.16).translate(-0.6 + i * 0.2, 1.3, 0.25), '#f8f9fa');
    t.cyl(0.07, 0.07, 0.01, 1.5, 0.12, -0.5, INK, 12).cyl(0.012, 0.012, 0.8, 1.5, 0.12, -0.5, '#f8f9fa', 6);
    t.add(new THREE.BoxGeometry(0.3, 0.18, 0.01).translate(1.65, 0.83, -0.5), '#ffbe0b');
  },
  /** The starter hut: putters, coloured balls and the scorecards. */
  toyGolfStarter(t) {
    t.block(2.0, 1.0, 0.8, 0, 0, 0, '#2a9d8f', 0.06).block(2.1, 0.06, 0.9, 0, 1.0, 0, '#f1faee', 0.2);
    for (let i = 0; i < 8; i++) t.add(new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4).rotateZ(0.08).translate(-0.85 + i * 0.07, 1.4, -0.3), STEEL);
    for (let i = 0; i < 8; i++) t.sphere(0.035, 0.3 + (i % 4) * 0.12, 1.08, -0.1 + Math.floor(i / 4) * 0.12, ['#ff006e', '#ffbe0b', '#3a86ff', '#06d6a0'][i % 4]);
    for (const x of [-1.0, 1.0]) t.cyl(0.03, 0.03, 1.6, x, 1.0, -0.35, '#f1faee', 6);
    for (let i = 0; i < 6; i++) t.add(new THREE.ConeGeometry(1.4, 0.5, 6, 1, true, (i / 6) * Math.PI * 2, Math.PI / 3).scale(1, 1, 0.6).translate(0, 2.85, -0.1), i % 2 ? '#2a9d8f' : '#f1faee');
  },

  // ============================================================ 🎨 art parlor
  /** A wooden easel with a canvas mid-painting and a stool. */
  toyEasel(t) {
    for (const s of [-1, 1]) t.add(new THREE.CylinderGeometry(0.025, 0.03, 1.8, 6).rotateZ(s * 0.12).translate(s * 0.28, 0.9, 0.05), WOOD);
    t.add(new THREE.CylinderGeometry(0.025, 0.03, 1.8, 6).rotateX(-0.3).translate(0, 0.86, -0.25), WOOD);
    t.block(0.7, 0.04, 0.12, 0, 0.72, 0.1, WOOD_DK, 0.2);
    t.block(0.66, 0.82, 0.04, 0, 0.76, 0.12, '#fbfbf7', 0.05);
    const c = ['#3a86ff', '#ffbe0b', '#ff006e', '#06d6a0', '#fb5607'];
    for (let i = 0; i < 6; i++) t.block(0.2 + (i % 3) * 0.08, 0.12, 0.005, -0.18 + (i % 2) * 0.2, 0.9 + i * 0.1, 0.145, c[i % c.length], 0.4);
    t.cyl(0.18, 0.18, 0.04, 0, 0.55, 0.75, WOOD_LT, 12).cyl(0.02, 0.02, 0.55, 0, 0, 0.75, INK, 6);
    t.block(0.28, 0.02, 0.18, 0.4, 0.74, 0.18, '#d4a373', 0.3); // palette
    for (let i = 0; i < 4; i++) t.cyl(0.02, 0.02, 0.01, 0.32 + i * 0.05, 0.76, 0.16, c[i], 6);
  },
  /** A big framed gallery wall piece on a stand, lit from above. */
  toyGalleryStand(t) {
    t.block(1.8, 2.0, 0.12, 0, 0, 0, '#f8f9fa', 0.03);
    for (const [x, y, w, h, c] of [[-0.45, 1.15, 0.6, 0.7, '#e76f51'], [0.4, 1.3, 0.5, 0.45, '#2a9d8f'], [0.4, 0.6, 0.5, 0.4, '#e9c46a'], [-0.45, 0.45, 0.6, 0.4, '#264653']] as [number, number, number, number, string][]) {
      t.block(w + 0.06, h + 0.06, 0.03, x, y - 0.03, 0.07, '#b08d57', 0.1);
      t.block(w, h, 0.01, x, y, 0.09, c, 0.1);
    }
    t.block(0.08, 0.06, 0.3, 0, 2.0, 0.12, INK, 0.2);
    glow(t, 1.6, 0.03, 0, 1.95, 0.25, '#fff3b0', 0.02);
  },
  /** A paint-splattered work table with jars of brushes. */
  toyPaintTable(t) {
    t.block(1.8, 0.06, 0.9, 0, 0.78, 0, '#e9ecef', 0.2);
    for (const [x, z] of [[-0.8, -0.38], [0.8, -0.38], [-0.8, 0.38], [0.8, 0.38]]) t.block(0.06, 0.78, 0.06, x, 0, z, WOOD_DK, 0.3);
    const c = ['#ff006e', '#3a86ff', '#ffbe0b', '#06d6a0', '#8338ec', '#fb5607'];
    for (let i = 0; i < 9; i++) t.cyl(0.06 + (i % 3) * 0.03, 0.06 + (i % 3) * 0.03, 0.005, -0.6 + (i % 5) * 0.3, 0.84, -0.25 + Math.floor(i / 5) * 0.4, c[i % c.length], 10);
    for (let i = 0; i < 3; i++) {
      t.cyl(0.06, 0.06, 0.14, -0.5 + i * 0.5, 0.84, 0.2, GLASS, 10);
      for (let k = 0; k < 3; k++) t.cyl(0.008, 0.008, 0.28, -0.52 + i * 0.5 + k * 0.02, 0.9, 0.2, WOOD_LT, 4);
    }
  },

  // ============================================================ 🎣 the pier
  /** The Hudson: a strip of river beyond the pier edge, with a rail along it (walk up to the rail). */
  toyPierRiver(t) {
    t.block(20, 0.02, 4.6, 0, 0, 0, '#2f6690', 0.02);
    t.inSlot(3, () => { for (let i = 0; i < 18; i++) t.block(0.6 + (i % 3) * 0.4, 0.005, 0.04, -9 + i * 1.05, 0.025, -1.6 + ((i * 7) % 5) * 0.7, '#a9d6e5', 0.3); });
    // The rail at the pier's edge (front of the strip).
    for (let i = 0; i <= 20; i++) t.block(0.06, 1.05, 0.06, -10 + i, 0.02, 2.2, '#3d405b', 0.3);
    t.block(20, 0.06, 0.08, 0, 1.05, 2.2, '#3d405b', 0.3).block(20, 0.04, 0.06, 0, 0.6, 2.2, '#3d405b', 0.3);
    // A tug and a sailboat out on the water.
    t.block(1.6, 0.4, 0.6, -5.0, 0.02, -1.0, '#c1121f', 0.2).block(0.6, 0.45, 0.45, -5.3, 0.42, -1.0, '#f8f9fa', 0.2).cyl(0.08, 0.08, 0.4, -5.3, 0.87, -1.0, INK, 8);
    t.block(1.0, 0.18, 0.3, 5.5, 0.02, -1.4, '#f8f9fa', 0.2);
    t.add(new THREE.ConeGeometry(0.4, 1.3, 3).scale(0.2, 1, 1).translate(5.5, 0.85, -1.4), '#f1faee');
  },
  /** A fishing spot at the rail: a rod in a holder, a bucket, a tackle box. */
  toyFishingSpot(t) {
    t.cyl(0.04, 0.04, 0.5, 0, 0, -0.35, '#495057', 6);
    t.add(new THREE.CylinderGeometry(0.012, 0.02, 2.4, 6).rotateX(-0.35).translate(0, 1.4, -0.6), INK);
    t.cyl(0.05, 0.05, 0.06, 0, 0.55, -0.42, STEEL, 10);
    t.cyl(0.15, 0.12, 0.3, 0.35, 0, 0.1, '#ffbe0b', 12).cyl(0.14, 0.14, 0.01, 0.35, 0.28, 0.1, '#4ea8de', 12);
    t.block(0.4, 0.2, 0.22, -0.35, 0, 0.15, '#2a9d8f', 0.2).block(0.42, 0.04, 0.24, -0.35, 0.2, 0.15, '#21867a', 0.2);
    t.cyl(0.16, 0.16, 0.04, 0, 0, 0.35, '#e9ecef', 12); // a folding stool
  },
  /** The bait shack: a little hut with a counter, a derby board and a life ring. */
  toyBaitShack(t) {
    t.block(2.6, 2.3, 1.6, 0, 0, -0.1, '#e9c46a', 0.04);
    t.add(new THREE.ConeGeometry(2.0, 0.7, 4).rotateY(Math.PI / 4).scale(1, 1, 0.65).translate(0, 2.65, -0.1), '#c1121f');
    t.block(2.2, 0.08, 0.5, 0, 1.05, 0.8, WOOD, 0.2).block(2.2, 1.0, 0.1, 0, 0.05, 0.7, WOOD_DK, 0.1);
    t.block(1.8, 0.8, 0.02, 0, 1.15, 0.71, '#22223b', 0.05);
    glow(t, 1.6, 0.04, 0, 2.05, 0.75, '#fff3b0', 0.04);
    t.block(0.9, 0.6, 0.03, 0.75, 1.3, 0.71, '#f8f9fa', 0.1); // derby board
    for (let i = 0; i < 3; i++) t.block(0.6, 0.05, 0.005, 0.75, 1.45 - i * 0.14, 0.73, INK, 0.3);
    t.add(new THREE.TorusGeometry(0.22, 0.07, 8, 18).translate(-1.35, 1.4, 0.4).rotateY(0), '#ff6b35');
    t.cyl(0.25, 0.22, 0.5, -1.0, 0, 1.05, '#3a86ff', 12); // a cooler of bait
  },
  /** A stack of crates and a coil of rope by a bollard. */
  toyBollard(t) {
    t.cyl(0.2, 0.24, 0.5, 0, 0, 0, '#22223b', 12).cyl(0.26, 0.26, 0.08, 0, 0.5, 0, '#22223b', 12);
    t.add(new THREE.TorusGeometry(0.25, 0.05, 6, 16).rotateX(Math.PI / 2).translate(0.55, 0.06, 0.2), '#d4a373');
    t.add(new THREE.TorusGeometry(0.18, 0.05, 6, 16).rotateX(Math.PI / 2).translate(0.55, 0.14, 0.2), '#d4a373');
  },

  // ============================================================ 🪓 axe lanes
  /** An axe-throwing lane: a wooden target in a chain-link cage, a throw line. */
  toyAxeLane(t) {
    t.block(2.2, 0.02, 4.0, 0, 0, 0, '#495057', 0.05);
    t.block(0.2, 0.005, 2.0, 0, 0.02, 1.2, '#ffd60a', 0.3).block(2.0, 0.005, 0.06, 0, 0.02, 1.2, '#ffd60a', 0.3);
    for (const x of [-1.05, 1.05]) t.block(0.04, 2.4, 4.0, x, 0, 0, '#adb5bd', 0.02);
    t.block(2.2, 2.4, 0.1, 0, 0, -1.95, WOOD_DK, 0.02);
    for (let i = 0; i < 6; i++) t.block(0.3, 2.0, 0.05, -0.75 + i * 0.3, 0.2, -1.88, i % 2 ? '#d9a066' : '#c58b55', 0.1);
    for (const [r, c] of [[0.6, '#1d3557'], [0.45, '#f1faee'], [0.3, '#e63946'], [0.15, '#f1faee'], [0.06, '#e63946']] as [number, string][]) t.add(new THREE.CylinderGeometry(r, r, 0.01, 24).rotateX(Math.PI / 2).translate(0, 1.4, -1.84 + (0.6 - r) * 0.01), c);
    for (const x of [-0.55, 0.55]) t.add(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 12).rotateX(Math.PI / 2).translate(x, 1.95, -1.845), '#2a9d8f');
    t.add(new THREE.BoxGeometry(0.04, 0.4, 0.03).rotateZ(0.6).translate(0.2, 1.5, -1.7), WOOD_LT).add(new THREE.BoxGeometry(0.14, 0.1, 0.02).rotateZ(0.6).translate(0.08, 1.38, -1.8), STEEL);
    glow(t, 2.0, 0.04, 0, 2.38, -1.85, '#ff6b35', 0.08);
  },
};

/** Pieces that hang on the wall. */
export const TOWN_ON_WALL: string[] = ['toyMenuBoard'];
