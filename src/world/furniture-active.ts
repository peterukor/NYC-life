// =====================================================================
// furniture-active.ts — 🏋️ the three gyms and 🌳 the new Central Park
// (Peter, 2026-10-28: "3 gyms 1 park (cp)… revamp the parks, make them
// so much nicer fr").
//
// Same toy kit and conventions as furniture-work.ts: metres, centred on
// the footprint, sitting on y = 0, the front faces +z. Slot 3 glows.
// =====================================================================

import * as THREE from 'three';
import type { Toy } from './landmarks/toy.ts';

const INK = '#1b1d22';
const STEEL = '#b8bec7';
const DARK = '#3a3f4b';
const RUBBER = '#2a2c33';
const WATER = '#4ea8de';
const WATER_DK = '#2f7fb8';
const STONE = '#b9b1a6';
const STONE_DK = '#8f877d';
const LEAF = ['#2d6a4f', '#40916c', '#52b788', '#74c69d'];
const BLOSSOM = ['#ffc8dd', '#ffafcc', '#fde2e4'];
const FALL = ['#e76f51', '#f4a261', '#e9c46a'];

/** A barbell plate on its side (axis along x). */
function plate(t: Toy, r: number, x: number, y: number, z: number, color = INK): void {
  t.add(new THREE.CylinderGeometry(r, r, 0.06, 18).rotateZ(Math.PI / 2).translate(x, y, z), color);
}
/** A horizontal bar along x. */
function barX(t: Toy, len: number, x: number, y: number, z: number, r = 0.02, color = STEEL): void {
  t.add(new THREE.CylinderGeometry(r, r, len, 8).rotateZ(Math.PI / 2).translate(x, y, z), color);
}
/** A horizontal bar along z. */
function barZ(t: Toy, len: number, x: number, y: number, z: number, r = 0.02, color = STEEL): void {
  t.add(new THREE.CylinderGeometry(r, r, len, 8).rotateX(Math.PI / 2).translate(x, y, z), color);
}
/** A round rod from point a to point b (posts, chains, slanted legs). */
function rod(t: Toy, a: [number, number, number], b: [number, number, number], r: number, color: string): void {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  t.add(g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), color);
}
/** A little lit console screen. */
function glowPanel(t: Toy, w: number, h: number, x: number, y: number, z: number, color: string, tilt = 0): void {
  t.add(new THREE.BoxGeometry(w + 0.04, h + 0.04, 0.04).rotateX(tilt).translate(x, y, z), INK);
  t.inSlot(3, () => t.add(new THREE.BoxGeometry(w, h, 0.01).rotateX(tilt).translate(x, y, z + 0.025), color));
}
/** A round, leafy crown of icosahedra. */
function crown(t: Toy, x: number, y: number, z: number, size: number, cols: string[]): void {
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9;
    t.add(new THREE.IcosahedronGeometry(size * (0.55 + (i % 3) * 0.12), 0).translate(x + Math.cos(a) * size * 0.45, y + (i % 3) * size * 0.22, z + Math.sin(a) * size * 0.45), cols[i % cols.length]);
  }
  t.add(new THREE.IcosahedronGeometry(size * 0.7, 0).translate(x, y + size * 0.55, z), cols[1 % cols.length]);
}
/** A flat ellipse of water (or grass) at height y. */
function ellipse(t: Toy, rx: number, rz: number, h: number, x: number, y0: number, z: number, color: string, sides = 36): void {
  t.add(new THREE.CylinderGeometry(1, 1, h, sides).scale(rx, 1, rz).translate(x, y0 + h / 2, z), color);
}

