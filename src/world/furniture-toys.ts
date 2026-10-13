// =====================================================================
// furniture-toys.ts — chunky cartoon furniture, built in code.
//
// Peter, 2026-10-13: "chunky cartoon, built in code" for the starting
// apartments. Every piece is soft rounded blocks merged into ONE mesh
// with vertex colours (the same toy kit as the landmarks), so a whole
// room is a handful of draw calls and runs on cheap phones.
//
// CONVENTIONS (same as the Kenney models in furniture.glb):
//   • metres; centred on its footprint; sitting on y = 0;
//   • the FRONT faces +z (rot 0 = facing the camera); the back is −z,
//     so a piece "against the back wall" has its back to −z.
// These geometries are added to the furniture kit by name ('toy…'), so
// data/furniture.ts uses them exactly like the Kenney models.
//
// TO ADD A PIECE: write a function below that fills a Toy, add it to
// TOYS, then add a FurnitureDef with parts: [{ model: 'toyYourPiece' }].
// =====================================================================

import * as THREE from 'three';
import { Toy } from './landmarks/toy.ts';

// ---- a cosy, slightly worn palette
const WOOD = '#a8743f';
const WOOD_DK = '#7a5230';
const METAL = '#4a4f5a';
const CHROME = '#c9ced6';
const ENAMEL = '#f4efe2';
const CREAM = '#efe4c8';
const CARDBOARD = '#c9955a';
const CRATE_RED = '#d8473f';
const CRATE_BLUE = '#3a7bd5';
const PLASTIC_WHITE = '#f2f2ee';
const PORCELAIN = '#fbfbf7';

/** A milk crate: open slatted box (sides only, open top). */
function milkCrate(t: Toy, x: number, y0: number, z: number, color: string, s = 0.42): void {
  const h = s * 0.75;
  const wall = 0.03;
  t.block(s, wall, s, x, y0, z, color, 0.2); // bottom
  for (const [dx, dz, w, d] of [[0, -s / 2 + wall / 2, s, wall], [0, s / 2 - wall / 2, s, wall], [-s / 2 + wall / 2, 0, wall, s], [s / 2 - wall / 2, 0, wall, s]] as const) {
    // Two slats per side with a gap: reads as a crate, not a box.
    t.block(w, h * 0.38, d, x + dx, y0, z + dz, color, 0.2);
    t.block(w, h * 0.3, d, x + dx, y0 + h * 0.7, z + dz, color, 0.2);
  }
  for (const cx of [-1, 1]) for (const cz of [-1, 1]) t.block(wall * 1.6, h, wall * 1.6, x + cx * (s / 2 - wall), y0, z + cz * (s / 2 - wall), color, 0.3);
}

/** A table lamp: round base, stem, cone shade. */
function lamp(t: Toy, x: number, y0: number, z: number, shade = '#f6d58e'): void {
  t.cyl(0.08, 0.1, 0.04, x, y0, z, METAL, 12);
  t.cyl(0.015, 0.015, 0.3, x, y0 + 0.04, z, METAL, 6);
  t.cyl(0.08, 0.15, 0.16, x, y0 + 0.3, z, shade, 14);
}

