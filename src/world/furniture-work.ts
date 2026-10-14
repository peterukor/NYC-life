// =====================================================================
// furniture-work.ts — chunky cartoon pieces for the eight workplaces
// (Peter, 2026-10-13: "make each work space look unique, with its own
// furniture and actions").
//
// Same toy kit and conventions as furniture-toys.ts: metres, centred on
// the footprint, sitting on y = 0, the front faces +z. Merged into the
// furniture kit by name; data/furniture.ts lists them (WORK_FURNITURE).
// =====================================================================

import * as THREE from 'three';
import type { Toy } from './landmarks/toy.ts';

const INK = '#1b1d22';
const STEEL = '#b8bec7';
const DARK_STEEL = '#5b616b';
const WOOD = '#9c6b3c';
const WOOD_DK = '#6b4527';
const RED = '#d8473f';
const GLASS = '#cfe8f3';
const NEON_PINK = '#ff4fa3';
const NEON_BLUE = '#36c5f0';
const NEON_PURPLE = '#9b5de5';
const GOLD = '#e0b13a';
const BRICK = '#9c4a3a';
const CHALK = '#f1ede4';

/** A row of small coloured things (bottles, cans, chip bags) on a shelf. */
function row(t: Toy, n: number, x0: number, x1: number, y: number, z: number, w: number, h: number, d: number, colors: string[]): void {
  for (let i = 0; i < n; i++) t.block(w, h, d, x0 + ((x1 - x0) * (i + 0.5)) / n, y, z, colors[i % colors.length], 0.3);
}
/** A screen: dark frame with a bright face. */
function screen(t: Toy, w: number, h: number, x: number, y0: number, z: number, face: string, rotY = 0): void {
  t.add(new THREE.BoxGeometry(w, h, 0.04).rotateY(rotY).translate(x, y0 + h / 2, z), INK);
  t.add(new THREE.BoxGeometry(w * 0.9, h * 0.82, 0.01).rotateY(rotY).translate(x + Math.sin(rotY) * 0.025, y0 + h / 2, z + Math.cos(rotY) * 0.025), face);
}

