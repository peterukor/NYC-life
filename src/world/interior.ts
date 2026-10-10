// =====================================================================
// interior.ts — rooms you go inside.
//
// To keep the game small, every venue of the same kind shares one room
// TEMPLATE (a bodega, a café, a bar…). The place's name and colour are
// painted onto it, so "Kings Deli" and "Fulton Mini Market" look like
// cousins, not clones. Your apartment is its own template, with
// furniture you tap to use.
// =====================================================================

import * as THREE from 'three';
import type { InteriorKind, PlaceDef } from '../data/places.ts';
import { adTexture, HOUSE_ADS, signTexture } from '../render/textures.ts';
import { makeAvatar } from './avatar.ts';
import { OUTFIT_COLORS, SKIN_TONES, HAIR_COLORS } from './avatar.ts';

/** Something in the room you can tap, and the actions it offers. */
export interface InteriorObject {
  id: string;
  label: string;
  emoji: string;
  mesh: THREE.Object3D;
  actions: string[];
  /** Where the player stands to use it. */
  stand: THREE.Vector3;
}

export interface Interior {
  scene: THREE.Scene;
  objects: InteriorObject[];
  /** Where the camera looks and where the player starts. */
  focus: THREE.Vector3;
  spawn: THREE.Vector3;
  /** Show an ad on the TV (apartment only) for a few seconds. */
  playTvAd?: () => void;
  update: (dt: number) => void;
  dispose: () => void;
}

const lam = (c: string) => new THREE.MeshLambertMaterial({ color: c });

