// =====================================================================
// home-interior.ts — your home, The Sims style.
//
//   • No roof, and the walls nearest the camera are cut down to a low
//     ledge, so you look straight into every room.
//   • Each home has its own floor plan (data/homes.ts): a studio, a loft
//     and a shared apartment all feel different.
//   • Real furniture (data/furniture.ts) that you tap to use: sleep in
//     the bed, cook on the stove, watch TV on the sofa…
//   • MOVE MODE: pick up any piece, drag it (or tap the floor) and turn
//     it. A green shade on the floor means it fits there, red means it
//     doesn't (walls, doorways, other furniture: world/furniture-fit.ts);
//     let go on red and it slides back to where it was. The arrangement
//     is saved per home (state.homes).
// =====================================================================

import * as THREE from 'three';
import { FURNITURE, type FurnitureDef } from '../data/furniture.ts';
import type { HomeItem, HomeLayout } from '../data/homes.ts';
import type { PlaceDef } from '../data/places.ts';
import { adTexture, HOUSE_ADS, signTexture } from '../render/textures.ts';
import { HAIR_COLORS, makeAvatar, OUTFIT_COLORS, SKIN_TONES } from './avatar.ts';
import type { FurnitureKit } from '../assets/furniture-kit.ts';
import type { Interior, InteriorObject } from './interior.ts';
import { rectAt, snapToWall, spotFree, WalkGrid, whyNot, type FitKind, type FitWorld, type Footprint } from './furniture-fit.ts';

const WALL_H = 2.9;
const LOW_WALL = 0.55;
const WALL_T = 0.2;

export interface HomeInterior extends Interior {
  layout: HomeLayout;
  /** The current arrangement (save this to keep the player's changes). */
  items: HomeItem[];
  /** Floor meshes: tap targets when placing furniture. */
  floors: THREE.Object3D[];
  /** Pick a piece up: remembers where it was and shows the floor shade. */
  beginMove: (uid: string) => void;
  /** Slide the held piece to a spot (snapped to a 10 cm grid). Returns whether it fits there. */
  dragTo: (uid: string, x: number, z: number) => boolean;
  /** Turn the held piece a quarter turn. Returns whether it fits. */
  rotateItem: (uid: string) => boolean;
  /** Put it down: if it fits it stays (and that's the new "before"), otherwise it slides back. Returns the reason it didn't fit, or null. */
  drop: (uid: string) => string | null;
  /** Leave move mode: `cancel` puts it back where it was when picked up. */
  endMove: (uid: string, cancel: boolean) => void;
  /** Where the held piece is now (to drag it by the point you grabbed). */
  itemPos: (uid: string) => { x: number; z: number } | null;
  /** Is this standing spot clear? */
  spotFree: (x: number, z: number) => boolean;
  /** A walk around the furniture from one spot to another (null = no way there). */
  walkPath: (fx: number, fz: number, tx: number, tz: number) => { x: number; z: number }[] | null;
  /** Take a piece out of the home (into storage). */
  removePiece: (uid: string) => void;
  /** Bring a piece in at the free spot nearest (x, z). Returns its uid, or null if there's no room. */
  addPiece: (item: string, x: number, z: number, rot?: number) => string | null;
  /** A piece's spot, turn and footprint (for posing the player on it). */
  pieceInfo: (uid: string) => { item: string; x: number; z: number; rot: number; fp: Footprint } | null;
  /** The first piece you use that can't be reached from the door (null = all fine). */
  blockedUse: () => string | null;
  /** Pieces standing where they shouldn't (for QA of the home layouts). */
  clashes: () => { uid: string; why: string }[];
  /** Glow the piece being moved (null = none). */
  highlight: (uid: string | null) => void;
  /** Homes: you can move furniture. Venues (shops, bars): you can't. */
  movable: boolean;
}

export interface BuildOptions {
  /** Venues: the counter offers these (the place's own actions). */
  placeActions?: string[];
  /** Venues get a name sign and a few locals and staff. */
  venue?: boolean;
}

