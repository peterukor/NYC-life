// =====================================================================
// proto/main.ts — TEST BUILD of the 2.5D map (open the game with ?proto).
//
// One neighbourhood (Downtown, 16 blocks). Buildings are pictures of
// Peter's full-detail models photographed in Blender from a fixed
// Clash-of-Clans-style angle; roads, sidewalks and water are flat
// coloured shapes; people, cars, trees and lamps are live 3D.
//
// Controls: drag to move around, pinch or mouse wheel to zoom, tap a
// block to see what it is and walk there.
// =====================================================================

import * as THREE from 'three';
import { HOUSES, homeWeekly, AD_PRICES } from '../data/plots.ts';
import { buildGround, buildProps, textTexture } from './ground.ts';
import { PEOPLE_SCALE, Walker, makeStroller, makeTraffic } from './people.ts';
import {
  CELL_D, CELL_W, COLS, DOWNTOWN, GRID_D, GRID_W, PITCH_X, PITCH_Z, ROAD, ROWS, SPACE_D, SPACE_W, STRIP, cellAt, cellX, cellZ, plotAt, type Block, type HouseKind, type Side,
} from './plan.ts';
import { cameraQuaternion, loadSprite, makeSpriteMesh } from './sprites.ts';
import { CAM_DIR, CAM_DISTANCE, CAM_FAR, CAM_NEAR, SUN_FROM } from './view.ts';

const HOUSE_ID: Record<HouseKind, 'tiny' | 'townhouse' | 'modern' | 'mansion'> = { tiny: 'tiny', townhouse: 'townhouse', villa: 'modern', mansion: 'mansion' };