export function buildInterior(place: PlaceDef, actionsHere: string[]): Interior {
  const scene = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];
  const t = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const objects: InteriorObject[] = [];
  const animated: ((dt: number) => void)[] = [];

  // Room shell: floor + three walls (open to the camera on one side, like The Sims).
  const W = place.interior === 'apartment' ? 12 : 16;
  const D = place.interior === 'apartment' ? 10 : 12;
  const H = 4.2;
  const floorColor: Partial<Record<InteriorKind, string>> = { apartment: '#b88b5e', bodega: '#cfcfc8', pizza: '#e8dcc8', cafe: '#9c6b43', bar: '#4a2f22', club: '#141018', office: '#8f969c', gym: '#3a3d42', comedy: '#2a1f26' };
  const wallColor: Partial<Record<InteriorKind, string>> = { apartment: '#efe4d2', bodega: '#f3efe2', pizza: '#f6e3c7', cafe: '#c28a5c', bar: '#6b2f2f', club: '#1d1630', office: '#e6e9ec', gym: '#5b6168', comedy: '#3a2340' };
  const floor = new THREE.Mesh(t(new THREE.BoxGeometry(W, 0.2, D)), t(lam(floorColor[place.interior] ?? '#999')));
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  floor.name = 'floor';
  scene.add(floor);
  const wallMat = t(lam(wallColor[place.interior] ?? '#ddd'));
  const back = new THREE.Mesh(t(new THREE.BoxGeometry(W, H, 0.25)), wallMat);
  back.position.set(0, H / 2, -D / 2);
  const left = new THREE.Mesh(t(new THREE.BoxGeometry(0.25, H, D)), wallMat);
  left.position.set(-W / 2, H / 2, 0);
  const right = left.clone();
  right.position.x = W / 2;
  scene.add(back, left, right);

  // Name sign on the back wall.
  if (place.interior !== 'apartment') {
    const sign = new THREE.Mesh(t(new THREE.PlaneGeometry(6, 1.1)), t(new THREE.MeshBasicMaterial({ map: t(signTexture(place.name, place.color)) })));
    sign.position.set(0, H - 0.8, -D / 2 + 0.14);
    scene.add(sign);
  }

  // Lighting: warm and cosy; clubs get coloured party lights.
  scene.add(new THREE.HemisphereLight('#fff7ea', '#3a3330', place.interior === 'club' ? 0.35 : 1.1));
  const key = new THREE.PointLight(place.interior === 'club' ? '#b14cff' : '#ffe2b8', place.interior === 'club' ? 60 : 30, 30);
  key.position.set(0, H - 0.4, 0);
  scene.add(key);
  scene.background = new THREE.Color('#0d0f14');

  const box = (w: number, h: number, d: number, color: string, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(t(new THREE.BoxGeometry(w, h, d)), t(lam(color)));
    m.position.set(x, y + h / 2, z);
    m.castShadow = true;
    scene.add(m);
    return m;
  };
  const addObject = (id: string, label: string, emoji: string, mesh: THREE.Object3D, actions: string[], stand: THREE.Vector3) => {
    mesh.userData.objectId = id;
    mesh.traverse((o) => (o.userData.objectId = id));
    objects.push({ id, label, emoji, mesh, actions, stand });
  };

  let playTvAd: (() => void) | undefined;

  if (place.interior === 'apartment') {
    // Bed (back left)
    const bed = new THREE.Group();
    const frame = box(2.2, 0.45, 3, '#6b4b3a', -4, 0, -3);
    const sheet = box(2.1, 0.25, 2.3, '#3d5a80', -4, 0.45, -2.6);
    const pillow = box(1.6, 0.2, 0.6, '#f1f1f1', -4, 0.5, -4.1);
    bed.add(frame, sheet, pillow);
    scene.add(bed);
    addObject('bed', 'Bed', '🛏️', bed, ['sleep', 'nap'], new THREE.Vector3(-2.5, 0, -2.5));
    // Kitchenette (back right)
    const kitchen = new THREE.Group();
    kitchen.add(box(3.6, 0.95, 0.8, '#d9d4cb', 3.6, 0, -4.4), box(0.9, 1.9, 0.8, '#e9ecef', 1.4, 0, -4.4), box(0.7, 0.05, 0.5, '#222', 3.6, 0.95, -4.4));
    scene.add(kitchen);
    addObject('kitchen', 'Kitchen', '🍳', kitchen, ['snack', 'cookPasta', 'cookFancy'], new THREE.Vector3(2.8, 0, -3.2));
    // Bathroom corner (right): shower + toilet
    const shower = box(1.2, 2.3, 1.2, '#a8dadc', 5.2, 0, -1.2);
    (shower.material as THREE.MeshLambertMaterial).transparent = true;
    (shower.material as THREE.MeshLambertMaterial).opacity = 0.6;
    addObject('shower', 'Shower', '🚿', shower, ['shower'], new THREE.Vector3(4.2, 0, -0.6));
    const toilet = new THREE.Group();
    toilet.add(box(0.5, 0.45, 0.7, '#fafafa', 5.3, 0, 1.0), box(0.5, 0.6, 0.2, '#fafafa', 5.3, 0.45, 0.7));
    scene.add(toilet);
    addObject('toilet', 'Toilet', '🚽', toilet, ['toilet'], new THREE.Vector3(4.4, 0, 1.2));
    // Desk with laptop (left wall)
    const desk = new THREE.Group();
    desk.add(box(1.6, 0.75, 0.8, '#7f5539', -5.3, 0, 1.2), box(0.5, 0.03, 0.35, '#2b2d42', -5.3, 0.78, 1.2), box(0.5, 0.33, 0.03, '#2b2d42', -5.3, 0.8, 1.04));
    scene.add(desk);
    addObject('desk', 'Laptop desk', '💻', desk, ['codePractice', 'freelance', 'sellOnline', 'doomscroll'], new THREE.Vector3(-4.2, 0, 1.4));
    // Couch + TV (front centre)
    const couch = new THREE.Group();
    couch.add(box(2.6, 0.5, 1, '#e76f51', 0, 0, 2.6), box(2.6, 0.6, 0.3, '#e76f51', 0, 0.5, 3.0));
    scene.add(couch);
    addObject('couch', 'Couch', '🛋️', couch, ['callMom', 'guitar', 'workout'], new THREE.Vector3(0, 0, 1.6));
    const tvStand = box(2, 0.5, 0.5, '#343a40', 0, 0, -0.6);
    const tvScreenMat = t(new THREE.MeshBasicMaterial({ color: '#0b0b0b', toneMapped: false }));
    const tvScreen = new THREE.Mesh(t(new THREE.PlaneGeometry(1.9, 1.07)), tvScreenMat);
    tvScreen.position.set(0, 1.15, -0.6);
    tvScreen.rotation.y = Math.PI; // faces the couch
    const tvBack = box(2, 1.15, 0.08, '#111', 0, 0.58, -0.66);
    const tv = new THREE.Group();
    tv.add(tvStand, tvScreen, tvBack);
    scene.add(tv);
    addObject('tv', 'TV', '📺', tv, ['watchTv', 'gameConsole'], new THREE.Vector3(0, 0, 1.4));
    // In-home TV ad: shown only when the player turns the TV on, for a few seconds, clearly labelled.
    let adTimer = 0;
    playTvAd = () => {
      const ad = HOUSE_ADS[Math.floor(Math.random() * HOUSE_ADS.length)];
      tvScreenMat.map = adTexture(ad, 16 / 9);
      tvScreenMat.color.set('#ffffff');
      tvScreenMat.needsUpdate = true;
      adTimer = 5;
    };
    animated.push((dt) => {
      if (adTimer > 0) {
        adTimer -= dt;
        if (adTimer <= 0) {
          // After the ad, the "show": a gently shifting colour.
          tvScreenMat.map = null;
          tvScreenMat.needsUpdate = true;
        }
      }
      if (adTimer <= 0 && tvScreenMat.color.getHex() !== 0x0b0b0b) tvScreenMat.color.setHSL((performance.now() / 4000) % 1, 0.5, 0.45);
    });
    // Rug and window for warmth.
    const rug = new THREE.Mesh(t(new THREE.CircleGeometry(1.8, 24)), t(lam('#457b9d')));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.01, 1.2);
    scene.add(rug);
    const win = new THREE.Mesh(t(new THREE.PlaneGeometry(2.4, 1.6)), t(new THREE.MeshBasicMaterial({ color: '#9ec9e8' })));
    win.position.set(-1.5, 2.4, -D / 2 + 0.14);
    scene.add(win);
  } else {
    // A counter that offers everything this place sells.
    const counterColor = place.interior === 'bar' || place.interior === 'club' ? '#3d2b1f' : '#e0d6c8';
    const counter = new THREE.Group();
    const top = box(W * 0.55, 1.05, 1, counterColor, 0, 0, -D / 2 + 2.6);
    const trim = box(W * 0.55, 0.08, 1.05, place.color, 0, 1.05, -D / 2 + 2.6);
    counter.add(top, trim);
    scene.add(counter);
    const label = place.interior === 'office' ? 'Your desk' : place.interior === 'gym' ? 'Front desk' : place.interior === 'comedy' ? 'Box office' : 'Counter';
    addObject('counter', label, place.emoji, counter, actionsHere, new THREE.Vector3(0, 0, -D / 2 + 3.8));
    decorate(place.interior, box, scene, t, W, D, animated);
    // A few locals hanging around.
    for (let i = 0; i < 4; i++) {
      const npc = makeAvatar({ body: i % 2 ? 'f' : 'm', skin: SKIN_TONES[(i * 3) % SKIN_TONES.length], top: OUTFIT_COLORS[(i * 5 + 2) % OUTFIT_COLORS.length], bottom: '#2b2d42', hair: HAIR_COLORS[i % HAIR_COLORS.length] });
      npc.root.position.set(-W / 2 + 2.5 + i * (W - 5) / 3, 0, 1.5 + (i % 2) * 1.6);
      npc.root.rotation.y = Math.PI + (i - 1.5) * 0.4;
      scene.add(npc.root);
      disposables.push({ dispose: npc.dispose });
      animated.push((dt) => npc.animate(0, dt));
    }
    // Staff behind the counter.
    const staff = makeAvatar({ body: 'm', skin: SKIN_TONES[2], top: place.color, bottom: '#222', hair: '#111' });
    staff.root.position.set(0.8, 0, -D / 2 + 1.5);
    scene.add(staff.root);
    disposables.push({ dispose: staff.dispose });
  }

  return {
    scene,
    objects,
    focus: new THREE.Vector3(0, 1, 0),
    spawn: new THREE.Vector3(0, 0, D / 2 - 1.5),
    playTvAd,
    update: (dt) => animated.forEach((f) => f(dt)),
    dispose() {
      disposables.forEach((x) => x.dispose());
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
    },
  };
}