export function buildHome(place: PlaceDef, layout: HomeLayout, arrangement: HomeItem[], kit: FurnitureKit, opts: BuildOptions = {}): HomeInterior {
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
    // Every wall running across the view is cut low except the back wall,
    // so rooms behind other rooms stay visible (railroad apartments).
    const low = alongX && cz > -hd + 0.3;
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

  const fpCache = new Map<string, Footprint | null>();
  const fit: FitWorld = {
    layout,
    items,
    footprint: (item) => {
      if (!fpCache.has(item)) {
        const def = FURNITURE.get(item);
        const b = def ? footprint(def) : null;
        fpCache.set(item, b && !b.isEmpty() ? { minX: b.min.x, maxX: b.max.x, minZ: b.min.z, maxZ: b.max.z } : null);
      }
      return fpCache.get(item)!;
    },
    kind: (item): FitKind => {
      const def = FURNITURE.get(item);
      return def?.flat ? 'flat' : def?.wall ? 'wall' : 'floor';
    },
  };

  /** Where you stand to use a piece: in front if that's clear, else beside or behind it. */
  const standFor = (it: HomeItem, out: THREE.Vector3) => {
    const fb = fit.footprint(it.item) ?? { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 };
    const up = new THREE.Vector3(0, 1, 0);
    const tries: [number, number][] = [
      [0, fb.maxZ + 0.45], [0, fb.maxZ + 0.8],
      [fb.maxX + 0.4, 0], [fb.minX - 0.4, 0],
      [fb.maxX + 0.4, fb.maxZ + 0.3], [fb.minX - 0.4, fb.maxZ + 0.3],
      [0, fb.minZ - 0.45],
    ];
    for (const [lx, lz] of tries) {
      const v = new THREE.Vector3(lx, 0, lz).applyAxisAngle(up, it.rot);
      if (spotFree(fit, it.x + v.x, it.z + v.z)) return out.set(it.x + v.x, 0, it.z + v.z);
    }
    const v = new THREE.Vector3(0, 0, fb.maxZ + 0.45).applyAxisAngle(up, it.rot);
    return out.set(THREE.MathUtils.clamp(it.x + v.x, -hw + 0.4, hw - 0.4), 0, THREE.MathUtils.clamp(it.z + v.z, -hd + 0.4, hd - 0.4));
  };
  // Where you can walk: rebuilt (lazily) whenever furniture moves.
  let grid: WalkGrid | null = null;
  /**
   * Can you still reach everything you use (bed, stove, shower…) from the
   * front door? Fitting on the floor isn't enough: a couch can fit and
   * still wall off the kitchen. Returns the first piece you can't reach.
   */
  const blockedUse = (): string | null => {
    const g = new WalkGrid(fit);
    const door = { x: 0, z: hd - 1 };
    const v = new THREE.Vector3();
    for (const it of items) {
      const def = FURNITURE.get(it.item);
      if (!def || !(def.actions.length || def.opens || def.placeActions)) continue;
      standFor(it, v);
      const path = g.path(door.x, door.z, v.x, v.z);
      const end = path?.[path.length - 1];
      if (!end || Math.hypot(end.x - v.x, end.z - v.z) > 0.35) return def.name;
    }
    return null;
  };
  const refreshStands = () => {
    grid = null;
    for (const it of items) {
      const obj = objects.find((o) => o.id === it.uid);
      if (obj) standFor(it, obj.stand);
    }
  };

  const placeGroup = (it: HomeItem) => {
    const g = groups.get(it.uid);
    if (!g) return;
    g.position.set(it.x, 0, it.z);
    g.rotation.y = it.rot;
  };

  /** Build a piece's 3D group and tap target. */
  const addPiece = (it: HomeItem) => {
    const def = FURNITURE.get(it.item);
    if (!def) return;
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
      const [sw, sh, sx, sy, sz] = def.screen ?? (big ? [1.15, 0.62, 0, 1.1, 0.16] : [0.5, 0.34, -0.05, 0.3, 0.29]);
      const screen = new THREE.Mesh(t(new THREE.PlaneGeometry(sw, sh)), tvScreen);
      screen.position.set(sx, sy, sz);
      g.add(screen);
    }
    scene.add(g);
    groups.set(it.uid, g);
    g.traverse((o) => (o.userData.objectId = it.uid));
    const label = def.placeActions ? place.name : def.name;
    objects.push({ id: it.uid, label, emoji: def.placeActions ? place.emoji : def.emoji, mesh: g, actions: def.placeActions ? opts.placeActions ?? [] : def.actions, stand: new THREE.Vector3() });
    placeGroup(it);
  };
  for (const it of items) addPiece(it);
  refreshStands();

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

  // ---- venues: a name sign, staff behind the counter, a few locals
  if (opts.venue) {
    const sign = new THREE.Mesh(t(new THREE.PlaneGeometry(6, 1.1)), t(new THREE.MeshBasicMaterial({ map: t(signTexture(place.name, place.color)) })));
    sign.position.set(0, WALL_H - 0.55, -hd + WALL_T / 2 + 0.03);
    scene.add(sign);
    const counter = items.find((i) => FURNITURE.get(i.item)?.placeActions);
    const people: { x: number; z: number; ry: number }[] = [];
    if (counter) people.push({ x: counter.x + 0.6, z: counter.z - 1.0, ry: 0 });
    for (let i = 0; i < 3; i++) people.push({ x: -hw + 2.5 + i * ((W - 5) / 2), z: 0.8 + (i % 2) * 1.8, ry: Math.PI + (i - 1) * 0.5 });
    people.forEach((p, i) => {
      const npc = makeAvatar({ body: i % 2 ? 'f' : 'm', skin: SKIN_TONES[(i * 3 + 1) % SKIN_TONES.length], top: i === 0 ? place.color : OUTFIT_COLORS[(i * 5 + 2) % OUTFIT_COLORS.length], bottom: '#2b2d42', hair: HAIR_COLORS[i % HAIR_COLORS.length] });
      npc.root.position.set(p.x, 0, p.z);
      npc.root.rotation.y = p.ry;
      scene.add(npc.root);
      disposables.push({ dispose: npc.dispose });
      animated.push((dt) => npc.animate(0, dt));
    });
  }

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

  // The floor shade under a held piece: green = fits, red = doesn't.
  // (Wall pieces get the shade on the floor right under them.)
  const shadeMat = t(new THREE.MeshBasicMaterial({ color: '#36c46b', transparent: true, opacity: 0.55, depthWrite: false }));
  // The held piece glows the same colour, so you see it even when it hides the shade.
  const heldMat = t(kit.material.clone());
  const tintHeld = (uid: string | null, ok = true) => {
    for (const [id, g] of groups) {
      const on = id === uid;
      g.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.material === tvScreen) return;
        if (o.material === kit.material || o.material === heldMat) o.material = on ? heldMat : kit.material;
      });
    }
    heldMat.emissive.set(ok ? '#1f7a3e' : '#9b1c22');
  };
  const shade = new THREE.Mesh(t(new THREE.PlaneGeometry(1, 1)), shadeMat);
  shade.rotation.x = -Math.PI / 2;
  shade.renderOrder = 2;
  shade.visible = false;
  const edge = new THREE.LineSegments(t(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1))), t(new THREE.LineBasicMaterial({ color: '#1f8f4a', transparent: true, opacity: 0.9, depthWrite: false })));
  edge.rotation.x = -Math.PI / 2;
  edge.renderOrder = 3;
  edge.visible = false;
  scene.add(shade, edge);
  // The piece in hand: where it was picked up, and the last spot it fitted.
  let hold: { uid: string; startX: number; startZ: number; startRot: number; okX: number; okZ: number; okRot: number } | null = null;
  const updateShade = (it: HomeItem): boolean => {
    const fp = fit.footprint(it.item);
    const ok = !whyNot(fit, it.uid, it.x, it.z, it.rot);
    if (!fp) return ok;
    const w = fp.maxX - fp.minX, d = fp.maxZ - fp.minZ;
    const cx = (fp.minX + fp.maxX) / 2, cz = (fp.minZ + fp.maxZ) / 2;
    const c = new THREE.Vector3(cx, 0, cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), it.rot);
    for (const m of [shade, edge]) {
      m.visible = true;
      m.position.set(it.x + c.x, 0.04, it.z + c.z);
      m.rotation.z = it.rot; // the plane lies flat: its z turn is a turn about the floor's up
      m.scale.set(w + 0.3, Math.max(d, 0.25) + 0.3, 1);
    }
    tintHeld(it.uid, ok);
    shadeMat.color.set(ok ? '#36c46b' : '#e5484d');
    (edge.material as THREE.LineBasicMaterial).color.set(ok ? '#1f8f4a' : '#a51d24');
    return ok;
  };
  const heldItem = (uid: string) => (hold?.uid === uid ? items.find((i) => i.uid === uid) ?? null : null);
  const putBack = (it: HomeItem, x: number, z: number, rot: number) => {
    it.x = x; it.z = z; it.rot = rot;
    placeGroup(it);
  };

  return {
    scene,
    objects,
    layout,
    items,
    floors,
    movable: !opts.venue,
    focus: new THREE.Vector3(0, 0.6, -0.4),
    spawn: new THREE.Vector3(0, 0, hd - 1),
    halfWidth: hw + 1.1, // margin: the front of the room is nearer the camera, so it looks wider
    playTvAd,
    beginMove(uid) {
      const it = items.find((i) => i.uid === uid);
      if (!it) return;
      hold = { uid, startX: it.x, startZ: it.z, startRot: it.rot, okX: it.x, okZ: it.z, okRot: it.rot };
      updateShade(it);
    },
    dragTo(uid, x, z) {
      const it = heldItem(uid);
      if (!it) return false;
      if (fit.kind(it.item) === 'wall') {
        const p = snapToWall(fit, it.item, x, z);
        it.x = p.x; it.z = p.z; it.rot = p.rot;
      } else {
        // A 10 cm grid makes lining things up easy; stay inside the outer walls.
        it.x = THREE.MathUtils.clamp(Math.round(x * 10) / 10, -hw + 0.2, hw - 0.2);
        it.z = THREE.MathUtils.clamp(Math.round(z * 10) / 10, -hd + 0.2, hd - 0.2);
      }
      placeGroup(it);
      return updateShade(it);
    },
    rotateItem(uid) {
      const it = heldItem(uid);
      if (!it || fit.kind(it.item) === 'wall') return it ? updateShade(it) : false;
      it.rot = (Math.round((it.rot + Math.PI / 2) / (Math.PI / 2)) * (Math.PI / 2)) % (Math.PI * 2);
      placeGroup(it);
      return updateShade(it);
    },
    drop(uid) {
      const it = heldItem(uid);
      if (!it || !hold) return null;
      let why = whyNot(fit, uid, it.x, it.z, it.rot);
      if (!why) {
        const cut = blockedUse();
        if (cut) why = `That blocks the way to the ${cut.toLowerCase()}`;
      }
      if (why) putBack(it, hold.okX, hold.okZ, hold.okRot);
      else Object.assign(hold, { okX: it.x, okZ: it.z, okRot: it.rot });
      updateShade(it);
      return why;
    },
    endMove(uid, cancel) {
      const it = heldItem(uid);
      if (it && hold) {
        if (cancel) putBack(it, hold.startX, hold.startZ, hold.startRot);
        else if (whyNot(fit, uid, it.x, it.z, it.rot) || blockedUse()) putBack(it, hold.okX, hold.okZ, hold.okRot);
      }
      hold = null;
      shade.visible = edge.visible = false;
      tintHeld(null);
      refreshStands();
    },
    itemPos(uid) {
      const it = items.find((i) => i.uid === uid);
      return it ? { x: it.x, z: it.z } : null;
    },
    spotFree: (x, z) => spotFree(fit, x, z),
    removePiece(uid) {
      const k = items.findIndex((i) => i.uid === uid);
      if (k < 0) return;
      items.splice(k, 1);
      const g = groups.get(uid);
      g?.removeFromParent();
      groups.delete(uid);
      const o = objects.findIndex((x) => x.id === uid);
      if (o >= 0) objects.splice(o, 1);
      if (tvScreen && g && g.children.some((c) => (c as THREE.Mesh).material === tvScreen)) tvScreen = null;
      refreshStands();
    },
    addPiece(item, x, z, preferRot = 0) {
      const def = FURNITURE.get(item);
      if (!def) return null;
      let n = 1;
      while (items.some((i) => i.uid === `${item}-${n}`)) n++;
      const it: HomeItem = { uid: `${item}-${n}`, item, x, z, rot: 0 };
      items.push(it);
      // Search outwards from (x, z) on a 20 cm grid for a spot it fits (both turns).
      let found = false;
      outer: for (let ring = 0; ring < 40; ring++) {
        for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          for (const rot of [preferRot, preferRot + Math.PI / 2, preferRot + Math.PI, preferRot - Math.PI / 2]) {
            let px = Math.round((x + dx * 0.2) * 10) / 10, pz = Math.round((z + dz * 0.2) * 10) / 10, pr = rot;
            if (def.wall) ({ x: px, z: pz, rot: pr } = snapToWall(fit, item, px, pz));
            if (!whyNot(fit, it.uid, px, pz, pr)) {
              Object.assign(it, { x: px, z: pz, rot: pr });
              if (blockedUse()) continue;
              found = true;
              break outer;
            }
          }
        }
      }
      if (!found) {
        items.pop();
        return null;
      }
      addPiece(it);
      refreshStands();
      return it.uid;
    },
    blockedUse: () => blockedUse(),
    pieceInfo: (uid) => {
      const it = items.find((i) => i.uid === uid);
      const fp = it && fit.footprint(it.item);
      return it && fp ? { item: it.item, x: it.x, z: it.z, rot: it.rot, fp } : null;
    },
    walkPath: (fx, fz, tx, tz) => (grid ??= new WalkGrid(fit)).path(fx, fz, tx, tz),
    clashes: () => items.flatMap((i) => {
      const why = whyNot(fit, i.uid, i.x, i.z, i.rot);
      const fp = fit.footprint(i.item);
      const r = fp ? rectAt(fp, i.x, i.z, i.rot) : null;
      return why ? [{ uid: i.uid, why: `${why} ${r ? [r.x0, r.z0, r.x1, r.z1].map((v) => v.toFixed(2)).join(',') : ''}` }] : [];
    }),
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