export async function startProto(stage: HTMLElement, ui: HTMLElement): Promise<void> {
  ui.innerHTML = '';
  document.title = 'NYC Life · 2.5D test';
  injectStyles();

  // ---- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  let hd = true;
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, hd ? 2 : 1);
  renderer.setPixelRatio(pixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  renderer.setClearColor('#bfe3f2');
  stage.appendChild(renderer.domElement);
  renderer.domElement.style.touchAction = 'none';

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAM_NEAR, CAM_FAR);
  camera.quaternion.copy(cameraQuaternion());
  // Start on the park's north sidewalk: nothing tall stands between it and the camera.
  const target = new THREE.Vector3(cellX(1) + CELL_W - 10, 0, cellZ(2) + 1.3);
  let viewH = 110; // metres of ground-plane height shown on screen (zoom)

  // ---- lights for the live 3D parts, matched to the Blender sun
  scene.add(new THREE.HemisphereLight('#fff4e2', '#b59a72', 1.6));
  const sun = new THREE.DirectionalLight('#fff2dd', 2.4);
  sun.position.copy(SUN_FROM).multiplyScalar(100);
  scene.add(sun);

  // ---- ground, props, buildings
  const ground = buildGround();
  scene.add(ground.group);
  addClouds(scene);

  const spriteJobs: Promise<void>[] = [];
  const place = (name: string, x: number, z: number, scale = 1) =>
    spriteJobs.push(
      loadSprite(name)
        .then((a) => void scene.add(makeSpriteMesh(a, x, z, scale)))
        .catch((e) => console.warn('[proto] sprite', name, e)),
    );
  // Trees and rocks are pictures of Peter's models (falls back to coded trees if missing).
  const TREES = ['prop-tree', 'prop-cherry', 'prop-tree'];
  ground.props.trees.forEach((t, i) => place(TREES[i % TREES.length], t.x, t.z, t.s * 1.5));
  ground.props.rocks.forEach((rk, i) => place(['prop-rock', 'prop-mossy-rock', 'prop-outcrop'][i % 3], rk.x, rk.z, rk.s * 1.3));
  scene.add(buildProps({ ...ground.props, trees: [] }));

  // Peter's road and intersection pictures, sunk so their road surface is at ground level.
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      const ix = c * PITCH_X + ROAD / 2;
      const iz = r * PITCH_Z + ROAD / 2;
      place('intersection', ix, iz);
      if (c < COLS) for (const k of [0.25, 0.75]) place('road-ew', cellX(c) + CELL_W * k, iz);
      if (r < ROWS) place('road-ns', ix, cellZ(r) + CELL_D / 2);
    }
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const blk = DOWNTOWN[r][c];
      const x0 = cellX(c);
      const z0 = cellZ(r);
      // A square picture stands east of its 30 m side strip; a full one fills the block.
      const at = (side?: Side) => (side ? x0 + STRIP + CELL_D / 2 : x0 + CELL_W / 2);
      if (blk.kind === 'model') place(blk.sprite, at(blk.side), z0 + CELL_D / 2);
      if (blk.kind === 'gym' && blk.sprite) place(blk.sprite, at(blk.side), z0 + CELL_D / 2);
      if (blk.kind === 'park' && blk.sprite) place(blk.sprite, x0 + CELL_W / 2, z0 + CELL_D / 2);
      if ((blk.kind === 'model' || blk.kind === 'gym') && blk.side === 'subway') place('subway-r0', x0 + STRIP / 2, z0 + CELL_D / 2 + 6, 1.6);
      if (blk.kind === 'homes') {
        for (const p of blk.plots) {
          if (!p.house) continue;
          // One-row houses face their street (north row faces north); two-row ones face south.
          const rot = p.h === 1 && p.r === 0 ? 180 : 0;
          place(`house-${p.house}-r${rot}`, x0 + 3 + (p.c + p.w / 2) * SPACE_W, z0 + 3 + (p.r + p.h / 2) * SPACE_D);
        }
      }
    }
  }

  // ---- people and cars
  const player = new Walker({ body: 'f', skin: '#8d5524', top: '#e63946', bottom: '#111111', hair: '#111111', hairStyle: 'hair_long', topId: 'tee', bottomId: 'jeans', shoesId: 'sneakers', shoes: '#f2f2f2' }, target.x, target.z);
  scene.add(player.avatar.root);
  const strollers = Array.from({ length: 10 }, (_, i) => makeStroller(i + 3));
  for (const s of strollers) scene.add(s.avatar.root);
  const traffic = makeTraffic(12);
  scene.add(traffic.group);

  // A soft round shadow under every person (they're live 3D, not in the pictures).
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.55 * PEOPLE_SCALE, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }),
  );
  const blobs = [player, ...strollers].map((w) => {
    const m = blob.clone();
    scene.add(m);
    return { w, m };
  });

  // Tap marker.
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.6, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
  );
  marker.visible = false;
  scene.add(marker);

  // See-through outline when your avatar walks behind a building.
  const XRAY = 1;
  const xray = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.55, depthFunc: THREE.GreaterDepth, depthWrite: false });

  // ---- UI
  ui.insertAdjacentHTML(
    'beforeend',
    `<div class="pt-top"><div class="pt-pill"><b>Downtown</b><span>2.5D test build</span></div>
       <div class="pt-right"><button class="pt-btn" id="pt-q">HD</button><div class="pt-stats" id="pt-stats">…</div></div></div>
     <button class="pt-btn pt-me" id="pt-me" aria-label="Find me">◎</button>
     <div class="pt-sheet" id="pt-sheet" hidden></div>
     <div class="pt-hint" id="pt-hint">Drag to move · pinch to zoom · tap a block</div>`,
  );
  const sheet = ui.querySelector<HTMLDivElement>('#pt-sheet')!;
  const stats = ui.querySelector<HTMLDivElement>('#pt-stats')!;
  const qBtn = ui.querySelector<HTMLButtonElement>('#pt-q')!;
  qBtn.onclick = () => {
    hd = !hd;
    qBtn.textContent = hd ? 'HD' : 'Low';
    renderer.setPixelRatio(pixelRatio());
    resize();
  };
  let follow = true;
  ui.querySelector<HTMLButtonElement>('#pt-me')!.onclick = () => (follow = true);

  // ---- camera
  const resize = () => {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    const aspect = w / h;
    camera.left = (-viewH * aspect) / 2;
    camera.right = (viewH * aspect) / 2;
    camera.top = viewH / 2;
    camera.bottom = -viewH / 2;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  const placeCamera = () => {
    target.x = THREE.MathUtils.clamp(target.x, -60, GRID_W + 40);
    target.z = THREE.MathUtils.clamp(target.z, -30, GRID_D + 60);
    camera.position.copy(target).addScaledVector(CAM_DIR, CAM_DISTANCE);
    camera.updateMatrixWorld();
  };
  const setZoom = (h: number) => {
    viewH = THREE.MathUtils.clamp(h, 70, 430);
    resize();
  };

  // ---- input: drag, pinch, wheel, tap
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const groundAt = (cx: number, cy: number): THREE.Vector3 | null => {
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  };
  const pts = new Map<number, { x: number; y: number }>();
  let downAt = 0;
  let moved = 0;
  let pinch0 = 0;
  let pinchH = viewH;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      downAt = performance.now();
      moved = 0;
    }
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      pinchH = viewH;
      moved = 99;
    }
  });
  el.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    if (pts.size === 1) {
      const before = groundAt(p.x, p.y);
      const after = groundAt(e.clientX, e.clientY);
      if (before && after) {
        target.sub(after.sub(before));
        placeCamera();
      }
      moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      if (moved > 8) follow = false;
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) setZoom((pinchH * pinch0) / d);
    }
  });
  const up = (e: PointerEvent) => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (p && pts.size === 0 && moved < 8 && performance.now() - downAt < 450) tap(p.x, p.y);
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(viewH * Math.exp(e.deltaY * 0.0012));
  }, { passive: false });

  const tap = (cx: number, cy: number) => {
    const g = groundAt(cx, cy);
    if (!g) return;
    ui.querySelector('#pt-hint')?.remove();
    player.walkTo(g.x, g.z);
    follow = true;
    marker.position.set(g.x, 0.4, g.z);
    marker.visible = true;
    const cell = cellAt(g.x, g.z);
    if (cell) showSheet(DOWNTOWN[cell.r][cell.c], g.x - cellX(cell.c), g.z - cellZ(cell.r));
    else sheet.hidden = true;
  };

  const showSheet = (blk: Block, lx: number, lz: number) => {
    let body = '';
    if (blk.kind === 'model') body = `<p>${blk.use}. ${blk.use === 'Apartments' ? 'Apartments for rent inside.' : 'Jobs and shops coming soon.'}</p>`;
    if (blk.kind === 'ads') {
      const p = AD_PRICES.downtown;
      const half = lx < CELL_W / 2 ? 0 : 1;
      body = `<p>${half ? 'Right' : 'Left'} half: ${blk.rented[half] ? `<b>rented</b> (${blk.rented[half]})` : `<b>free</b>`}</p>
              <div class="pt-row"><span>One half</span><b>$${p.unit}/wk</b></div><div class="pt-row"><span>Whole block</span><b>$${p.block}/wk</b></div>
              <p class="pt-small">Real money · weekly · up to 26 weeks</p>`;
    }
    if (blk.kind === 'homes') {
      const plot = plotAt(blk.plots, lx, lz);
      if (plot?.house) {
        const h = HOUSES.find((x) => x.id === HOUSE_ID[plot.house!])!;
        body = `<p>${h.emoji} ${h.name} · a neighbour lives here.</p>`;
      } else {
        body = `<p>Empty plot · build your home here:</p>` + HOUSES.map((h) => `<div class="pt-row"><span>${h.emoji} ${h.name} (${h.spaces} space${h.spaces > 1 ? 's' : ''})</span><b>$${homeWeekly('downtown', h.id)}/wk</b></div>`).join('');
      }
    }
    if (blk.kind === 'lot') body = '<p>Empty lot. Peter can auction it or turn it into homes or ads.</p>';
    if (blk.kind === 'park') body = '<p>Swings, slides and a basketball court. Hang out here to restore energy.</p>';
    if ((blk.kind === 'model' || blk.kind === 'gym') && blk.side === 'subway' && lx < STRIP) body = '<p>🚇 Subway: take the train to another borough (coming soon).</p>';
    if (blk.kind === 'gym') body = '<p>Work out to build fitness, then cool off in the pool.</p>';
    if (blk.kind === 'landmark') body = '<p>Landmark model coming soon.</p>';
    sheet.innerHTML = `<button class="pt-x" aria-label="Close">✕</button><h3>${blk.name}</h3>${body}`;
    sheet.hidden = false;
    sheet.querySelector<HTMLButtonElement>('.pt-x')!.onclick = () => (sheet.hidden = true);
  };

  // ---- loop
  const clock = new THREE.Clock();
  let fpsT = 0;
  let frames = 0;
  let t = 0;
  placeCamera();
  await Promise.race([Promise.all(spriteJobs), new Promise((r) => setTimeout(r, 8000))]);
  const loop = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    t += dt;
    player.update(dt);
    for (const s of strollers) s.update(dt);
    traffic.update(dt);
    ground.tick(t);
    for (const { w, m } of blobs) m.position.set(w.pos.x, w.pos.y + 0.03, w.pos.z);
    if (!player.walking) marker.visible = false;
    marker.rotation.y += dt;
    if (follow) {
      target.x += (player.pos.x - target.x) * Math.min(1, dt * 3);
      target.z += (player.pos.z - target.z) * Math.min(1, dt * 3);
    }
    placeCamera();
    player.avatar.root.traverse((o) => o.layers.enable(XRAY));

    renderer.info.reset();
    renderer.clear();
    camera.layers.set(0);
    renderer.render(scene, camera);
    // Second pass: only the avatar, only where something is in front of it.
    camera.layers.set(XRAY);
    scene.overrideMaterial = xray;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.set(0);

    frames++;
    fpsT += dt;
    if (fpsT > 0.5) {
      stats.textContent = `${Math.round(frames / fpsT)} fps · ${renderer.info.render.calls} draws`;
      frames = 0;
      fpsT = 0;
    }
    requestAnimationFrame(loop);
  };
  renderer.info.autoReset = false;
  document.querySelector('.loading')?.remove();
  loop();
  (window as unknown as { __proto: unknown }).__proto = { player, target, setZoom, camera, renderer, tap: (x: number, z: number) => player.walkTo(x, z), follow: (on: boolean) => (follow = on) };
}

