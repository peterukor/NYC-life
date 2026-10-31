// =====================================================================
// furniture-night.ts — pieces for the five Manhattan nights out rebuilt
// on 2026-10-31 (Peter: "go for it"): 🎙️ The Basement Comedy Club, 🍸
// The Stoop, 🎷 Lenox Lounge Revival, 🕹️ Pixel Palace and 🎰 Empire
// Casino (rooms in data/night-rooms.ts).
//
// Same toy kit and conventions as furniture-town.ts: metres, centred on
// the footprint, sitting on y = 0, the front faces +z. Slot 3 glows at
// night. Big repeated things (slot rings, cabinet pods, rows of comedy
// tables) are ONE piece each, so a packed room stays cheap on phones.
// =====================================================================

import * as THREE from 'three';
import { Toy } from './landmarks/toy.ts';

const INK = '#1b1d22';
const STEEL = '#b8bec7';
const CHROME = '#d9dde3';
const GOLD = '#d4a93c';
const GOLD_LT = '#f2cf6b';
const WOOD = '#8a5a34';
const WOOD_DK = '#4a2e1b';
const RED_LEATHER = '#8c1c2c';
const BROWNSTONE = '#7a4b3a';
const PLUSH = ['#ff8fab', '#ffd23f', '#90e0ef', '#b9fbc0', '#f4a261', '#cdb4db', '#ffadad', '#a0c4ff'];

/** A glowing flat panel (slot 3). */
function glow(t: Toy, w: number, h: number, x: number, y: number, z: number, color: string, d = 0.01): void {
  t.inSlot(3, () => t.add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
}
/** A plain box (no rounding: cheap, for bricks, slats and trim). */
function box(t: Toy, w: number, h: number, d: number, x: number, y0: number, z: number, color: string): void {
  t.add(new THREE.BoxGeometry(w, h, d).translate(x, y0 + h / 2, z), color);
}
/** A rod from a to b. */
function rod(t: Toy, a: THREE.Vector3, b: THREE.Vector3, r: number, color: string, sides = 6): void {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, sides);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  t.add(g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2), color);
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Put a sub-assembly at (x, z), turned by a (radians; 0 = facing +z), lifted by y. */
function place(t: Toy, sub: Toy, x: number, z: number, a: number, y = 0): void {
  t.addToy(sub, (g) => { g.rotateY(a); g.translate(x, y, z); });
}
/** A cheap deterministic 0..1 hash (brick colours, plush colours). */
const h01 = (i: number, j: number) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ------------------------------------------------------------ small parts

/** A mic on a stand (base at y0). */
function micStand(t: Toy, x: number, y0: number, z: number, h = 1.45): void {
  t.cyl(0.14, 0.16, 0.03, x, y0, z, INK, 14);
  t.cyl(0.012, 0.012, h, x, y0, z, CHROME, 6);
  rod(t, V(x, y0 + h, z), V(x, y0 + h + 0.06, z + 0.14), 0.012, CHROME);
  t.add(new THREE.CylinderGeometry(0.025, 0.018, 0.14, 8).rotateX(Math.PI / 2 - 0.4).translate(x, y0 + h + 0.08, z + 0.2), INK);
  t.sphere(0.035, x, y0 + h + 0.1, z + 0.27, '#3a3d44');
}
/** A small chair facing −z (its back on the +z side): seat top at 0.47. */
function smallChair(color: string, legs = INK): Toy {
  const c = new Toy();
  for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) c.block(0.035, 0.44, 0.035, x, 0, z, legs, 0.3);
  c.block(0.38, 0.05, 0.38, 0, 0.42, 0, color, 0.3);
  c.block(0.38, 0.42, 0.05, 0, 0.47, 0.17, color, 0.3);
  return c;
}
/** An upright arcade cabinet (front +z), 0.8 wide. */
function cabinet(body: string, face: string, marquee: string): Toy {
  const t = new Toy();
  t.block(0.8, 1.15, 0.72, 0, 0, 0, body, 0.06);
  t.block(0.8, 0.5, 0.42, 0, 1.15, -0.15, body, 0.06);
  t.block(0.84, 0.26, 0.5, 0, 1.65, -0.12, INK, 0.06);
  glow(t, 0.72, 0.18, 0, 1.78, 0.135, marquee);
  t.add(new THREE.BoxGeometry(0.64, 0.5, 0.05).rotateX(-0.18).translate(0, 1.38, 0.1), INK);
  t.inSlot(3, () => t.add(new THREE.BoxGeometry(0.56, 0.42, 0.01).rotateX(-0.18).translate(0, 1.38, 0.135), face));
  t.block(0.78, 0.08, 0.3, 0, 1.0, 0.28, INK, 0.05);
  t.cyl(0.025, 0.025, 0.1, -0.2, 1.06, 0.3, INK, 6);
  t.sphere(0.045, -0.2, 1.17, 0.3, '#e0283f');
  t.cyl(0.035, 0.035, 0.03, 0.1, 1.08, 0.31, '#36c5f0', 8).cyl(0.035, 0.035, 0.03, 0.24, 1.08, 0.31, '#ffd23f', 8);
  glow(t, 0.7, 0.03, 0, 0.06, 0.37, marquee, 0.02); // under-glow
  return t;
}
/** A slot machine (front +z), 0.66 wide. */
function slot(body: string, top: string): Toy {
  const t = new Toy();
  t.block(0.66, 0.95, 0.58, 0, 0, 0, body, 0.06);
  t.block(0.66, 0.72, 0.42, 0, 0.95, -0.08, body, 0.06);
  glow(t, 0.52, 0.28, 0, 1.24, 0.14, '#fff8e1');
  for (const [x, c] of [[-0.16, '#e0283f'], [0, GOLD_LT], [0.16, '#2a9d8f']] as [number, string][]) box(t, 0.11, 0.13, 0.02, x, 1.18, 0.15, c);
  t.block(0.7, 0.16, 0.46, 0, 1.67, -0.08, top, 0.06);
  glow(t, 0.6, 0.08, 0, 1.75, 0.16, GOLD_LT);
  t.cyl(0.018, 0.018, 0.42, 0.37, 1.0, 0, STEEL, 6);
  t.sphere(0.06, 0.37, 1.45, 0, '#e0283f');
  t.block(0.58, 0.06, 0.24, 0, 0.9, 0.24, INK, 0.05);
  return t;
}
/** An Adirondack chair facing +z. */
function adirondack(color: string): Toy {
  const c = new Toy();
  c.add(new THREE.BoxGeometry(0.56, 0.05, 0.55).rotateX(0.12).translate(0, 0.36, 0), color);
  for (let i = 0; i < 5; i++) c.add(new THREE.BoxGeometry(0.09, 0.75, 0.04).rotateX(-0.35).translate(-0.2 + i * 0.1, 0.72, -0.36), color);
  for (const x of [-0.32, 0.32]) {
    box(c, 0.1, 0.04, 0.62, x, 0.56, 0.02, color);
    box(c, 0.05, 0.56, 0.05, x, 0, 0.26, color);
    box(c, 0.05, 0.4, 0.05, x, 0, -0.22, color);
  }
  return c;
}