const TOYS: Record<string, (t: Toy) => void> = {
  // ------------------------------------------------------------ bedroom
  /** Twin bed on a black metal frame, rumpled duvet, one flat pillow. Head at the back (−z). */
  toyTwinBed(t) {
    const W = 1.05, L = 2.05;
    t.block(W, 0.06, L, 0, 0.26, 0, METAL, 0.2); // frame rails
    for (const cx of [-1, 1]) for (const cz of [-1, 1]) t.cyl(0.025, 0.025, 0.3, cx * (W / 2 - 0.03), 0, cz * (L / 2 - 0.03), METAL, 6);
    t.block(0.06, 0.65, 0.06, -W / 2 + 0.03, 0, -L / 2 + 0.03, METAL, 0.3);
    t.block(0.06, 0.65, 0.06, W / 2 - 0.03, 0, -L / 2 + 0.03, METAL, 0.3);
    for (const y of [0.45, 0.6]) t.block(W, 0.04, 0.04, 0, y, -L / 2 + 0.03, METAL, 0.3); // headboard bars
    t.block(W - 0.04, 0.2, L - 0.06, 0, 0.32, 0.01, '#f4f1ea', 0.25); // mattress
    t.block(W * 0.7, 0.12, 0.38, 0, 0.52, -L / 2 + 0.28, '#ffffff', 0.45); // pillow
    t.block(W + 0.04, 0.1, L * 0.62, 0, 0.5, L * 0.18, '#3fa7a0', 0.4); // duvet
    t.block(W * 0.55, 0.08, 0.35, -0.12, 0.58, L * 0.02, '#3fa7a0', 0.5); // rumpled fold
    t.block(W + 0.05, 0.22, 0.05, 0, 0.32, L * 0.49 - 0.02, '#3fa7a0', 0.4); // duvet hanging over the foot
  },
  /** Two milk crates stacked as a nightstand, a lamp and a phone on top. */
  toyCrateNightstand(t) {
    milkCrate(t, 0, 0, 0, CRATE_RED);
    milkCrate(t, 0, 0.32, 0, CRATE_BLUE);
    t.block(0.42, 0.02, 0.42, 0, 0.635, 0, WOOD, 0.2); // a board on top
    lamp(t, -0.08, 0.655, -0.05);
    t.block(0.08, 0.012, 0.15, 0.12, 0.655, 0.08, '#1b1d22', 0.3); // phone
    for (let i = 0; i < 3; i++) t.block(0.24, 0.025, 0.17, 0, 0.36 + 0.005 + i * 0.03, 0.02, ['#e7c14a', '#4caf7d', '#e86a5a'][i], 0.2); // books in the crate
  },
  /** Rolling clothes rack: the broke version of a closet. Opens your wardrobe. */
  toyClothesRack(t) {
    const W = 1.3;
    for (const sx of [-1, 1]) {
      t.cyl(0.02, 0.02, 1.55, sx * W / 2, 0.08, 0, CHROME, 8);
      t.block(0.06, 0.03, 0.5, sx * W / 2, 0.06, 0, CHROME, 0.4);
      for (const sz of [-1, 1]) t.sphere(0.04, sx * W / 2, 0.04, sz * 0.22, '#2b2d33');
    }
    t.add(new THREE.CylinderGeometry(0.02, 0.02, W, 8).rotateZ(Math.PI / 2).translate(0, 1.62, 0), CHROME);
    t.block(W, 0.03, 0.42, 0, 0.18, 0, WOOD, 0.3); // low shelf
    // Hanging clothes: hanger hooks + flat tees, a hoodie, a jacket.
    const clothes: [number, string, number][] = [[-0.5, '#e8505b', 0.62], [-0.33, '#ffffff', 0.6], [-0.16, '#2f3542', 0.75], [0.02, '#3d8bfd', 0.62], [0.2, '#7bc950', 0.6], [0.38, '#8a6f52', 0.85]];
    for (const [x, c, len] of clothes) {
      t.cyl(0.006, 0.006, 0.06, x, 1.56, 0, CHROME, 4);
      t.block(0.05, len, 0.36, x, 1.56 - len, 0, c, 0.25);
      t.block(0.05, 0.08, 0.44, x, 1.5, 0, c, 0.4); // shoulders
    }
    // Two pairs of sneakers and a shoebox on the shelf.
    for (const [x, c] of [[-0.42, '#ffffff'], [-0.1, '#e8505b']] as const) {
      for (const dz of [-0.06, 0.06]) t.block(0.11, 0.07, 0.26, x + dz, 0.21, 0.04, c, 0.45);
    }
    t.block(0.34, 0.14, 0.22, 0.35, 0.21, 0, '#e68a3a', 0.15);
  },
  /** A small folding table used as a desk: laptop, mug, a plastic chair in front. */
  toyFoldingDesk(t) {
    const W = 1.1, D = 0.6;
    t.block(W, 0.04, D, 0, 0.7, 0, '#e9e4d8', 0.3);
    for (const sx of [-1, 1]) {
      t.add(new THREE.CylinderGeometry(0.015, 0.015, 0.78, 6).rotateX(0.18).translate(sx * (W / 2 - 0.06), 0.36, -0.05), METAL);
      t.add(new THREE.CylinderGeometry(0.015, 0.015, 0.78, 6).rotateX(-0.18).translate(sx * (W / 2 - 0.06), 0.36, 0.05), METAL);
    }
    // Laptop: base + open screen tipped back.
    t.block(0.36, 0.02, 0.25, 0, 0.74, 0.02, '#9aa3ae', 0.3);
    t.add(new THREE.BoxGeometry(0.36, 0.24, 0.015).translate(0, 0.12, 0).rotateX(-0.25).translate(0, 0.76, -0.1), '#9aa3ae');
    t.add(new THREE.BoxGeometry(0.32, 0.2, 0.01).translate(0, 0.12, 0.01).rotateX(-0.25).translate(0, 0.76, -0.1), '#4f86c6');
    t.cyl(0.04, 0.035, 0.1, 0.38, 0.74, 0.05, '#e8505b', 10); // mug
    t.block(0.2, 0.01, 0.28, -0.36, 0.74, 0.04, '#ffffff', 0.1); // papers
    // Plastic chair.
    t.block(0.42, 0.04, 0.42, 0, 0.44, 0.52, PLASTIC_WHITE, 0.3);
    t.block(0.42, 0.4, 0.04, 0, 0.46, 0.73, PLASTIC_WHITE, 0.3);
    for (const sx of [-1, 1]) for (const sz of [0.34, 0.7]) t.cyl(0.02, 0.025, 0.44, sx * 0.18, 0, sz, PLASTIC_WHITE, 6);
  },
  /** Cast-iron radiator, painted cream a dozen times. */
  toyRadiator(t) {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = -0.45 + (i * 0.9) / (n - 1);
      t.block(0.07, 0.62, 0.2, x, 0.1, 0, CREAM, 0.5);
    }
    t.block(0.98, 0.05, 0.16, 0, 0.1, 0, '#d9cfb1', 0.4);
    t.block(0.98, 0.04, 0.16, 0, 0.7, 0, '#d9cfb1', 0.4);
    for (const sx of [-1, 1]) t.cyl(0.025, 0.025, 0.1, sx * 0.44, 0, 0, '#d9cfb1', 8);
    t.cyl(0.03, 0.03, 0.14, 0.5, 0.25, 0, '#b0985a', 8); // valve
    t.add(new THREE.TorusGeometry(0.05, 0.012, 6, 12).translate(0.5, 0.41, 0), '#b0985a');
  },
  /** Laundry pile: a heap of clothes on the floor. */
  toyLaundryPile(t) {
    const c = ['#3d8bfd', '#ffffff', '#2f3542', '#e8505b', '#7bc950', '#f6c453', '#8a6f52'];
    const blobs: [number, number, number, number][] = [[0, 0.08, 0, 0.32], [0.2, 0.06, 0.12, 0.22], [-0.18, 0.06, 0.1, 0.24], [0.05, 0.16, -0.05, 0.2], [-0.1, 0.12, -0.15, 0.2], [0.25, 0.04, -0.15, 0.18]];
    blobs.forEach(([x, y, z, r], i) => t.add(new THREE.SphereGeometry(r, 10, 6).scale(1, 0.45, 1).translate(x, y, z), c[i % c.length]));
    t.block(0.5, 0.03, 0.14, 0.22, 0.02, 0.3, '#2f6fd6', 0.4); // a stray pair of jeans
  },
  /** Moving boxes, still not unpacked. One is open. */
  toyMovingBoxes(t) {
    t.block(0.55, 0.42, 0.45, -0.18, 0, 0, CARDBOARD, 0.06);
    t.block(0.45, 0.36, 0.4, -0.14, 0.42, 0.02, CARDBOARD, 0.06);
    t.block(0.4, 0.04, 0.05, -0.14, 0.6, 0.23, '#e9e4d8', 0.2); // tape label
    // Open box: walls and flaps.
    const x = 0.42, w = 0.46;
    t.block(w, 0.03, w, x, 0, 0.05, '#b98349', 0.1);
    for (const [dx, dz, ww, dd] of [[0, -w / 2, w, 0.02], [0, w / 2, w, 0.02], [-w / 2, 0, 0.02, w], [w / 2, 0, 0.02, w]] as const) t.block(ww, 0.38, dd, x + dx, 0, 0.05 + dz, CARDBOARD, 0.1);
    t.add(new THREE.BoxGeometry(w, 0.02, 0.22).translate(0, 0, 0.11).rotateX(-0.9).translate(x, 0.38, 0.05 + w / 2), CARDBOARD);
    t.add(new THREE.BoxGeometry(w, 0.02, 0.22).translate(0, 0, -0.11).rotateX(0.9).translate(x, 0.38, 0.05 - w / 2), CARDBOARD);
    t.sphere(0.13, x, 0.36, 0.05, '#e8505b'); // a jumper poking out
  },

  // ------------------------------------------------------------ living
  /** A worn three-seater: sagging cushions, one patched with tape, a throw on the arm. Faces +z. */
  toyWornCouch(t) {
    const W = 2.0, D = 0.9, C = '#7c8f5e';
    t.block(W, 0.28, D, 0, 0.1, 0, '#6a7b50', 0.18); // base
    for (const sx of [-1, 1]) t.block(0.2, 0.62, D, sx * (W / 2 - 0.1), 0.1, 0, C, 0.35); // arms
    t.block(W - 0.2, 0.55, 0.22, 0, 0.36, -D / 2 + 0.11, C, 0.35); // back
    for (let i = 0; i < 3; i++) t.block((W - 0.42) / 3 - 0.02, 0.16 - (i === 1 ? 0.03 : 0), D - 0.28, -W / 2 + 0.21 + ((W - 0.42) / 3) * (i + 0.5), 0.38, 0.06, C, 0.45);
    t.block(0.2, 0.012, 0.16, 0.42, 0.55, 0.12, '#c9c3b4', 0.05); // tape patch
    t.block(0.06, 0.012, 0.2, 0.42, 0.551, 0.12, '#c9c3b4', 0.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) t.cyl(0.03, 0.025, 0.1, sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.1), WOOD_DK, 8);
    // Plaid throw over the right arm, a pillow on the left.
    t.block(0.26, 0.05, D + 0.04, W / 2 - 0.1, 0.72, 0, '#c0504d', 0.3);
    t.block(0.06, 0.4, D * 0.6, W / 2 + 0.01, 0.34, 0.05, '#c0504d', 0.3);
    t.add(new THREE.BoxGeometry(0.36, 0.34, 0.12).rotateZ(0.25).translate(-W / 2 + 0.38, 0.72, -0.18), '#f6c453');
  },
  /** A boxy old TV on two milk crates, a game console underneath. */
  toyCrateTv(t) {
    milkCrate(t, -0.23, 0, 0, CRATE_BLUE);
    milkCrate(t, 0.23, 0, 0, CRATE_BLUE);
    t.block(0.95, 0.03, 0.46, 0, 0.315, 0, WOOD, 0.2);
    t.block(0.72, 0.56, 0.5, 0, 0.345, -0.02, '#3b3f48', 0.15); // CRT body
    t.block(0.62, 0.46, 0.04, 0, 0.395, 0.23, '#24272e', 0.2); // bezel
    t.add(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4).rotateZ(0.5).translate(-0.1, 1.07, -0.1), CHROME); // rabbit ears
    t.add(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4).rotateZ(-0.5).translate(0.1, 1.07, -0.1), CHROME);
    t.block(0.3, 0.06, 0.22, -0.23, 0.03, 0, '#1b1d22', 0.3); // console in the crate
    t.block(0.12, 0.04, 0.08, 0.23, 0.03, 0.05, '#2f3542', 0.5); // controller
  },
  /** Round kitchen table, one wooden chair and one folding chair that don't match, a pizza box. */
  toySmallTable(t) {
    t.cyl(0.45, 0.45, 0.04, 0, 0.72, 0, '#d7b98a', 20);
    t.cyl(0.04, 0.05, 0.72, 0, 0, 0, WOOD_DK, 10);
    t.cyl(0.25, 0.28, 0.04, 0, 0, 0, WOOD_DK, 14);
    t.block(0.36, 0.05, 0.36, 0.05, 0.76, 0.02, '#f2f2ee', 0.08); // pizza box
    t.block(0.2, 0.012, 0.12, 0.05, 0.81, 0.02, '#e8505b', 0.2);
    // Wooden chair (left).
    t.block(0.4, 0.05, 0.4, -0.62, 0.44, 0, WOOD, 0.2);
    t.block(0.05, 0.5, 0.4, -0.84, 0.47, 0, WOOD, 0.2);
    for (const sx of [-0.8, -0.44]) for (const sz of [-0.17, 0.17]) t.cyl(0.02, 0.02, 0.44, sx, 0, sz, WOOD, 6);
    // Folding chair (right), grey metal.
    t.block(0.4, 0.04, 0.38, 0.64, 0.44, 0, '#8d939d', 0.2);
    t.block(0.04, 0.42, 0.38, 0.85, 0.46, 0, '#8d939d', 0.2);
    for (const sz of [-0.17, 0.17]) {
      t.add(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6).rotateZ(0.25).translate(0.64, 0.22, sz), METAL);
      t.add(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6).rotateZ(-0.25).translate(0.64, 0.22, sz), METAL);
    }
  },
  /** A roommate's closed bedroom door, set against a wall (thin). Name sign and a sticker. */
  toyRoommateDoor(t) {
    t.block(1.0, 2.15, 0.06, 0, 0, -0.02, '#e9e1cf', 0.05); // frame
    t.block(0.86, 2.05, 0.08, 0, 0, 0, '#8a5a3c', 0.04); // door
    for (const y of [0.35, 1.2]) t.block(0.66, 0.7, 0.02, 0, y, 0.045, '#7a4e33', 0.1); // panels
    t.sphere(0.04, 0.33, 1.02, 0.07, '#d4b14a'); // knob
    t.block(0.34, 0.14, 0.015, 0, 1.62, 0.055, '#ffffff', 0.2); // name sign
    t.block(0.12, 0.12, 0.012, -0.22, 1.35, 0.056, '#ff6fa5', 0.5); // sticker
  },
  /** A tall pothos in a pot, standing on a little stool. */
  toyPlantStool(t) {
    t.cyl(0.18, 0.18, 0.04, 0, 0.42, 0, WOOD, 12);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      t.cyl(0.02, 0.02, 0.42, Math.cos(a) * 0.12, 0, Math.sin(a) * 0.12, WOOD, 6);
    }
    t.cyl(0.13, 0.1, 0.22, 0, 0.46, 0, '#d8794f', 12);
    const leaves: [number, number, number, number][] = [[0, 0.82, 0, 0.18], [0.12, 0.74, 0.06, 0.14], [-0.12, 0.76, -0.04, 0.15], [0.05, 0.95, -0.06, 0.12], [-0.06, 0.6, 0.14, 0.11], [0.16, 0.55, -0.1, 0.1]];
    leaves.forEach(([x, y, z, r], i) => t.sphere(r, x, y, z, i % 2 ? '#4caf50' : '#3c9a46'));
    t.sphere(0.07, 0.2, 0.36, 0.12, '#4caf50'); // trailing vine
    t.sphere(0.06, 0.23, 0.22, 0.14, '#3c9a46');
  },
  /** Sneakers and slides kicked off by the front door, on a mat. */
  toyShoePile(t) {
    t.block(0.8, 0.015, 0.5, 0, 0, 0, '#5b6b7a', 0.3); // door mat
    const shoes: [number, number, number, string][] = [[-0.25, 0.08, 0.3, '#ffffff'], [-0.12, 0.05, -0.2, '#ffffff'], [0.1, 0.1, 0.6, '#2f3542'], [0.25, -0.08, 1.4, '#2f3542'], [0.05, -0.12, -0.5, '#e8505b']];
    for (const [x, z, rot, c] of shoes) t.add(new THREE.BoxGeometry(0.11, 0.08, 0.27).translate(0, 0.055, 0).rotateY(rot).translate(x, 0.015, z), c);
  },
  /** A worn rug (flat: walk over it, put things on it). */
  toyWornRug(t) {
    t.block(2.2, 0.012, 1.5, 0, 0, 0, '#b5533c', 0.05);
    t.block(1.9, 0.014, 1.2, 0, 0, 0, '#d7a24a', 0.05);
    t.block(1.5, 0.016, 0.8, 0, 0, 0, '#b5533c', 0.05);
    t.block(0.5, 0.017, 0.3, 0.3, 0, 0.1, '#8e3e2c', 0.05); // a worn patch
  },
  /** Trash: a can and two tied bags waiting to go down. */
  toyTrashBags(t) {
    t.cyl(0.18, 0.15, 0.55, -0.2, 0, 0, '#5a6270', 14);
    t.cyl(0.19, 0.19, 0.04, -0.2, 0.55, 0, '#4a505c', 14);
    t.add(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 1.15, 1).translate(0.18, 0.22, 0.06), '#22252b');
    t.add(new THREE.SphereGeometry(0.16, 10, 8).scale(1, 1.2, 1).translate(0.12, 0.18, 0.3), '#22252b');
    t.add(new THREE.ConeGeometry(0.05, 0.1, 6).translate(0.18, 0.5, 0.06), '#22252b');
  },

  // ------------------------------------------------------------ kitchen
  /** An old white enamel stove: four black burners, oven window, a dented pot. */
  toyOldStove(t) {
    const W = 0.76, D = 0.66, H = 0.9;
    t.block(W, H, D, 0, 0, 0, ENAMEL, 0.06);
    t.block(W, 0.25, 0.06, 0, H, -D / 2 + 0.03, ENAMEL, 0.2); // back panel
    for (let i = 0; i < 4; i++) t.cyl(0.03, 0.03, 0.02, -0.25 + i * 0.165, H + 0.12, -D / 2 + 0.07, '#2b2d33', 10); // knobs on the panel
    for (const [x, z] of [[-0.18, -0.12], [0.18, -0.12], [-0.18, 0.15], [0.18, 0.15]] as const) {
      t.cyl(0.12, 0.12, 0.015, x, H, z, '#2b2d33', 16);
      t.add(new THREE.TorusGeometry(0.08, 0.012, 6, 16).rotateX(Math.PI / 2).translate(x, H + 0.02, z), '#1b1d22');
    }
    t.block(W - 0.12, 0.42, 0.02, 0, 0.18, D / 2, '#e7e1d2', 0.15); // oven door
    t.block(W - 0.34, 0.2, 0.02, 0, 0.28, D / 2 + 0.008, '#3b3f48', 0.3); // window
    t.add(new THREE.CylinderGeometry(0.015, 0.015, W - 0.2, 6).rotateZ(Math.PI / 2).translate(0, 0.66, D / 2 + 0.05), CHROME);
    t.cyl(0.12, 0.11, 0.14, 0.18, H + 0.02, 0.15, '#9aa3ae', 14); // pot
    t.add(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 6).rotateZ(Math.PI / 2).translate(0.38, H + 0.12, 0.15), '#2b2d33');
  },
  /** Rounded old cream fridge covered in magnets, photos and takeout menus. */
  toyOldFridge(t) {
    const W = 0.76, D = 0.72, H = 1.72;
    t.block(W, H, D, 0, 0, 0, '#f2ead6', 0.12);
    t.block(W - 0.02, 0.012, 0.01, 0, 1.18, D / 2 + 0.001, '#cfc6ae', 0.1); // freezer split
    t.block(0.04, 0.3, 0.05, W / 2 - 0.09, 1.3, D / 2 + 0.02, CHROME, 0.5); // handles
    t.block(0.04, 0.45, 0.05, W / 2 - 0.09, 0.6, D / 2 + 0.02, CHROME, 0.5);
    const notes: [number, number, number, number, string][] = [[-0.18, 1.42, 0.16, 0.12, '#ffffff'], [-0.05, 1.3, 0.12, 0.16, '#fde68a'], [-0.2, 0.95, 0.18, 0.24, '#ffffff'], [0.04, 0.82, 0.14, 0.1, '#bde0fe'], [-0.12, 0.62, 0.12, 0.12, '#ffc8dd']];
    for (const [x, y, w, h, c] of notes) t.block(w, h, 0.008, x, y, D / 2 + 0.004, c, 0.05);
    for (const [x, y, c] of [[-0.18, 1.52, '#e63946'], [-0.05, 1.44, '#2a9d8f'], [-0.2, 1.17, '#ffbe0b'], [0.04, 0.9, '#8338ec']] as const) t.sphere(0.022, x, y, D / 2 + 0.015, c);
    t.block(0.36, 0.12, 0.26, 0, H, 0, '#e8505b', 0.15); // cereal boxes on top
    t.block(0.16, 0.3, 0.1, 0.24, H, 0, '#f6c453', 0.15);
  },
  /** Sink counter with a cupboard, a pile of dishes and a drying rack. */
  toySinkCounter(t) {
    const W = 1.2, D = 0.62, H = 0.9;
    t.block(W, H - 0.04, D, 0, 0, 0, '#8fb3a3', 0.05); // cupboards
    t.block(W + 0.02, 0.05, D + 0.02, 0, H - 0.05, 0, '#e6e1d6', 0.15); // counter top
    for (const x of [-W / 4, W / 4]) {
      t.block(W / 2 - 0.06, H - 0.18, 0.02, x, 0.08, D / 2, '#9ec2b2', 0.1);
      t.sphere(0.022, x + (x < 0 ? 0.2 : -0.2), 0.6, D / 2 + 0.02, CHROME);
    }
    t.block(0.5, 0.02, 0.36, -0.15, H - 0.005, 0.02, '#aab3be', 0.1); // basin rim
    t.block(0.44, 0.015, 0.3, -0.15, H - 0.003, 0.02, '#6f7885', 0.1);
    t.cyl(0.02, 0.02, 0.28, -0.15, H, -D / 2 + 0.08, CHROME, 8); // faucet
    t.add(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 8).rotateX(Math.PI / 2).translate(-0.15, H + 0.27, -D / 2 + 0.15), CHROME);
    for (let i = 0; i < 4; i++) t.cyl(0.11 - i * 0.004, 0.1, 0.02, -0.12, H + 0.01 + i * 0.022, 0.04, i % 2 ? '#ffffff' : '#bde0fe', 14); // dishes piled in the sink
    t.block(0.36, 0.03, 0.28, 0.36, H, 0.02, '#c9ced6', 0.3); // drying rack
    for (let i = 0; i < 4; i++) t.add(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 14).rotateX(Math.PI / 2).translate(0.26 + i * 0.07, H + 0.12, 0.02), '#ffffff');
  },

  // ------------------------------------------------------------ on the walls (keep their height)
  /** Two posters, a little crooked: a concert poster and a subway map. Flat against a wall. */
  toyPosters(t) {
    t.add(new THREE.BoxGeometry(0.62, 0.86, 0.02).rotateZ(0.04).translate(-0.42, 1.75, 0), '#2b2d42');
    t.add(new THREE.BoxGeometry(0.5, 0.3, 0.025).rotateZ(0.04).translate(-0.42, 1.95, 0.005), '#ff6f59');
    t.add(new THREE.BoxGeometry(0.46, 0.1, 0.025).rotateZ(0.04).translate(-0.42, 1.55, 0.005), '#f6c453');
    t.add(new THREE.BoxGeometry(0.7, 0.5, 0.02).rotateZ(-0.03).translate(0.38, 1.62, 0), '#f4f1ea');
    for (const [x0, y0, x1, y1, c] of [[0.1, 1.45, 0.66, 1.75, '#e63946'], [0.12, 1.7, 0.62, 1.5, '#2a9d8f'], [0.36, 1.42, 0.36, 1.82, '#f4a261'], [0.14, 1.6, 0.64, 1.62, '#3a86ff']] as const) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      t.add(new THREE.BoxGeometry(len, 0.025, 0.025).rotateZ(Math.atan2(y1 - y0, x1 - x0)).translate((x0 + x1) / 2, (y0 + y1) / 2, 0.012), c);
    }
  },
  /** A window AC unit sticking out under the window, dripping. */
  toyWindowAC(t) {
    t.block(0.62, 0.4, 0.5, 0, 1.05, 0.05, '#e9e6de', 0.1);
    for (let i = 0; i < 6; i++) t.block(0.5, 0.02, 0.01, 0, 1.12 + i * 0.045, 0.3, '#b8b4aa', 0.2);
    t.block(0.14, 0.08, 0.01, 0.2, 1.38, 0.3, '#5d6371', 0.2);
    t.add(new THREE.BoxGeometry(0.66, 0.04, 0.12).rotateX(0.4).translate(0, 1.0, -0.15), '#8d939d'); // bracket
  },

  // ------------------------------------------------------------ bathroom
  /** Toilet, front +z. */
  toyToilet(t) {
    t.block(0.42, 0.42, 0.22, 0, 0.42, -0.24, PORCELAIN, 0.25); // tank
    t.block(0.3, 0.04, 0.16, 0, 0.84, -0.24, '#e9e9e3', 0.4); // lid
    t.cyl(0.14, 0.16, 0.38, 0, 0, 0.0, PORCELAIN, 14); // base
    t.add(new THREE.CylinderGeometry(0.2, 0.18, 0.08, 16).scale(1, 1, 1.25).translate(0, 0.42, 0.04), PORCELAIN); // bowl
    t.add(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 16).scale(1, 1, 1.25).translate(0, 0.47, 0.04), '#f1d3b3'); // wooden seat
    t.block(0.05, 0.02, 0.03, 0.15, 0.78, -0.12, CHROME, 0.5); // flush handle
    t.cyl(0.06, 0.06, 0.12, 0.3, 0.55, -0.2, '#ffffff', 10); // toilet roll on the tank side
  },
  /** Bathtub with a shower curtain on a rod, half drawn. Long side along x, front +z. */
  toyTubShower(t) {
    const L = 1.6, W = 0.76, H = 0.55;
    t.block(L, H, W, 0, 0, 0, PORCELAIN, 0.15);
    t.block(L - 0.12, 0.02, W - 0.12, 0, H - 0.01, 0, '#cfe7ee', 0.2); // water-ish inside
    t.add(new THREE.CylinderGeometry(0.012, 0.012, L, 6).rotateZ(Math.PI / 2).translate(0, 1.95, W / 2 - 0.05), CHROME); // rod
    // Curtain: three folds drawn to one end.
    for (let i = 0; i < 4; i++) t.block(0.12, 1.25, 0.03, -L / 2 + 0.1 + i * 0.13, H + 0.12, W / 2 - 0.05 + (i % 2 ? 0.03 : -0.03), i % 2 ? '#7fd1c7' : '#b8ece4', 0.2);
    t.cyl(0.015, 0.015, 0.4, L / 2 - 0.15, H, -W / 2 + 0.06, CHROME, 6); // shower pipe
    t.cyl(0.07, 0.04, 0.05, L / 2 - 0.15, 1.75, -W / 2 + 0.12, CHROME, 10); // shower head
    t.cyl(0.015, 0.015, 1.3, L / 2 - 0.15, 0.5, -W / 2 + 0.06, CHROME, 6);
    t.block(0.14, 0.06, 0.08, -L / 2 + 0.25, H + 0.02, -W / 2 + 0.06, '#ff9fb2', 0.4); // shampoo
    t.block(0.08, 0.14, 0.06, -L / 2 + 0.4, H + 0.02, -W / 2 + 0.06, '#7bc950', 0.4);
  },
  /** Pedestal sink with a mirror cabinet above it. Against a wall, front +z. */
  toyPedestalSink(t) {
    t.cyl(0.08, 0.12, 0.72, 0, 0, -0.05, PORCELAIN, 12);
    t.block(0.56, 0.16, 0.44, 0, 0.72, 0, PORCELAIN, 0.35);
    t.block(0.42, 0.02, 0.28, 0, 0.87, 0.03, '#d8e4ea', 0.3);
    t.cyl(0.015, 0.015, 0.18, 0, 0.88, -0.16, CHROME, 8);
    t.block(0.5, 0.6, 0.12, 0, 1.2, -0.17, '#e9e1cf', 0.1); // mirror cabinet
    t.block(0.42, 0.5, 0.01, 0, 1.25, -0.105, '#cde8f2', 0.1); // mirror
    t.cyl(0.03, 0.03, 0.12, 0.2, 0.88, -0.1, '#ff6fa5', 8); // toothbrush cup
    t.block(0.09, 0.03, 0.05, -0.18, 0.88, -0.1, '#f6c453', 0.4); // soap
  },
};


