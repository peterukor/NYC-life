// =====================================================================
// furniture-deco.ts — the pieces that make a home YOURS, built in code:
// lights of every kind (LED strips, fairy lights, neon, chandeliers,
// pendants, arc lamps), wall art, mirrors, rugs, vases and candles.
// (Peter, 2026-10-27: "from furnitures, to bulbs styles to hanging
// lights to mats and rugs, to different colors".)
//
// Same conventions as furniture-toys.ts (metres, front faces +z), and
// colour SLOTS so players can recolour them (assets/furniture-kit.ts):
//   inSlot(1, …) main colour   inSlot(2, …) frame   inSlot(3, …) glows
// Colours given inside slots 1–2 are shading only (white = the chosen
// colour exactly). Glow parts take the light's colour when lit.
//
// Three placements (data/furniture.ts says which):
//   wall    — DECO_ON_WALL: the back sits at z = −depth/2, kept at its height
//   ceiling — DECO_HANG:    the top is at y = 0 (hung from the ceiling)
//   else    — on the floor, or on a table top for small decor
// =====================================================================

import * as THREE from 'three';
import type { Toy } from './landmarks/toy.ts';

const BLACK = '#1d1e22';
const WHITE = '#ffffff';
const GLASS = '#d9ecf2';
const CORD = '#2a2a2e';
const MIRROR = '#b9cbd6';

/** A cord from the ceiling (y = 0) down to y = −len. */
function cord(t: Toy, x: number, z: number, len: number): void {
  t.cyl(0.006, 0.006, len, x, -len, z, CORD, 4);
  t.cyl(0.05, 0.05, 0.02, x, -0.02, z, CORD, 10); // ceiling rose
}

/** A tube through points (for neon shapes and arcs). */
function tube(t: Toy, pts: [number, number, number][], r: number, color: string, closed = false): void {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed);
  t.add(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 6), r, 6, closed), color);
}