// ------------------------------------------------------------ the pieces

export const NIGHT_TOYS: Record<string, (t: Toy) => void> = {
  // ============================================================ 🎙️ The Basement Comedy Club
  /** The stage: a low black riser against a red brick wall, a mic stand, a stool with a glass of water, footlights. */
  toyComedyStage(t) {
    t.block(3.4, 0.32, 1.9, 0, 0, 0, '#17161a', 0.04);
    box(t, 3.42, 0.04, 0.06, 0, 0.3, 0.94, '#2b2a30');
    // The brick wall: mortar behind, bricks in running bond (plain boxes, cheap).
    box(t, 3.6, 2.6, 0.12, 0, 0.32, -0.98, '#4b3a33');
    const rows = 30, bw = 0.23, bh = 0.075;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? bw / 2 : 0;
      for (let i = -1; i < 16; i++) {
        const x0 = -1.8 + off + i * (bw + 0.018);
        const x1 = Math.min(1.8, x0 + bw), xa = Math.max(-1.8, x0);
        if (x1 - xa < 0.04) continue;
        const k = h01(r, i);
        const col = k < 0.3 ? '#8e3b2a' : k < 0.6 ? '#a4462f' : k < 0.85 ? '#7a3324' : '#b5573a';
        box(t, x1 - xa, bh, 0.03, (xa + x1) / 2, 0.34 + r * (bh + 0.012), -0.905, col);
      }
    }
    // A painted halo where the spotlight hits the bricks.
    t.inSlot(3, () => t.add(new THREE.RingGeometry(0.62, 0.7, 32).translate(0.1, 1.75, -0.885), '#ffcf7a'));
    micStand(t, 0.1, 0.32, 0.25);
    // The stool, and the comic's water.
    t.cyl(0.17, 0.17, 0.05, -0.55, 1.02, -0.25, INK, 14);
    for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) rod(t, V(-0.55 + x * 0.6, 1.02, -0.25 + z * 0.6), V(-0.55 + x, 0.32, -0.25 + z), 0.014, STEEL);
    t.cyl(0.035, 0.03, 0.12, -0.5, 1.07, -0.22, '#cfe8f3', 8);
    // Little monitor wedges and footlights along the front edge.
    for (const x of [-1.25, 1.25]) t.add(new THREE.BoxGeometry(0.5, 0.22, 0.3).rotateX(-0.5).translate(x, 0.43, 0.65), '#111114');
    for (let i = 0; i < 7; i++) glow(t, 0.16, 0.04, -1.2 + i * 0.4, 0.27, 0.955, '#ffd29a', 0.02);
  },
  /** A tight row of three little tables with red candle jars, two chairs at each, all facing the stage (−z). */
  toyComedyTables(t) {
    const chair = smallChair('#2b2a30', '#111');
    for (const tx of [-0.95, 0, 0.95]) {
      t.cyl(0.04, 0.05, 0.7, tx, 0, -0.05, INK, 8);
      t.cyl(0.18, 0.2, 0.03, tx, 0, -0.05, INK, 12);
      t.cyl(0.28, 0.28, 0.04, tx, 0.7, -0.05, '#141416', 18);
      t.inSlot(3, () => t.cyl(0.04, 0.04, 0.08, tx, 0.74, -0.08, '#ff5a3c', 10));
      t.cyl(0.03, 0.025, 0.11, tx + 0.12, 0.74, 0.0, '#cfe8f3', 8); // a drink (the minimum is two)
      for (const dx of [-0.24, 0.24]) place(t, chair, tx + dx, 0.42, 0);
    }
  },
  /** The open mic sign-up: a lectern with a clipboard and a lit card. */
  toyMicSignup(t) {
    t.block(0.56, 1.0, 0.4, 0, 0, 0, WOOD_DK, 0.06);
    t.add(new THREE.BoxGeometry(0.62, 0.04, 0.46).rotateX(0.3).translate(0, 1.06, 0), WOOD);
    t.add(new THREE.BoxGeometry(0.24, 0.01, 0.32).rotateX(0.3).translate(-0.08, 1.09, 0.02), '#f8f4e3');
    for (let i = 0; i < 5; i++) t.add(new THREE.BoxGeometry(0.16, 0.004, 0.01).rotateX(0.3).translate(-0.08, 1.095 + i * 0.016, 0.1 - i * 0.05), '#33363d');
    t.cyl(0.006, 0.006, 0.14, 0.04, 1.08, -0.05, '#e63946', 6);
    rod(t, V(0.22, 1.08, -0.15), V(0.22, 1.3, 0.0), 0.01, CHROME);
    t.cyl(0.05, 0.03, 0.06, 0.22, 1.27, 0.03, INK, 8);
    glow(t, 0.4, 0.14, 0, 0.7, 0.205, '#ff3b3b');
  },
  /** Stairs down from the street: dark wood steps rising toward +z, a handrail, a bulb in a cage. */
  toyCellarStairs(t) {
    for (let i = 0; i < 8; i++) {
      const z = -1.05 + i * 0.3;
      t.block(1.1, 0.3 * (i + 1), 0.3, 0, 0, z, i % 2 ? '#3d2a1f' : '#46301f', 0.04);
      box(t, 1.1, 0.02, 0.04, 0, 0.3 * (i + 1), z - 0.14, '#c9a55c');
    }
    box(t, 0.08, 2.5, 2.4, 0.6, 0, 0, '#2a1f19');
    rod(t, V(-0.52, 1.0, -1.15), V(-0.52, 3.35, 1.1), 0.025, STEEL);
    for (const z of [-1.1, 1.0]) t.cyl(0.02, 0.02, z < 0 ? 1.0 : 3.3, -0.52, 0, z, STEEL, 6);
    glow(t, 0.07, 0.11, 0.55, 2.0, -0.6, '#ffd29a', 0.07);
  },
  /** The green room: a velvet curtain half drawn on a rail, a tired loveseat, a mirror ringed with bulbs. */
  toyGreenRoom(t) {
    box(t, 2.2, 2.45, 0.08, 0, 0, -0.56, '#2f3a2c');
    // Loveseat (seen better decades).
    t.block(1.2, 0.42, 0.6, 0.35, 0, -0.2, '#6b705c', 0.25);
    t.block(1.2, 0.5, 0.18, 0.35, 0.42, -0.43, '#6b705c', 0.35);
    for (const x of [-0.28, 0.98]) t.block(0.16, 0.62, 0.6, x, 0, -0.2, '#5c614f', 0.35);
    // The mirror and its bulbs.
    t.block(0.7, 0.55, 0.04, 0.35, 1.25, -0.5, '#c9d6df', 0.1);
    for (let i = 0; i < 6; i++) { t.inSlot(3, () => t.sphere(0.03, 0.02 + i * 0.13, 1.84, -0.48, '#fff3c4')); }
    for (let i = 0; i < 4; i++) for (const x of [-0.04, 0.74]) t.inSlot(3, () => t.sphere(0.03, x, 1.3 + i * 0.14, -0.48, '#fff3c4'));
    // Rail and curtain folds (the left side drawn shut).
    rod(t, V(-1.1, 2.4, 0.5), V(1.1, 2.4, 0.5), 0.02, GOLD);
    for (let i = 0; i < 9; i++) t.cyl(0.07, 0.07, 2.36, -1.05 + i * 0.11, 0.02, 0.48 + (i % 2) * 0.03, i % 2 ? '#7a1424' : '#8c1c2c', 8);
    glow(t, 0.5, 0.12, 0.35, 2.05, -0.51, '#3ddc84');
  },

  // ============================================================ 🍸 The Stoop
  /** A brownstone stoop: six steps up to a green door, iron railings, planters at the bottom. Front (+z) is the bottom step. */
  toyBrownstoneStoop(t) {
    box(t, 2.4, 2.8, 0.22, 0, 0, -1.25, BROWNSTONE);
    box(t, 2.5, 0.12, 0.3, 0, 2.68, -1.2, '#6a3e30'); // cornice
    // The door, its frame and the transom light.
    box(t, 1.1, 1.5, 0.06, 0, 1.08, -1.12, '#5c3a2c');
    box(t, 0.9, 1.25, 0.05, 0, 1.12, -1.08, '#1f3b2d');
    t.sphere(0.025, 0.3, 1.7, -1.04, GOLD);
    glow(t, 0.86, 0.16, 0, 2.48, -1.08, '#ffd29a', 0.02);
    // Steps.
    for (let i = 0; i < 6; i++) {
      const top = 0.18 * (6 - i);
      t.block(1.4, top, 0.34, 0, 0, -0.85 + i * 0.34, i % 2 ? '#835241' : '#8a5745', 0.03);
    }
    // Cheek walls and railings.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 6; i++) box(t, 0.18, 0.18 * (6 - i) + 0.12, 0.34, s * 0.79, 0, -0.85 + i * 0.34, BROWNSTONE);
      rod(t, V(s * 0.79, 1.95, -1.0), V(s * 0.79, 0.95, 0.9), 0.02, INK);
      for (let k = 0; k < 6; k++) {
        const z = -0.95 + k * 0.36;
        const y0 = 0.18 * (6 - Math.min(5, Math.floor((z + 1.02) / 0.34))) + 0.12;
        t.cyl(0.01, 0.01, 0.8, s * 0.79, y0, z, INK, 4);
      }
      t.cyl(0.04, 0.04, 0.95, s * 0.79, 0.3, 1.0, INK, 6).sphere(0.05, s * 0.79, 1.3, 1.0, INK);
      // A planter with geraniums.
      t.block(0.34, 0.3, 0.34, s * 1.05, 0, 0.95, '#3a3d44', 0.1);
      for (let k = 0; k < 4; k++) t.sphere(0.07, s * 1.05 + (k % 2 - 0.5) * 0.12, 0.36, 0.9 + (k > 1 ? 0.1 : 0), k % 2 ? '#e63946' : '#2d6a4f');
    }
  },
  /** Karaoke corner: a round riser, a TV with the lyrics up, a mic, a little mirror ball on an arm. */
  toyKaraokeCorner(t) {
    t.cyl(0.9, 0.95, 0.18, 0, 0, 0.1, '#3c1a5b', 28);
    t.inSlot(3, () => t.add(new THREE.TorusGeometry(0.93, 0.02, 6, 36).rotateX(Math.PI / 2).translate(0, 0.17, 0.1), '#ff5fa2'));
    // The TV on a stand at the back.
    t.block(0.08, 1.1, 0.08, 0, 0, -0.55, INK, 0.2);
    t.block(1.05, 0.62, 0.08, 0, 1.0, -0.55, INK, 0.08);
    glow(t, 0.95, 0.52, 0, 1.31, -0.505, '#14213d');
    for (let i = 0; i < 3; i++) glow(t, 0.7 - i * 0.12, 0.05, -0.05, 1.18 + i * 0.12, -0.498, i === 1 ? '#ff5fa2' : '#ffffff', 0.006);
    micStand(t, 0.0, 0.18, 0.2, 1.3);
    // A speaker and the mirror ball.
    t.block(0.36, 0.55, 0.3, 0.7, 0.18, -0.35, '#22252b', 0.1);
    t.cyl(0.1, 0.1, 0.02, 0.7, 0.55, -0.19, '#555a63', 12);
    rod(t, V(-0.75, 0.18, -0.5), V(-0.75, 2.3, -0.5), 0.02, INK);
    rod(t, V(-0.75, 2.3, -0.5), V(-0.2, 2.3, -0.1), 0.015, INK);
    t.add(new THREE.IcosahedronGeometry(0.16, 1).translate(-0.2, 2.1, -0.1), '#e3e7ee');
  },
  /** The backyard fire pit: a stone ring, embers and flames, four Adirondack chairs pulled in. */
  toyFirePit(t) {
    t.cyl(0.55, 0.6, 0.38, 0, 0, 0, '#6c6a66', 16);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      t.block(0.22, 0.12, 0.14, Math.cos(a) * 0.56, 0.38, Math.sin(a) * 0.56, i % 2 ? '#8a8783' : '#7a7772', 0.2);
    }
    t.cyl(0.46, 0.46, 0.02, 0, 0.38, 0, '#1b1b1b', 16);
    t.inSlot(3, () => {
      t.add(new THREE.SphereGeometry(0.34, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.25, 1).translate(0, 0.39, 0), '#ff6a00');
      for (const [x, z, h, c] of [[0, 0, 0.55, '#ffb703'], [0.13, 0.08, 0.38, '#ff7b00'], [-0.12, 0.06, 0.42, '#ff9e00'], [0.02, -0.13, 0.36, '#ff7b00']] as [number, number, number, string][]) t.add(new THREE.ConeGeometry(0.09, h, 7).translate(x, 0.42 + h / 2, z), c);
    });
    for (let i = 0; i < 3; i++) t.add(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6).rotateZ(Math.PI / 2).rotateY(i * 1.05).translate(0, 0.43, 0), '#4a2e1b');
    const cols = ['#2a9d8f', '#e9c46a', '#e76f51', '#f1faee'];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      // Chairs at radius 1.25, each turned to face the fire.
      place(t, adirondack(cols[i]), Math.sin(a) * 1.25, Math.cos(a) * 1.25, a + Math.PI);
    }
  },
  /** Biscuit, the bartender's dog, asleep in a bed with a bowl and a chewed tennis ball. */
  toyBarDog(t) {
    t.cyl(0.36, 0.38, 0.1, 0, 0, 0, '#3d5a80', 18);
    t.add(new THREE.TorusGeometry(0.33, 0.07, 6, 18).rotateX(Math.PI / 2).translate(0, 0.14, 0), '#98c1d9');
    t.add(new THREE.SphereGeometry(0.22, 12, 8).scale(1.25, 0.6, 0.9).translate(0.02, 0.2, 0.02), '#c08552');
    t.sphere(0.12, -0.2, 0.24, 0.12, '#c08552');
    t.add(new THREE.SphereGeometry(0.07, 8, 6).scale(1.4, 0.8, 0.9).translate(-0.31, 0.21, 0.16), '#c08552');
    t.sphere(0.025, -0.4, 0.22, 0.17, INK);
    for (const z of [0.03, 0.2]) t.add(new THREE.SphereGeometry(0.06, 8, 6).scale(0.6, 1.2, 1).translate(-0.17, 0.27, z), '#7f5539');
    t.add(new THREE.SphereGeometry(0.05, 8, 6).scale(2.2, 0.6, 0.7).translate(0.3, 0.17, -0.12), '#c08552'); // tail
    t.cyl(0.11, 0.09, 0.07, 0.45, 0, 0.25, '#e63946', 12).cyl(0.08, 0.08, 0.01, 0.45, 0.06, 0.25, '#90e0ef', 12);
    t.sphere(0.04, 0.38, 0.04, -0.3, '#b5e48c');
  },
  /** A sidewalk A-frame chalkboard with the specials. */
  toyChalkboard(t) {
    for (const s of [-1, 1]) {
      t.add(new THREE.BoxGeometry(0.62, 0.95, 0.04).rotateX(s * 0.2).translate(0, 0.47, s * 0.1), WOOD);
      t.add(new THREE.BoxGeometry(0.54, 0.84, 0.01).rotateX(s * 0.2).translate(0, 0.49, s * 0.125), '#22302a');
    }
    for (let i = 0; i < 5; i++) t.add(new THREE.BoxGeometry(0.4 - (i % 2) * 0.12, 0.025, 0.005).rotateX(0.2).translate(-0.02, 0.7 - i * 0.12, 0.137 - i * 0.025), i === 0 ? '#ffd166' : '#f1faee');
  },

  // ============================================================ 🎷 Lenox Lounge Revival
  /** The art deco bar: black lacquer and gold flutes, a chrome band, a red leather rail, rounded ends, red stools. */
  toyDecoBar(t) {
    const L = 3.8;
    box(t, L, 1.0, 0.66, 0, 0, 0, '#121014');
    for (const s of [-1, 1]) t.cyl(0.33, 0.33, 1.0, s * L / 2, 0, 0, '#121014', 20);
    for (let i = 0; i < 19; i++) box(t, 0.03, 0.82, 0.02, -1.8 + i * 0.2, 0.06, 0.335, GOLD);
    box(t, L, 0.05, 0.02, 0, 0.88, 0.34, CHROME);
    box(t, L + 0.1, 0.05, 0.76, 0, 1.0, 0, '#2a1a12');
    for (const s of [-1, 1]) t.cyl(0.37, 0.37, 0.05, s * L / 2, 1.0, 0, '#2a1a12', 20);
    t.add(new THREE.CylinderGeometry(0.05, 0.05, L, 10).rotateZ(Math.PI / 2).translate(0, 1.07, 0.33), RED_LEATHER);
    glow(t, L, 0.03, 0, 0.05, 0.345, '#ffae42', 0.02);
    // Taps and a cocktail or two.
    for (let i = 0; i < 4; i++) t.cyl(0.02, 0.02, 0.32, -0.6 + i * 0.3, 1.05, -0.22, CHROME, 6);
    t.add(new THREE.ConeGeometry(0.06, 0.08, 10).rotateX(Math.PI).translate(0.9, 1.19, 0.05), '#cfe8f3');
    t.cyl(0.006, 0.006, 0.1, 0.9, 1.05, 0.05, '#cfe8f3', 4);
    for (let i = 0; i < 5; i++) {
      const x = -1.6 + i * 0.8;
      t.cyl(0.025, 0.12, 0.72, x, 0, 0.78, CHROME, 8);
      t.cyl(0.2, 0.19, 0.09, x, 0.72, 0.78, RED_LEATHER, 16);
    }
  },
  /** The back bar: a smoky mirror with a gold sunburst, stepped skyscraper crown, two rows of lit bottles. */
  toyDecoBackBar(t) {
    box(t, 4.4, 0.95, 0.45, 0, 0, 0, '#121014');
    box(t, 4.42, 0.04, 0.47, 0, 0.95, 0, GOLD);
    box(t, 4.4, 1.55, 0.05, 0, 0.99, -0.2, '#3a3f4a');
    // The sunburst.
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      t.add(new THREE.BoxGeometry(0.04, 0.6, 0.02).translate(0, 0.3, 0).rotateZ(a - Math.PI / 2).translate(0, 1.15, -0.16), i % 2 ? GOLD : GOLD_LT);
    }
    t.add(new THREE.CircleGeometry(0.16, 20, 0, Math.PI).translate(0, 1.15, -0.15), GOLD_LT);
    // Shelves of bottles either side, lit from below.
    for (const s of [-1, 1]) for (let r = 0; r < 2; r++) {
      box(t, 1.4, 0.03, 0.22, s * 1.35, 1.25 + r * 0.55, -0.1, GOLD);
      glow(t, 1.36, 0.02, s * 1.35, 1.26 + r * 0.55, -0.04, '#ffcf7a', 0.12);
      for (let i = 0; i < 7; i++) t.cyl(0.035, 0.045, 0.3, s * 1.35 - 0.6 + i * 0.2, 1.28 + r * 0.55, -0.1, ['#6a040f', '#e9c46a', '#2d6a4f', '#f4f1ea', '#9d0208', '#c47f2c', '#264653'][(i + r * 3) % 7], 8);
    }
    // Stepped crown, like a 1930s skyscraper.
    for (const [w, y] of [[4.4, 2.54], [2.2, 2.62], [1.2, 2.7]] as [number, number][]) box(t, w, 0.08, 0.3, 0, y, -0.12, y > 2.6 ? GOLD_LT : '#121014');
    glow(t, 1.0, 0.04, 0, 2.6, 0.035, '#ffcf7a', 0.02);
  },
  /** The bandstand: a walnut riser with a gold deco shell, an upright bass, a drum kit, a sax on its stand, two music stands, a mic. */
  toyJazzStand(t) {
    t.block(3.4, 0.3, 2.0, 0, 0, 0, '#5b3a24', 0.04);
    box(t, 3.42, 0.04, 0.05, 0, 0.27, 1.0, GOLD);
    // The shell: rings of gold and oxblood behind the band.
    const rings: [number, number, string][] = [[1.55, 1.68, GOLD], [1.3, 1.55, '#5e1520'], [1.18, 1.3, GOLD_LT], [0.95, 1.18, '#4a0f18'], [0.86, 0.95, GOLD], [0, 0.86, '#3a0c13']];
    for (const [r0, r1, c] of rings) t.add(new THREE.RingGeometry(r0, r1, 36, 1, 0, Math.PI).translate(0, 0.3, -0.955), c);
    for (let i = 1; i < 8; i++) {
      const a = (i / 8) * Math.PI;
      t.add(new THREE.BoxGeometry(0.03, 0.82, 0.01).translate(0, 0.41, 0).rotateZ(a - Math.PI / 2).translate(0, 0.3, -0.95), GOLD);
    }
    box(t, 3.4, 1.75, 0.04, 0, 0.3, -1.0, '#140a0c');
    // Upright bass on its stand.
    const bx = -1.05, bz = -0.15;
    t.add(new THREE.SphereGeometry(0.28, 14, 10).scale(1, 1.15, 0.45).translate(bx, 0.72, bz), '#8b3d1c');
    t.add(new THREE.SphereGeometry(0.22, 14, 10).scale(1, 1.1, 0.45).translate(bx, 1.12, bz), '#8b3d1c');
    box(t, 0.06, 0.75, 0.05, bx, 1.25, bz + 0.03, INK);
    t.add(new THREE.TorusGeometry(0.05, 0.02, 6, 10).translate(bx, 2.05, bz + 0.03), '#5c2a12');
    rod(t, V(bx, 0.3, bz - 0.25), V(bx, 0.62, bz - 0.05), 0.015, INK);
    // The drums.
    const dx = 0.95, dz = -0.45;
    t.add(new THREE.CylinderGeometry(0.28, 0.28, 0.3, 18).rotateX(Math.PI / 2).translate(dx, 0.6, dz + 0.1), '#7a0f1c');
    t.inSlot(3, () => t.add(new THREE.CircleGeometry(0.24, 18).translate(dx, 0.6, dz + 0.255), '#fff1d6'));
    t.add(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 14).rotateX(-0.3).translate(dx - 0.05, 0.98, dz + 0.0), '#7a0f1c');
    t.cyl(0.17, 0.17, 0.13, dx - 0.5, 0.75, dz + 0.25, '#e9ecef', 14);
    t.cyl(0.01, 0.01, 0.45, dx - 0.5, 0.3, dz + 0.25, CHROME, 4);
    t.cyl(0.2, 0.2, 0.28, dx + 0.45, 0.3, dz + 0.25, '#7a0f1c', 14);
    for (const [x, z, y] of [[dx - 0.75, dz - 0.05, 1.05], [dx + 0.5, dz - 0.25, 1.35]] as [number, number, number][]) {
      t.cyl(0.012, 0.012, y - 0.3, x, 0.3, z, CHROME, 4);
      t.cyl(0.24, 0.02, 0.02, x, y, z, GOLD_LT, 18);
    }
    t.cyl(0.16, 0.16, 0.08, dx + 0.05, 0.75, dz - 0.5, INK, 12).cyl(0.02, 0.02, 0.45, dx + 0.05, 0.3, dz - 0.5, CHROME, 4);
    // The sax on its stand, a mic up front, two music stands.
    const sx = -0.25, sz = 0.35;
    rod(t, V(sx - 0.12, 0.3, sz + 0.1), V(sx, 0.55, sz), 0.01, INK);
    rod(t, V(sx + 0.12, 0.3, sz + 0.1), V(sx, 0.55, sz), 0.01, INK);
    t.cyl(0.035, 0.05, 0.55, sx, 0.55, sz, GOLD_LT, 10);
    t.add(new THREE.CylinderGeometry(0.11, 0.05, 0.16, 12).rotateZ(-0.9).translate(sx + 0.1, 0.62, sz), GOLD_LT);
    rod(t, V(sx, 1.1, sz), V(sx - 0.1, 1.22, sz), 0.02, GOLD_LT);
    micStand(t, 0.35, 0.3, 0.55, 1.35);
    for (const x of [-0.6, 0.25]) {
      t.cyl(0.01, 0.01, 0.95, x, 0.3, -0.35, INK, 4);
      t.add(new THREE.BoxGeometry(0.42, 0.3, 0.015).rotateX(-0.35).translate(x, 1.3, -0.32), '#1d1f24');
      t.add(new THREE.BoxGeometry(0.34, 0.24, 0.005).rotateX(-0.35).translate(x, 1.3, -0.305), '#f8f4e3');
    }
  },
  /** A half-moon red leather booth round a little table with a fringed lamp. Open side faces +z. */
  toyDecoBooth(t) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 - Math.PI * 0.45 + (i / (n - 1)) * Math.PI * 0.9;
      const sx = Math.cos(a), sz = Math.sin(a);
      t.addToy(new Toy().block(0.5, 0.42, 0.5, 0, 0, 0, RED_LEATHER, 0.3), (g) => { g.rotateY(-a + Math.PI / 2); g.translate(sx * 0.7, 0, sz * 0.5 + 0.1); });
      t.addToy(new Toy().block(0.5, 0.62, 0.16, 0, 0, 0, '#7a1424', 0.4), (g) => { g.rotateY(-a + Math.PI / 2); g.translate(sx * 0.98, 0.4, sz * 0.72 + 0.1); });
    }
    t.cyl(0.05, 0.1, 0.7, 0, 0, 0.1, INK, 8);
    t.cyl(0.38, 0.38, 0.04, 0, 0.7, 0.1, '#f4f1ea', 20);
    t.cyl(0.39, 0.39, 0.08, 0, 0.66, 0.1, '#f4f1ea', 20);
    t.cyl(0.012, 0.012, 0.22, 0, 0.74, 0.1, GOLD, 6);
    t.inSlot(3, () => t.add(new THREE.CylinderGeometry(0.06, 0.12, 0.12, 12).translate(0, 1.0, 0.1), '#ff9e7a'));
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; t.cyl(0.006, 0.006, 0.06, Math.cos(a) * 0.12, 0.88, 0.1 + Math.sin(a) * 0.12, GOLD, 3); }
  },
  /** A little round table by the band: white cloth, a fringed lamp, two red tub chairs turned to the stage (−z). */
  toyLoungeTable(t) {
    t.cyl(0.05, 0.1, 0.7, 0, 0, 0, INK, 8);
    t.cyl(0.36, 0.38, 0.1, 0, 0.64, 0, '#f4f1ea', 18);
    t.cyl(0.012, 0.012, 0.2, 0, 0.74, 0, GOLD, 6);
    t.inSlot(3, () => t.add(new THREE.CylinderGeometry(0.05, 0.1, 0.1, 12).translate(0, 0.98, 0), '#ffb38a'));
    t.cyl(0.03, 0.025, 0.12, 0.15, 0.74, 0.08, '#cfe8f3', 8);
    for (const s of [-1, 1]) {
      const tub = new Toy();
      tub.cyl(0.3, 0.26, 0.42, 0, 0, 0, RED_LEATHER, 16);
      tub.add(new THREE.CylinderGeometry(0.31, 0.31, 0.34, 16, 1, true, Math.PI * 0.2, Math.PI * 1.6).translate(0, 0.59, 0), '#7a1424');
      place(t, tub, s * 0.62, 0.15, s * -0.5 + Math.PI);
    }
  },

  // ============================================================ 🕹️ Pixel Palace
  /** A retro pod: four cabinets back to back round a glowing pillar with a pixel heart on top. */
  toyArcadePodRetro(t) {
    pod(t, [['#1b998b', '#0b1320', '#2ec4b6'], ['#5c6470', '#8d99ae', '#ffd23f'], ['#e85d04', '#1a0f05', '#ffba08'], ['#8d2c1d', '#120a08', '#ff6a3d']], '#ff4fa3');
  },
  /** The city pod: Rooftop Jump, Bodega Stack and friends. */
  toyArcadePodCity(t) {
    pod(t, [['#2d5aa0', '#0d1a33', '#7bd8ff'], ['#ffb703', '#2b1d00', '#ffe066'], ['#3a0ca3', '#0b0320', '#b388ff'], ['#2a9d8f', '#04211d', '#3dffb0']], '#36c5f0');
  },
  /** The prize tower: a round glass counter ringed with plush, three tiers of prizes and a giant plush pigeon on top. */
  toyPrizeTower(t) {
    t.cyl(1.15, 1.2, 0.95, 0, 0, 0, '#3a0ca3', 28);
    t.cyl(1.12, 1.12, 0.38, 0, 0.95, 0, '#bfe3f0', 28);
    t.cyl(1.16, 1.16, 0.04, 0, 1.33, 0, '#240046', 28);
    t.inSlot(3, () => t.add(new THREE.TorusGeometry(1.18, 0.025, 6, 40).rotateX(Math.PI / 2).translate(0, 0.08, 0), '#ff4fa3'));
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; t.sphere(0.1, Math.cos(a) * 0.95, 1.1, Math.sin(a) * 0.95, PLUSH[i % PLUSH.length]); }
    const tiers: [number, number, number][] = [[0.8, 1.37, 0.5], [0.58, 1.87, 0.45], [0.38, 2.32, 0.38]];
    tiers.forEach(([r, y, h], k) => {
      t.cyl(r, r + 0.04, h, 0, y, 0, k % 2 ? '#7209b7' : '#560bad', 22);
      t.inSlot(3, () => t.add(new THREE.TorusGeometry(r + 0.03, 0.02, 6, 30).rotateX(Math.PI / 2).translate(0, y + h, 0), k % 2 ? '#36c5f0' : '#ffd23f'));
      const n = Math.round(r * 11);
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + k; t.sphere(0.09 + (h01(k, i) * 0.04), Math.cos(a) * (r - 0.02), y + h * 0.55, Math.sin(a) * (r - 0.02), PLUSH[(i + k * 3) % PLUSH.length]); }
    });
    // The giant plush pigeon (top prize: 25,000 tickets, nobody has ever won it).
    const py = 2.7;
    t.add(new THREE.SphereGeometry(0.34, 14, 10).scale(1.25, 0.95, 0.9).translate(0.0, py + 0.28, 0), '#8d99ae');
    t.add(new THREE.SphereGeometry(0.2, 12, 8).scale(1, 1, 0.95).translate(0.0, py + 0.58, 0.18), '#6c7a89');
    t.add(new THREE.TorusGeometry(0.17, 0.06, 6, 16).rotateX(Math.PI / 2 - 0.4).translate(0, py + 0.48, 0.12), '#2a9d8f');
    t.add(new THREE.ConeGeometry(0.04, 0.12, 8).rotateX(Math.PI / 2).translate(0, py + 0.57, 0.38), '#e9c46a');
    for (const s of [-1, 1]) {
      t.sphere(0.05, s * 0.1, py + 0.64, 0.32, '#ff7b00');
      t.sphere(0.022, s * 0.11, py + 0.645, 0.36, INK);
      t.add(new THREE.SphereGeometry(0.2, 10, 8).scale(0.4, 0.8, 1.3).translate(s * 0.36, py + 0.28, -0.05), '#5c677d');
      t.cyl(0.02, 0.02, 0.1, s * 0.12, py - 0.04, 0.05, '#e76f51', 6);
    }
    t.add(new THREE.SphereGeometry(0.16, 10, 8).scale(0.9, 0.35, 1.3).translate(0, py + 0.22, -0.42), '#5c677d');
    // TICKETS light on the counter's front.
    glow(t, 0.8, 0.16, 0, 0.62, 1.205, '#ffd23f', 0.02);
  },
  /** Beat Street stage: a raised neon platform with two dance machines under a light arch. */
  toyBeatStage(t) {
    t.block(3.2, 0.25, 2.2, 0, 0, 0, '#141018', 0.04);
    t.inSlot(3, () => { box(t, 3.22, 0.04, 0.03, 0, 0.21, 1.1, '#36c5f0'); for (const s of [-1, 1]) box(t, 0.03, 0.04, 2.22, s * 1.61, 0.21, 0, '#ff4fa3'); });
    const arrows = ['#ff4fa3', '#36c5f0', '#ffd23f', '#7bd88f'];
    for (const x of [-0.8, 0.8]) {
      place(t, cabinet('#c9184a', '#2a0a3d', '#ff4fa3'), x, -0.65, 0, 0.25);
      for (let i = 0; i < 9; i++) {
        const cx = x - 0.3 + (i % 3) * 0.3, cz = 0.25 + Math.floor(i / 3) * 0.3;
        if (i % 2) t.inSlot(3, () => box(t, 0.26, 0.02, 0.26, cx, 0.25, cz, arrows[(i >> 1) % 4]));
        else box(t, 0.26, 0.02, 0.26, cx, 0.25, cz, '#2b2d33');
      }
    }
    // The arch: two posts and a beam of coloured lamps.
    for (const s of [-1, 1]) t.block(0.14, 2.6, 0.14, s * 1.5, 0.25, -0.95, '#2b2d33', 0.2);
    box(t, 3.14, 0.16, 0.16, 0, 2.85, -0.95, '#2b2d33');
    for (let i = 0; i < 8; i++) t.inSlot(3, () => t.sphere(0.07, -1.3 + i * 0.37, 2.8, -0.82, arrows[i % 4]));
    glow(t, 1.6, 0.26, 0, 2.5, -0.86, '#ff4fa3', 0.02);
  },
  /** A neon pixel-art pigeon for the wall (our mascot). */
  toyPixelPigeonNeon(t) {
    // 12 × 10 pixels; '.' off, g grey, n neck green, o orange eye, y yellow beak, p pink feet.
    const art = [
      '....gggg....',
      '...gggggg...',
      '..gggoggyy..',
      '..ggggggg...',
      '...nnnnn....',
      '..ggggggggg.',
      '.gggggggggg.',
      '..gggggggg..',
      '....p..p....',
      '...pp..pp...',
    ];
    const col: Record<string, string> = { g: '#9b5cff', n: '#3ddc84', o: '#ff7b00', y: '#ffd23f', p: '#ff4fa3' };
    const px = 0.12;
    box(t, 1.56, 1.32, 0.04, 0, 0, -0.02, '#120a1f');
    art.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch !== '.') glow(t, px * 0.86, px * 0.86, -0.66 + c * px, 1.2 - r * px, 0.01, col[ch], 0.02);
    }));
  },

  // ============================================================ 🎰 Empire Casino
  /** The centrepiece: a gold art deco Empire State spire on a black marble plinth, its crown lit. */
  toyEmpireSpire(t) {
    t.cyl(1.25, 1.3, 0.42, 0, 0, 0, '#141418', 32);
    t.add(new THREE.TorusGeometry(1.26, 0.035, 6, 48).rotateX(Math.PI / 2).translate(0, 0.42, 0), GOLD);
    t.inSlot(3, () => t.add(new THREE.TorusGeometry(1.31, 0.02, 6, 48).rotateX(Math.PI / 2).translate(0, 0.05, 0), '#ffd36b'));
    const tiers: [number, number][] = [[0.95, 0.7], [0.78, 0.55], [0.62, 0.42], [0.48, 0.3], [0.36, 0.22]];
    let y = 0.42;
    tiers.forEach(([w, h], k) => {
      box(t, w, h, w, 0, y, 0, k % 2 ? '#c9a55c' : '#d8bd7c');
      // Window piers: dark slots up each face.
      for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
        box(t, 0.02, h * 0.8, 0.012, -w * 0.36 + i * w * 0.18, y + h * 0.1, s * (w / 2 + 0.003), '#3b2f1e');
        box(t, 0.012, h * 0.8, 0.02, s * (w / 2 + 0.003), y + h * 0.1, -w * 0.36 + i * w * 0.18, '#3b2f1e');
      }
      y += h;
    });
    // The lit crown and the mast.
    t.inSlot(3, () => {
      box(t, 0.28, 0.16, 0.28, 0, y, 0, '#ffe08a');
      box(t, 0.2, 0.12, 0.2, 0, y + 0.16, 0, '#fff3c4');
    });
    t.cyl(0.05, 0.08, 0.2, 0, y + 0.28, 0, GOLD, 10);
    t.cyl(0.015, 0.04, 0.32, 0, y + 0.48, 0, CHROME, 8);
    t.inSlot(3, () => t.sphere(0.035, 0, y + 0.82, 0, '#ff3b3b'));
  },
  /** A slot carousel: six slots round a gold column with a JACKPOT crown. */
  toySlotCarousel(t) {
    t.cyl(0.42, 0.46, 2.15, 0, 0, 0, '#1d1a12', 18);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      place(t, slot(i % 2 ? '#7a0f1c' : '#14213d', GOLD), Math.sin(a) * 0.92, Math.cos(a) * 0.92, a);
    }
    t.cyl(0.62, 0.5, 0.3, 0, 2.15, 0, GOLD, 18);
    t.inSlot(3, () => {
      t.cyl(0.6, 0.6, 0.12, 0, 2.24, 0, '#ff3b3b', 18);
      t.add(new THREE.TorusGeometry(0.64, 0.025, 6, 30).rotateX(Math.PI / 2).translate(0, 2.47, 0), '#ffd36b');
    });
    t.cyl(0.2, 0.3, 0.18, 0, 2.45, 0, GOLD_LT, 12);
  },
  /** The video poker bar: a long walnut bar with six screens set into the top and stools out front. */
  toyVideoPokerBar(t) {
    box(t, 4.0, 1.0, 0.7, 0, 0, 0, '#2a1a12');
    for (let i = 0; i < 9; i++) box(t, 0.03, 0.85, 0.02, -1.6 + i * 0.4, 0.07, 0.355, GOLD);
    box(t, 4.1, 0.05, 0.85, 0, 1.0, 0.05, '#121014');
    box(t, 4.12, 0.03, 0.03, 0, 1.02, 0.47, GOLD);
    glow(t, 3.9, 0.03, 0, 0.05, 0.36, '#ffd36b', 0.02);
    for (let i = 0; i < 6; i++) {
      const x = -1.6 + i * 0.64;
      t.add(new THREE.BoxGeometry(0.42, 0.3, 0.05).rotateX(-0.9).translate(x, 1.14, 0.08), INK);
      t.inSlot(3, () => t.add(new THREE.BoxGeometry(0.36, 0.24, 0.01).rotateX(-0.9).translate(x, 1.16, 0.105), i % 2 ? '#1d6fff' : '#2a9d8f'));
      t.cyl(0.025, 0.12, 0.72, x, 0, 0.82, CHROME, 8);
      t.cyl(0.2, 0.19, 0.09, x, 0.72, 0.82, '#14213d', 16);
    }
  },
  /** A fluted black-and-gold column with a glowing uplight crown. */
  toyDecoColumn(t) {
    box(t, 0.6, 0.18, 0.6, 0, 0, 0, '#121014');
    box(t, 0.46, 2.4, 0.46, 0, 0.18, 0, '#121014');
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      box(t, 0.03, 2.3, 0.02, -0.15 + i * 0.1, 0.23, s * 0.235, GOLD);
      box(t, 0.02, 2.3, 0.03, s * 0.235, 0.23, -0.15 + i * 0.1, GOLD);
    }
    box(t, 0.62, 0.12, 0.62, 0, 2.58, 0, GOLD);
    t.inSlot(3, () => box(t, 0.52, 0.06, 0.52, 0, 2.7, 0, '#ffe08a'));
  },
};

