// =====================================================================
// proto/main.ts — TEST BUILD of the 2.5D map (open the game with ?proto).
//
// All of Manhattan as one continuous map: six neighbourhoods from the
// Financial District up to Harlem, Central Park in the middle. Buildings,
// houses, roads, trees and rocks are pictures of Peter's full-detail
// models photographed in Blender from one fixed camera (looking from
// the lower left, like The Sims); people and cars are live 3D.
//
// Controls: drag to move, pinch or mouse wheel to zoom (all the way out
// to see the whole borough), tap a block or a house to see it.
// =====================================================================

import * as THREE from 'three';
import { HOUSES, homeWeekly, AD_PRICES } from '../data/plots.ts';
import { buildGround, buildProps, textTexture } from './ground.ts';
import { PEOPLE_SCALE, Walker, makeStroller, makeTraffic } from './people.ts';
import {
  CELL_D, CELL_W, COLS, GRID_D, GRID_W, HOODS, PITCH_Z, ROAD, STRIP, blockAt, cellAt, cellX, cellZ, hoodAtZ, hoodOfRow, houseAt,
  type Block, type HouseKind,
} from './plan.ts';
import { SpriteWorld, cameraQuaternion } from './sprites.ts';
import { CAM_DIR, CAM_DISTANCE, CAM_FAR, CAM_NEAR, SUN_FROM } from './view.ts';

const HOUSE_ID: Record<HouseKind, 'tiny' | 'townhouse' | 'modern' | 'mansion'> = { tiny: 'tiny', townhouse: 'townhouse', villa: 'modern', mansion: 'mansion' };
const ZOOM_MIN = 70;
const ZOOM_MAX = 2300;
/** Zoomed out past this, the map shows neighbourhood names and small pictures. */
const OVERVIEW = 520;

