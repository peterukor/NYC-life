// =====================================================================
// home-interior.ts — your home, The Sims style.
//
//   • No roof, and the walls nearest the camera are cut down to a low
//     ledge, so you look straight into every room.
//   • Each home has its own floor plan (data/homes.ts): a studio, a loft
//     and a shared apartment all feel different.
//   • Real furniture (data/furniture.ts) that you tap to use: sleep in
//     the bed, cook on the stove, watch TV on the sofa…
//   • MOVE MODE: pick up any piece, tap the floor to put it down, turn
//     it. The arrangement is saved per home (state.homes).
// =====================================================================

import * as THREE from 'three';
import { FURNITURE, type FurnitureDef } from '../data/furniture.ts';
import type { HomeItem, HomeLayout } from '../data/homes.ts';
import type { PlaceDef } from '../data/places.ts';
import { adTexture, HOUSE_ADS } from '../render/textures.ts';
import type { FurnitureKit } from '../assets/furniture-kit.ts';
import type { Interior, InteriorObject } from './interior.ts';

const WALL_H = 2.9;
const LOW_WALL = 0.55;
const WALL_T = 0.2;

export interface HomeInterior extends Interior {
  layout: HomeLayout;
  /** The current arrangement (save this to keep the player's changes). */
  items: HomeItem[];
  /** Floor meshes: tap targets when placing furniture. */
  floors: THREE.Object3D[];
  /** Move a piece (clamped inside the home). */
  moveItem: (uid: string, x: number, z: number) => void;
  /** Turn a piece a quarter turn. */
  rotateItem: (uid: string) => void;
  /** Glow the piece being moved (null = none). */
  highlight: (uid: string | null) => void;
}