export const WORK_TOYS: Record<string, (t: Toy) => void> = {
  // ============================================================ 🏪 bodega
  /** The deli counter: a glass case of meats and cheeses, a register and a tip jar. Your work station. */
  toyDeliCounter(t) {
    t.block(2.8, 0.95, 0.75, 0, 0, 0, '#e9e2d0', 0.08);
    t.block(2.7, 0.35, 0.6, 0, 0.95, 0.04, GLASS, 0.06); // glass case
    row(t, 6, -1.25, 1.25, 0.98, 0.05, 0.32, 0.12, 0.3, ['#e07a7a', '#f2d06b', '#f6b5a0', '#e9c46a', '#d9785f', '#f3e5ab']);
    t.block(2.8, 0.04, 0.75, 0, 1.3, 0, STEEL, 0.2); // top
    t.block(0.42, 0.22, 0.34, 1.05, 1.34, -0.05, '#3a3f47', 0.15); // register
    t.block(0.36, 0.1, 0.02, 1.05, 1.5, 0.08, '#7bd88f', 0.1); // its screen
    t.cyl(0.07, 0.07, 0.16, -1.1, 1.34, 0.18, '#d7f0ff', 12); // tip jar
    t.block(0.08, 0.04, 0.06, -1.1, 1.46, 0.18, '#7bb661', 0.2); // a bill in it
  },
  /** Flat-top grill with two sandwiches on it and a hood. Against the back wall. */
  toyFlatTopGrill(t) {
    t.block(1.3, 0.9, 0.7, 0, 0, 0, STEEL, 0.06);
    t.block(1.25, 0.06, 0.6, 0, 0.9, 0.02, '#2b2d33', 0.1);
    for (const x of [-0.3, 0.25]) {
      t.block(0.26, 0.05, 0.12, x, 0.96, 0.05, '#e9b872', 0.4);
      t.block(0.26, 0.04, 0.12, x, 1.01, 0.05, '#8c4a2f', 0.4);
    }
    t.block(1.3, 0.35, 0.5, 0, 1.8, -0.1, STEEL, 0.08); // hood
    for (let i = 0; i < 4; i++) t.cyl(0.03, 0.03, 0.04, -0.45 + i * 0.3, 0.75, 0.36, RED, 8);
  },
  /** Glass-door drinks cooler, every shelf a different colour. */
  toyDrinkCooler(t) {
    t.block(1.3, 2.0, 0.65, 0, 0, 0, '#f2f2ee', 0.05);
    t.block(1.15, 1.7, 0.02, 0, 0.18, 0.33, GLASS, 0.05);
    for (let r = 0; r < 4; r++) row(t, 7, -0.52, 0.52, 0.25 + r * 0.42, 0.15, 0.1, 0.26, 0.1, [RED, '#2a9d8f', '#f4a261', '#3a86ff', '#ffd400', '#8338ec', '#06d6a0']);
    t.block(1.3, 0.16, 0.66, 0, 2.0, 0, RED, 0.2); // header
  },
  /** An aisle shelf of chips, candy and cans. */
  toySnackShelf(t) {
    t.block(1.6, 1.5, 0.5, 0, 0, 0, '#d9d4c7', 0.05);
    for (let r = 0; r < 3; r++) row(t, 6, -0.68, 0.68, 0.2 + r * 0.45, 0.12, 0.2, 0.3, 0.16, ['#ffd400', RED, '#3a86ff', '#ff7b00', '#06d6a0', '#e63946']);
  },
  /** Lotto stand: a little rack of scratch-offs and a sign. */
  toyLottoStand(t) {
    t.block(0.6, 1.0, 0.4, 0, 0, 0, '#1d3557', 0.1);
    for (let i = 0; i < 4; i++) t.block(0.12, 0.2, 0.02, -0.2 + i * 0.13, 0.7, 0.21, ['#ffd400', '#06d6a0', '#ff4fa3', '#36c5f0'][i], 0.2);
    t.block(0.6, 0.3, 0.06, 0, 1.05, 0, '#ffd400', 0.2);
    t.block(0.42, 0.12, 0.02, 0, 1.13, 0.04, RED, 0.2);
  },
  /** The bodega cat asleep in a cardboard box. */
  toyCatBed(t) {
    t.block(0.55, 0.22, 0.42, 0, 0, 0, '#c9955a', 0.15);
    t.add(new THREE.SphereGeometry(0.17, 12, 8).scale(1.3, 0.6, 1).translate(0, 0.27, 0), '#f4a261'); // curled cat
    t.sphere(0.09, 0.18, 0.31, 0.06, '#f4a261'); // head
    for (const s of [-1, 1]) t.add(new THREE.ConeGeometry(0.035, 0.07, 4).translate(0.18 + s * 0.05, 0.4, 0.06), '#f4a261'); // ears
    t.add(new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI).rotateX(Math.PI / 2).translate(-0.1, 0.24, 0.12), '#e07a2a'); // tail
  },
  /** Coffee urns on a little counter, cups stacked. */
  toyCoffeeStation(t) {
    t.block(0.9, 0.9, 0.55, 0, 0, 0, WOOD_DK, 0.08);
    for (const x of [-0.22, 0.22]) {
      t.cyl(0.13, 0.13, 0.45, x, 0.9, 0, STEEL, 16);
      t.cyl(0.03, 0.03, 0.06, x, 1.0, 0.14, INK, 6);
    }
    for (let i = 0; i < 4; i++) t.cyl(0.045, 0.035, 0.05, 0.36, 0.9 + i * 0.045, 0.12, '#f4f1ea', 10);
  },

  // ============================================================ 🍸 bar
  /** The bar: wood top, beer taps, stools out front. Your work station. */
  toyBarTop(t) {
    t.block(3.2, 1.05, 0.7, 0, 0, 0, WOOD_DK, 0.08);
    t.block(3.3, 0.06, 0.8, 0, 1.05, 0, WOOD, 0.2);
    for (let i = 0; i < 4; i++) {
      t.cyl(0.025, 0.025, 0.4, -0.6 + i * 0.4, 1.11, -0.2, STEEL, 8);
      t.block(0.07, 0.14, 0.05, -0.6 + i * 0.4, 1.4, -0.18, [GOLD, INK, RED, '#2a9d8f'][i], 0.3);
    }
    for (let i = 0; i < 4; i++) {
      t.cyl(0.03, 0.03, 0.7, -1.2 + i * 0.8, 0, 0.75, DARK_STEEL, 8);
      t.cyl(0.2, 0.2, 0.08, -1.2 + i * 0.8, 0.7, 0.75, RED, 16);
    }
    t.cyl(0.06, 0.05, 0.14, 1.2, 1.11, 0.1, '#ffd166', 10); // a beer
  },
  /** The back bar: shelves of bottles in front of a mirror. Against the back wall. */
  toyBottleWall(t) {
    t.block(3.0, 0.9, 0.5, 0, 0, 0, WOOD_DK, 0.06);
    t.block(3.0, 1.3, 0.06, 0, 0.9, -0.22, '#a9c4cf', 0.05); // mirror
    for (let r = 0; r < 3; r++) {
      t.block(3.0, 0.04, 0.3, 0, 1.0 + r * 0.42, -0.1, WOOD, 0.2);
      for (let i = 0; i < 12; i++) t.cyl(0.04, 0.05, 0.28, -1.38 + i * 0.25, 1.04 + r * 0.42, -0.1, ['#2a9d8f', '#e9c46a', '#8c2f39', '#f4f1ea', '#3a86ff', '#6a4c93'][(i + r) % 6], 8);
    }
  },
  /** A red leather booth for four with a little table. */
  toyBooth(t) {
    for (const z of [-0.55, 0.55]) {
      t.block(1.4, 0.45, 0.5, 0, 0, z, '#8c2f39', 0.25);
      t.block(1.4, 0.6, 0.15, 0, 0.45, z + (z < 0 ? -0.2 : 0.2), '#8c2f39', 0.4);
    }
    t.block(1.1, 0.06, 0.55, 0, 0.72, 0, WOOD, 0.2);
    t.cyl(0.05, 0.08, 0.72, 0, 0, 0, INK, 8);
  },
  /** A glowing jukebox. */
  toyJukebox(t) {
    t.block(0.8, 1.2, 0.5, 0, 0, 0, '#7b2d26', 0.15);
    t.add(new THREE.CylinderGeometry(0.4, 0.4, 0.5, 20, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateZ(-Math.PI / 2).translate(0, 1.2, 0), '#ffb703');
    t.block(0.6, 0.35, 0.02, 0, 0.7, 0.26, NEON_BLUE, 0.2);
    t.block(0.62, 0.06, 0.03, 0, 0.45, 0.26, NEON_PINK, 0.3);
  },
  /** A pool table, balls racked. */
  toyPoolTable(t) {
    t.block(2.2, 0.75, 1.2, 0, 0, 0, WOOD_DK, 0.1);
    t.block(2.0, 0.04, 1.0, 0, 0.75, 0, '#1f7a4c', 0.1);
    for (let i = 0; i < 6; i++) t.sphere(0.04, 0.5 + (i % 3) * 0.07, 0.83, -0.08 + Math.floor(i / 3) * 0.08 + (i % 3) * 0.02, [GOLD, RED, '#3a86ff', '#8338ec', '#ff7b00', INK][i]);
    t.sphere(0.04, -0.6, 0.83, 0, '#ffffff');
    t.add(new THREE.CylinderGeometry(0.012, 0.02, 1.4, 6).rotateZ(Math.PI / 2 - 0.05).translate(-0.2, 0.86, 0.35), '#d9b38c');
  },
  /** A neon sign on the wall. */
  toyNeonSign(t) {
    t.block(1.4, 0.6, 0.05, 0, 0, 0, '#22172b', 0.2);
    t.add(new THREE.TorusGeometry(0.18, 0.03, 6, 16).translate(-0.35, 0.3, 0.05), NEON_PINK);
    t.block(0.55, 0.05, 0.04, 0.25, 0.42, 0.05, NEON_BLUE, 0.5);
    t.block(0.55, 0.05, 0.04, 0.25, 0.18, 0.05, NEON_BLUE, 0.5);
    t.block(0.05, 0.28, 0.04, 0.0, 0.16, 0.05, NEON_BLUE, 0.5);
  },

  // ============================================================ 🏋️ gym
  /** Front desk with a towel stack and a sign-in tablet. Your work station. */
  toyGymDesk(t) {
    t.block(2.2, 1.05, 0.7, 0, 0, 0, '#2b2d42', 0.08);
    t.block(2.3, 0.05, 0.8, 0, 1.05, 0, '#ef233c', 0.2);
    for (let i = 0; i < 4; i++) t.block(0.4, 0.07, 0.3, -0.7, 1.1 + i * 0.07, 0, i % 2 ? '#ffffff' : '#edf2f4', 0.4);
    t.block(0.32, 0.22, 0.03, 0.6, 1.1, 0.1, INK, 0.2);
    t.block(0.28, 0.18, 0.01, 0.6, 1.12, 0.12, NEON_BLUE, 0.2);
  },
  /** A treadmill with a console. */
  toyTreadmill(t) {
    t.block(0.8, 0.22, 1.8, 0, 0, 0.1, '#3d405b', 0.12);
    t.block(0.62, 0.03, 1.6, 0, 0.22, 0.15, INK, 0.3);
    for (const x of [-0.36, 0.36]) t.block(0.05, 1.15, 0.08, x, 0.22, -0.72, DARK_STEEL, 0.4);
    t.block(0.8, 0.28, 0.18, 0, 1.25, -0.72, '#3d405b', 0.2);
    t.block(0.4, 0.16, 0.01, 0, 1.31, -0.62, NEON_BLUE, 0.2);
  },
  /** A bench press with a loaded bar. */
  toyBenchPress(t) {
    t.block(0.35, 0.45, 1.3, 0, 0, 0.15, '#2b2d42', 0.25);
    for (const x of [-0.45, 0.45]) t.block(0.06, 1.15, 0.06, x, 0, -0.4, DARK_STEEL, 0.3);
    t.add(new THREE.CylinderGeometry(0.02, 0.02, 1.7, 8).rotateZ(Math.PI / 2).translate(0, 1.05, -0.4), STEEL);
    for (const x of [-0.7, 0.7]) t.add(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 18).rotateZ(Math.PI / 2).translate(x, 1.05, -0.4), INK);
  },
  /** A rack of dumbbells, light to heavy. */
  toyDumbbellRack(t) {
    t.block(1.8, 0.7, 0.5, 0, 0, 0, DARK_STEEL, 0.1);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) {
      const x = -0.75 + i * 0.3, y = 0.4 + r * 0.32 - 0.05, sz = 0.06 + i * 0.012;
      for (const dz of [-0.09, 0.09]) t.add(new THREE.CylinderGeometry(sz, sz, 0.06, 10).rotateX(Math.PI / 2).translate(x, y + 0.08, dz), INK);
      t.add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 6).rotateX(Math.PI / 2).translate(x, y + 0.08, 0), STEEL);
    }
  },
  /** A heavy punching bag on a stand. */
  toyPunchingBag(t) {
    t.block(0.7, 0.06, 0.7, 0, 0, 0, INK, 0.3);
    t.block(0.07, 2.1, 0.07, -0.3, 0, -0.3, DARK_STEEL, 0.3);
    t.block(0.07, 0.07, 0.5, -0.3, 2.05, -0.06, DARK_STEEL, 0.3);
    t.cyl(0.2, 0.2, 1.0, -0.3, 0.75, 0.15, '#c1121f', 16);
    t.cyl(0.21, 0.21, 0.06, -0.3, 1.2, 0.15, INK, 16);
  },
  /** Yoga mats rolled out and rolled up. */
  toyYogaMats(t) {
    for (let i = 0; i < 3; i++) t.block(0.6, 0.02, 1.7, -0.75 + i * 0.75, 0, 0, ['#9b5de5', '#00bbf9', '#06d6a0'][i], 0.3);
    t.add(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 12).rotateZ(Math.PI / 2).translate(0, 0.07, -1.0), '#f15bb5');
  },

  // ============================================================ 💻 startup
  /** A standing desk with two big monitors and a mechanical keyboard. Work station. */
  toyStandingDesk(t) {
    t.block(1.6, 0.04, 0.75, 0, 1.05, 0, '#f5f3ee', 0.2);
    for (const x of [-0.7, 0.7]) t.block(0.08, 1.05, 0.5, x, 0, 0, DARK_STEEL, 0.3);
    screen(t, 0.6, 0.38, -0.33, 1.2, -0.2, '#1e1e2e', 0.12);
    screen(t, 0.6, 0.38, 0.33, 1.2, -0.2, '#1e1e2e', -0.12);
    for (let i = 0; i < 5; i++) t.block(0.4, 0.01, 0.02, -0.33, 1.32 + i * 0.05, -0.17, ['#a6e3a1', '#89b4fa', '#f9e2af', '#f38ba8', '#cba6f7'][i], 0.3); // code
    t.block(0.45, 0.04, 0.15, 0, 1.09, 0.15, INK, 0.3);
    t.cyl(0.04, 0.035, 0.1, 0.55, 1.09, 0.15, '#ff7b00', 10); // a mug
  },
  /** Two beanbags. */
  toyBeanbags(t) {
    t.add(new THREE.SphereGeometry(0.45, 14, 10).scale(1, 0.6, 1).translate(-0.4, 0.27, 0), '#ffbe0b');
    t.add(new THREE.SphereGeometry(0.45, 14, 10).scale(1, 0.6, 1).translate(0.5, 0.27, 0.1), '#3a86ff');
  },
  /** A ping-pong table with a net. */
  toyPingPong(t) {
    t.block(2.4, 0.06, 1.35, 0, 0.72, 0, '#1d6fa5', 0.2);
    t.block(0.02, 0.15, 1.45, 0, 0.78, 0, '#f2f2ee', 0.3);
    t.block(2.4, 0.01, 0.02, 0, 0.785, 0, '#ffffff', 0.3);
    for (const [x, z] of [[-1.0, -0.55], [-1.0, 0.55], [1.0, -0.55], [1.0, 0.55]]) t.block(0.06, 0.72, 0.06, x, 0, z, INK, 0.3);
    t.sphere(0.03, 0.4, 0.84, 0.2, '#ff7b00');
  },
  /** A wall of free snacks in clear bins, and a fridge of oat milk. */
  toySnackWall(t) {
    t.block(2.0, 1.8, 0.45, 0, 0, 0, '#f5f3ee', 0.05);
    for (let r = 0; r < 4; r++) row(t, 5, -0.8, 0.8, 0.2 + r * 0.4, 0.1, 0.3, 0.3, 0.25, ['#ffbe0b', '#fb5607', '#ff006e', '#8338ec', '#3a86ff']);
  },
  /** A whiteboard covered in boxes and arrows (wall). */
  toyWhiteboard(t) {
    t.block(1.8, 1.0, 0.05, 0, 0, 0, '#d9dde2', 0.1);
    t.block(1.7, 0.9, 0.01, 0, 0.05, 0.03, '#ffffff', 0.1);
    for (const [x, y, c] of [[-0.5, 0.65, '#3a86ff'], [0.1, 0.65, '#e63946'], [0.55, 0.35, '#2a9d8f'], [-0.3, 0.3, '#3a86ff']] as const) t.block(0.3, 0.16, 0.01, x, y, 0.04, c, 0.1);
    t.block(0.4, 0.02, 0.01, -0.2, 0.72, 0.045, INK, 0.3);
    t.block(0.02, 0.3, 0.01, 0.55, 0.5, 0.045, INK, 0.3);
  },

  // ============================================================ 📈 trading floor
  /** A trading desk: six screens of charts. Work station. */
  toyTradingDesk(t) {
    t.block(2.4, 0.75, 0.8, 0, 0, 0, '#2f3640', 0.06);
    t.block(2.5, 0.04, 0.9, 0, 0.75, 0, '#dcdde1', 0.2);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) screen(t, 0.62, 0.36, -0.68 + i * 0.68, 0.85 + r * 0.38, -0.25, r ? '#0b3d2e' : '#2c0b0e');
    for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) t.block(0.08, 0.04 + ((i * 3 + k) % 4) * 0.04, 0.01, -0.85 + i * 0.68 + k * 0.1, 1.28, -0.22, '#4cd137', 0.2); // green bars
  },
  /** An LED ticker running along the wall. */
  toyTickerWall(t) {
    t.block(3.6, 0.45, 0.08, 0, 0, 0, INK, 0.1);
    for (let i = 0; i < 12; i++) t.block(0.2, 0.08, 0.01, -1.6 + i * 0.29, 0.25, 0.05, i % 3 ? '#4cd137' : '#e84118', 0.2);
    for (let i = 0; i < 12; i++) t.block(0.16, 0.06, 0.01, -1.6 + i * 0.29, 0.1, 0.05, '#fbc531', 0.2);
  },
  /** A glass meeting table with chairs. */
  toyMeetingTable(t) {
    t.block(2.2, 0.04, 1.0, 0, 0.74, 0, GLASS, 0.2);
    for (const x of [-0.8, 0.8]) t.block(0.06, 0.74, 0.8, x, 0, 0, STEEL, 0.3);
    for (const x of [-0.7, 0, 0.7]) for (const z of [-0.75, 0.75]) {
      t.block(0.45, 0.08, 0.45, x, 0.45, z, INK, 0.3);
      t.block(0.45, 0.45, 0.06, x, 0.53, z + (z < 0 ? -0.2 : 0.2), INK, 0.3);
      t.cyl(0.03, 0.03, 0.45, x, 0, z, STEEL, 6);
    }
  },
  /** An espresso bar with a chrome machine. */
  toyEspressoBar(t) {
    t.block(1.2, 0.95, 0.6, 0, 0, 0, '#2f3640', 0.06);
    t.block(1.25, 0.04, 0.65, 0, 0.95, 0, '#f5f6fa', 0.2);
    t.block(0.55, 0.45, 0.4, -0.15, 0.99, -0.05, STEEL, 0.15);
    t.cyl(0.03, 0.03, 0.1, -0.25, 1.1, 0.18, INK, 8);
    t.cyl(0.04, 0.035, 0.07, 0.35, 0.99, 0.1, '#f5f6fa', 10);
  },
  /** A small gold bull on a plinth (rub it for luck). */
  toyGoldBull(t) {
    t.block(0.7, 0.8, 0.5, 0, 0, 0, '#2f3640', 0.08);
    t.add(new THREE.SphereGeometry(0.22, 12, 8).scale(1.5, 0.8, 0.8).translate(0, 1.0, 0), GOLD);
    t.sphere(0.12, 0.32, 1.08, 0, GOLD);
    for (const s of [-1, 1]) t.add(new THREE.ConeGeometry(0.03, 0.18, 6).rotateZ(-s * 1.0).translate(0.36, 1.2, s * 0.08), GOLD);
    for (const [x, z] of [[-0.2, -0.08], [-0.2, 0.08], [0.2, -0.08], [0.2, 0.08]]) t.cyl(0.035, 0.035, 0.2, x, 0.8, z, GOLD, 6);
  },

  // ============================================================ 🌙 club
  /** The stage: a round, mirrored stage with spotlights. Your work station. */
  toyStage(t) {
    t.cyl(1.3, 1.35, 0.4, 0, 0, 0, '#2d1b3d', 28);
    t.cyl(1.25, 1.25, 0.03, 0, 0.4, 0, '#c9b6e4', 28);
    t.cyl(1.32, 1.32, 0.05, 0, 0.18, 0, NEON_PURPLE, 28);
    for (const a of [0.4, 2.7]) {
      const x = Math.cos(a) * 1.5, z = -Math.abs(Math.sin(a) * 1.5) - 0.2;
      t.block(0.06, 2.2, 0.06, x, 0, z, INK, 0.3);
      t.cyl(0.1, 0.16, 0.22, x, 2.1, z + 0.05, INK, 10);
      t.cyl(0.14, 0.14, 0.01, x, 2.1, z + 0.05, '#fff3b0', 10);
    }
  },
  /** DJ booth with decks and a laptop. */
  toyDjBooth(t) {
    t.block(1.6, 1.0, 0.7, 0, 0, 0, '#1a1423', 0.08);
    t.block(1.5, 0.08, 0.04, 0, 0.5, 0.36, NEON_BLUE, 0.4);
    for (const x of [-0.45, 0.45]) t.cyl(0.18, 0.18, 0.04, x, 1.0, 0, INK, 18);
    t.block(0.4, 0.03, 0.28, 0, 1.0, 0, '#2b2d33', 0.2);
    t.block(0.32, 0.22, 0.02, 0, 1.03, -0.12, '#c9ced6', 0.2);
  },
  /** A light-up dance floor (flat). */
  toyDanceFloor(t) {
    const cols = [NEON_PINK, NEON_BLUE, NEON_PURPLE, '#fee440', '#00f5d4'];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) t.block(0.56, 0.03, 0.56, -1.2 + i * 0.6, 0, -0.9 + j * 0.6, cols[(i * 2 + j) % cols.length], 0.1);
  },
  /** A curved velvet VIP booth with a bottle on ice. */
  toyVipBooth(t) {
    t.add(new THREE.TorusGeometry(0.9, 0.25, 8, 20, Math.PI).rotateX(-Math.PI / 2).scale(1, 0.9, 1).translate(0, 0.25, 0.3), '#5a189a');
    t.cyl(0.4, 0.4, 0.05, 0, 0.6, 0.6, '#c9b6e4', 18);
    t.cyl(0.05, 0.08, 0.6, 0, 0, 0.6, INK, 8);
    t.cyl(0.1, 0.08, 0.12, 0, 0.65, 0.6, STEEL, 12);
    t.cyl(0.03, 0.04, 0.22, 0, 0.7, 0.6, '#2d6a4f', 8);
  },

  // ============================================================ 💊 alley
  /** A green dumpster, lid half open. */
  toyDumpster(t) {
    t.block(1.8, 1.1, 1.0, 0, 0.1, 0, '#2d6a4f', 0.06);
    for (const x of [-0.75, 0.75]) for (const z of [-0.4, 0.4]) t.cyl(0.07, 0.07, 0.1, x, 0, z, INK, 8);
    t.add(new THREE.BoxGeometry(1.8, 0.05, 1.0).rotateX(-0.5).translate(0, 1.42, -0.2), '#1b4332');
    t.block(0.3, 0.25, 0.3, 0.4, 1.2, 0.1, INK, 0.5); // a bag sticking out
  },
  /** Trash bags piled against the wall. */
  toyAlleyTrash(t) {
    for (const [x, z, r] of [[-0.3, 0, 0.28], [0.25, 0.05, 0.25], [0, -0.1, 0.24], [-0.05, 0.2, 0.2]]) t.add(new THREE.SphereGeometry(r, 10, 8).scale(1, 0.9, 1).translate(x, r * 0.9 + (x === 0 ? 0.25 : 0), z), INK);
  },
  /** Stacked wooden crates with a sheet over the "stock". Your work station. */
  toyStashCrates(t) {
    t.block(0.8, 0.5, 0.6, -0.3, 0, 0, WOOD, 0.08);
    t.block(0.7, 0.45, 0.55, 0.45, 0, 0.05, WOOD_DK, 0.08);
    t.block(0.65, 0.4, 0.5, -0.25, 0.5, 0, WOOD, 0.08);
    t.block(0.9, 0.06, 0.7, -0.25, 0.9, 0, '#577590', 0.4); // a tarp
    t.block(0.2, 0.12, 0.14, 0.45, 0.45, 0.05, '#e9c46a', 0.3); // a paper bag
  },
  /** A fire escape bolted to the brick (wall). */
  toyFireEscape(t) {
    for (const y of [0, 1.1]) {
      t.block(1.6, 0.05, 0.6, 0, y + 1.2, 0.3, INK, 0.2);
      for (let i = 0; i < 6; i++) t.block(0.03, 0.5, 0.03, -0.75 + i * 0.3, y + 1.25, 0.58, INK, 0.3);
      t.block(1.6, 0.03, 0.03, 0, y + 1.72, 0.58, INK, 0.3);
    }
    t.add(new THREE.BoxGeometry(0.4, 0.05, 1.3).rotateX(-0.9).translate(0.6, 1.8, 0.35), INK); // stairs
  },
  /** A buzzing streetlamp. */
  toyStreetLamp(t) {
    t.cyl(0.12, 0.15, 0.1, 0, 0, 0, '#2b2d33', 10);
    t.cyl(0.05, 0.06, 3.0, 0, 0.1, 0, '#2b2d33', 8);
    t.block(0.6, 0.05, 0.06, 0.25, 3.0, 0, '#2b2d33', 0.3);
    t.cyl(0.08, 0.16, 0.14, 0.5, 2.88, 0, '#2b2d33', 10);
    t.cyl(0.14, 0.14, 0.01, 0.5, 2.87, 0, '#ffe8a3', 12);
  },
  /** Graffiti on the brick (wall). */
  toyGraffiti(t) {
    t.block(2.4, 1.4, 0.04, 0, 0, 0, BRICK, 0.05);
    t.add(new THREE.TorusGeometry(0.3, 0.08, 6, 14).scale(1.4, 1, 1).translate(-0.6, 0.75, 0.04), '#ff006e');
    t.block(0.9, 0.25, 0.02, 0.4, 0.9, 0.04, '#3a86ff', 0.5);
    t.block(0.6, 0.15, 0.02, 0.5, 0.5, 0.04, '#ffbe0b', 0.5);
    t.add(new THREE.ConeGeometry(0.15, 0.4, 4).rotateZ(-1.2).translate(0.1, 0.35, 0.04), '#06d6a0');
  },

  // ============================================================ 🚓 precinct
  /** The tall front desk with a sign. Your work station. */
  toyPrecinctDesk(t) {
    t.block(2.6, 1.25, 0.8, 0, 0, 0, WOOD_DK, 0.06);
    t.block(2.7, 0.06, 0.9, 0, 1.25, 0, WOOD, 0.2);
    t.block(1.2, 0.3, 0.05, 0, 0.75, 0.42, '#1d3557', 0.2);
    t.block(1.0, 0.1, 0.01, 0, 0.85, 0.45, '#f1faee', 0.2);
    t.block(0.35, 0.25, 0.25, 0.9, 1.31, -0.1, '#cfd2d6', 0.15); // old monitor
    t.cyl(0.1, 0.1, 0.03, -0.9, 1.31, 0, '#ffd166', 12); // donut box lid, sort of
    t.block(0.3, 0.06, 0.3, -0.9, 1.31, 0.05, '#f4a261', 0.3);
  },
  /** A holding cell: bars and a bench. */
  toyHoldingCell(t) {
    t.block(2.2, 0.08, 1.6, 0, 0, 0, '#adb5bd', 0.1);
    for (let i = 0; i < 12; i++) t.cyl(0.025, 0.025, 2.2, -1.05 + i * 0.19, 0.08, 0.78, DARK_STEEL, 6);
    for (const y of [0.1, 2.25]) t.block(2.2, 0.06, 0.06, 0, y, 0.78, DARK_STEEL, 0.3);
    t.block(1.6, 0.4, 0.4, 0, 0.08, -0.5, '#6c757d', 0.15);
  },
  /** A cluttered cop desk: case files, an old computer, a mug. */
  toyCopDesk(t) {
    t.block(1.4, 0.75, 0.75, 0, 0, 0, '#8d6e63', 0.06);
    t.block(0.45, 0.35, 0.35, -0.3, 0.75, -0.1, '#cfd2d6', 0.15);
    t.block(0.36, 0.22, 0.01, -0.3, 0.82, 0.08, '#3a5a40', 0.2);
    for (let i = 0; i < 4; i++) t.block(0.3, 0.03, 0.22, 0.35, 0.75 + i * 0.035, 0.05, ['#f4d35e', '#ffffff', '#f4d35e', '#ee964b'][i], 0.3);
    t.cyl(0.04, 0.035, 0.1, 0.55, 0.75, -0.2, '#ffffff', 10);
  },
  /** A row of grey lockers. */
  toyLockers(t) {
    for (let i = 0; i < 4; i++) {
      t.block(0.45, 1.9, 0.5, -0.7 + i * 0.47, 0, 0, '#6c757d', 0.05);
      for (let k = 0; k < 3; k++) t.block(0.25, 0.02, 0.01, -0.7 + i * 0.47, 1.55 + k * 0.06, 0.26, '#495057', 0.3);
      t.block(0.03, 0.12, 0.02, -0.55 + i * 0.47, 0.95, 0.26, STEEL, 0.3);
    }
  },
  /** The precinct coffee machine: a stained pot on a filing cabinet. */
  toyPrecinctCoffee(t) {
    t.block(0.55, 1.0, 0.55, 0, 0, 0, '#adb5bd', 0.05);
    for (let k = 0; k < 3; k++) t.block(0.4, 0.02, 0.01, 0, 0.25 + k * 0.3, 0.28, '#6c757d', 0.3);
    t.block(0.35, 0.4, 0.3, 0, 1.0, -0.05, INK, 0.15);
    t.cyl(0.08, 0.1, 0.16, 0, 1.0, 0.12, '#5c3d2e', 12);
  },
  /** A cork wanted board with photos and red string (wall). */
  toyWantedBoard(t) {
    t.block(1.6, 1.0, 0.04, 0, 0, 0, '#c99e67', 0.1);
    for (const [x, y] of [[-0.5, 0.65], [0, 0.7], [0.5, 0.6], [-0.3, 0.3], [0.35, 0.25]]) t.block(0.24, 0.3, 0.01, x, y - 0.15, 0.03, CHALK, 0.1);
    t.add(new THREE.BoxGeometry(0.75, 0.01, 0.01).rotateZ(-0.12).translate(-0.25, 0.68, 0.045), RED);
    t.add(new THREE.BoxGeometry(0.75, 0.01, 0.01).rotateZ(0.6).translate(0.15, 0.45, 0.045), RED);
  },
};

/** Workplace pieces that hang on a wall. */
export const WORK_ON_WALL = ['toyNeonSign', 'toyWhiteboard', 'toyTickerWall', 'toyFireEscape', 'toyGraffiti', 'toyWantedBoard'];