/** Four cabinets back to back round a pillar (body, screen, marquee each), and a pixel heart up top. */
function pod(t: Toy, looks: [string, string, string][], heart: string): void {
  t.cyl(0.32, 0.36, 2.3, 0, 0, 0, '#16121f', 12);
  for (let i = 0; i < 3; i++) t.inSlot(3, () => t.add(new THREE.TorusGeometry(0.34, 0.02, 6, 20).rotateX(Math.PI / 2).translate(0, 0.6 + i * 0.7, 0), heart));
  looks.forEach(([b, f, m], i) => {
    const a = (i * Math.PI) / 2;
    place(t, cabinet(b, f, m), Math.sin(a) * 0.72, Math.cos(a) * 0.72, a);
  });
  // A pixel heart, two-sided.
  const art = ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'];
  for (const [rx, z] of [[0, 0.06], [Math.PI, -0.06]] as [number, number][]) {
    art.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === 'x') t.inSlot(3, () => t.add(new THREE.BoxGeometry(0.09, 0.09, 0.04).translate(-0.3 + c * 0.1, 2.95 - r * 0.1, z).rotateY(rx), heart));
    }));
  }
  box(t, 0.76, 0.66, 0.08, 0, 2.38, 0, '#16121f');
}

/** Wall pieces (kept at their height). */
export const NIGHT_ON_WALL: string[] = ['toyPixelPigeonNeon'];