export async function startProto(stage: HTMLElement, ui: HTMLElement): Promise<void> {
  ui.innerHTML = '';
  document.title = 'NYC Life · Manhattan';
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
  // Start in the Financial District, on the sidewalk by Zuccotti Playground.
  const fidi = HOODS.length - 1;
  const target = new THREE.Vector3(cellX(1) + CELL_W - 10, 0, cellZ(fidi * 4 + 2) - 2.2);
  let viewH = 120;

  // ---- lights for the live 3D parts, matched to the Blender sun
  scene.add(new THREE.HemisphereLight('#fff4e2', '#b59a72', 1.6));
  const sun = new THREE.DirectionalLight('#fff2dd', 2.4);
  sun.position.copy(SUN_FROM).multiplyScalar(100);
  scene.add(sun);

  // ---- the map
  const ground = buildGround();
  scene.add(ground.group);
  scene.add(buildProps({ ...ground.props, trees: [], rocks: [] }));
  const world = new SpriteWorld(scene);
  for (const s of ground.sprites) world.add(s.name, s.x, s.z, s.scale);
  addClouds(scene);
  const labels = addHoodLabels(scene);

  // ---- people and cars
  const player = new Walker(
    { body: 'f', skin: '#8d5524', top: '#e63946', bottom: '#111111', hair: '#111111', hairStyle: 'hair_long', topId: 'tee', bottomId: 'jeans', shoesId: 'sneakers', shoes: '#f2f2f2' },
    target.x,
    target.z,
  );
  scene.add(player.avatar.root);
  const strollers = Array.from({ length: 14 }, (_, i) => makeStroller(i + 3, target.x, target.z));
  for (const s of strollers) scene.add(s.avatar.root);
  const traffic = makeTraffic(36);
  scene.add(traffic.group);

  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.55 * PEOPLE_SCALE, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.22, depthWrite: false }),
  );
  const blobs = [player, ...strollers].map((w) => {
    const m = blob.clone();
    scene.add(m);
    return { w, m };
  });

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.6, 28).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }),
  );
  marker.visible = false;
  scene.add(marker);

  // Glowing frame around what you tapped (block or house), in the style
  // of Peter's highlight art: soft mint fill, white rim, cyan glow.
  const glowTex = textTexture(640, 448, (g) => {
    const pad = 40;
    g.shadowColor = 'rgba(64,255,214,1)';
    g.shadowBlur = 30;
    g.fillStyle = 'rgba(120,255,226,0.14)';
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.lineWidth = 7;
    g.beginPath();
    g.roundRect(pad, pad, 640 - pad * 2, 448 - pad * 2, 18);
    g.fill();
    g.stroke();
    g.stroke();
  });
  const hlGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const highlight = new THREE.Mesh(hlGeo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }));
  const ghost = new THREE.Mesh(hlGeo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0.22 }));
  highlight.add(ghost);
  highlight.visible = false;
  highlight.renderOrder = 20;
  ghost.renderOrder = 21;
  scene.add(highlight);
  const showHighlight = (x0: number, z0: number, w: number, d: number) => {
    const m = 6 * Math.min(1, w / CELL_W + 0.3);
    highlight.scale.set(w + m * 2, 1, d + m * 2);
    highlight.position.set(x0 + w / 2, 0.9, z0 + d / 2);
    highlight.visible = true;
  };

  // See-through outline when your avatar walks behind a building.
  const XRAY = 1;
  const xray = new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: 0.55, depthFunc: THREE.GreaterDepth, depthWrite: false });

  // ---- UI
  ui.insertAdjacentHTML(
    'beforeend',
    `<div class="pt-top"><div class="pt-pill"><b id="pt-hood">Financial District</b><span>Manhattan</span></div>
       <div class="pt-right"><button class="pt-btn" id="pt-q">HD</button><div class="pt-stats" id="pt-stats">…</div></div></div>
     <div class="pt-zoom"><button class="pt-btn" id="pt-in" aria-label="Zoom in">＋</button><button class="pt-btn" id="pt-out" aria-label="Zoom out">－</button></div>
     <button class="pt-btn pt-me" id="pt-me" aria-label="Find me">◎</button>
     <div class="pt-sheet" id="pt-sheet" hidden></div>
     <div class="pt-hint" id="pt-hint">Drag to move · pinch to zoom out over Manhattan · tap a house or block</div>`,
  );
  const sheet = ui.querySelector<HTMLDivElement>('#pt-sheet')!;
  const stats = ui.querySelector<HTMLDivElement>('#pt-stats')!;
  const hoodPill = ui.querySelector<HTMLElement>('#pt-hood')!;
  const qBtn = ui.querySelector<HTMLButtonElement>('#pt-q')!;
  qBtn.onclick = () => {
    hd = !hd;
    qBtn.textContent = hd ? 'HD' : 'Low';
    renderer.setPixelRatio(pixelRatio());
    resize();
  };
  let follow = true;
  /** A smooth camera flight in progress (tap on the overview, or "find me"). */
  let fly: { x: number; z: number; h: number } | null = null;
  ui.querySelector<HTMLButtonElement>('#pt-me')!.onclick = () => {
    fly = { x: player.pos.x, z: player.pos.z, h: 120 };
  };
  ui.querySelector<HTMLButtonElement>('#pt-in')!.onclick = () => setZoom(viewH / 1.6);
  ui.querySelector<HTMLButtonElement>('#pt-out')!.onclick = () => setZoom(viewH * 1.6);

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
    target.x = THREE.MathUtils.clamp(target.x, -80, GRID_W + 80);
    target.z = THREE.MathUtils.clamp(target.z, -60, GRID_D + 80);
    camera.position.copy(target).addScaledVector(CAM_DIR, CAM_DISTANCE);
    camera.updateMatrixWorld();
  };
  const setZoom = (h: number) => {
    viewH = THREE.MathUtils.clamp(h, ZOOM_MIN, ZOOM_MAX);
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
      if (moved > 8) {
        follow = false;
        fly = null;
      }
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
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      setZoom(viewH * Math.exp(e.deltaY * 0.0012));
    },
    { passive: false },
  );

  const tap = (cx: number, cy: number) => {
    const g = groundAt(cx, cy);
    if (g) tapAt(g);
  };
  const tapAt = (g: THREE.Vector3) => {
    ui.querySelector('#pt-hint')?.remove();
    const cell = cellAt(g.x, g.z);
    // Zoomed far out: tapping flies you down to that spot.
    if (viewH > OVERVIEW) {
      follow = false;
      fly = { x: g.x, z: g.z, h: 160 };
      return;
    }
    player.walkTo(g.x, g.z);
    follow = true;
    marker.position.set(g.x, 0.4, g.z);
    marker.visible = true;
    if (!cell) {
      sheet.hidden = true;
      highlight.visible = false;
      return;
    }
    const blk = blockAt(cell.c, cell.r);
    const x0 = cellX(cell.c);
    const z0 = cellZ(cell.r);
    showSheet(blk, cell.r, g.x - x0, g.z - z0);
    if (blk.kind === 'homes') {
      const h = houseAt(blk.houses, g.x - x0, g.z - z0);
      if (h) showHighlight(x0 + (h.c * CELL_W) / 8, z0 + (h.r * CELL_D) / 2, (h.w * CELL_W) / 8, (h.h * CELL_D) / 2);
    } else if (blk.kind === 'park') showHighlight(cellX(1), cellZ(4), cellX(2) + CELL_W - cellX(1), cellZ(7) + CELL_D - cellZ(4));
    else showHighlight(x0, z0, CELL_W, CELL_D);
  };

  const showSheet = (blk: Block, r: number, lx: number, lz: number) => {
    const hood = hoodOfRow(r);
    let title = blk.name;
    let body = '';
    if (blk.kind === 'rect' || blk.kind === 'square') {
      body = `<p>${blk.use}. ${blk.use === 'Apartments' ? 'Apartments for rent inside.' : 'Jobs and shops coming soon.'}</p>`;
      if (blk.kind === 'square' && blk.side === 'subway' && lx < STRIP) body = '<p>🚇 Subway: take the train to another borough (coming soon).</p>';
    }
    if (blk.kind === 'ads') {
      const p = AD_PRICES[hood.tier];
      const half = lx < CELL_W / 2 ? 0 : 1;
      body = `<p>${half ? 'Right' : 'Left'} half: ${blk.rented[half] ? `<b>rented</b> (${blk.rented[half]})` : '<b>free</b>'}</p>
              <div class="pt-row"><span>One half</span><b>$${p.unit}/wk</b></div><div class="pt-row"><span>Whole block</span><b>$${p.block}/wk</b></div>
              <p class="pt-small">Real money · weekly · up to 26 weeks</p>`;
    }
    if (blk.kind === 'homes') {
      const h = houseAt(blk.houses, lx, lz);
      if (h) {
        const info = HOUSES.find((x) => x.id === HOUSE_ID[h.house])!;
        title = `${info.emoji} ${info.name}`;
        body = `<p>${blk.name} · ${hood.name}</p>
                <div class="pt-row"><span>Size</span><b>${info.spaces} space${info.spaces > 1 ? 's' : ''}</b></div>
                <div class="pt-row"><span>Rent</span><b>$${homeWeekly(hood.tier, info.id)}/wk</b></div>
                <p class="pt-small">For rent now · weekly · up to 26 weeks · max 3 homes per borough</p>`;
      }
    }
    if (blk.kind === 'gym') body = '<p>Work out to build fitness, then cool off in the pool.</p>';
    if (blk.kind === 'playground') body = '<p>Swings, slides and a basketball court. Hang out here to restore energy.</p>';
    if (blk.kind === 'landmark') body = '<p>Landmark model coming soon.</p>';
    if (blk.kind === 'park') body = '<p>The lake, the fountain, a playground and hundreds of trees. Relax, jog or have a picnic.</p>';
    sheet.innerHTML = `<button class="pt-x" aria-label="Close">✕</button><h3>${title}</h3>${body}`;
    sheet.hidden = false;
    sheet.querySelector<HTMLButtonElement>('.pt-x')!.onclick = () => {
      sheet.hidden = true;
      highlight.visible = false;
    };
  };

  // ---- loop
  await world.build();
  const clock = new THREE.Clock();
  let fpsT = 0;
  let frames = 0;
  let t = 0;
  let streamT = 0;
  placeCamera();
  renderer.info.autoReset = false;
  const loop = () => {
    const dt = Math.min(clock.getDelta(), 0.1);
    t += dt;
    player.update(dt);
    for (const s of strollers) {
      s.update(dt);
      // Keep the strollers around the player.
      if (s.pos.distanceTo(player.pos) > 260) s.respawnNear(player.pos.x, player.pos.z);
    }
    traffic.update(dt);
    ground.tick(t);
    for (const { w, m } of blobs) m.position.set(w.pos.x, w.pos.y + 0.03, w.pos.z);
    if (!player.walking) marker.visible = false;
    if (sheet.hidden) highlight.visible = false;
    (highlight.material as THREE.MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(t * 4);
    if (fly) {
      const k = Math.min(1, dt * 3.2);
      target.x += (fly.x - target.x) * k;
      target.z += (fly.z - target.z) * k;
      setZoom(Math.exp(Math.log(viewH) + (Math.log(fly.h) - Math.log(viewH)) * k));
      if (Math.hypot(fly.x - target.x, fly.z - target.z) < 2 && Math.abs(viewH - fly.h) < 2) {
        fly = null;
        follow = Math.hypot(player.pos.x - target.x, player.pos.z - target.z) < 30;
      }
    } else if (follow) {
      target.x += (player.pos.x - target.x) * Math.min(1, dt * 3);
      target.z += (player.pos.z - target.z) * Math.min(1, dt * 3);
    }
    placeCamera();
    const overview = viewH > OVERVIEW;
    for (const l of labels) l.visible = overview;
    hoodPill.textContent = hoodAtZ(target.z).name;
    streamT -= dt;
    if (streamT <= 0) {
      streamT = 0.4;
      const aspect = (stage.clientWidth || 1) / (stage.clientHeight || 1);
      // Ground area on screen (the camera looks down at 30°, so it reaches twice as far up/down).
      const hw = (viewH * aspect) / 2 + 40;
      const hd2 = viewH + 40;
      world.stream(target.x - hw - hd2 * 0.7, target.z - hw - hd2 * 0.7, target.x + hw + hd2 * 0.7, target.z + hw + hd2 * 0.7, viewH < OVERVIEW, t);
    }
    player.avatar.root.traverse((o) => o.layers.enable(XRAY));

    renderer.info.reset();
    renderer.clear();
    camera.layers.set(0);
    renderer.render(scene, camera);
    camera.layers.set(XRAY);
    scene.overrideMaterial = xray;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.set(0);

    frames++;
    fpsT += dt;
    if (fpsT > 0.5) {
      const c = world.count;
      stats.textContent = `${Math.round(frames / fpsT)} fps · ${renderer.info.render.calls} draws · ${c.sharp}/${c.pictures} sharp`;
      frames = 0;
      fpsT = 0;
    }
    requestAnimationFrame(loop);
  };
  document.querySelector('.loading')?.remove();
  loop();
  (window as unknown as { __proto: unknown }).__proto = {
    player,
    target,
    setZoom,
    camera,
    renderer,
    tap: (x: number, z: number) => tapAt(new THREE.Vector3(x, 0, z)),
    follow: (on: boolean) => (follow = on),
    world,
  };
}