type BoxFn = (w: number, h: number, d: number, color: string, x: number, y: number, z: number) => THREE.Mesh;
type TrackFn = <T extends { dispose(): void }>(x: T) => T;

/** Template furniture per venue type. */
function decorate(kind: InteriorKind, box: BoxFn, scene: THREE.Scene, t: TrackFn, W: number, D: number, animated: ((dt: number) => void)[]): void {
  switch (kind) {
    case 'bodega': {
      // Shelves stacked with colourful products, a fridge wall, and THE cat.
      for (let i = 0; i < 3; i++) {
        box(0.6, 2, 4, '#c9c3b6', -W / 2 + 1.2, 0, -2 + i * 0.1);
        for (let s = 0; s < 4; s++) for (let k = 0; k < 6; k++) box(0.4, 0.3, 0.5, ['#e63946', '#ffb703', '#2a9d8f', '#3a86ff'][(s + k) % 4], -W / 2 + 1.2, 0.2 + s * 0.48, -3.6 + k * 0.62);
      }
      box(0.6, 2.4, 6, '#d8f3ff', W / 2 - 0.8, 0, -1);
      const cat = box(0.5, 0.35, 0.25, '#e9a23b', 1.4, 1.05, -D / 2 + 2.6);
      animated.push(() => (cat.rotation.y = Math.sin(performance.now() / 1500) * 0.4));
      break;
    }
    case 'pizza':
      box(2.2, 1.6, 1.4, '#7f4f24', -W / 2 + 2, 0, -D / 2 + 1);
      box(1.6, 0.6, 0.2, '#ff6b35', -W / 2 + 2, 0.6, -D / 2 + 1.75);
      for (let i = 0; i < 3; i++) box(1.4, 1.1, 0.6, '#d62828', -3 + i * 3, 0, 2.5);
      break;
    case 'cafe':
      for (let i = 0; i < 4; i++) {
        box(0.9, 0.75, 0.9, '#6f4e37', -4.5 + i * 3, 0, 1.6);
        box(0.12, 0.3, 0.6, '#264653', -4.5 + i * 3, 0.75, 1.6);
      }
      box(W - 2, 0.05, 0.4, '#3a5a40', 0, 2.6, -D / 2 + 0.3);
      break;
    case 'bar':
    case 'club': {
      for (let i = 0; i < 6; i++) box(0.4, 0.8, 0.4, '#222', -4 + i * 1.6, 0, -D / 2 + 3.6);
      const neon = new THREE.Mesh(t(new THREE.TorusGeometry(0.8, 0.06, 6, 24)), t(new THREE.MeshBasicMaterial({ color: kind === 'club' ? '#ff00ff' : '#ff4d6d', toneMapped: false })));
      neon.position.set(-W / 2 + 0.2, 2.6, -1);
      neon.rotation.y = Math.PI / 2;
      scene.add(neon);
      if (kind === 'club') {
        // Dance floor tiles that pulse with the beat.
        const tiles: THREE.MeshBasicMaterial[] = [];
        for (let x = -3; x <= 3; x++)
          for (let z = 0; z <= 3; z++) {
            const m = t(new THREE.MeshBasicMaterial({ color: '#222', toneMapped: false }));
            const tile = new THREE.Mesh(t(new THREE.PlaneGeometry(0.95, 0.95)), m);
            tile.rotation.x = -Math.PI / 2;
            tile.position.set(x, 0.02, z);
            scene.add(tile);
            tiles.push(m);
          }
        animated.push(() => {
          const beat = Math.floor(performance.now() / 470);
          tiles.forEach((m, i) => m.color.setHSL(((i * 37 + beat * 53) % 360) / 360, 0.9, (i + beat) % 3 === 0 ? 0.55 : 0.12));
        });
      }
      break;
    }
    case 'office':
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 4; c++) {
          box(1.4, 0.75, 0.8, '#ced4da', -4.5 + c * 3, 0, 0.5 + r * 2.5);
          box(0.7, 0.45, 0.05, '#1b263b', -4.5 + c * 3, 0.78, 0.25 + r * 2.5);
        }
      break;
    case 'gym':
      for (let i = 0; i < 4; i++) {
        box(0.8, 1.2, 1.8, '#adb5bd', -5 + i * 3.2, 0, 1.5);
        box(1.6, 0.12, 0.12, '#111', -5 + i * 3.2, 1.3, 1.5);
      }
      break;
    case 'comedy': {
      box(5, 0.6, 2.5, '#5a189a', 0, 0, -D / 2 + 1.25);
      const mic = box(0.06, 1.5, 0.06, '#ccc', 0, 0.6, -D / 2 + 1.8);
      mic.castShadow = false;
      for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) box(0.5, 0.45, 0.5, '#222', -4 + c * 2, 0, 1.5 + r * 2);
      const spot = new THREE.SpotLight('#ffffff', 60, 14, 0.4, 0.5);
      spot.position.set(0, 4, 2);
      spot.target.position.set(0, 0.6, -D / 2 + 1.2);
      scene.add(spot, spot.target);
      break;
    }
    default:
      break;
  }
}