export const DECO_TOYS: Record<string, (t: Toy) => void> = {
  // ================================================================ lights
  /** A 2 m LED strip in a slim channel: lights the wall behind it. */
  decoLedStrip(t) {
    t.block(2.0, 0.03, 0.03, 0, 0, 0, '#3a3d44', 0.2);
    t.inSlot(3, () => t.block(1.96, 0.012, 0.012, 0, 0.012, 0.012, WHITE, 0.3));
  },
  /** Fairy lights draped in three swoops, warm little bulbs. */
  decoFairyLights(t) {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 36; i++) {
      const u = i / 36;
      const x = -1.2 + u * 2.4;
      const sag = Math.abs(Math.sin(u * Math.PI * 3)) * 0.22;
      pts.push([x, 0.3 - sag, 0.02]);
    }
    tube(t, pts, 0.004, '#3b4a3a');
    t.inSlot(3, () => pts.forEach((p, i) => i % 2 === 0 && t.sphere(0.018, p[0], p[1] - 0.015, p[2] + 0.01, WHITE)));
  },
  /** Neon heart on a clear backing plate. */
  decoNeonHeart(t) {
    t.block(0.62, 0.56, 0.015, 0, -0.03, -0.01, '#cfd8dc', 0.1);
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const x = 16 * Math.pow(Math.sin(a), 3), y = 13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a);
      pts.push([x * 0.016, y * 0.016 + 0.25, 0.02]);
    }
    t.inSlot(3, () => tube(t, pts, 0.012, WHITE, true));
  },
  /** Neon lightning bolt. */
  decoNeonBolt(t) {
    t.block(0.42, 0.66, 0.015, 0, 0, -0.01, '#cfd8dc', 0.1);
    t.inSlot(3, () => tube(t, [[0.08, 0.6, 0.02], [-0.1, 0.33, 0.02], [0.05, 0.33, 0.02], [-0.08, 0.06, 0.02]], 0.013, WHITE));
  },
  /** Neon "NYC" in looping script-ish strokes. */
  decoNeonNyc(t) {
    t.block(1.0, 0.46, 0.015, 0, 0, -0.01, '#cfd8dc', 0.1);
    const z = 0.02;
    t.inSlot(3, () => {
      tube(t, [[-0.4, 0.08, z], [-0.4, 0.38, z], [-0.2, 0.08, z], [-0.2, 0.38, z]], 0.012, WHITE); // N
      tube(t, [[-0.08, 0.38, z], [0.02, 0.24, z], [0.12, 0.38, z]], 0.012, WHITE); // Y arms
      tube(t, [[0.02, 0.24, z], [0.02, 0.08, z]], 0.012, WHITE);
      const c: [number, number, number][] = [];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI * 0.3 + (i / 12) * Math.PI * 1.4;
        c.push([0.33 + Math.cos(a) * 0.12, 0.23 + Math.sin(a) * 0.15, z]);
      }
      tube(t, c, 0.012, WHITE); // C
    });
  },
  /** Brass wall sconce with a glass shade. */
  decoSconce(t) {
    t.inSlot(2, () => {
      t.cyl(0.05, 0.05, 0.02, 0, 0, 0, WHITE, 12);
      t.add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12).rotateX(Math.PI / 2).translate(0, 0.02, -0.04), WHITE);
      tube(t, [[0, 0.02, -0.03], [0, 0.04, 0.08], [0, 0.12, 0.12]], 0.01, WHITE);
    });
    t.inSlot(3, () => t.cyl(0.07, 0.05, 0.14, 0, 0.12, 0.12, WHITE, 14));
  },
  /** A glass globe pendant on a long cord. */
  decoGlobePendant(t) {
    cord(t, 0, 0, 0.7);
    t.inSlot(2, () => t.cyl(0.03, 0.03, 0.05, 0, -0.74, 0, WHITE, 10));
    t.inSlot(3, () => t.sphere(0.16, 0, -0.9, 0, WHITE));
  },
  /** Five Edison bulbs at different heights. */
  decoBulbCluster(t) {
    t.inSlot(2, () => t.block(0.7, 0.03, 0.18, 0, -0.03, 0, WHITE, 0.3));
    [[-0.28, 0.5], [-0.14, 0.8], [0, 0.6], [0.14, 0.9], [0.28, 0.55]].forEach(([x, len]) => {
      t.cyl(0.005, 0.005, len, x, -len, 0, CORD, 4);
      t.cyl(0.018, 0.018, 0.05, x, -len - 0.05, 0, '#3a3024', 8);
      t.inSlot(3, () => t.add(new THREE.SphereGeometry(0.055, 10, 8).scale(1, 1.35, 1).translate(x, -len - 0.12, 0), WHITE));
    });
  },
  /** A crystal chandelier: brass hoops, candle bulbs, glass drops. */
  decoCrystalChandelier(t) {
    cord(t, 0, 0, 0.35);
    t.inSlot(2, () => {
      t.cyl(0.02, 0.02, 0.4, 0, -0.75, 0, WHITE, 8);
      t.add(new THREE.TorusGeometry(0.42, 0.015, 6, 28).rotateX(Math.PI / 2).translate(0, -0.72, 0), WHITE);
      t.add(new THREE.TorusGeometry(0.26, 0.012, 6, 22).rotateX(Math.PI / 2).translate(0, -0.52, 0), WHITE);
    });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = Math.cos(a) * 0.42, z = Math.sin(a) * 0.42;
      t.inSlot(2, () => t.cyl(0.02, 0.025, 0.08, x, -0.72, z, WHITE, 8));
      t.inSlot(3, () => t.add(new THREE.SphereGeometry(0.03, 8, 6).scale(1, 1.6, 1).translate(x, -0.6, z), WHITE));
      // Crystal drops hanging off the hoop.
      t.add(new THREE.OctahedronGeometry(0.035, 0).scale(0.7, 1.4, 0.7).translate(Math.cos(a + 0.3) * 0.36, -0.82, Math.sin(a + 0.3) * 0.36), GLASS);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      t.inSlot(3, () => t.add(new THREE.SphereGeometry(0.026, 8, 6).scale(1, 1.6, 1).translate(Math.cos(a) * 0.26, -0.43, Math.sin(a) * 0.26), WHITE));
    }
    t.add(new THREE.OctahedronGeometry(0.06, 0).scale(0.7, 1.6, 0.7).translate(0, -1.0, 0), GLASS);
  },
  /** A brass sputnik: rods out in all directions, a bulb on each. */
  decoSputnik(t) {
    cord(t, 0, 0, 0.4);
    t.inSlot(2, () => t.sphere(0.07, 0, -0.55, 0, WHITE));
    for (let i = 0; i < 12; i++) {
      const y = 1 - (i / 11) * 2, r = Math.sqrt(1 - y * y), a = i * 2.4;
      const d = new THREE.Vector3(Math.cos(a) * r, y * 0.8, Math.sin(a) * r).normalize();
      const end = d.clone().multiplyScalar(0.4).add(new THREE.Vector3(0, -0.55, 0));
      t.inSlot(2, () => tube(t, [[0, -0.55, 0], [end.x, end.y, end.z]], 0.008, WHITE));
      t.inSlot(3, () => t.sphere(0.035, end.x, end.y, end.z, WHITE));
    }
  },
  /** A modern LED ring pendant. */
  decoRingPendant(t) {
    for (const x of [-0.4, 0.4]) t.cyl(0.004, 0.004, 0.8, x, -0.8, 0, CORD, 4);
    t.inSlot(2, () => t.add(new THREE.TorusGeometry(0.45, 0.03, 8, 40).rotateX(Math.PI / 2).translate(0, -0.82, 0), WHITE));
    t.inSlot(3, () => t.add(new THREE.TorusGeometry(0.45, 0.018, 6, 40).rotateX(Math.PI / 2).translate(0, -0.85, 0), WHITE));
  },
  /** A round paper lantern. */
  decoPaperLantern(t) {
    cord(t, 0, 0, 0.6);
    t.inSlot(3, () => t.add(new THREE.SphereGeometry(0.3, 16, 10).scale(1, 0.92, 1).translate(0, -0.9, 0), WHITE));
    for (let i = 1; i < 6; i++) t.add(new THREE.TorusGeometry(Math.sin((i / 6) * Math.PI) * 0.305, 0.004, 4, 24).rotateX(Math.PI / 2).translate(0, -0.9 + Math.cos((i / 6) * Math.PI) * 0.28, 0), '#d8d2c4');
  },
  /** A big arc floor lamp: marble base, steel arc, dome shade out over the sofa. */
  decoArcLamp(t) {
    t.block(0.36, 0.1, 0.36, 0, 0, -0.5, '#e9e6e0', 0.15);
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI * 0.85;
      pts.push([0, 0.1 + Math.sin(a) * 1.75, -0.5 + (1 - Math.cos(a)) * 0.75]);
    }
    t.inSlot(2, () => {
      tube(t, pts, 0.016, WHITE);
      const e = pts[pts.length - 1];
      t.add(new THREE.SphereGeometry(0.24, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, e[1] - 0.26, e[2]), WHITE);
    });
    const e = pts[pts.length - 1];
    t.inSlot(3, () => t.add(new THREE.CircleGeometry(0.21, 16).rotateX(Math.PI / 2).translate(0, e[1] - 0.27, e[2]), WHITE));
  },
  /** A wooden tripod floor lamp with a drum shade. */
  decoTripodLamp(t) {
    t.inSlot(2, () => {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        tube(t, [[Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28], [0, 1.25, 0]], 0.018, WHITE);
      }
    });
    t.inSlot(3, () => t.cyl(0.24, 0.24, 0.32, 0, 1.2, 0, WHITE, 18));
  },
  /** Three pillar candles on a tray. */
  decoCandles(t) {
    t.inSlot(2, () => t.cyl(0.17, 0.17, 0.02, 0, 0, 0, WHITE, 16));
    [[-0.07, 0.16, 0.04], [0.06, 0.11, -0.04], [0.05, 0.07, 0.08]].forEach(([x, h, z]) => {
      t.cyl(0.035, 0.035, h, x, 0.02, z, '#f6efe1', 12);
      t.inSlot(3, () => t.add(new THREE.SphereGeometry(0.012, 6, 4).scale(1, 2, 1).translate(x, 0.02 + h + 0.02, z), WHITE));
    });
  },
  /** A lava lamp: the blob glows in its colour. */
  decoLavaLamp(t) {
    t.cyl(0.07, 0.09, 0.12, 0, 0, 0, '#9aa3ae', 12);
    t.inSlot(3, () => t.cyl(0.05, 0.07, 0.3, 0, 0.12, 0, WHITE, 12));
    t.cyl(0.03, 0.05, 0.06, 0, 0.42, 0, '#9aa3ae', 12);
  },
  /** A mushroom table lamp, glossy. */
  decoMushroomLamp(t) {
    t.inSlot(1, () => {
      t.cyl(0.05, 0.06, 0.28, 0, 0, 0, WHITE, 14);
      t.add(new THREE.SphereGeometry(0.17, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.27, 0), WHITE);
    });
    t.inSlot(3, () => t.add(new THREE.CircleGeometry(0.15, 16).rotateX(Math.PI / 2).translate(0, 0.265, 0), WHITE));
  },

  /** Logs and flames for a fireplace: the flames glow (and flicker, home-interior.ts). */
  decoFire(t) {
    for (const [x, r] of [[-0.12, 0.3], [0.1, -0.25], [0, 0.05]] as const) t.add(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8).rotateZ(Math.PI / 2).rotateY(r).translate(x, 0.05, 0), '#5a3b26');
    t.inSlot(3, () => {
      for (const [x, h, s] of [[-0.12, 0.28, 0.09], [0.02, 0.38, 0.11], [0.14, 0.24, 0.08]] as const) t.add(new THREE.ConeGeometry(s, h, 7).translate(x, 0.1 + h / 2, 0), WHITE);
    });
  },

  /** An indoor pool, 6 × 3.2 m: stone coping, tiled sides, glowing water, steps and a ladder. */
  decoPool(t) {
    const W = 6, D = 3.2, c = 0.3;
    t.inSlot(2, () => {
      t.block(W + c * 2, 0.12, c, 0, 0, -D / 2 - c / 2, WHITE, 0.1);
      t.block(W + c * 2, 0.12, c, 0, 0, D / 2 + c / 2, WHITE, 0.1);
      t.block(c, 0.12, D, -W / 2 - c / 2, 0, 0, WHITE, 0.1);
      t.block(c, 0.12, D, W / 2 + c / 2, 0, 0, WHITE, 0.1);
    });
    t.inSlot(3, () => t.add(new THREE.PlaneGeometry(W, D, 12, 6).rotateX(-Math.PI / 2).translate(0, 0.06, 0), '#3fb6e0'));
    for (let i = 0; i < 3; i++) t.block(1.0, 0.05, 0.3, -W / 2 + 0.6, 0.0, -D / 2 + 0.25 + i * 0.3, '#cfe9f1', 0.1); // steps under the water
    for (const x of [W / 2 - 0.6, W / 2 - 0.2]) tube(t, [[x, 0.06, D / 2 - 0.1], [x, 0.7, D / 2 + 0.05], [x, 0.7, D / 2 + 0.2], [x, 0.1, D / 2 + 0.3]], 0.02, '#c0c4ca');
  },
  /** A sun lounger with a cushion and a rolled towel. */
  decoLounger(t) {
    t.inSlot(2, () => {
      t.block(0.7, 0.08, 1.9, 0, 0.25, 0, WHITE, 0.15);
      for (const x of [-0.3, 0.3]) for (const z of [-0.85, 0.85]) t.block(0.05, 0.25, 0.05, x, 0, z, WHITE, 0.2);
      t.add(new THREE.BoxGeometry(0.66, 0.06, 0.7).translate(0, 0.03, -0.35).rotateX(-0.6).translate(0, 0.42, -0.62), WHITE);
    });
    t.inSlot(1, () => {
      t.block(0.62, 0.06, 1.2, 0, 0.33, 0.3, WHITE, 0.3);
      t.add(new THREE.BoxGeometry(0.6, 0.05, 0.62).translate(0, 0.03, -0.31).rotateX(-0.6).translate(0, 0.46, -0.6), WHITE);
    });
    t.add(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8).rotateZ(Math.PI / 2).translate(0, 0.45, 0.75), '#f6efe1');
  },

  // ================================================================ venues (2026-10-27: "real and lively")
  /** A 4 × 4 m LED dance floor: 64 glass tiles that flash (pulse: disco). */
  decoLedFloor(t) {
    t.block(4.1, 0.08, 4.1, 0, 0, 0, '#15121c', 0.05);
    const cols = ['#ff3fb4', '#22d3ee', '#9b5cff', '#ffd36b', '#3ddc84', '#ff6a3d'];
    t.inSlot(3, () => {
      for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
        t.add(new THREE.BoxGeometry(0.44, 0.02, 0.44).translate(-1.75 + i * 0.5, 0.09, -1.75 + j * 0.5), cols[(i * 3 + j * 5 + ((i * j) % 4)) % cols.length]);
      }
    });
  },
  /** A 4.4 m bar counter: marble top, a glowing front panel, foot rail (pulse: breathe). */
  decoLedBar(t) {
    const W = 4.4;
    t.block(W, 1.0, 0.7, 0, 0, 0, '#1b1820', 0.04);
    t.inSlot(2, () => t.block(W + 0.1, 0.06, 0.82, 0, 1.0, 0.03, WHITE, 0.2));
    t.inSlot(3, () => {
      for (let i = 0; i < 11; i++) t.add(new THREE.PlaneGeometry(0.36, 0.8).translate(-W / 2 + 0.2 + i * 0.4, 0.5, 0.352), WHITE);
    });
    t.add(new THREE.CylinderGeometry(0.02, 0.02, W, 6).rotateZ(Math.PI / 2).translate(0, 0.18, 0.5), '#c9a24a');
  },
  /** Back-bar shelves of lit bottles (wall). */
  decoBottleShelf(t) {
    const W = 3.2;
    t.block(W, 2.0, 0.3, 0, 0, 0, '#2a2026', 0.04);
    const cols = ['#7fb069', '#c47f2c', '#e9e6e0', '#3d8bff', '#8c2f39', '#f6d58e'];
    for (let r = 0; r < 3; r++) {
      const y = 0.45 + r * 0.55;
      t.inSlot(2, () => t.block(W - 0.1, 0.03, 0.26, 0, y, 0.03, WHITE, 0.1));
      t.inSlot(3, () => t.add(new THREE.PlaneGeometry(W - 0.2, 0.02).translate(0, y + 0.5, 0.17), WHITE));
      for (let k = 0; k < 13; k++) {
        const x = -W / 2 + 0.2 + k * 0.23, h = 0.26 + ((k * 7 + r) % 3) * 0.05;
        t.cyl(0.035, 0.04, h, x, y + 0.03, 0.05, cols[(k + r * 2) % cols.length], 7);
        t.cyl(0.012, 0.012, 0.07, x, y + 0.03 + h, 0.05, '#1d1f24', 5);
      }
    }
  },
  /** A circular lighting truss with moving heads and video screens (hangs over the dance floor). */
  decoTrussRing(t) {
    const R = 2.0, y = -1.0;
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) t.cyl(0.015, 0.015, 1.0, Math.cos(a) * R, y, Math.sin(a) * R, CORD, 4);
    t.add(new THREE.TorusGeometry(R, 0.08, 6, 40).rotateX(Math.PI / 2).translate(0, y, 0), '#2b2d33');
    t.add(new THREE.TorusGeometry(R, 0.03, 4, 40).rotateX(Math.PI / 2).translate(0, y - 0.12, 0), '#3a3d44');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      t.block(0.18, 0.16, 0.18, Math.cos(a) * R, y - 0.32, Math.sin(a) * R, '#1d1e22', 0.2);
      t.inSlot(3, () => t.add(new THREE.CircleGeometry(0.06, 10).rotateX(Math.PI / 2).translate(Math.cos(a) * R, y - 0.33, Math.sin(a) * R), ['#ff3fb4', '#22d3ee', '#9b5cff', '#ffd36b'][i % 4]));
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const g = new THREE.BoxGeometry(0.9, 0.55, 0.05).translate(0, y - 0.45, 0).rotateY(-a + Math.PI / 2);
      t.add(g.clone().translate(Math.cos(a) * (R - 0.15), 0, Math.sin(a) * (R - 0.15)), '#111216');
      t.inSlot(3, () => t.add(new THREE.PlaneGeometry(0.8, 0.45).translate(0, y - 0.45, 0.03).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * (R - 0.15), 0, Math.sin(a) * (R - 0.15)), ['#9b5cff', '#22d3ee', '#ff3fb4', '#3d8bff'][i]));
    }
  },
  /** A raised VIP deck: glass tiles lit from below, a glowing edge (flat: sofas stand on it). */
  decoVipRiser(t) {
    const W = 5, D = 4;
    t.block(W, 0.05, D, 0, 0, 0, '#16131d', 0.05);
    t.inSlot(3, () => {
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) t.add(new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2).translate(-2 + i, 0.052, -1.5 + j), '#3d6bff');
      t.block(W + 0.05, 0.02, 0.05, 0, 0.04, D / 2, '#22d3ee', 0.3);
      t.block(0.05, 0.02, D, W / 2, 0.04, 0, '#22d3ee', 0.3);
    });
  },
  /** A lounge set: a round marble table with a candle, two tub chairs. */
  decoLoungeSet(t) {
    t.cyl(0.05, 0.12, 0.7, 0, 0, 0, '#1d1f24', 10);
    t.inSlot(2, () => t.cyl(0.42, 0.42, 0.05, 0, 0.7, 0, WHITE, 20));
    t.cyl(0.04, 0.04, 0.08, 0.1, 0.75, 0.05, '#e9e6e0', 8);
    t.inSlot(3, () => t.add(new THREE.SphereGeometry(0.02, 6, 4).scale(1, 2, 1).translate(0.1, 0.87, 0.05), '#ffb766'));
    t.cyl(0.04, 0.05, 0.22, -0.12, 0.75, -0.08, '#3a5a3a', 8); // a bottle
    for (const sx of [-1, 1]) {
      t.inSlot(1, () => {
        t.add(new THREE.CylinderGeometry(0.32, 0.28, 0.45, 16, 1, false, 0, Math.PI * 1.3).rotateY(sx > 0 ? -Math.PI * 0.15 + Math.PI / 2 : Math.PI * 0.85 + Math.PI / 2).translate(sx * 0.82, 0.25, 0), WHITE);
        t.cyl(0.29, 0.29, 0.1, sx * 0.82, 0.25, 0, '#e0e0e0', 16);
      });
      t.cyl(0.02, 0.02, 0.25, sx * 0.82, 0, 0, '#c9a24a', 6);
    }
  },
  // ================================================================ Lagos Life staples (Peter, 2026-10-27)
  /** A split air conditioner high on the wall: the most Lagos thing in any room. */
  decoSplitAC(t) {
    t.inSlot(2, () => t.block(0.95, 0.3, 0.24, 0, 0, 0.12, WHITE, 0.08));
    t.block(0.8, 0.025, 0.02, 0, 0.05, 0.245, '#9aa3ad', 0.01); // the vent
    t.inSlot(3, () => t.sphere(0.012, 0.36, 0.2, 0.245, WHITE));
  },
  /** A ring light on a tripod: content creators only. */
  decoRingLight(t) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      tube(t, [[Math.cos(a) * 0.28, 0, Math.sin(a) * 0.28], [0, 0.75, 0]], 0.012, BLACK);
    }
    t.cyl(0.012, 0.012, 0.85, 0, 0.75, 0, BLACK, 6);
    t.inSlot(3, () => t.add(new THREE.TorusGeometry(0.22, 0.025, 8, 28).translate(0, 1.78, 0.02), WHITE));
    t.block(0.07, 0.14, 0.01, 0, 1.71, 0.02, '#26282e', 0.01); // the phone
  },
  /** A standing fan. */
  decoStandFan(t) {
    t.cyl(0.2, 0.22, 0.04, 0, 0, 0, BLACK, 16);
    t.cyl(0.018, 0.018, 1.0, 0, 0.04, 0, '#c0c4ca', 6);
    t.inSlot(1, () => t.cyl(0.07, 0.07, 0.14, 0, 1.0, -0.02, WHITE, 10));
    t.add(new THREE.TorusGeometry(0.26, 0.008, 4, 28).translate(0, 1.13, 0.1), '#c0c4ca');
    for (let i = 0; i < 3; i++) {
      t.inSlot(1, () => t.add(new THREE.CircleGeometry(0.12, 10, 0, 1.2).rotateZ((i / 3) * Math.PI * 2).translate(0, 1.13, 0.1), WHITE));
    }
  },
  /** A water dispenser with a big blue bottle. */
  decoWaterDispenser(t) {
    t.block(0.36, 0.95, 0.36, 0, 0, 0, '#f2f2ef', 0.04);
    t.block(0.2, 0.06, 0.02, 0, 0.62, 0.18, '#c0392b', 0.01);
    t.inSlot(1, () => t.cyl(0.15, 0.15, 0.42, 0, 0.95, 0, WHITE, 16));
    t.inSlot(1, () => t.cyl(0.05, 0.15, 0.06, 0, 1.37, 0, WHITE, 16));
  },
  /** A throne: red velvet, gold frame, crown on top. For the main character. */
  decoThrone(t) {
    t.inSlot(2, () => {
      t.block(0.9, 0.42, 0.8, 0, 0, 0, WHITE, 0.03);
      t.block(0.14, 0.75, 0.8, -0.38, 0, 0, WHITE, 0.03);
      t.block(0.14, 0.75, 0.8, 0.38, 0, 0, WHITE, 0.03);
      t.block(0.9, 1.55, 0.14, 0, 0, -0.33, WHITE, 0.03);
      for (const x of [-0.3, 0, 0.3]) t.cyl(0.0, 0.06, 0.18, x, 1.55, -0.33, WHITE, 4);
    });
    t.inSlot(1, () => {
      t.block(0.62, 0.12, 0.62, 0, 0.42, 0.04, WHITE, 0.05);
      t.block(0.62, 1.0, 0.08, 0, 0.5, -0.24, WHITE, 0.05);
    });
  },
  /** A four-poster canopy bed. */
  decoCanopyBed(t) {
    const W = 2.0, D = 2.3, H = 2.15;
    t.inSlot(2, () => {
      t.block(W, 0.32, D, 0, 0, 0, WHITE, 0.04);
      t.block(W, 1.0, 0.1, 0, 0, -D / 2 + 0.05, WHITE, 0.04); // headboard
      for (const [x, z] of [[-W / 2 + 0.05, -D / 2 + 0.05], [W / 2 - 0.05, -D / 2 + 0.05], [-W / 2 + 0.05, D / 2 - 0.05], [W / 2 - 0.05, D / 2 - 0.05]]) t.block(0.07, H, 0.07, x, 0, z, WHITE, 0.01);
      t.block(W, 0.06, 0.06, 0, H - 0.06, -D / 2 + 0.05, WHITE, 0.01);
      t.block(W, 0.06, 0.06, 0, H - 0.06, D / 2 - 0.05, WHITE, 0.01);
      t.block(0.06, 0.06, D, -W / 2 + 0.05, H - 0.06, 0, WHITE, 0.01);
      t.block(0.06, 0.06, D, W / 2 - 0.05, H - 0.06, 0, WHITE, 0.01);
    });
    t.block(W - 0.12, 0.2, D - 0.2, 0, 0.32, 0.05, '#f4f1ea', 0.06); // mattress
    t.inSlot(1, () => t.block(W - 0.08, 0.06, D * 0.62, 0, 0.5, D * 0.18, WHITE, 0.04)); // duvet
    for (const x of [-0.45, 0.45]) t.block(0.62, 0.14, 0.34, x, 0.52, -D / 2 + 0.35, '#ffffff', 0.06);
  },
  /** A black-framed glass partition (the see-through wall round a shower or a study). */
  decoGlassPanel(t) {
    const W = 1.4, H = 2.0;
    t.inSlot(2, () => {
      t.block(W, 0.05, 0.05, 0, 0, 0, WHITE, 0.005);
      t.block(W, 0.05, 0.05, 0, H - 0.05, 0, WHITE, 0.005);
      t.block(0.05, H, 0.05, -W / 2 + 0.025, 0, 0, WHITE, 0.005);
      t.block(0.05, H, 0.05, W / 2 - 0.025, 0, 0, WHITE, 0.005);
      t.block(0.03, H, 0.03, 0, 0, 0, WHITE, 0.005);
    });
  },
  /** A big rug with a border (red with gold, or any two colours). */
  decoBorderRug(t) {
    const W = 3.0, D = 2.0;
    t.inSlot(2, () => t.add(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2).translate(0, 0.008, 0), WHITE));
    t.inSlot(1, () => t.add(new THREE.PlaneGeometry(W - 0.3, D - 0.3).rotateX(-Math.PI / 2).translate(0, 0.01, 0), WHITE));
    t.inSlot(2, () => {
      for (const [w, d] of [[W - 0.5, D - 0.5]] as const) {
        t.add(new THREE.PlaneGeometry(w, 0.05).rotateX(-Math.PI / 2).translate(0, 0.012, d / 2), WHITE);
        t.add(new THREE.PlaneGeometry(w, 0.05).rotateX(-Math.PI / 2).translate(0, 0.012, -d / 2), WHITE);
        t.add(new THREE.PlaneGeometry(0.05, d).rotateX(-Math.PI / 2).translate(w / 2, 0.012, 0), WHITE);
        t.add(new THREE.PlaneGeometry(0.05, d).rotateX(-Math.PI / 2).translate(-w / 2, 0.012, 0), WHITE);
      }
      t.add(new THREE.CircleGeometry(0.3, 4).rotateX(-Math.PI / 2).translate(0, 0.012, 0), WHITE);
    });
  },
  /** A bold framed poster (yellow frame, a big graphic face). */
  decoPopArt(t) {
    t.inSlot(2, () => t.block(0.62, 0.8, 0.04, 0, 0, 0, WHITE, 0.01));
    t.inSlot(1, () => t.add(new THREE.PlaneGeometry(0.5, 0.68).translate(0, 0.4, 0.022), WHITE));
    t.add(new THREE.CircleGeometry(0.16, 24).translate(0, 0.46, 0.024), '#1d1e22');
    t.add(new THREE.PlaneGeometry(0.16, 0.05).translate(0, 0.24, 0.024), '#c0392b');
    t.add(new THREE.CircleGeometry(0.035, 12).translate(-0.06, 0.5, 0.026), '#ffffff');
    t.add(new THREE.CircleGeometry(0.035, 12).translate(0.06, 0.5, 0.026), '#ffffff');
  },
  /** A wall clock. */
  decoClock(t) {
    t.inSlot(2, () => t.add(new THREE.CylinderGeometry(0.2, 0.2, 0.04, 28).rotateX(Math.PI / 2).translate(0, 0.2, 0.02), WHITE));
    t.add(new THREE.CircleGeometry(0.175, 28).translate(0, 0.2, 0.042), '#f8f6f0');
    t.add(new THREE.PlaneGeometry(0.012, 0.12).translate(0, 0.25, 0.044), '#1d1e22');
    t.add(new THREE.PlaneGeometry(0.09, 0.012).rotateZ(0.5).translate(0.035, 0.22, 0.044), '#1d1e22');
  },
  /** A grand staircase going up (steps rise towards the back, a black rail each side). 1.3 × 3.8 m. */
  decoStairsUp(t) {
    const W = 1.3, L = 3.8, N = 14, H = 2.85;
    for (let i = 0; i < N; i++) {
      const z0 = L / 2 - (i + 1) * (L / N);
      t.inSlot(1, () => t.block(W - 0.1, (H * (i + 1)) / N, L / N, 0, 0, z0 + L / N / 2, WHITE, 0.01));
    }
    t.inSlot(2, () => {
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 - 0.03);
        tube(t, [[x, 0.95, L / 2 - 0.05], [x, 0.95 + H, -L / 2 + 0.05]], 0.025, WHITE);
        for (let i = 0; i <= 6; i++) {
          const f = i / 6, z = L / 2 - 0.05 - f * (L - 0.1), y = f * H;
          t.cyl(0.012, 0.012, 0.95, x, y, z, WHITE, 5);
        }
      }
    });
  },
  /** The top of the stairs: an opening in the floor with a rail round three sides and the first steps going down. 1.3 × 3.8 m. */
  decoStairsDown(t) {
    const W = 1.3, L = 3.8;
    t.add(new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2).translate(0, 0.012, 0), '#2a2622');
    for (let i = 0; i < 6; i++) {
      const k = 1 - i * 0.13;
      t.inSlot(1, () => t.add(new THREE.PlaneGeometry(W - 0.12, L / 14).rotateX(-Math.PI / 2).translate(0, 0.016, L / 2 - 0.15 - i * (L / 14)), new THREE.Color(WHITE).multiplyScalar(k)));
    }
    t.inSlot(2, () => {
      for (const sx of [-1, 1]) {
        const x = sx * (W / 2 + 0.02);
        t.block(0.05, 0.05, L, x, 0.95, 0, WHITE, 0.01);
        for (let i = 0; i <= 7; i++) t.cyl(0.012, 0.012, 0.95, x, 0, -L / 2 + (i * L) / 7, WHITE, 5);
      }
      t.block(W + 0.09, 0.05, 0.05, 0, 0.95, -L / 2, WHITE, 0.01);
    });
  },
  /** A live stage: a platform with a glowing edge, drum kit, mic stand, two speakers. */
  decoLiveStage(t) {
    const W = 5, D = 3;
    t.block(W, 0.5, D, 0, 0, 0, '#1a1820', 0.04);
    t.inSlot(3, () => t.block(W + 0.02, 0.04, 0.04, 0, 0.47, D / 2, '#ff3fb4', 0.3));
    t.inSlot(2, () => t.add(new THREE.PlaneGeometry(W - 0.2, D - 0.2).rotateX(-Math.PI / 2).translate(0, 0.505, 0), WHITE));
    // Drum kit.
    t.cyl(0.28, 0.28, 0.4, 0.6, 0.5, -0.6, '#c8553d', 16);
    for (const [x, z, r] of [[0.15, -0.3, 0.16], [1.05, -0.3, 0.16], [1.1, -0.9, 0.2]] as const) t.cyl(r, r, 0.22, x, 0.85, z, '#e9e6e0', 12);
    for (const [x, z] of [[-0.15, -0.9], [1.4, -0.4]]) {
      t.cyl(0.01, 0.01, 0.9, x, 0.5, z, '#c0c4ca', 5);
      t.cyl(0.25, 0.25, 0.01, x, 1.4, z, '#d4a84b', 16);
    }
    // Mic stand.
    t.cyl(0.12, 0.12, 0.02, -0.9, 0.5, 0.6, '#1d1f24', 10);
    t.cyl(0.01, 0.01, 1.4, -0.9, 0.5, 0.6, '#c0c4ca', 5);
    t.sphere(0.04, -0.9, 1.95, 0.6, '#1d1f24');
    // Speakers.
    for (const sx of [-1, 1]) t.block(0.6, 1.3, 0.5, sx * (W / 2 - 0.35), 0.5, D / 2 - 0.4, '#1d1e22', 0.1);
  },
  /** A neon entrance arch (stand it just inside the door). */
  decoNeonArch(t) {
    const W = 2.8, H = 3.0;
    for (const sx of [-1, 1]) t.block(0.35, H, 0.35, sx * (W / 2), 0, 0, '#1d1e22', 0.1);
    t.block(W + 0.35, 0.5, 0.35, 0, H, 0, '#1d1e22', 0.1);
    t.inSlot(3, () => {
      for (const k of [0, 1]) {
        const o = 0.08 + k * 0.1;
        tube(t, [[-W / 2 + o, 0.05, 0.19], [-W / 2 + o, H - o, 0.19], [W / 2 - o, H - o, 0.19], [W / 2 - o, 0.05, 0.19]], 0.025, k ? '#ff8a3d' : '#ffd36b');
      }
    });
  },

  // ================================================================ wall decor
  /** Abstract canvas: big soft shapes (main colour) on cream. */
  decoArtShapes(t) {
    t.inSlot(2, () => t.block(1.0, 1.3, 0.04, 0, 0, 0, WHITE, 0.05));
    t.block(0.92, 1.22, 0.02, 0, 0.04, 0.02, '#f2ece0', 0.02);
    t.inSlot(1, () => {
      t.add(new THREE.CircleGeometry(0.26, 24).translate(-0.12, 0.85, 0.035), WHITE);
      t.add(new THREE.PlaneGeometry(0.5, 0.36).translate(0.12, 0.38, 0.035), '#b0b0b0');
    });
    t.add(new THREE.CircleGeometry(0.14, 20, 0, Math.PI).translate(0.2, 0.62, 0.036), '#1d1f24');
  },
  /** A triptych of colour fields. */
  decoArtTriptych(t) {
    [-0.5, 0, 0.5].forEach((x, i) => {
      t.inSlot(2, () => t.block(0.42, 0.62, 0.035, x, 0, 0, WHITE, 0.05));
      t.inSlot(1, () => t.add(new THREE.PlaneGeometry(0.36, 0.56).translate(x, 0.31, 0.02), ['#ffffff', '#c4c4c4', '#8a8a8a'][i]));
      t.add(new THREE.PlaneGeometry(0.36, 0.1).translate(x, 0.1 + i * 0.16, 0.021), '#f2ece0');
    });
  },
  /** A big framed skyline print. */
  decoArtSkyline(t) {
    t.inSlot(2, () => t.block(1.3, 0.9, 0.04, 0, 0, 0, WHITE, 0.04));
    t.inSlot(1, () => t.add(new THREE.PlaneGeometry(1.2, 0.8).translate(0, 0.45, 0.021), WHITE));
    const towers = [[-0.5, 0.25], [-0.4, 0.4], [-0.3, 0.3], [-0.18, 0.62], [-0.06, 0.35], [0.06, 0.48], [0.18, 0.3], [0.3, 0.55], [0.42, 0.28], [0.52, 0.36]];
    for (const [x, h] of towers) t.add(new THREE.PlaneGeometry(0.1, h).translate(x, 0.05 + h / 2, 0.022), '#1d1f24');
    t.add(new THREE.CircleGeometry(0.08, 16).translate(0.35, 0.68, 0.022), '#f6d58e');
  },
  /** A gallery wall: five frames of different sizes. */
  decoGallery(t) {
    const frames: [number, number, number, number, string][] = [[-0.55, 0.6, 0.4, 0.5, '#d9a6a0'], [-0.05, 0.75, 0.5, 0.36, '#9fb8c8'], [0.48, 0.55, 0.36, 0.48, '#c9b79c'], [-0.12, 0.16, 0.34, 0.3, '#a3b18a'], [0.32, 0.04, 0.3, 0.38, '#e9b44c']];
    for (const [x, y, w, h, c] of frames) {
      t.inSlot(2, () => t.block(w, h, 0.03, x, y, 0, WHITE, 0.05));
      t.add(new THREE.PlaneGeometry(w - 0.08, h - 0.08).translate(x, y + h / 2, 0.016), c);
    }
  },
  /** A round mirror in a thin frame. */
  decoMirrorRound(t) {
    t.inSlot(2, () => t.add(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 32).rotateX(Math.PI / 2).translate(0, 0.42, 0), WHITE));
    t.add(new THREE.CircleGeometry(0.39, 32).translate(0, 0.42, 0.017), MIRROR);
  },
  /** A tall arched mirror. */
  decoMirrorArch(t) {
    const s = new THREE.Shape();
    s.moveTo(-0.35, 0);
    s.lineTo(0.35, 0);
    s.lineTo(0.35, 1.2);
    s.absarc(0, 1.2, 0.35, 0, Math.PI, false);
    s.lineTo(-0.35, 0);
    t.inSlot(2, () => t.add(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }).translate(0, 0, -0.015), WHITE));
    t.add(new THREE.ShapeGeometry(s).scale(0.9, 0.95, 1).translate(0, 0.04, 0.017), MIRROR);
  },
  /** A floating shelf with books, a plant and a frame. */
  decoWallShelf(t) {
    t.inSlot(2, () => t.block(1.0, 0.04, 0.22, 0, 0, 0, WHITE, 0.1));
    ['#8c2f39', '#e9b44c', '#1f3b4d', '#f4efe6', '#588157'].forEach((c, i) => t.block(0.04, 0.2 + (i % 2) * 0.04, 0.16, -0.4 + i * 0.045, 0.04, 0, c, 0.1));
    t.cyl(0.06, 0.05, 0.1, 0.15, 0.04, 0, '#e9e6e0', 12);
    for (let i = 0; i < 5; i++) t.add(new THREE.SphereGeometry(0.06, 6, 4).scale(1, 0.5, 0.6).rotateZ(i).translate(0.15 + Math.cos(i * 1.3) * 0.05, 0.17 + i * 0.015, Math.sin(i) * 0.03), i % 2 ? '#40916c' : '#2d6a4f');
    t.inSlot(1, () => t.block(0.18, 0.24, 0.02, 0.38, 0.04, -0.03, WHITE, 0.1));
  },
  /** A big flat TV on the wall (plays your shows like any TV). */
  decoTvWall(t) {
    t.block(1.6, 0.92, 0.05, 0, 0, 0, BLACK, 0.05);
  },

  // ================================================================ floor & table decor
  /** A shaggy round rug. */
  decoRugShag(t) {
    t.inSlot(1, () => {
      t.cyl(1.0, 1.0, 0.025, 0, 0, 0, WHITE, 40);
      for (let i = 0; i < 90; i++) {
        const a = i * 2.39996, r = Math.sqrt(i / 90) * 0.95;
        t.add(new THREE.ConeGeometry(0.035, 0.03, 4).translate(Math.cos(a) * r, 0.035, Math.sin(a) * r), '#e8e8e8');
      }
    });
  },
  /** A Persian-style rug: borders and a medallion (main and frame colours). */
  decoRugPersian(t) {
    const W = 2.4, D = 1.7, y = 0;
    t.inSlot(1, () => t.block(W, 0.015, D, 0, y, 0, WHITE, 0.05));
    t.inSlot(2, () => t.block(W - 0.2, 0.017, D - 0.2, 0, y, 0, WHITE, 0.05));
    t.inSlot(1, () => t.block(W - 0.36, 0.019, D - 0.36, 0, y, 0, '#d0d0d0', 0.05));
    t.block(W - 0.42, 0.021, D - 0.42, 0, y, 0, '#efe2c4', 0.05);
    t.inSlot(2, () => t.add(new THREE.CircleGeometry(0.42, 8).rotateX(-Math.PI / 2).scale(1.3, 1, 1).translate(0, 0.024, 0), WHITE));
    t.inSlot(1, () => t.add(new THREE.CircleGeometry(0.22, 8).rotateX(-Math.PI / 2).scale(1.3, 1, 1).translate(0, 0.026, 0), WHITE));
    for (const sx of [-1, 1]) for (let i = 0; i < 12; i++) t.block(0.012, 0.004, 0.08, sx * (W / 2 + 0.03), 0, -D / 2 + 0.07 + i * ((D - 0.14) / 11), '#efe2c4', 0); // fringe
  },
  /** A striped runner. */
  decoRugRunner(t) {
    t.block(0.8, 0.015, 2.4, 0, 0, 0, '#f2ece0', 0.05);
    t.inSlot(1, () => [-0.25, 0, 0.25].forEach((x) => t.block(0.1, 0.017, 2.36, x, 0, 0, WHITE, 0.05)));
  },
  /** A cowhide-ish organic rug. */
  decoRugHide(t) {
    const s = new THREE.Shape();
    const n = 14;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.85 + Math.sin(a * 3) * 0.12 + Math.cos(a * 5) * 0.05;
      const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 0.85;
      if (i === 0) s.moveTo(x, z);
      else s.lineTo(x, z);
    }
    t.add(new THREE.ExtrudeGeometry(s, { depth: 0.015, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, 0.015, 0), '#f1ece4');
    t.inSlot(1, () => {
      for (const [x, z, r] of [[-0.5, -0.2, 0.25], [0.3, 0.25, 0.3], [0.65, -0.3, 0.18], [-0.1, 0.4, 0.14]]) t.add(new THREE.CircleGeometry(r, 9).rotateX(-Math.PI / 2).scale(1.2, 1, 0.8).translate(x, 0.017, z), WHITE);
    });
  },
  /** A tall vase with dried pampas. */
  decoPampasVase(t) {
    t.inSlot(1, () => t.add(new THREE.LatheGeometry([0.06, 0.12, 0.15, 0.12, 0.06, 0.07].map((r, i) => new THREE.Vector2(r, i * 0.09)), 16), WHITE));
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9, lean = 0.08 + (i % 3) * 0.06;
      t.add(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 4).translate(0, 0.35, 0).rotateZ(Math.cos(a) * lean).rotateX(Math.sin(a) * lean).translate(0, 0.45, 0), '#b49b74');
      t.add(new THREE.SphereGeometry(0.05, 6, 4).scale(0.8, 2.6, 0.8).translate(0, 0.62, 0).rotateZ(Math.cos(a) * lean).rotateX(Math.sin(a) * lean).translate(0, 0.45, 0), '#e9dcc2');
    }
  },
  /** A bowl vase with a few flowers. */
  decoFlowers(t) {
    t.inSlot(1, () => t.add(new THREE.LatheGeometry([0.02, 0.07, 0.09, 0.07, 0.04, 0.045].map((r, i) => new THREE.Vector2(r, i * 0.04)), 14), WHITE));
    const cols = ['#ff6fb5', '#f6d58e', '#ffffff', '#e7a8a0', '#ff6fb5'];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3, x = Math.cos(a) * 0.06, z = Math.sin(a) * 0.06;
      t.add(new THREE.CylinderGeometry(0.003, 0.003, 0.22, 4).translate(x * 0.5, 0.31, z * 0.5), '#4c7a3a');
      t.sphere(0.035, x, 0.42 + (i % 2) * 0.03, z, cols[i]);
    }
  },
  /** A stack of coffee-table books with a little sculpture. */
  decoBookStack(t) {
    ['#1f3b4d', '#f4efe6', '#8c2f39'].forEach((c, i) => t.block(0.3 - i * 0.03, 0.04, 0.22 - i * 0.02, 0, i * 0.04, 0, c, 0.15));
    t.inSlot(1, () => t.sphere(0.05, 0.03, 0.17, 0, WHITE));
  },
  /** A record player on a small cabinet. */
  decoRecordPlayer(t) {
    t.inSlot(2, () => {
      t.block(0.8, 0.5, 0.42, 0, 0.1, 0, WHITE, 0.08);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.cyl(0.015, 0.012, 0.1, sx * 0.34, 0, sz * 0.16, WHITE, 6);
    });
    for (let i = 0; i < 9; i++) t.block(0.008, 0.3, 0.3, -0.3 + i * 0.03, 0.14, 0, ['#e9b44c', '#1d1f24', '#c8553d', '#8ecae6'][i % 4], 0.1);
    t.block(0.42, 0.08, 0.34, 0.12, 0.6, 0, BLACK, 0.15);
    t.cyl(0.14, 0.14, 0.01, 0.1, 0.68, 0, '#111111', 24);
    t.cyl(0.04, 0.04, 0.012, 0.1, 0.68, 0, '#c8553d', 12);
    t.block(0.015, 0.015, 0.2, 0.28, 0.69, 0.02, '#c0c4ca', 0.3);
  },
  /** A beanbag. */
  decoBeanbag(t) {
    t.inSlot(1, () => t.add(new THREE.SphereGeometry(0.45, 14, 10).scale(1, 0.6, 1).translate(0, 0.25, 0), WHITE));
    t.inSlot(1, () => t.add(new THREE.SphereGeometry(0.3, 12, 8).scale(1.2, 0.8, 0.5).translate(0, 0.42, -0.22), '#e2e2e2'));
  },
  /** A round velvet pouf. */
  decoPouf(t) {
    t.inSlot(1, () => t.cyl(0.3, 0.28, 0.4, 0, 0.02, 0, WHITE, 20));
    t.inSlot(1, () => t.add(new THREE.TorusGeometry(0.3, 0.025, 6, 24).rotateX(Math.PI / 2).translate(0, 0.42, 0), '#e0e0e0'));
    t.inSlot(2, () => t.cyl(0.29, 0.29, 0.02, 0, 0, 0, WHITE, 20));
  },
  /** A hanging trailing plant in a macramé holder. */
  decoHangingPlant(t) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      tube(t, [[0, 0, 0], [Math.cos(a) * 0.12, -0.5, Math.sin(a) * 0.12]], 0.004, '#e9dcc2');
    }
    t.inSlot(1, () => t.add(new THREE.SphereGeometry(0.14, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, -0.5, 0), WHITE));
    for (let i = 0; i < 14; i++) {
      const a = i * 2.4, r = 0.1 + (i % 3) * 0.03;
      t.add(new THREE.SphereGeometry(0.06, 6, 4).scale(1, 0.5, 0.6).translate(Math.cos(a) * r, -0.47 - (i % 5) * 0.09 - (i > 7 ? 0.2 : 0), Math.sin(a) * r), i % 2 ? '#40916c' : '#2d6a4f');
    }
  },
  /** A tall olive tree in a stone pot. */
  decoOliveTree(t) {
    t.inSlot(1, () => t.cyl(0.24, 0.18, 0.42, 0, 0, 0, WHITE, 14));
    t.cyl(0.03, 0.04, 1.0, 0, 0.42, 0, '#6f5a43', 6);
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4, y = 1.25 + (i % 4) * 0.12, r = 0.15 + (i % 3) * 0.08;
      t.add(new THREE.SphereGeometry(0.15, 7, 5).scale(1, 0.75, 1).translate(Math.cos(a) * r, y, Math.sin(a) * r), i % 2 ? '#7d8f69' : '#94a684');
    }
  },
};

/** Hangs on a wall: kept at its height, back against the wall. */
export const DECO_ON_WALL = ['decoSplitAC', 'decoPopArt', 'decoClock', 'decoBottleShelf', 'decoLedStrip', 'decoFairyLights', 'decoNeonHeart', 'decoNeonBolt', 'decoNeonNyc', 'decoSconce', 'decoArtShapes', 'decoArtTriptych', 'decoArtSkyline', 'decoGallery', 'decoMirrorRound', 'decoMirrorArch', 'decoWallShelf', 'decoTvWall'];
/** Hangs from the ceiling: the top at y = 0. */
export const DECO_HANG = ['decoTrussRing', 'decoGlobePendant', 'decoBulbCluster', 'decoCrystalChandelier', 'decoSputnik', 'decoRingPendant', 'decoPaperLantern', 'decoHangingPlant'];