/** Fluffy clouds over the parts of the map that are still "coming soon". */
function addClouds(scene: THREE.Scene): void {
  // Peter's painted cloud.
  const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}proto/cloud.webp`);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const put = (x: number, z: number, s: number) => {
    const c = new THREE.Sprite(mat);
    c.scale.set(s * 1.3, s * 0.43, 1);
    c.position.set(x, 18, z);
    scene.add(c);
  };
  for (let x = -40; x < GRID_W + 120; x += 46) put(x + ((x * 7) % 13), -28 - ((x * 3) % 17), 120 + ((x * 5) % 40));
  for (let z = -40; z < GRID_D + 60; z += 46) put(GRID_W + 30 + ((z * 3) % 17), z + ((z * 7) % 13), 120 + ((z * 5) % 40));
  const label = (text: string, x: number, z: number) => {
    const t = textTexture(1024, 160, (g) => {
      g.fillStyle = 'rgba(29,53,87,0.92)';
      g.beginPath();
      g.roundRect(8, 8, 1008, 144, 72);
      g.fill();
      g.fillStyle = '#ffffff';
      g.font = '800 64px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(text, 512, 102, 960);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(80, 12.5, 1);
    s.position.set(x, 40, z);
    s.renderOrder = 10;
    scene.add(s);
  };
  label('↑ Tribeca · coming soon', GRID_W / 2 - 60, -40);
  label('→ Seaport · coming soon', GRID_W + 40, GRID_D / 2 - 40);
}

function injectStyles(): void {
  const css = `
  .pt-top{position:fixed;top:max(10px,env(safe-area-inset-top));left:10px;right:10px;display:flex;justify-content:space-between;align-items:flex-start;pointer-events:none;z-index:5;font-family:system-ui,sans-serif}
  .pt-pill{background:rgba(255,255,255,.92);border-radius:18px;padding:8px 14px;box-shadow:0 4px 14px rgba(0,0,0,.15);display:flex;flex-direction:column;line-height:1.15}
  .pt-pill b{font-size:17px;color:#1d3557}.pt-pill span{font-size:12px;color:#6b7280}
  .pt-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:auto}
  .pt-btn{border:0;background:#fff;color:#1d3557;font-weight:800;border-radius:14px;padding:8px 12px;box-shadow:0 4px 14px rgba(0,0,0,.15);font-size:14px}
  .pt-stats{background:rgba(0,0,0,.55);color:#fff;font:600 11px ui-monospace,monospace;padding:3px 8px;border-radius:8px}
  .pt-me{position:fixed;right:12px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:5;width:48px;height:48px;font-size:22px;border-radius:50%}
  .pt-hint{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(24px + env(safe-area-inset-bottom));background:rgba(29,53,87,.88);color:#fff;font:600 13px system-ui,sans-serif;padding:8px 14px;border-radius:14px;z-index:4;pointer-events:none}
  .pt-sheet{position:fixed;left:10px;right:70px;bottom:calc(14px + env(safe-area-inset-bottom));max-width:420px;background:#fff;border-radius:20px;padding:14px 16px 12px;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:6;font-family:system-ui,sans-serif;color:#1f2937}
  .pt-sheet h3{margin:0 28px 6px 0;font-size:18px;color:#1d3557}.pt-sheet p{margin:4px 0 8px;font-size:14px}
  .pt-row{display:flex;justify-content:space-between;gap:10px;font-size:14px;padding:5px 0;border-top:1px solid #eef0f3}
  .pt-small{font-size:12px!important;color:#6b7280}
  .pt-x{position:absolute;top:10px;right:12px;border:0;background:#f1f3f6;border-radius:50%;width:28px;height:28px;font-size:13px}
  `;
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}