export function buildHome(place: PlaceDef, layout: HomeLayout, arrangement: HomeItem[], kit: FurnitureKit): HomeInterior {
  void place; // kept for future per-home touches (name plate, colours)
  const scene = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];
  const t = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const W = layout.width;
  const D = layout.depth;
  const animated: ((dt: number) => void)[] = [];

  scene.background = new THREE.Color('#1b2030');
  scene.add(new THREE.HemisphereLight('#fff6e8', '#5a4a40', 1.25));
  const sun = new THREE.DirectionalLight('#ffe9c8', 1.1);
  sun.position.set(-6, 12, 8);
  scene.add(sun);

  // ---- floors (one flat plane per room, later rooms drawn on top)
  const floors: THREE.Object3D[] = [];
  const under = new THREE.Mesh(t(new THREE.BoxGeometry(W + WALL_T * 2, 0.3, D + WALL_T * 2)), t(new THREE.MeshLambertMaterial({ color: '#6d5a4c' })));
  under.position.y = -0.151;
  scene.add(under);
  layout.rooms.forEach((r, i) => {
    const [x0, z0, x1, z1] = r.rect;
    const m = new THREE.Mesh(t(new THREE.PlaneGeometry(x1 - x0, z1 - z0)), t(new THREE.MeshLambertMaterial({ color: r.floor })));
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.002 + i * 0.002, (z0 + z1) / 2);
    m.name = `floor-${r.label}`;
    scene.add(m);
    floors.push(m);
  });

  // ---- walls: the outer box plus the layout's inner walls, split at door gaps.
  // Walls between the camera (+z side) and the middle of the home are cut low.
  const wallMat = t(new THREE.MeshLambertMaterial({ color: layout.wallColor }));
  const capMat = t(new THREE.MeshLambertMaterial({ color: '#fdf8ef' }));
  const wall = (ax: number, az: number, bx: number, bz: number) => {
    const alongX = Math.abs(bz - az) < 1e-3;
    const len = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
    if (len < 0.05) return;
    const cx = (ax + bx) / 2;
    const cz = (az + bz) / 2;
    const low = alongX && cz > 0.5;
    const h = low ? LOW_WALL : WALL_H;
    const m = new THREE.Mesh(t(new THREE.BoxGeometry(alongX ? len + WALL_T : WALL_T, h, alongX ? WALL_T : len + WALL_T)), wallMat);
    m.position.set(cx, h / 2, cz);
    scene.add(m);
    // A light cap on top: the "cut" edge of a Sims wall.
    const cap = new THREE.Mesh(t(new THREE.BoxGeometry(alongX ? len + WALL_T + 0.02 : WALL_T + 0.04, 0.05, alongX ? WALL_T + 0.04 : len + WALL_T + 0.02)), capMat);
    cap.position.set(cx, h + 0.025, cz);
    scene.add(cap);
  };
  const wallWithGaps = (a: [number, number], b: [number, number], gaps: [number, number][] = []) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / len;
    const dz = (b[1] - a[1]) / len;
    let s = 0;
    for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
      wall(a[0] + dx * s, a[1] + dz * s, a[0] + dx * g0, a[1] + dz * g0);
      s = g1;
    }
    wall(a[0] + dx * s, a[1] + dz * s, b[0], b[1]);
  };
  const hw = W / 2;
  const hd = D / 2;
  wallWithGaps([-hw, -hd], [hw, -hd]); // back
  wallWithGaps([-hw, -hd], [-hw, hd]); // left
  wallWithGaps([hw, -hd], [hw, hd]); // right
  wallWithGaps([-hw, hd], [hw, hd], [[hw - 1.2, hw + 1.2]]); // front (low), front door in the middle
  for (const w of layout.walls) wallWithGaps(w.a, w.b, w.gaps);

  // Windows on the back wall: bright sky panes with cream frames.
  for (const x of [-hw * 0.45, hw * 0.25]) {
    const frame = new THREE.Mesh(t(new THREE.PlaneGeometry(2.0, 1.4)), capMat);
    frame.position.set(x, 1.75, -hd + WALL_T / 2 + 0.01);
    const pane = new THREE.Mesh(t(new THREE.PlaneGeometry(1.75, 1.15)), t(new THREE.MeshBasicMaterial({ color: '#a9d8f5' })));
    pane.position.set(x, 1.75, -hd + WALL_T / 2 + 0.02);
    scene.add(frame, pane);
  }

  // ---- furniture
  const objects: InteriorObject[] = [];
  const groups = new Map<string, THREE.Group>();
  const items = arrangement.map((i) => ({ ...i }));
  let tvScreen: THREE.MeshBasicMaterial | null = null;
  let adTimer = 0;

  const footprint = (def: FurnitureDef) => {
    const box = new THREE.Box3();
    for (const p of def.parts) {
      const g = kit.models.get(p.model);
      if (!g?.boundingBox) continue;
      const b = g.boundingBox.clone();
      if (p.rot) b.applyMatrix4(new THREE.Matrix4().makeRotationY(p.rot));
      b.translate(new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0));
      box.union(b);
    }
    return box;
  };

  const placeGroup = (it: HomeItem) => {
    const g = groups.get(it.uid);
    if (!g) return;
    g.position.set(it.x, 0, it.z);
    g.rotation.y = it.rot;
    const obj = objects.find((o) => o.id === it.uid);
    if (obj) {
      // Stand just in front of the piece to use it.
      const def = FURNITURE.get(it.item)!;
      const fb = footprint(def);
      const front = new THREE.Vector3(0, 0, fb.max.z + 0.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
      obj.stand.set(THREE.MathUtils.clamp(it.x + front.x, -hw + 0.4, hw - 0.4), 0, THREE.MathUtils.clamp(it.z + front.z, -hd + 0.4, hd - 0.4));
    }
  };

  for (const it of items) {
    const def = FURNITURE.get(it.item);
    if (!def) continue;
    const g = new THREE.Group();
    g.name = `furniture-${it.uid}`;
    for (const p of def.parts) {
      const geo = kit.models.get(p.model);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, kit.material);
      m.position.set(p.x ?? 0, p.y ?? 0, p.z ?? 0);
      m.rotation.y = p.rot ?? 0;
      g.add(m);
    }
    if (def.tv && !tvScreen) {
      tvScreen = t(new THREE.MeshBasicMaterial({ color: '#0b0b0b', toneMapped: false }));
      const big = def.id === 'tv';
      const screen = new THREE.Mesh(t(new THREE.PlaneGeometry(big ? 1.15 : 0.5, big ? 0.62 : 0.34)), tvScreen);
      screen.position.set(big ? 0 : -0.05, big ? 1.1 : 0.3, big ? 0.16 : 0.29);
      g.add(screen);
    }
    scene.add(g);
    groups.set(it.uid, g);
    g.traverse((o) => (o.userData.objectId = it.uid));
    objects.push({ id: it.uid, label: def.name, emoji: def.emoji, mesh: g, actions: def.actions, stand: new THREE.Vector3() });
    placeGroup(it);
  }

  // TV: the ad shows only when you turn the TV on, briefly and clearly.
  const playTvAd = tvScreen
    ? () => {
        const ad = HOUSE_ADS[Math.floor(Math.random() * HOUSE_ADS.length)];
        tvScreen!.map = adTexture(ad, 16 / 9);
        tvScreen!.color.set('#ffffff');
        tvScreen!.needsUpdate = true;
        adTimer = 5;
      }
    : undefined;
  animated.push((dt) => {
    if (!tvScreen) return;
    if (adTimer > 0) {
      adTimer -= dt;
      if (adTimer <= 0) {
        tvScreen.map = null;
        tvScreen.needsUpdate = true;
      }
    }
    if (adTimer <= 0 && tvScreen.color.getHex() !== 0x0b0b0b) tvScreen.color.setHSL((performance.now() / 4000) % 1, 0.5, 0.45);
  });

  // ---- move mode helpers
  let lit: string | null = null;
  const glow = new THREE.Mesh(t(new THREE.RingGeometry(0.9, 1.15, 32)), t(new THREE.MeshBasicMaterial({ color: '#ffd400', transparent: true, opacity: 0.9, depthWrite: false })));
  glow.rotation.x = -Math.PI / 2;
  glow.visible = false;
  scene.add(glow);
  animated.push(() => {
    if (!lit) return;
    const g = groups.get(lit);
    if (!g) return;
    glow.position.set(g.position.x, 0.03, g.position.z);
    const s = 1 + Math.sin(performance.now() / 180) * 0.06;
    glow.scale.set(s, s, s);
  });

  return {
    scene,
    objects,
    layout,
    items,
    floors,
    focus: new THREE.Vector3(0, 0.6, -0.4),
    spawn: new THREE.Vector3(0, 0, hd - 1),
    halfWidth: hw + 0.6,
    playTvAd,
    moveItem(uid, x, z) {
      const it = items.find((i) => i.uid === uid);
      if (!it) return;
      it.x = THREE.MathUtils.clamp(x, -hw + 0.4, hw - 0.4);
      it.z = THREE.MathUtils.clamp(z, -hd + 0.4, hd - 0.4);
      placeGroup(it);
    },
    rotateItem(uid) {
      const it = items.find((i) => i.uid === uid);
      if (!it) return;
      it.rot = (it.rot + Math.PI / 2) % (Math.PI * 2);
      placeGroup(it);
    },
    highlight(uid) {
      lit = uid;
      glow.visible = !!uid;
    },
    update: (dt) => animated.forEach((f) => f(dt)),
    dispose() {
      // Furniture geometry and material are shared (kit): only drop our own things.
      disposables.forEach((x) => x.dispose());
    },
  };
}