// ---- the billionaire penthouse (Peter, 2026-10-13): same chunky toy
// style, richer materials. Marble, walnut, brass, velvet.
const MARBLE = '#f1eee8';
const VEIN = '#cfc8bd';
const WALNUT = '#5b3a29';
const BRASS = '#d4af37';
const VELVET = '#1f6f5c';
const LINEN = '#f7f3ea';
const INK = '#1d1d22';
const STEEL = '#b9c0c9';

const LUX: Record<string, (t: Toy) => void> = {
  /** King bed: tall tufted headboard, thick mattress, white duvet, a folded throw and four pillows. Head at −z. */
  toyKingBed(t) {
    const W = 2.1, L = 2.3;
    t.block(W + 0.1, 0.32, L, 0, 0, 0, WALNUT, 0.12); // platform
    t.block(W, 0.3, L - 0.1, 0, 0.32, 0.03, LINEN, 0.3); // mattress
    t.block(W + 0.04, 0.12, L - 0.55, 0, 0.6, 0.25, '#ffffff', 0.4); // duvet
    t.block(W + 0.06, 0.08, 0.5, 0, 0.66, L / 2 - 0.45, '#6d5b8a', 0.35); // throw
    t.block(W + 0.3, 1.25, 0.2, 0, 0, -L / 2, '#2c3e63', 0.25); // headboard
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) t.sphere(0.035, -0.75 + i * 0.5, 0.7 + j * 0.35, -L / 2 + 0.11, BRASS); // tufting buttons
    for (const sx of [-0.55, 0.55]) {
      t.block(0.7, 0.2, 0.36, sx, 0.62, -L / 2 + 0.32, '#ffffff', 0.5);
      t.block(0.6, 0.18, 0.3, sx, 0.78, -L / 2 + 0.36, '#e8dcc4', 0.5);
    }
  },
  /** L-shaped velvet sectional with brass legs and a couple of cushions. Faces +z, the L runs to the right. */
  toyVelvetSectional(t) {
    const W = 3.0, D = 1.0;
    t.block(W, 0.3, D, 0, 0.08, 0, VELVET, 0.25);
    t.block(1.0, 0.3, 1.0, W / 2 - 0.5, 0.08, D, VELVET, 0.25); // chaise
    t.block(W, 0.5, 0.22, 0, 0.38, -D / 2 + 0.11, VELVET, 0.4); // back
    t.block(0.22, 0.45, D, -W / 2 + 0.11, 0.38, 0, VELVET, 0.4); // left arm
    for (let i = 0; i < 3; i++) t.block(W / 3 - 0.06, 0.14, D - 0.26, -W / 2 + (W / 3) * (i + 0.5), 0.38, 0.08, '#2a8a72', 0.5);
    t.block(0.94, 0.14, 0.9, W / 2 - 0.5, 0.38, D, '#2a8a72', 0.5);
    for (const [x, z] of [[-W / 2 + 0.1, -D / 2 + 0.1], [-W / 2 + 0.1, D / 2 - 0.1], [W / 2 - 0.1, -D / 2 + 0.1], [W / 2 - 0.1, D * 1.5 - 0.1], [W / 2 - 0.9, D * 1.5 - 0.1]]) t.cyl(0.03, 0.02, 0.08, x, 0, z, BRASS, 8);
    t.add(new THREE.BoxGeometry(0.4, 0.38, 0.12).rotateZ(0.2).translate(-1.0, 0.68, -0.25), '#e9c46a');
    t.add(new THREE.BoxGeometry(0.4, 0.38, 0.12).rotateZ(-0.15).translate(0.2, 0.68, -0.25), '#f4f1ea');
  },
  /** Walnut media console with a huge, thin TV on top. Faces +z. */
  toyMediaWall(t) {
    t.block(2.6, 0.45, 0.5, 0, 0.06, 0, WALNUT, 0.12);
    for (let i = 0; i < 4; i++) t.block(0.6, 0.32, 0.01, -0.95 + i * 0.63, 0.12, 0.25, '#6b4632', 0.05); // doors
    for (const sx of [-1.2, 1.2]) t.cyl(0.025, 0.02, 0.06, sx, 0, 0, BRASS, 8);
    t.block(0.24, 0.04, 0.2, 0, 0.51, -0.02, INK, 0.2); // stand
    t.block(0.05, 0.22, 0.05, 0, 0.55, -0.04, INK, 0.2);
    t.block(2.1, 1.2, 0.05, 0, 0.72, -0.04, INK, 0.08); // the TV
    t.block(0.32, 0.05, 0.24, -0.9, 0.51, 0.02, '#e8e8e8', 0.3); // console
    t.cyl(0.07, 0.07, 0.03, 0.9, 0.51, 0.05, '#c9ced6', 16); // speaker puck
  },
  /** Six-burner pro range with a big steel hood. Against a wall, front +z. */
  toyChefRange(t) {
    t.block(1.2, 0.9, 0.7, 0, 0, 0, STEEL, 0.06);
    t.block(1.2, 0.04, 0.7, 0, 0.9, 0, '#2b2d33', 0.05);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) t.cyl(0.11, 0.11, 0.03, -0.38 + i * 0.38, 0.94, -0.15 + j * 0.3, INK, 14);
    for (let i = 0; i < 6; i++) t.cyl(0.03, 0.03, 0.04, -0.45 + i * 0.18, 0.78, 0.36, '#e63946', 8); // red knobs
    t.block(1.0, 0.5, 0.02, 0, 0.18, 0.355, '#9aa3ae', 0.05); // oven door
    t.block(0.6, 0.04, 0.04, 0, 0.6, 0.38, CHROME, 0.4);
    t.add(new THREE.CylinderGeometry(0.25, 0.65, 0.5, 4, 1).rotateY(Math.PI / 4).scale(1.3, 1, 0.75).translate(0, 1.95, -0.1), STEEL); // hood
    t.block(0.35, 0.6, 0.3, 0, 2.2, -0.2, STEEL, 0.05);
    t.cyl(0.12, 0.1, 0.12, 0.3, 0.97, 0.1, '#2b2d33', 12); // a pot
  },
  /** Tall double-door steel fridge with a wine column. Front +z. */
  toyChefFridge(t) {
    t.block(1.1, 2.1, 0.75, 0, 0, 0, STEEL, 0.05);
    t.block(0.01, 2.0, 0.02, -0.02, 0.05, 0.375, '#8f98a3', 0.05);
    for (const sx of [-0.12, 0.08]) t.block(0.03, 0.9, 0.05, sx, 0.9, 0.4, CHROME, 0.4);
    t.block(0.42, 2.1, 0.75, 0.78, 0, 0, '#2b2d33', 0.05); // wine column
    t.block(0.32, 1.8, 0.02, 0.78, 0.15, 0.38, '#3d5466', 0.1);
    for (let i = 0; i < 6; i++) t.cyl(0.035, 0.035, 0.3, 0.78, 0.35 + i * 0.27, 0.25, i % 2 ? '#7f1d1d' : '#c9a227', 8);
  },
  /** Marble kitchen island with three brass stools. Long side faces +z. */
  toyMarbleIsland(t) {
    t.block(2.4, 0.88, 0.95, 0, 0, -0.1, WALNUT, 0.06);
    t.block(2.55, 0.06, 1.1, 0, 0.88, -0.05, MARBLE, 0.1);
    for (let i = 0; i < 5; i++) t.block(0.6 + (i % 2) * 0.3, 0.004, 0.02, -0.9 + i * 0.45, 0.942, -0.3 + (i % 3) * 0.2, VEIN, 0.1);
    for (let i = 0; i < 3; i++) {
      const x = -0.8 + i * 0.8;
      t.cyl(0.02, 0.025, 0.65, x, 0, 0.75, BRASS, 8);
      t.cyl(0.19, 0.19, 0.07, x, 0.65, 0.75, '#2c3e63', 16);
    }
    t.cyl(0.14, 0.1, 0.1, 0.6, 0.94, -0.1, '#ffffff', 16); // fruit bowl
    for (const [x, c] of [[0.55, '#e9c46a'], [0.66, '#e63946'], [0.6, '#2d6a4f']] as const) t.sphere(0.045, x, 1.04, -0.12 + (x - 0.6), c);
  },
  /** Freestanding oval soaking tub with a brass floor tap. Front +z. */
  toySoakingTub(t) {
    t.add(new THREE.CylinderGeometry(0.85, 0.7, 0.62, 28, 1).scale(1, 1, 0.5).translate(0, 0.31, 0), PORCELAIN);
    t.add(new THREE.CylinderGeometry(0.72, 0.6, 0.02, 28, 1).scale(1, 1, 0.48).translate(0, 0.55, 0), '#cfe7ee'); // water
    t.cyl(0.025, 0.025, 1.0, 0.95, 0, 0, BRASS, 8);
    t.add(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8).rotateZ(Math.PI / 2).translate(0.82, 1.0, 0), BRASS);
    t.block(0.5, 0.06, 0.3, -0.2, 0.62, 0.0, '#ffffff', 0.4); // folded towel on the rim
  },
  /** Double vanity: two basins, a long mirror, brass taps. Against a wall, front +z. */
  toyDoubleVanity(t) {
    t.block(1.8, 0.85, 0.55, 0, 0, 0, WALNUT, 0.08);
    t.block(1.9, 0.06, 0.6, 0, 0.85, 0, MARBLE, 0.1);
    for (const sx of [-0.45, 0.45]) {
      t.block(0.42, 0.02, 0.32, sx, 0.9, 0.06, '#ffffff', 0.4);
      t.cyl(0.015, 0.015, 0.22, sx, 0.91, -0.2, BRASS, 8);
    }
    t.block(1.7, 0.9, 0.04, 0, 1.15, -0.27, '#d6e9f2', 0.1);
    t.block(1.78, 0.04, 0.06, 0, 2.05, -0.26, BRASS, 0.2);
  },
  /** Baby grand piano, lid up, with its bench. Keys face +z. */
  toyGrandPiano(t) {
    t.add(new THREE.CylinderGeometry(0.9, 0.9, 0.32, 24, 1, false, 0, Math.PI).scale(0.85, 1, 1.2).rotateY(-Math.PI / 2).translate(0, 0.62, -0.25), INK);
    t.block(1.5, 0.32, 0.55, 0, 0.62, 0.3, INK, 0.1);
    t.block(1.3, 0.04, 0.16, 0, 0.8, 0.52, '#fdfdfb', 0.1); // keys
    for (let i = 0; i < 12; i++) t.block(0.04, 0.03, 0.09, -0.6 + i * 0.11, 0.83, 0.48, INK, 0.1);
    t.add(new THREE.BoxGeometry(1.4, 0.03, 1.5).translate(0, 0, -0.75).rotateX(0.55).translate(0, 0.95, 0.05), INK); // lid
    for (const [x, z] of [[-0.65, 0.4], [0.65, 0.4], [0, -1.1]]) t.cyl(0.05, 0.04, 0.62, x, 0, z, INK, 8);
    t.block(0.9, 0.08, 0.35, 0, 0.45, 1.0, INK, 0.2); // bench
    for (const sx of [-0.38, 0.38]) t.block(0.06, 0.45, 0.3, sx, 0, 1.0, INK, 0.2);
  },
  /** A big abstract canvas in a brass frame. Hangs on a wall. */
  toyArtwork(t) {
    t.block(1.6, 1.1, 0.05, 0, 1.2, 0, BRASS, 0.05);
    t.block(1.5, 1.0, 0.02, 0, 1.25, 0.025, '#f4efe6', 0.05);
    t.block(0.7, 0.5, 0.01, -0.3, 1.55, 0.04, '#e76f51', 0.1);
    t.block(0.5, 0.7, 0.01, 0.35, 1.35, 0.045, '#264653', 0.1);
    t.cyl(0.18, 0.18, 0.01, 0.1, 1.5, 0.05, '#e9c46a', 20);
  },
  /** A wall of walnut wardrobe: four doors, brass handles, a mirror panel. Front +z. */
  toyWardrobeWall(t) {
    t.block(2.4, 2.2, 0.6, 0, 0, 0, WALNUT, 0.04);
    for (let i = 0; i < 4; i++) {
      const x = -0.9 + i * 0.6;
      t.block(0.56, 2.1, 0.02, x, 0.05, 0.3, i === 2 ? '#d6e9f2' : '#6b4632', 0.04);
      t.block(0.03, 0.4, 0.04, x + (i % 2 ? -0.22 : 0.22), 0.9, 0.33, BRASS, 0.4);
    }
  },
  /** Executive desk: walnut top on brass legs, a leather chair, a slim monitor. Front +z, chair on the +z side. */
  toyExecutiveDesk(t) {
    t.block(1.8, 0.06, 0.85, 0, 0.74, -0.1, WALNUT, 0.1);
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.45, 0.25]) t.cyl(0.025, 0.025, 0.74, sx, 0, sz, BRASS, 8);
    t.block(0.7, 0.42, 0.03, 0, 0.82, -0.38, INK, 0.1); // monitor
    t.block(0.1, 0.1, 0.1, 0, 0.8, -0.38, INK, 0.2);
    t.block(0.42, 0.02, 0.15, 0, 0.8, -0.1, '#e8e8e8', 0.3); // keyboard
    lamp(t, -0.7, 0.8, -0.3, '#f6e7b8');
    t.block(0.6, 0.12, 0.55, 0, 0.45, 0.55, '#5c3a24', 0.4); // chair seat
    t.block(0.6, 0.7, 0.12, 0, 0.55, 0.85, '#5c3a24', 0.4); // chair back
    t.cyl(0.04, 0.04, 0.42, 0, 0.03, 0.55, INK, 8);
    t.cyl(0.28, 0.28, 0.04, 0, 0, 0.55, INK, 5);
  },
  /** Fiddle-leaf fig in a big ceramic pot. */
  toyFiddleFig(t) {
    t.cyl(0.22, 0.17, 0.42, 0, 0, 0, '#e9e4d8', 16);
    t.cyl(0.03, 0.03, 1.2, 0, 0.4, 0, WOOD_DK, 6);
    for (let i = 0; i < 9; i++) {
      const a = i * 2.3, y = 0.9 + (i / 9) * 0.9;
      t.add(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.7, 0.35).rotateY(a).translate(Math.cos(a) * 0.2, y, Math.sin(a) * 0.2), i % 2 ? '#2d6a4f' : '#40916c');
    }
  },
};
Object.assign(TOYS, LUX);

/** Pieces that hang on a wall: centred on their footprint but kept at their height. */
const ON_WALL = new Set(['toyPosters', 'toyWindowAC', 'toyArtwork']);

let cache: Map<string, THREE.BufferGeometry> | null = null;

/** Every toy piece as a ready geometry (centred on its footprint, on y = 0), by name. */
export function toyFurnitureModels(): Map<string, THREE.BufferGeometry> {
  if (cache) return cache;
  cache = new Map();
  for (const [name, make] of Object.entries(TOYS)) {
    const t = new Toy();
    make(t);
    const geo = t.geometry();
    geo.computeBoundingBox();
    const b = geo.boundingBox!;
    geo.translate(-(b.min.x + b.max.x) / 2, ON_WALL.has(name) ? 0 : -b.min.y, -(b.min.z + b.max.z) / 2);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    cache.set(name, geo);
  }
  return cache;
}