/** Big neighbourhood names, shown when zoomed far out. */
function addHoodLabels(scene: THREE.Scene): THREE.Sprite[] {
  return HOODS.map((h) => {
    const t = textTexture(1024, 200, (g) => {
      g.fillStyle = 'rgba(255,255,255,0.94)';
      g.beginPath();
      g.roundRect(10, 10, 1004, 180, 90);
      g.fill();
      g.fillStyle = '#1d3557';
      g.font = '900 84px system-ui, sans-serif';
      g.textAlign = 'center';
      g.fillText(h.name, 512, 128, 940);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(300, 58.6, 1);
    s.position.set(GRID_W / 2, 120, cellZ(h.row0) + (4 * PITCH_Z - ROAD) / 2);
    s.renderOrder = 30;
    s.visible = false;
    scene.add(s);
    return s;
  });
}

/** Fluffy clouds over the parts of the city that are still "coming soon" (the Bronx side). */
function addClouds(scene: THREE.Scene): void {
  const tex = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}proto/cloud.webp`);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const put = (x: number, z: number, s: number) => {
    const c = new THREE.Sprite(mat);
    c.scale.set(s * 1.3, s * 0.43, 1);
    c.position.set(x, 18, z);
    scene.add(c);
  };
  for (let x = -120; x < GRID_W + 160; x += 50) put(x + ((x * 7) % 13), -40 - ((x * 3) % 23), 130 + ((x * 5) % 40));
  for (let x = -100; x < GRID_W + 140; x += 70) put(x + 30, -110, 170);
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
    s.scale.set(110, 17, 1);
    s.position.set(x, 40, z);
    s.renderOrder = 10;
    scene.add(s);
  };
  label('↑ The Bronx · coming soon', GRID_W / 2, -60);
  label('→ Queens · coming soon', GRID_W + 160, cellZ(6));
  label('→ Brooklyn · coming soon', GRID_W + 160, cellZ(21));
  void COLS;
}

function injectStyles(): void {
  const css = `
  .pt-top{position:fixed;top:max(10px,env(safe-area-inset-top));left:10px;right:10px;display:flex;justify-content:space-between;align-items:flex-start;pointer-events:none;z-index:5;font-family:system-ui,sans-serif}
  .pt-pill{background:rgba(255,255,255,.92);border-radius:18px;padding:8px 14px;box-shadow:0 4px 14px rgba(0,0,0,.15);display:flex;flex-direction:column;line-height:1.15}
  .pt-pill b{font-size:17px;color:#1d3557}.pt-pill span{font-size:12px;color:#6b7280}
  .pt-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:auto}
  .pt-btn{border:0;background:#fff;color:#1d3557;font-weight:800;border-radius:14px;padding:8px 12px;box-shadow:0 4px 14px rgba(0,0,0,.15);font-size:14px}
  .pt-stats{background:rgba(0,0,0,.55);color:#fff;font:600 11px ui-monospace,monospace;padding:3px 8px;border-radius:8px}
  .pt-zoom{position:fixed;right:12px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:5;display:flex;flex-direction:column;gap:8px}
  .pt-zoom .pt-btn{width:48px;height:44px;font-size:22px;padding:0}
  .pt-me{position:fixed;right:12px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:5;width:48px;height:48px;font-size:22px;border-radius:50%}
  .pt-hint{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(24px + env(safe-area-inset-bottom));background:rgba(29,53,87,.88);color:#fff;font:600 13px system-ui,sans-serif;padding:8px 14px;border-radius:14px;z-index:4;pointer-events:none;max-width:70vw;text-align:center}
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