export const ACTIVE_TOYS: Record<string, (t: Toy) => void> = {
  // ================================================================ 🏋️ gym
  /** A spin bike: heavy flywheel, saddle, drop bars and a lit cadence screen. */
  toySpinBike(t) {
    t.block(0.5, 0.06, 1.15, 0, 0, 0, RUBBER, 0.2);
    t.add(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 22).rotateZ(Math.PI / 2).translate(0, 0.36, 0.38), '#d7263d');
    t.add(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12).rotateZ(Math.PI / 2).translate(0, 0.36, 0.38), STEEL);
    t.add(new THREE.CylinderGeometry(0.04, 0.05, 0.95, 8).rotateX(0.45).translate(0, 0.55, 0.05), DARK);
    t.add(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8).rotateX(-0.2).translate(0, 0.78, -0.3), DARK);
    t.block(0.2, 0.06, 0.3, 0, 1.02, -0.36, INK, 0.4); // saddle
    t.add(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8).rotateX(0.25).translate(0, 0.85, 0.3), DARK);
    barX(t, 0.5, 0, 1.15, 0.42, 0.025, INK); // bars
    for (const x of [-0.24, 0.24]) barZ(t, 0.25, x, 1.15, 0.52, 0.025, INK);
    glowPanel(t, 0.16, 0.1, 0, 1.22, 0.38, '#36c5f0', -0.5);
  },
  /** A rowing machine: long rail, sliding seat, footplates and the fan housing. */
  toyRowingMachine(t) {
    t.block(0.14, 0.12, 2.3, 0, 0.12, -0.15, STEEL, 0.3); // rail
    t.block(0.5, 0.12, 0.08, 0, 0, -1.25, DARK, 0.3);
    t.block(0.5, 0.12, 0.08, 0, 0, 0.85, DARK, 0.3);
    t.block(0.32, 0.08, 0.36, 0, 0.26, -0.5, INK, 0.4); // seat
    t.cyl(0.32, 0.32, 0.22, 0, 0.2, 0.95, '#1b4965', 24); // fan housing
    t.add(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 24).rotateZ(Math.PI / 2).scale(1, 1, 1).translate(0, 0.42, 0.95), '#1b4965');
    for (const x of [-0.12, 0.12]) t.block(0.12, 0.04, 0.3, x, 0.28, 0.45, RUBBER, 0.3).block(0.12, 0.2, 0.03, x, 0.3, 0.58, '#62b6cb', 0.2);
    barX(t, 0.5, 0, 0.62, 0.62, 0.025, INK); // handle
    t.add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6).rotateX(Math.PI / 2 - 0.2).translate(0, 0.86, 0.78), DARK);
    glowPanel(t, 0.18, 0.13, 0, 1.12, 0.66, '#9ef01a', -0.4);
  },
  /** A power rack with a loaded barbell and plate storage. */
  toySquatRack(t) {
    t.block(1.4, 0.04, 1.3, 0, 0, 0, RUBBER, 0.1); // platform
    for (const [x, z] of [[-0.6, -0.55], [0.6, -0.55], [-0.6, 0.45], [0.6, 0.45]]) t.block(0.08, 2.3, 0.08, x, 0.04, z, '#212529', 0.2);
    for (const z of [-0.55, 0.45]) barX(t, 1.28, 0, 2.3, z, 0.04, '#212529');
    for (const x of [-0.6, 0.6]) barZ(t, 1.0, x, 2.3, -0.05, 0.04, '#212529');
    barX(t, 2.0, 0, 1.35, 0.45, 0.022, STEEL);
    for (const x of [-0.82, 0.82]) { plate(t, 0.23, x, 1.35, 0.45, '#d7263d'); plate(t, 0.18, x * 1.08, 1.35, 0.45, '#1d3557'); }
    for (const x of [-0.6, 0.6]) t.block(0.1, 0.06, 0.12, x, 1.28, 0.45, '#adb5bd', 0.2); // J-hooks
    for (const [y, r, c] of [[0.3, 0.23, '#d7263d'], [0.32, 0.2, '#2a9d8f'], [0.34, 0.17, '#f4a261']] as [number, number, string][]) plate(t, r, -0.7, y + 0.04, -0.2, c);
  },
  /** A cable crossover: two weight stacks, pulleys up high, a pull-up bar. */
  toyCableMachine(t) {
    for (const x of [-1.0, 1.0]) {
      t.block(0.42, 2.3, 0.4, x, 0, -0.1, '#343a40', 0.08);
      for (let i = 0; i < 12; i++) t.block(0.3, 0.06, 0.2, x, 0.12 + i * 0.075, 0.05, i < 4 ? '#e63946' : DARK, 0.3); // stack
      t.cyl(0.07, 0.07, 0.06, x * 0.86, 2.0, 0.18, STEEL, 12);
    }
    barX(t, 2.4, 0, 2.3, -0.1, 0.04, '#343a40');
    barX(t, 1.4, 0, 2.15, 0.1, 0.02, STEEL);
    for (const x of [-0.86, 0.86]) t.add(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4).translate(x, 1.5, 0.2), INK).block(0.14, 0.05, 0.05, x, 0.95, 0.2, INK, 0.3);
  },
  /** Kettlebells on a low two-tier rack, light to heavy. */
  toyKettlebellRack(t) {
    t.block(1.6, 0.06, 0.5, 0, 0.1, 0, DARK, 0.2).block(1.6, 0.06, 0.5, 0, 0.5, 0, DARK, 0.2);
    for (const x of [-0.76, 0.76]) t.block(0.06, 0.62, 0.5, x, 0, 0, '#212529', 0.2);
    const cols = ['#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#8338ec', '#073b4c'];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 5; i++) {
      const x = -0.6 + i * 0.3, y = 0.16 + r * 0.4, s = 0.08 + i * 0.012;
      t.sphere(s, x, y + s, 0, cols[(i + r) % cols.length]);
      t.add(new THREE.TorusGeometry(s * 0.6, 0.015, 6, 12, Math.PI).translate(x, y + s * 1.9, 0), INK);
    }
  },
  /** Plyo boxes in three heights. */
  toyPlyoBoxes(t) {
    t.block(0.6, 0.45, 0.6, -0.65, 0, 0, '#3a86ff', 0.12);
    t.block(0.6, 0.6, 0.6, 0, 0, 0, '#ff006e', 0.12);
    t.block(0.6, 0.75, 0.6, 0.65, 0, 0, '#ffbe0b', 0.12);
    for (const [x, h] of [[-0.65, 0.45], [0, 0.6], [0.65, 0.75]]) t.block(0.3, 0.02, 0.02, x, h * 0.5, 0.3, '#ffffff', 0.3);
  },
  /** A turf lane with yard lines and a push sled (walk over it). */
  toyTurfLane(t) {
    t.block(1.8, 0.03, 6.0, 0, 0, 0, '#2d8a3e', 0.05);
    for (let i = 0; i < 6; i++) t.block(1.8, 0.005, 0.06, 0, 0.03, -2.5 + i * 1.0, '#f8f9fa', 0.3);
    t.block(0.06, 0.005, 6.0, -0.87, 0.03, 0, '#f8f9fa', 0.3).block(0.06, 0.005, 6.0, 0.87, 0.03, 0, '#f8f9fa', 0.3);
    t.block(0.8, 0.08, 0.6, 0, 0.03, -2.2, '#adb5bd', 0.2); // sled
    for (const x of [-0.25, 0.25]) t.block(0.06, 0.9, 0.06, x, 0.1, -2.4, DARK, 0.3);
    plate(t, 0.2, 0, 0.14, -2.1, INK);
  },
  /** A rubber mat for jump rope, a rope coiled on a hook stand and a timer. */
  toyRopeMat(t) {
    t.block(2.0, 0.025, 2.0, 0, 0, 0, '#3d405b', 0.1);
    t.block(1.6, 0.005, 1.6, 0, 0.025, 0, '#f2cc8f', 0.3);
    t.add(new THREE.TorusGeometry(0.22, 0.015, 6, 20).rotateX(Math.PI / 2).translate(0.6, 0.04, 0.6), '#e07a5f');
    for (const x of [0.4, 0.8]) t.block(0.05, 0.12, 0.05, x, 0.03, 0.6, '#f4f1de', 0.3);
  },
  /** A tall gym mirror panel with a ballet-style bar (stands against a wall). */
  toyMirrorPanel(t) {
    t.block(2.4, 2.2, 0.06, 0, 0.1, 0, '#adb5bd', 0.05);
    t.block(2.3, 2.1, 0.01, 0, 0.15, 0.035, '#cfe8f3', 0.05);
    t.block(0.6, 2.0, 0.005, -0.5, 0.2, 0.042, '#e9f5fb', 0.05); // a glint
    barX(t, 2.3, 0, 1.0, 0.18, 0.02, STEEL);
  },
  /** An adjustable flat bench with a pair of dumbbells. */
  toyWeightBench(t) {
    t.block(0.32, 0.08, 1.2, 0, 0.38, 0, INK, 0.3);
    for (const z of [-0.45, 0.45]) t.block(0.42, 0.38, 0.08, 0, 0, z, DARK, 0.2);
    for (const x of [-0.32, 0.32]) {
      barZ(t, 0.3, x, 0.08, 0.6, 0.02);
      for (const dz of [-0.13, 0.13]) t.add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 6).rotateX(Math.PI / 2).translate(x, 0.08, 0.6 + dz), INK);
    }
  },
  /** An elliptical trainer with a lit console. */
  toyElliptical(t) {
    t.block(0.6, 0.12, 1.7, 0, 0, 0, '#495057', 0.2);
    t.cyl(0.24, 0.24, 0.3, 0, 0.1, -0.7, '#495057', 18);
    for (const x of [-0.16, 0.16]) {
      t.block(0.14, 0.04, 0.36, x, 0.38, 0.05, RUBBER, 0.3);
      t.add(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6).rotateX(-0.25).translate(x * 1.6, 1.0, 0.45), STEEL);
    }
    t.block(0.08, 1.3, 0.1, 0, 0.12, 0.7, '#495057', 0.3);
    glowPanel(t, 0.3, 0.18, 0, 1.45, 0.66, '#ff9f1c', -0.35);
  },
  /** Battle ropes looped round an anchor. */
  toyBattleRopes(t) {
    t.block(0.3, 0.4, 0.3, 0, 0, -1.6, '#212529', 0.2);
    for (const x of [-0.3, 0.3]) {
      for (let i = 0; i < 8; i++) {
        const z = -1.4 + i * 0.4;
        t.add(new THREE.CylinderGeometry(0.045, 0.045, 0.42, 6).rotateX(Math.PI / 2).rotateY(Math.sin(i * 1.4) * 0.3).translate(x + Math.sin(i * 1.4) * 0.1, 0.05, z), '#e9c46a');
      }
    }
  },
  /** A smoothie bar: counter, blenders, fruit and a lit menu. */
  toySmoothieBar(t) {
    t.block(2.6, 1.05, 0.7, 0, 0, 0, '#f1faee', 0.06);
    t.block(2.7, 0.06, 0.8, 0, 1.05, 0, '#2a9d8f', 0.2);
    t.block(2.6, 0.12, 0.05, 0, 0.5, 0.36, '#2a9d8f', 0.2);
    for (const [x, c] of [[-0.9, '#ff6b6b'], [-0.5, '#ffd166'], [0.6, '#06d6a0']] as [number, string][]) {
      t.block(0.18, 0.12, 0.18, x, 1.11, -0.1, INK, 0.2);
      t.cyl(0.08, 0.07, 0.3, x, 1.23, -0.1, '#e9f5fb', 10);
      t.cyl(0.07, 0.06, 0.16, x, 1.24, -0.1, c, 10);
    }
    for (let i = 0; i < 6; i++) t.sphere(0.06, -0.05 + (i % 3) * 0.13, 1.17 + Math.floor(i / 3) * 0.08, 0.1, ['#ff9f1c', '#e63946', '#80b918'][i % 3]);
    glowPanel(t, 1.4, 0.5, 0, 1.8, -0.3, '#80ed99');
    t.block(0.05, 0.6, 0.05, -0.75, 1.1, -0.3, DARK, 0.3).block(0.05, 0.6, 0.05, 0.75, 1.1, -0.3, DARK, 0.3);
  },
  /** A massage chair that's always taken. */
  toyMassageChair(t) {
    t.block(0.8, 0.5, 0.9, 0, 0, 0.05, '#212529', 0.3);
    t.block(0.8, 1.0, 0.3, 0, 0.45, -0.35, '#212529', 0.3);
    t.block(0.6, 0.1, 0.6, 0, 0.5, 0.05, '#6c757d', 0.4);
    for (const x of [-0.38, 0.38]) t.block(0.16, 0.3, 0.8, x, 0.5, 0.05, '#343a40', 0.4);
    t.block(0.5, 0.25, 0.4, 0, 0.0, 0.55, '#343a40', 0.3); // leg rest
    t.inSlot(3, () => t.block(0.04, 0.6, 0.02, -0.36, 0.7, -0.19, '#b388ff', 0.3));
  },
  /** A lap pool with lane ropes, a ladder and a lifeguard chair. */
  toyLapPool(t) {
    t.block(9.0, 0.16, 4.2, 0, 0, 0, '#e9ecef', 0.05); // coping
    t.block(8.4, 0.02, 3.6, 0, 0.15, 0, WATER_DK, 0.05);
    t.inSlot(3, () => t.block(8.3, 0.01, 3.5, 0, 0.165, 0, '#7fd8f7', 0.05));
    for (let i = 1; i < 4; i++) {
      const z = -1.8 + i * 0.9;
      for (let k = 0; k < 20; k++) t.sphere(0.035, -4.0 + k * 0.42, 0.19, z, k % 4 < 2 ? '#e63946' : '#f8f9fa');
    }
    for (let i = 0; i < 4; i++) t.block(0.4, 0.005, 0.12, -4.0, 0.17, -1.35 + i * 0.9, INK, 0.3); // lane T
    for (const z of [-0.2, 0.2]) t.add(new THREE.TorusGeometry(0.22, 0.02, 6, 12, Math.PI).rotateZ(Math.PI / 2).translate(4.1, 0.38, -1.5 + z), STEEL);
    t.block(0.06, 1.6, 0.06, -4.25, 0.16, 1.85, '#f8f9fa', 0.3).block(0.06, 1.6, 0.06, -3.85, 0.16, 1.85, '#f8f9fa', 0.3);
    t.block(0.5, 0.06, 0.4, -4.05, 1.76, 1.85, '#e63946', 0.3);
  },
  /** A cedar sauna cabin with a glowing glass door. */
  toySauna(t) {
    t.block(2.4, 2.3, 2.0, 0, 0, 0, '#b07d48', 0.04);
    for (let i = 0; i < 10; i++) t.block(2.42, 0.02, 2.02, 0, 0.2 + i * 0.22, 0, '#8d5b2f', 0.3);
    t.block(2.6, 0.12, 2.2, 0, 2.3, 0, '#6f4518', 0.1);
    t.block(0.8, 1.9, 0.02, 0.5, 0.05, 1.0, '#ffd6a5', 0.05);
    t.inSlot(3, () => t.block(0.7, 1.8, 0.01, 0.5, 0.1, 1.015, '#ffb703', 0.05));
    glowPanel(t, 0.3, 0.14, -0.5, 1.6, 1.0, '#ff7b00');
  },
  /** A low rack of rolled towels and a stack of fresh ones. */
  toyTowelShelf(t) {
    t.block(1.2, 1.2, 0.45, 0, 0, 0, '#f8f9fa', 0.05);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) t.add(new THREE.CylinderGeometry(0.1, 0.1, 0.36, 10).rotateX(Math.PI / 2).translate(-0.42 + i * 0.28, 0.2 + r * 0.38, 0.02), ['#ffffff', '#caf0f8', '#d8f3dc'][r]);
  },

  // ======================================================= 🌳 Central Park
  /** The Lake: a big curvy pond with a stone edge, reeds, lily pads and Bow Bridge across it. */
  toyLake(t) {
    // Stone rim (overlapping ellipses), then water, then the bridge.
    ellipse(t, 6.2, 3.3, 0.12, -1.0, 0, 0, STONE_DK);
    ellipse(t, 4.2, 2.6, 0.12, 2.6, 0, 0.6, STONE_DK);
    ellipse(t, 6.0, 3.1, 0.04, -1.0, 0.1, 0, WATER);
    ellipse(t, 4.0, 2.4, 0.04, 2.6, 0.1, 0.6, WATER);
    ellipse(t, 2.4, 1.2, 0.01, -3.2, 0.14, -0.8, '#6cc0ef');
    for (const [x, z] of [[-5.2, 1.2], [-4.4, 1.9], [3.8, -1.0], [5.2, 1.4], [-2.0, 2.4]]) t.cyl(0.22, 0.22, 0.01, x, 0.15, z, '#52b788', 10);
    for (const [x, z] of [[-6.4, -0.8], [-6.2, 0.6], [5.9, 0.0], [6.1, 1.4], [-3.6, -2.9]]) for (let k = 0; k < 4; k++) t.cyl(0.015, 0.02, 0.6 + k * 0.1, x + k * 0.08, 0.1, z + (k % 2) * 0.1, '#6a994e', 4);
    // Bow Bridge: a shallow cast-iron arch, cream with planters.
    const bx = 0.6;
    for (let i = 0; i < 18; i++) {
      const u = i / 17, z = -3.2 + u * 6.4, y = 0.25 + Math.sin(u * Math.PI) * 0.75;
      t.block(1.5, 0.08, 0.38, bx, y, z, '#efe6d2', 0.2);
      for (const x of [bx - 0.72, bx + 0.72]) t.block(0.05, 0.55, 0.36, x, y + 0.08, z, i % 2 ? '#d9cbb0' : '#efe6d2', 0.3);
    }
    t.add(new THREE.TorusGeometry(3.2, 0.12, 6, 24, Math.PI).rotateY(Math.PI / 2).scale(1, 0.32, 1).translate(bx, 0.1, 0), '#d9cbb0');
    for (const z of [-3.2, 3.2]) for (const x of [bx - 0.72, bx + 0.72]) t.cyl(0.18, 0.2, 0.5, x, 0.25, z, '#d9cbb0', 8).cyl(0.2, 0.15, 0.22, x, 0.75, z, '#6a994e', 8);
    // Two rowboats out on the water.
    for (const [x, z, a, c] of [[-3.4, 0.8, 0.4, '#e63946'], [3.6, 1.2, -0.7, '#3a86ff']] as [number, number, number, string][]) {
      t.add(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.55, 0.45, 1.4).rotateY(a).translate(x, 0.32, z), c);
      t.add(new THREE.BoxGeometry(0.5, 0.04, 0.14).rotateY(a).translate(x, 0.3, z), '#8a5a34');
    }
  },
  /** The Loeb-style boathouse dock: a deck, rowboats tied up, a rental sign. */
  toyBoatDock(t) {
    t.block(3.0, 0.2, 1.6, 0, 0, 0, '#8a5a34', 0.08);
    for (let i = 0; i < 10; i++) t.block(0.02, 0.005, 1.6, -1.35 + i * 0.3, 0.2, 0, '#5c3a21', 0.3);
    for (const x of [-1.4, 1.4]) for (const z of [-0.7, 0.7]) t.cyl(0.07, 0.07, 0.6, x, 0, z, '#5c3a21', 8);
    for (const [x, c] of [[-0.8, '#e63946'], [0.0, '#3a86ff'], [0.8, '#2a9d8f']] as [number, string][]) {
      t.add(new THREE.SphereGeometry(0.4, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(0.5, 0.4, 1.1).translate(x, 0.2, 1.3), c);
    }
    t.block(0.06, 1.4, 0.06, -1.2, 0.2, -0.6, '#5c3a21', 0.3);
    t.block(1.0, 0.4, 0.05, -0.75, 1.3, -0.6, '#1b4332', 0.2).block(0.9, 0.3, 0.01, -0.75, 1.35, -0.57, '#f1faee', 0.2);
  },
  /** The angel fountain on the terrace: a wide basin, two tiers and the angel. */
  toyBethesdaFountain(t) {
    t.cyl(2.3, 2.4, 0.45, 0, 0, 0, STONE, 8);
    t.cyl(2.1, 2.1, 0.05, 0, 0.4, 0, WATER, 8);
    t.cyl(0.35, 0.5, 1.1, 0, 0.45, 0, STONE, 12);
    t.cyl(1.0, 0.7, 0.14, 0, 1.5, 0, STONE, 16);
    t.cyl(0.9, 0.9, 0.03, 0, 1.6, 0, '#7fc8f8', 16);
    t.cyl(0.2, 0.28, 0.7, 0, 1.6, 0, STONE, 10);
    t.cyl(0.55, 0.4, 0.1, 0, 2.3, 0, STONE, 14);
    // The angel (patina green): body, head, spread wings, a raised arm.
    t.cyl(0.12, 0.18, 0.6, 0, 2.4, 0, '#5f9e8f', 10);
    t.sphere(0.1, 0, 3.1, 0, '#5f9e8f');
    for (const s of [-1, 1]) t.add(new THREE.ConeGeometry(0.22, 0.75, 3).rotateZ(s * 1.1).translate(s * 0.35, 2.95, -0.08), '#5f9e8f');
    t.add(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6).rotateZ(-0.5).translate(0.16, 3.1, 0.08), '#5f9e8f');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      t.block(0.5, 0.3, 0.3, Math.cos(a) * 2.25, 0.45, Math.sin(a) * 2.25, STONE_DK, 0.2);
    }
  },
  /** The carousel: striped canopy, painted horses, lights that chase at night. */
  toyCarousel(t) {
    t.cyl(2.2, 2.3, 0.3, 0, 0, 0, '#9d0208', 24);
    t.cyl(2.1, 2.1, 0.04, 0, 0.3, 0, '#f1e3c8', 24);
    t.cyl(0.4, 0.4, 2.4, 0, 0.3, 0, '#ffd166', 12);
    for (let i = 0; i < 16; i++) {
      const a0 = (i / 16) * Math.PI * 2;
      t.add(new THREE.ConeGeometry(2.5, 1.0, 16, 1, true, a0, Math.PI / 8).translate(0, 3.2, 0), i % 2 ? '#e63946' : '#fff8e7');
    }
    t.cyl(2.5, 2.5, 0.25, 0, 2.55, 0, '#ffd166', 24);
    t.sphere(0.18, 0, 3.8, 0, '#ffd166');
    t.inSlot(3, () => { for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; t.sphere(0.06, Math.cos(a) * 2.52, 2.68, Math.sin(a) * 2.52, '#fff3b0'); } });
    const horse = ['#ffffff', '#f4a261', '#8ecae6', '#cdb4db', '#ffafcc', '#b7e4c7'];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, x = Math.cos(a) * 1.55, z = Math.sin(a) * 1.55, y = 0.75 + (i % 2) * 0.25;
      t.cyl(0.025, 0.025, 2.3, x, 0.3, z, '#ffd166', 6);
      t.add(new THREE.BoxGeometry(0.2, 0.26, 0.62).rotateY(-a).translate(x, y, z), horse[i]);
      t.add(new THREE.BoxGeometry(0.12, 0.32, 0.16).rotateY(-a).translate(x + Math.cos(a + Math.PI / 2) * 0.3, y + 0.2, z + Math.sin(a + Math.PI / 2) * 0.3), horse[i]);
    }
  },
  /**
   * A playground on soft rubber (6 × 4 m): a climbing tower with a roof,
   * a ladder up the back and a slide down the front; monkey bars out to
   * the east; an A-frame swing set (one belt seat, one toddler bucket);
   * a seesaw and a spring rider up front; a timber curb all round.
   */
  toyPlayground(t) {
    const POST = '#2a9d8f', DECK = '#e63946', SLIDE = '#ffb703', PANEL = '#3a86ff', CURB = '#8a5a34';
    // Ground: rubber tiles, a blue patch under the swings, timber curb.
    t.block(6.0, 0.05, 4.0, 0, 0, 0, '#d0684a', 0.04);
    t.block(2.4, 0.012, 2.0, 1.85, 0.05, -1.0, '#4f7cac', 0.04);
    for (const z of [-1.94, 1.94]) t.block(6.0, 0.16, 0.12, 0, 0, z, CURB, 0.04);
    for (const x of [-2.94, 2.94]) t.block(0.12, 0.16, 4.0, x, 0, 0, CURB, 0.04);

    // The tower: four posts, a deck, side panels and a pointy roof.
    const [x0, x1, z0, z1] = [-2.5, -1.3, -1.5, -0.3];
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) t.cyl(0.07, 0.07, 2.6, x, 0.05, z, POST, 8);
    t.block(1.3, 0.1, 1.3, -1.9, 1.1, -0.9, DECK, 0.03);
    t.block(1.2, 0.5, 0.05, -1.9, 1.25, z0, PANEL, 0.05); // back panel
    for (const z of [-1.2, -0.6]) t.block(0.05, 0.5, 0.3, x0, 1.25, z, PANEL, 0.05); // west panel, gap for the ladder
    t.add(new THREE.ConeGeometry(1.05, 0.8, 4).rotateY(Math.PI / 4).translate(-1.9, 3.05, -0.9), DECK);
    t.sphere(0.09, -1.9, 3.5, -0.9, SLIDE);
    // Ladder up the west side.
    for (const z of [-1.05, -0.75]) rod(t, [-2.95, 0.05, z], [-2.52, 1.2, z], 0.035, POST);
    for (let i = 1; i <= 4; i++) { const f = i / 5; barZ(t, 0.3, -2.95 + 0.43 * f, 0.05 + 1.15 * f, -0.9, 0.025, STEEL); }
    // The slide: a chute off the front of the deck, a flat run-out at the bottom.
    const chute = (len: number, y: number, z: number, ang: number, w: number, h: number, c: string) =>
      t.add(new THREE.BoxGeometry(w, h, len).rotateX(ang).translate(-1.9, y, z), c);
    chute(2.0, 0.66, 0.45, 0.6, 0.56, 0.05, SLIDE);
    for (const dx of [-0.29, 0.29]) t.add(new THREE.BoxGeometry(0.05, 0.16, 2.0).rotateX(0.6).translate(-1.9 + dx, 0.74, 0.43), SLIDE);
    chute(0.5, 0.15, 1.5, 0, 0.56, 0.05, SLIDE);
    for (const dx of [-0.29, 0.29]) t.block(0.05, 0.12, 0.5, -1.9 + dx, 0.15, 1.5, SLIDE, 0.02);
    t.block(0.06, 0.15, 0.06, -1.9, 0, 1.6, STEEL, 0.02);
    for (const dx of [-0.33, 0.33]) rod(t, [-1.9 + dx, 1.2, -0.3], [-1.9 + dx, 1.7, -0.3], 0.03, STEEL); // grab bars at the top

    // Monkey bars from the tower to a little ladder post.
    for (const z of [-1.15, -0.65]) {
      barX(t, 1.75, -0.45, 1.85, z, 0.035, PANEL);
      t.cyl(0.06, 0.06, 1.85, 0.4, 0.05, z, POST, 8);
    }
    for (let i = 0; i < 7; i++) barZ(t, 0.5, -1.1 + i * 0.25, 1.85, -0.9, 0.025, STEEL);
    for (let i = 1; i <= 3; i++) barZ(t, 0.5, 0.4, i * 0.45, -0.9, 0.025, STEEL);

    // Swing set: two A-frames, a beam, a belt seat and a toddler bucket.
    const sz = -1.0, top = 2.15;
    for (const x of [0.85, 2.85]) for (const dz of [-0.75, 0.75]) rod(t, [x, 0.05, sz + dz], [x, top, sz], 0.05, POST);
    barX(t, 2.1, 1.85, top, sz, 0.06, POST);
    const swing = (x: number, bucket: boolean) => {
      const seatY = bucket ? 0.7 : 0.55;
      for (const dx of [-0.2, 0.2]) rod(t, [x + dx, top, sz], [x + dx, seatY + 0.06, sz], 0.012, STEEL);
      if (bucket) {
        t.block(0.4, 0.28, 0.32, x, seatY - 0.12, sz, DECK, 0.1);
        t.block(0.28, 0.1, 0.2, x, seatY + 0.07, sz, '#1b1d22', 0.05);
      } else t.add(new THREE.BoxGeometry(0.46, 0.04, 0.18).translate(x, seatY, sz), '#1b1d22');
    };
    swing(1.4, false);
    swing(2.3, true);

    // A seesaw: a red pivot, a tilted plank, handles and seats.
    const sx = 1.5, szz = 1.15, tilt = 0.17;
    t.add(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 3).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).translate(sx, 0.17, szz), DECK);
    t.add(new THREE.BoxGeometry(2.3, 0.06, 0.24).rotateZ(tilt).translate(sx, 0.32, szz), SLIDE);
    for (const s of [-1, 1]) {
      const hx = sx + s * 0.75, hy = 0.32 + s * 0.75 * Math.tan(tilt);
      t.add(new THREE.BoxGeometry(0.3, 0.05, 0.26).rotateZ(tilt).translate(sx + s * 1.0, 0.36 + s * 1.0 * Math.tan(tilt), szz), PANEL);
      rod(t, [hx, hy, szz - 0.09], [hx, hy + 0.28, szz - 0.09], 0.02, STEEL);
      rod(t, [hx, hy, szz + 0.09], [hx, hy + 0.28, szz + 0.09], 0.02, STEEL);
      barZ(t, 0.22, hx, hy + 0.28, szz, 0.022, STEEL);
    }

    // A spring rider (a yellow duck on a coil).
    for (let i = 0; i < 5; i++) t.add(new THREE.TorusGeometry(0.08, 0.016, 5, 10).rotateX(Math.PI / 2).translate(-0.3, 0.1 + i * 0.07, 1.2), STEEL);
    t.add(new THREE.SphereGeometry(0.26, 10, 8).scale(0.75, 0.65, 1.15).translate(-0.3, 0.6, 1.2), SLIDE);
    t.sphere(0.15, -0.3, 0.85, 1.42, SLIDE);
    t.add(new THREE.ConeGeometry(0.06, 0.14, 6).rotateX(Math.PI / 2).translate(-0.3, 0.83, 1.6), '#fb8500');
    barX(t, 0.36, -0.3, 0.86, 1.3, 0.02, DECK);
  },
  /** A ball field: an infield diamond on the grass, bases, a pitcher's mound (walk over it). */
  toyBallField(t) {
    t.block(9.0, 0.02, 7.0, 0, 0, 0, '#74c69d', 0.02);
    for (let i = 0; i < 9; i++) t.block(1.0, 0.004, 7.0, -4.0 + i, 0.02, 0, i % 2 ? '#6ab98f' : '#7fcca2', 0.3); // mowing stripes
    t.add(new THREE.BoxGeometry(3.4, 0.01, 3.4).rotateY(Math.PI / 4).translate(0, 0.03, 0.8), '#d4a373');
    t.add(new THREE.BoxGeometry(2.6, 0.012, 2.6).rotateY(Math.PI / 4).translate(0, 0.035, 0.8), '#74c69d');
    for (const [x, z] of [[0, 3.2], [2.4, 0.8], [0, -1.6], [-2.4, 0.8]]) t.add(new THREE.BoxGeometry(0.22, 0.04, 0.22).rotateY(Math.PI / 4).translate(x, 0.05, z), '#ffffff');
    t.cyl(0.4, 0.5, 0.06, 0, 0.03, 0.8, '#d4a373', 14);
  },
  /** A chain-link backstop behind home plate. */
  toyBackstop(t) {
    for (let i = 0; i < 5; i++) t.cyl(0.04, 0.04, 2.6, -2.0 + i, 0, 0, STEEL, 6);
    for (let i = 0; i < 4; i++) t.block(1.0, 2.4, 0.02, -1.5 + i, 0.1, 0, '#adb5bd', 0.02);
    for (const x of [-1.8, 1.8]) t.block(1.4, 0.4, 0.35, x * 0.8, 0, 0.5, '#8a5a34', 0.2); // bleacher bits
  },
  /** Belvedere-style castle on a rock: a grey stone tower, battlements and a flag. */
  toyCastle(t) {
    for (const [x, z, s] of [[-0.8, 0.5, 1.2], [0.6, 0.7, 1.0], [0, -0.3, 1.4], [1.0, -0.6, 0.9]] as [number, number, number][]) t.add(new THREE.DodecahedronGeometry(s, 0).scale(1, 0.55, 1).translate(x, 0.35, z), '#7d7a75');
    t.block(2.0, 1.4, 1.6, -0.2, 0.8, -0.2, '#a8a29e', 0.04);
    t.cyl(0.6, 0.6, 2.8, 0.8, 0.8, -0.3, '#a8a29e', 10);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; t.block(0.22, 0.25, 0.22, 0.8 + Math.cos(a) * 0.55, 3.6, -0.3 + Math.sin(a) * 0.55, '#a8a29e', 0.1); }
    for (let i = 0; i < 5; i++) t.block(0.22, 0.25, 0.22, -1.1 + i * 0.4, 2.2, 0.55, '#a8a29e', 0.1);
    t.add(new THREE.ConeGeometry(0.68, 1.0, 10).translate(0.8, 4.1, -0.3), '#495057');
    t.cyl(0.02, 0.02, 0.8, 0.8, 4.4, -0.3, INK, 4);
    t.block(0.45, 0.28, 0.02, 1.03, 4.9, -0.3, '#e63946', 0.2);
    for (const x of [-0.7, 0.2]) t.block(0.25, 0.45, 0.02, x, 1.4, 0.61, '#2b2d42', 0.3);
    t.inSlot(3, () => t.block(0.2, 0.35, 0.01, 0.8, 2.6, 0.31, '#ffd166', 0.3));
  },
  /** A cluster of grey schist boulders you can sit on. */
  toyRocks(t) {
    for (const [x, z, s, c] of [[-0.6, 0, 0.9, '#8d8a85'], [0.5, 0.3, 0.7, '#a19d97'], [0.2, -0.5, 0.55, '#77736e'], [-0.1, 0.6, 0.4, '#9a958f']] as [number, number, number, string][]) t.add(new THREE.DodecahedronGeometry(s, 0).scale(1, 0.6, 0.9).translate(x, s * 0.45, z), c);
    t.cyl(0.15, 0.2, 0.06, 0.9, 0, -0.4, '#52b788', 6);
  },
  /** A raised flower bed of tulips. */
  toyFlowerBed(t) {
    t.block(2.4, 0.3, 1.0, 0, 0, 0, STONE, 0.1);
    t.block(2.2, 0.06, 0.8, 0, 0.26, 0, '#5c3d2e', 0.2);
    const c = ['#ff006e', '#ffbe0b', '#fb5607', '#ffffff', '#8338ec'];
    for (let i = 0; i < 22; i++) {
      const x = -1.0 + (i % 11) * 0.2, z = -0.2 + Math.floor(i / 11) * 0.4;
      t.cyl(0.01, 0.01, 0.26, x, 0.3, z, '#2d6a4f', 4);
      t.add(new THREE.SphereGeometry(0.06, 6, 5).scale(1, 1.3, 1).translate(x, 0.6, z), c[(i * 3) % c.length]);
    }
  },
  /** A big American elm, like the ones that arch over the Mall. */
  toyElm(t) {
    t.cyl(0.2, 0.32, 2.6, 0, 0, 0, '#5b3a29', 10);
    for (const s of [-1, 1]) t.add(new THREE.CylinderGeometry(0.08, 0.13, 1.4, 6).rotateZ(s * 0.6).translate(s * 0.45, 2.9, 0), '#5b3a29');
    crown(t, 0, 3.6, 0, 1.5, LEAF);
  },
  /** A cherry tree in bloom. */
  toyCherryTree(t) {
    t.cyl(0.12, 0.18, 1.4, 0, 0, 0, '#4a2c2a', 8);
    t.add(new THREE.CylinderGeometry(0.06, 0.1, 0.9, 6).rotateZ(0.7).translate(0.35, 1.6, 0), '#4a2c2a');
    crown(t, 0.1, 2.0, 0, 1.0, BLOSSOM);
  },
  /** A maple already turning. */
  toyMaple(t) {
    t.cyl(0.14, 0.22, 1.7, 0, 0, 0, '#5b3a29', 8);
    crown(t, 0, 2.3, 0, 1.15, FALL);
  },
  /** A tall pine. */
  toyPine(t) {
    t.cyl(0.12, 0.18, 0.8, 0, 0, 0, '#5b3a29', 8);
    for (let i = 0; i < 4; i++) t.add(new THREE.ConeGeometry(1.1 - i * 0.22, 1.2, 9).translate(0, 1.3 + i * 0.75, 0), i % 2 ? '#1b4332' : '#2d6a4f');
  },
  /** A clipped hedge. */
  toyHedgeRow(t) {
    t.block(3.0, 0.9, 0.7, 0, 0, 0, '#2d6a4f', 0.35);
    for (let i = 0; i < 6; i++) t.sphere(0.32, -1.25 + i * 0.5, 0.82, 0, i % 2 ? '#40916c' : '#2d6a4f');
  },
  /** A pretzel and hot dog cart with a striped umbrella. */
  toyPretzelCart(t) {
    t.block(1.4, 0.85, 0.7, 0, 0.2, 0, '#c0c4c9', 0.06);
    t.block(1.42, 0.12, 0.72, 0, 1.0, 0, '#adb5bd', 0.1);
    for (const x of [-0.5, 0.5]) t.cyl(0.2, 0.2, 0.06, x, 0.2, 0.37, INK, 14);
    t.cyl(0.02, 0.02, 1.3, 0.5, 1.1, 0, STEEL, 6);
    for (let i = 0; i < 8; i++) t.add(new THREE.ConeGeometry(0.95, 0.35, 8, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4).translate(0.5, 2.55, 0), i % 2 ? '#1d3557' : '#ffd166');
    for (let i = 0; i < 3; i++) t.add(new THREE.TorusGeometry(0.09, 0.03, 6, 10).translate(-0.45 + i * 0.22, 1.25, 0.1), '#b5651d');
    t.block(0.6, 0.35, 0.02, 0, 0.5, 0.36, '#e63946', 0.2);
  },
  /** A horse and a white carriage waiting at the curb. */
  toyCarriage(t) {
    // Carriage.
    t.block(1.2, 0.5, 1.4, 0, 0.55, 0.6, '#f8f9fa', 0.2);
    t.block(1.2, 0.5, 0.3, 0, 1.05, 1.15, '#f8f9fa', 0.2);
    t.block(1.0, 0.1, 0.9, 0, 1.05, 0.5, '#9d0208', 0.3);
    t.add(new THREE.SphereGeometry(0.7, 12, 6, 0, Math.PI, 0, Math.PI / 2).rotateY(Math.PI / 2).scale(0.9, 0.9, 0.6).translate(0, 1.5, 1.05), INK);
    for (const [x, z, r] of [[-0.65, 1.1, 0.5], [0.65, 1.1, 0.5], [-0.65, 0.05, 0.36], [0.65, 0.05, 0.36]]) t.add(new THREE.TorusGeometry(r, 0.04, 6, 16).rotateY(Math.PI / 2).translate(x, r, z), INK);
    // Shafts and the horse.
    for (const x of [-0.35, 0.35]) barZ(t, 1.6, x, 0.85, -0.6, 0.025, INK);
    t.add(new THREE.CapsuleGeometry(0.28, 0.9, 4, 10).rotateX(Math.PI / 2).translate(0, 1.25, -1.2), '#7f5539');
    for (const [x, z] of [[-0.16, -0.85], [0.16, -0.85], [-0.16, -1.55], [0.16, -1.55]]) t.cyl(0.06, 0.05, 1.0, x, 0, z, '#6f4518', 6);
    t.add(new THREE.CylinderGeometry(0.11, 0.15, 0.6, 8).rotateX(0.7).translate(0, 1.6, -1.8), '#7f5539');
    t.add(new THREE.BoxGeometry(0.2, 0.22, 0.42).translate(0, 1.82, -2.05), '#7f5539');
    t.block(0.06, 0.3, 0.4, 0, 1.6, -1.7, INK, 0.3); // mane
    t.cyl(0.03, 0.06, 0.6, 0, 0.8, -0.5, INK, 6); // tail-ish
    t.sphere(0.12, 0, 2.02, -1.95, '#9d0208'); // a plume
  },
  /** A fenced dog run with a couple of dogs (they don't leave). */
  toyDogRun(t) {
    t.block(4.0, 0.03, 3.0, 0, 0, 0, '#d4a373', 0.1);
    for (const [w, d, x, z] of [[4.0, 0.03, 0, -1.5], [4.0, 0.03, 0, 1.5], [0.03, 3.0, -2.0, 0], [0.03, 3.0, 2.0, 0]] as [number, number, number, number][]) {
      t.block(w, 0.03, d, x, 0.9, z, STEEL, 0.3);
      t.block(w, 0.85, d, x, 0.05, z, '#adb5bd', 0.02);
    }
    // Two dogs and a ball.
    for (const [x, z, c, a] of [[-0.8, 0.2, '#e9c46a', 0.4], [0.9, -0.5, '#3d405b', -1.0]] as [number, number, string, number][]) {
      t.add(new THREE.CapsuleGeometry(0.12, 0.35, 4, 8).rotateZ(Math.PI / 2).rotateY(a).translate(x, 0.32, z), c);
      t.add(new THREE.SphereGeometry(0.11, 8, 6).translate(x + Math.cos(a) * 0.3, 0.45, z - Math.sin(a) * 0.3), c);
      for (const dx of [-0.12, 0.12]) t.cyl(0.03, 0.03, 0.22, x + dx * Math.cos(a), 0.03, z - dx * Math.sin(a), c, 5);
    }
    t.sphere(0.06, 0.2, 0.09, 0.6, '#ccff33');
    t.block(0.4, 0.2, 0.25, 1.6, 0.03, 1.2, '#4ea8de', 0.4); // water bowl
  },
  /** A picnic spot: a checked blanket, a basket and a bottle (walk over it). */
  toyPicnicSpot(t) {
    t.block(1.6, 0.02, 1.3, 0, 0, 0, '#e63946', 0.3);
    for (let i = 0; i < 4; i++) t.block(1.6, 0.005, 0.12, 0, 0.02, -0.5 + i * 0.33, '#ffffff', 0.3).block(0.12, 0.005, 1.3, -0.6 + i * 0.4, 0.021, 0, '#ffffff', 0.3);
    t.block(0.4, 0.22, 0.28, 0.45, 0.02, -0.3, '#b08968', 0.2);
    t.cyl(0.04, 0.04, 0.25, -0.4, 0.02, 0.3, '#2d6a4f', 8);
    t.sphere(0.07, -0.1, 0.07, 0.35, '#ff006e');
  },
  /** The bandshell: a big painted shell over a little stage. */
  toyBandshell(t) {
    t.block(5.0, 0.6, 2.6, 0, 0, 0, STONE, 0.05);
    t.add(new THREE.SphereGeometry(2.4, 18, 10, 0, Math.PI, 0, Math.PI / 2).rotateY(Math.PI / 2).scale(1.05, 1.25, 0.95).translate(0, 0.6, -0.8), '#f1e3c8');
    t.add(new THREE.SphereGeometry(2.2, 18, 10, 0, Math.PI, 0, Math.PI / 2).rotateY(Math.PI / 2).scale(1.0, 1.15, 0.85).translate(0, 0.61, -0.75), '#e0c9a6');
    for (const x of [-2.3, 2.3]) t.block(0.3, 3.4, 0.4, x, 0.6, 0.2, '#d6c7a8', 0.1);
    t.block(5.0, 0.3, 0.4, 0, 3.8, 0.2, '#d6c7a8', 0.1);
    t.inSlot(3, () => { for (let i = 0; i < 9; i++) t.sphere(0.07, -2.0 + i * 0.5, 3.75, 0.42, '#fff3b0'); });
    for (const x of [-1.0, 0.0, 1.0]) t.cyl(0.03, 0.03, 1.1, x, 0.6, 0.3, INK, 6); // mic stands
  },
  /** A bronze statue on a granite plinth. */
  toyStatue(t) {
    t.block(1.2, 1.2, 1.2, 0, 0, 0, '#6c757d', 0.05).block(1.4, 0.2, 1.4, 0, 0, 0, '#5a6169', 0.1);
    t.cyl(0.2, 0.28, 1.0, 0, 1.2, 0, '#4d6a5c', 10);
    t.sphere(0.16, 0, 2.38, 0, '#4d6a5c');
    t.add(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6).rotateZ(-1.0).translate(0.32, 1.95, 0), '#4d6a5c');
    t.block(0.6, 0.18, 0.02, 0, 0.5, 0.61, '#b08d57', 0.3); // plaque
  },
};

/** Nothing here hangs (the mirror panel stands against a wall). */
export const ACTIVE_ON_WALL: string[] = [];
