// =====================================================================
// game.ts — the conductor. It owns the game loop and connects the
// simulation (sim/), the 3D world (world/, render/) and the menus (ui/).
//
// Each frame it:
//   1. advances the life simulation to "now" (real New York time),
//   2. moves the player and the camera, updates crowds, cars and ads,
//   3. sets the sky for the time of day and weather,
//   4. asks the director whether a random event should happen,
//   5. refreshes the on-screen HUD (only when something changed).
//
// Rules of thumb for anyone editing this file:
//   • Money ONLY changes through sim/economy.ts.
//   • Anything slow (building an area) happens behind a fade or a ride.
//   • Only one "thing" runs at a time: an action, a shift, a trip or an
//     event. `busy` guards that.
// =====================================================================

import * as THREE from 'three';
import { bus } from './core/bus.ts';
import { isRushHour, nowMs, nycTime } from './core/clock.ts';
import { DETAIL_RADIUS, RIDESHARE, SUBWAY_FARE, WALK_SPEED, SHIFT_GAME_HOURS, SHIFT_SECONDS, DIRECTOR_TICK_SECONDS, CAMERA } from './core/constants.ts';
import { esc, money } from './core/format.ts';
import { ACTIONS, actionLock } from './data/actions.ts';
import { CAREER_BY_ID } from './data/careers.ts';
import { doorOf, isOpen, PLACE_BY_ID, stationOf, type PlaceDef } from './data/places.ts';
import { finishAction, startAction } from './sim/activity.ts';
import { changeMoney } from './sim/economy.ts';
import { applyOutcome, buildContext, directorPick, EVENTS, type EventContext, type RandomEventDef } from './sim/events.ts';
import { checkGoal, currentGoal } from './sim/goals.ts';
import { advanceTo } from './sim/life.ts';
import { postDailyNews } from './sim/news.ts';
import { buyPrepaidPhone, checkPoliceReturn, PREPAID_PHONE_PRICE } from './sim/phone.ts';
import { loadGame, saveGame, deleteGame } from './sim/save.ts';
import { newLife } from './sim/state.ts';
import type { AreaId, GameState, Look } from './sim/types.ts';
import { weatherDef, weatherFor } from './sim/weather.ts';
import { completeShift, jobTitle, shiftBlocker, WORK_STYLES, type WorkStyle } from './sim/work.ts';
import { Engine } from './render/engine.ts';
import { qualitySettings } from './render/quality.ts';
import { skyAt } from './render/sky.ts';
import { AdManager } from './world/ads.ts';
import { makeAvatar, type Avatar } from './world/avatar.ts';
import { loadFolk, type FolkAnim, type FolkKit } from './world/folk.ts';
import { kitNight, loadKits, type Kits } from './assets/kit.ts';
import { buildCity, setNightGlow, type BuiltCity } from './world/city.ts';
import { Crowd } from './world/crowd.ts';
import { buildInterior, type Interior } from './world/interior.ts';
import { buildHome, type HomeInterior } from './world/home-interior.ts';
import { loadFurnitureKit, type FurnitureKit } from './assets/furniture-kit.ts';
import { layoutForPlace } from './data/homes.ts';
import { FURNITURE } from './data/furniture.ts';
import { openCloset } from './ui/closet.ts';
import { DISTRICTS, crossStreets, blockRect } from './world/layout.ts';
import { findPath, nearestWalkable } from './world/nav.ts';
import { SystemRunner, type SystemContext } from './core/systems.ts';
import './systems/index.ts';
import { buildSubwayRide, type TransitScene } from './world/transit.ts';
import { sfx, setSoundEnabled } from './ui/audio.ts';
import { closeSheet, fade, html, isSheetOpen, onAct, openModal, openSheet, progressBar, root, toast, wait } from './ui/dom.ts';
import { Hud } from './ui/hud.ts';
import { openMap } from './ui/map.ts';
import { runOnboarding } from './ui/onboarding.ts';
import { openPhone } from './ui/phone.ts';


export class Game {
  private engine: Engine;
  private state!: GameState;
  private city: BuiltCity | null = null;
  private crowd: Crowd | null = null;
  /** Plug-in systems (weather effects, traffic…): see core/systems.ts. */
  private systems = new SystemRunner();
  private ads: AdManager | null = null;
  private player: Avatar;
  /** Cartoon model packs (empty if they couldn't load: simple shapes are used). */
  private kits: Kits = {};
  /** False while a test hook has pointed the camera somewhere else. */
  private followCamera = true;
  private folk: FolkKit | null = null;
  private hud!: Hud;
  private interior: Interior | null = null;
  private transit: TransitScene | null = null;
  private interiorCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
  /** Home furniture models (loaded at boot; null = use the simple room). */
  private furniture: FurnitureKit | null = null;
  /** The furniture piece being moved in move mode (home only). */
  private moving: { uid: string; bar: HTMLElement } | null = null;

  private path: { x: number; z: number }[] = [];
  /** Place to open when the player reaches its door. */
  private headingTo: string | null = null;
  private busy = false;
  private overlayClose: (() => void) | null = null;
  private directorTimer = 0;
  private simTimer = 0;
  private saveTimer = 0;
  private hudTimer = 0;
  private time = 0;
  private started = false;

  constructor(stage: HTMLElement) {
    const q = qualitySettings('auto');
    this.engine = new Engine(stage, q);
    this.player = makeAvatar({ body: 'f', skin: '#8d5524', top: '#e63946', bottom: '#111111', hair: '#111111' });
    this.engine.cityScene.add(this.player.root);
    this.engine.onTap((x, y) => this.onTap(x, y));
    // Re-frame rooms when the phone rotates or the window changes size.
    window.addEventListener('resize', () => {
      if (this.engine.mode === 'interior') this.fitInteriorCamera();
    });
    // Test hooks for automated play-testing (only with ?qa in the address).
    if (new URLSearchParams(location.search).has('qa')) this.exposeTestHooks();
  }

  /** Lets scripts/qa-smoke.mjs drive the game without tapping 3D objects by pixel. */
  private exposeTestHooks(): void {
    (window as unknown as Record<string, unknown>).__nyc = {
      state: () => this.state,
      mode: () => this.engine.mode,
      openObject: (id: string) => {
        const o = this.interior?.objects.find((x) => x.id === id);
        if (o) this.openObjectSheet(o.label, o.emoji, o.actions, this.interior && 'floors' in this.interior ? o.id : undefined);
        return !!o;
      },
      openPlace: (id: string) => this.openPlace(PLACE_BY_ID[id]),
      travel: (id: string) => this.travelSheet(PLACE_BY_ID[id]),
      event: (id: string, where: EventContext['where'] = 'street') => {
        const ev = EVENTS.find((e) => e.id === id);
        if (ev) void this.showEvent(ev, where);
      },
      /** What a tap at (x, y) would hit, without doing anything. */
      whatsAt: (x: number, y: number) => {
        const c = this.city!;
        const door = this.engine.pick(x, y, c.doors.map((d) => d.hit));
        const ground = this.engine.pick(x, y, [...c.walkSurfaces, ...c.solids]);
        return { door: door?.object.userData.placeId ?? null, ground: ground ? ground.object.name || ground.object.type : null, point: ground ? { x: Math.round(ground.point.x), z: Math.round(ground.point.z) } : null };
      },
      /** Where the player is walking to (remaining waypoints). */
      path: () => this.path.map((w) => ({ x: Math.round(w.x), z: Math.round(w.z) })),
      /** Move the street camera to `d` metres from the player (for close-up screenshots). */
      zoom: (d: number, front = false) => {
        const { camera, controls } = this.engine;
        controls.minDistance = Math.min(CAMERA.minDistance, d);
        const offset = camera.position.clone().sub(controls.target).setLength(d);
        if (front) {
          // Swing round to face the player (the avatar looks down its +Z axis).
          const yaw = this.player.root.rotation.y;
          const up = d < 10 ? 0.45 : 0.85; // close-ups from eye level, wider shots from above
          offset.set(Math.sin(yaw) * d * 0.8, d * up, Math.cos(yaw) * d * 0.8);
        }
        camera.position.copy(controls.target).add(offset);
        controls.update();
      },
      /** Point the camera at a place (loads its area if needed) — for screenshots. */
      viewPlace: (id: string, d = 120, y = 30) => {
        const place = PLACE_BY_ID[id];
        if (!place) return false;
        if (!this.city || this.city.area !== place.area) this.loadArea(place.area);
        const door = doorOf(place);
        const { camera, controls } = this.engine;
        controls.maxDistance = Math.max(CAMERA.maxDistance, d * 2);
        controls.target.set(door.x - door.faceX * 30, y, door.z - door.faceZ * 30);
        camera.position.set(controls.target.x + d * 0.55, controls.target.y + d * 0.35, controls.target.z + d * 0.75);
        controls.update();
        this.followCamera = false;
        return true;
      },
      /** Jump straight inside a place (for screenshots of interiors). */
      enterPlace: (id: string) => {
        const p = PLACE_BY_ID[id];
        if (p) this.enterInterior(p, false);
        return !!p;
      },
      /** Try on clothes without saving (for screenshots). */
      /** Force an activity animation on the player (null = back to normal). */
      anim: (name: FolkAnim | null) => this.player.setAction(name),
      tryLook: (patch: Partial<Look>) => this.player.setLook({ ...this.state.profile.look, ...patch }),
      /** Heaviest visible meshes (name, triangles) — for performance checks. */
      meshStats: () => {
        const rows: [string, number][] = [];
        this.engine.cityScene.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const g = m.geometry;
          const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
          const n = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
          rows.push([m.name || m.type, Math.round(tris * n)]);
        });
        return rows.sort((a, b) => b[1] - a[1]).slice(0, 15);
      },
      /** Triangles on screen grouped by kind (frustum-culled), for performance checks. */
      triBreakdown: () => {
        const cam = this.engine.camera;
        const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        const out: Record<string, number> = {};
        this.engine.cityScene.traverseVisible((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || !m.geometry) return;
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          const sph = m.geometry.boundingSphere!.clone().applyMatrix4(m.matrixWorld);
          if (m.frustumCulled && !fr.intersectsSphere(sph)) return;
          const g = m.geometry;
          const tris = ((g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
          const k = (m.name || m.type).replace(/[-_].*$/, '');
          out[k] = Math.round((out[k] ?? 0) + tris);
        });
        return { shadows: this.engine.renderer.shadowMap.enabled, ...out };
      },
      /** The game clock's current hour (0-23). */
      hour: () => nycTime().hour,
      fps: () => Math.round(this.engine.fps),
      drawCalls: () => this.engine.renderer.info.render.calls,
      triangles: () => this.engine.renderer.info.render.triangles,
    };
  }

  // ===================================================================
  // Boot
  // ===================================================================

  async boot(): Promise<void> {
    // Cartoon model packs. Waits at most a few seconds: on a very slow
    // connection the game starts with simple shapes instead of hanging.
    const timeout = <T,>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p, new Promise<T>((r) => window.setTimeout(() => r(fallback), ms))]);
    const [kits, folk, furniture] = await Promise.all([timeout(loadKits(), 12000, {} as Kits), timeout(loadFolk().catch(() => null), 12000, null), timeout(loadFurnitureKit(), 12000, null)]);
    this.furniture = furniture;
    this.kits = kits;
    this.folk = folk;
    const loaded = loadGame();
    if (loaded) {
      this.state = loaded;
      this.applySettings();
      const summary = advanceTo(this.state);
      this.loadArea(this.state.location.area);
      this.placePlayerAtLocation();
      this.engine.start((dt) => this.frame(dt));
      this.finishBoot();
      if (summary) window.setTimeout(() => toast(summary, { icon: '🕐', ms: 6000 }), 900);
      if (this.state.location.placeId) this.enterInterior(PLACE_BY_ID[this.state.location.placeId], false);
      return;
    }

    // First visit: show the city behind the character screen.
    this.loadArea('manhattan');
    const hub = DISTRICTS.manhattan.hub;
    const b = blockRect(DISTRICTS.manhattan, hub.c, hub.r);
    this.player.root.position.set((b.minX + b.maxX) / 2, 0.2, (b.minZ + b.maxZ) / 2 + 10);
    this.engine.controls.target.set(this.player.root.position.x, 2, this.player.root.position.z);
    this.engine.camera.position.set(this.player.root.position.x + 9, 7, this.player.root.position.z + 16);
    this.engine.start((dt) => this.frame(dt));
    document.querySelector('.loading')?.classList.add('done');
    const opts = await runOnboarding((look: Look) => this.player.setLook(look));
    this.state = newLife(opts);
    this.player.setLook(opts.look);
    postDailyNews(this.state, nycTime().dateKey);
    this.applySettings();
    this.placePlayerAtLocation();
    this.finishBoot();
    this.enterInterior(PLACE_BY_ID[this.state.home.placeId], false);
    toast(`Welcome to New York, ${opts.name}!`, { icon: '🗽', tone: 'good', ms: 4000 });
    this.save();
  }

  private finishBoot(): void {
    this.player.setLook(this.state.profile.look);
    this.hud = new Hud({
      onNav: (w) => this.onNav(w),
      onMoney: () => this.openPhoneApp('bank'),
      onWork: () => void this.goToWork(),
    });
    this.started = true;
    document.querySelector('.loading')?.classList.add('done');
    bus.on('pin:tap', (e) => {
      const p = PLACE_BY_ID[e.placeId];
      if (p) this.openPlace(p);
    });
    bus.on('money:changed', (e) => {
      if (e.delta > 0 && e.delta >= 500) sfx.cash();
    });
    // Save when the tab is hidden or closed (phones kill background tabs).
    document.addEventListener('visibilitychange', () => document.hidden && this.save());
    window.addEventListener('pagehide', () => this.save());
    this.refreshHud(true);
  }

  private applySettings(): void {
    setSoundEnabled(this.state.settings.sound);
    const q = qualitySettings(this.state.settings.quality);
    this.engine.quality = q;
    this.engine.renderer.setPixelRatio(q.pixelRatio);
  }

  // ===================================================================
  // Areas
  // ===================================================================

  private loadArea(area: AreaId): void {
    this.ads?.dispose();
    this.crowd?.dispose();
    this.systems.areaUnloaded();
    this.city?.dispose();
    const q = this.engine.quality;
    this.city = buildCity(area, { trees: q.trees, shadows: q.shadows, kits: this.kits, detailScale: q.tier === 'low' ? 0.75 : 1 });
    this.engine.cityScene.add(this.city.group);
    this.crowd = new Crowd(this.city.nav, area, q.crowd, this.folk ?? undefined, q.tier === 'low' ? 6 : q.tier === 'medium' ? 12 : 20);
    this.engine.cityScene.add(this.crowd.group);
    this.systems.areaLoaded(this.systemContext());
    this.ads = new AdManager(this.city.adSlots, q.tier);
    bus.emit('area:changed', { area });
  }

  /** Switch between the city, an interior and the subway view (tells listeners). */
  private setMode(mode: 'city' | 'interior' | 'transit'): void {
    this.engine.mode = mode;
    bus.emit('view:mode', { mode });
  }

  /** What plug-in systems get to see (core/systems.ts). */
  private systemContext(): SystemContext {
    const t = nycTime();
    return {
      scene: this.engine.cityScene,
      camera: this.engine.camera,
      player: this.player.root.position,
      district: DISTRICTS[this.city?.area ?? 'manhattan'],
      quality: this.engine.quality,
      state: this.state,
      time: t,
      weather: weatherFor(t.dateKey, t.hour),
    };
  }

  private placePlayerAtLocation(): void {
    const loc = this.state.location;
    this.player.root.position.set(loc.x, 0.2, loc.z);
    this.engine.controls.target.set(loc.x, 2, loc.z);
    this.engine.camera.position.set(loc.x + 20, CAMERA.startDistance * 0.73, loc.z + 36);
    this.path = [];
  }

  // ===================================================================
  // Frame loop
  // ===================================================================

  private frame(dt: number): void {
    this.time += dt;
    const t = nycTime();

    if (this.started) {
      // Simulation: cheap, but no need to run it 60 times a second.
      this.simTimer += dt;
      if (this.simTimer >= 1) {
        this.simTimer = 0;
        const note = advanceTo(this.state);
        if (note) toast(note, { icon: '📅', ms: 5000 });
        const police = checkPoliceReturn(this.state);
        if (police) toast(police, { icon: '📱', tone: 'good', ms: 5000 });
        const g = checkGoal(this.state);
        if (g) {
          toast(`Goal done: ${g.title} · +${money(g.reward)}`, { icon: '🎯', tone: 'good', ms: 3800 });
          sfx.notify();
        }
      }
      this.saveTimer += dt;
      if (this.saveTimer > 15) {
        this.saveTimer = 0;
        this.save();
      }
      this.directorTimer += dt;
      if (this.directorTimer >= DIRECTOR_TICK_SECONDS) {
        this.directorTimer = 0;
        this.maybeRandomEvent();
      }
    }

    // ---- sky & lighting
    const weather = weatherFor(t.dateKey, t.hour);
    const sky = skyAt(t.hourFloat, weather);
    const scene = this.engine.cityScene;
    if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color();
    scene.background.copy(sky.sky);
    (scene.fog as THREE.Fog).color.copy(sky.fog);
    this.engine.hemi.intensity = sky.hemi;
    this.engine.sun.intensity = sky.sun;
    this.engine.sun.color.copy(sky.sunColor);
    setNightGlow(sky.glow * 1.1);
    kitNight.value = sky.glow;
    this.engine.followSun(this.player.root.position, sky.sunDir);

    if (this.engine.mode === 'city' && this.city) {
      this.updatePlayer(dt);
      const camDist = this.engine.camera.position.distanceTo(this.engine.controls.target);
      this.city.updateLod(this.engine.controls.target, DETAIL_RADIUS + camDist * 0.6, camDist);
      this.city.updateSeeThrough(this.engine.camera.position, this.player.root.position, dt);
      this.city.tick(dt);
      const hub = DISTRICTS[this.city.area].hub;
      const hb = blockRect(DISTRICTS[this.city.area], hub.c, hub.r);
      const hubX = (hb.minX + hb.maxX) / 2;
      const hubZ = (hb.minZ + hb.maxZ) / 2;
      this.crowd?.update(dt, this.engine.controls.target, t.hour, (x, z) => (Math.hypot(x - hubX, z - hubZ) < 160 ? 1.5 : 1));
      this.systems.update(dt, this.systemContext());
      this.ads?.update(dt, this.engine.camera);
      // Door rings gently pulse so you notice them.
      const pulse = 0.55 + Math.sin(this.time * 3) * 0.3;
      this.city.group.traverse((o) => {
        if (o.userData.pulse) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = pulse;
      });
    } else if (this.engine.mode === 'interior' && this.interior) {
      this.interior.update(dt);
      this.player.animate(0, dt);
    } else if (this.engine.mode === 'transit' && this.transit) {
      this.transit.update(dt);
    }

    if (this.started) {
      this.hudTimer += dt;
      if (this.hudTimer > 0.25) {
        this.hudTimer = 0;
        this.refreshHud();
      }
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player.root.position;
    let speed = 0;
    if (this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - p.x;
      const dz = wp.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4) {
        this.path.shift();
        if (!this.path.length) this.arrived();
      } else {
        const step = Math.min(dist, WALK_SPEED * dt);
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        speed = WALK_SPEED;
        const target = Math.atan2(dx, dz);
        let diff = target - this.player.root.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.player.root.rotation.y += diff * Math.min(1, dt * 10);
      }
      this.state.location.x = p.x;
      this.state.location.z = p.z;
    }
    this.player.animate(speed, dt);
    this.player.setDetail(this.engine.camera.position.distanceTo(this.engine.controls.target));
    // Camera follows the player, keeping whatever angle and zoom you chose.
    if (!this.followCamera) return;
    const target = this.engine.controls.target;
    const before = target.clone();
    target.lerp(new THREE.Vector3(p.x, 2, p.z), Math.min(1, dt * 6));
    this.engine.camera.position.add(target.clone().sub(before));
  }

  private arrived(): void {
    if (!this.headingTo) return;
    const place = PLACE_BY_ID[this.headingTo];
    this.headingTo = null;
    if (place) this.openPlace(place);
  }

  // ===================================================================
  // Input
  // ===================================================================

  private onTap(x: number, y: number): void {
    if (!this.started || this.busy || this.overlayClose) return;
    sfx.tap();
    if (this.engine.mode === 'interior' && this.interior && this.moving) {
      // Move mode: tap the floor to put the piece there.
      const home = this.interior as HomeInterior;
      const hit = this.engine.pick(x, y, home.floors, this.interiorCamera);
      if (hit) home.moveItem(this.moving.uid, hit.point.x, hit.point.z);
      return;
    }
    if (this.engine.mode === 'interior' && this.interior) {
      const hit = this.engine.pick(x, y, this.interior.objects.map((o) => o.mesh), this.interiorCamera);
      const id = hit?.object.userData.objectId as string | undefined;
      const obj = id ? this.interior.objects.find((o) => o.id === id) : undefined;
      if (obj) {
        this.player.root.position.copy(obj.stand);
        this.player.root.lookAt(obj.mesh.getWorldPosition(new THREE.Vector3()).setY(0));
        this.openObjectSheet(obj.label, obj.emoji, obj.actions, 'floors' in this.interior ? obj.id : undefined);
      }
      return;
    }
    if (this.engine.mode !== 'city' || !this.city) return;
    // 1) A door? 2) A billboard? 3) The ground: walk there.
    const doorHit = this.engine.pick(x, y, this.city.doors.map((d) => d.hit));
    if (doorHit) {
      const placeId = doorHit.object.userData.placeId as string;
      return this.walkToPlace(placeId);
    }
    const adHit = this.engine.pick(x, y, this.city.adSlots.map((s) => s.mesh));
    // Ground and walls together: whichever is hit first wins, so tapping a
    // building doesn't walk you to the hidden ground behind it.
    const groundHit = this.engine.pick(x, y, [...this.city.walkSurfaces, ...this.city.solids]);
    if (adHit && (!groundHit || adHit.point.distanceTo(this.engine.camera.position) < groundHit.point.distanceTo(this.engine.camera.position))) {
      return this.openAdCard(adHit.object.userData.adSlotId as string);
    }
    if (groundHit) {
      this.headingTo = null;
      // A wall hit: aim for the sidewalk at the foot of that wall.
      const target = this.city.solids.includes(groundHit.object) ? nearestWalkable(this.city.nav, groundHit.point.x, groundHit.point.z) : groundHit.point;
      this.walkTo(target.x, target.z);
    }
  }

  private walkTo(x: number, z: number): void {
    if (!this.city) return;
    const p = this.player.root.position;
    const path = findPath(this.city.nav, p.x, p.z, x, z);
    if (!path.length) {
      const near = nearestWalkable(this.city.nav, x, z);
      this.path = findPath(this.city.nav, p.x, p.z, near.x, near.z);
    } else this.path = path;
    if (this.state.location.placeId) this.state.location.placeId = null;
  }

  private walkToPlace(placeId: string): void {
    const place = PLACE_BY_ID[placeId];
    const door = doorOf(place);
    const p = this.player.root.position;
    if (Math.hypot(door.x - p.x, door.z - p.z) < 3) return this.openPlace(place);
    this.headingTo = placeId;
    this.walkTo(door.x, door.z);
  }

  private onNav(which: 'here' | 'map' | 'phone' | 'leave'): void {
    if (this.busy) return;
    sfx.tap();
    if (which === 'leave') return this.leaveInterior();
    if (which === 'phone') return this.openPhoneApp();
    if (which === 'map') return this.openMapOverlay();
    // "Here": the nearest place within a short walk, else the cross streets.
    const p = this.player.root.position;
    let best: PlaceDef | null = null;
    let bestD = 40;
    for (const pl of Object.values(PLACE_BY_ID)) {
      if (pl.area !== this.state.location.area) continue;
      const d = doorOf(pl);
      const dist = Math.hypot(d.x - p.x, d.z - p.z);
      if (dist < bestD) {
        best = pl;
        bestD = dist;
      }
    }
    if (best) this.walkToPlace(best.id);
    else toast(`Nothing right here. Open the Map to find places.`, { icon: '🗺️' });
  }

  // ===================================================================
  // Places
  // ===================================================================

  private openPlace(place: PlaceDef): void {
    const s = this.state;
    if (!s.stats.placesVisited.includes(place.id)) s.stats.placesVisited.push(place.id);
    const t = nycTime();
    const open = isOpen(place, t.hour);
    const hours = place.hours ? `${fmtH(place.hours[0])}–${fmtH(place.hours[1])}` : 'Open 24/7';
    const isHome = place.id === s.home.placeId;
    const canGoIn = place.interior !== 'none';
    const landmark = place.landmark
      ? `<div class="landmark"><div class="portrait" style="background:${place.color}">${place.emoji}</div><div><p class="blurb" style="margin:0 0 4px">${esc(place.landmark.description)}</p><a href="${place.landmark.officialSite}" target="_blank" rel="noopener noreferrer">Official site: ${esc(place.landmark.siteLabel)} ↗</a></div></div>`
      : '';
    const actions = !canGoIn ? this.actionGrid(place.actions, open) : '';
    const rentable = place.type === 'home' && !isHome
      ? `<div class="card"><h3>For rent: ${money(place.rent ?? 0)} / week</h3><p>Moving here makes it your home. Rent is charged weekly from your cash, then your bank.</p><button class="btn primary block" style="margin-top:10px" data-act="move">Move in</button></div>`
      : '';
    const station = place.type === 'station' ? `<div class="stack" style="margin-bottom:12px">${(['manhattan', 'brooklyn'] as AreaId[]).filter((a) => a !== place.area).map((a) => `<button class="btn primary block" data-act="train:${a}">🚇 Take the train to ${DISTRICTS[a].name} · ${money(SUBWAY_FARE)}</button>`).join('')}</div>` : '';
    const sheet = openSheet({
      emoji: place.emoji,
      title: place.name,
      sub: `${esc(crossStreets(DISTRICTS[place.area], doorOf(place).x, doorOf(place).z))}`,
      body: `
        <div class="row"><span class="tag ${open ? 'open' : 'closed'}">${open ? '● Open' : '● Closed'}</span><span class="tag">${hours}</span>${isHome ? '<span class="tag">🏠 Your home</span>' : ''}</div>
        <p class="blurb">${esc(place.blurb)}</p>
        ${landmark}${station}${rentable}
        ${canGoIn && (place.type !== 'home' || isHome) ? `<button class="btn primary block" data-act="enter" ${open ? '' : 'disabled'}>${open ? (isHome ? 'Go inside' : 'Go in') : `Closed — opens ${fmtH(place.hours![0])}`}</button>` : ''}
        ${actions}`,
    });
    onAct(sheet.body, (act, el) => {
      if (act === 'enter') {
        sheet.close();
        return this.enterInterior(place, true);
      }
      if (act === 'move') {
        sheet.close();
        return this.moveHome(place);
      }
      if (act.startsWith('train:')) {
        sheet.close();
        return void this.rideTrain(act.slice(6) as AreaId, null);
      }
      if (act.startsWith('do:')) {
        sheet.close();
        return void this.runAction(act.slice(3), el);
      }
    });
  }

  private actionGrid(actionIds: string[], open: boolean, extra = ''): string {
    const s = this.state;
    const hour = nycTime().hour;
    const cards = actionIds
      .map((id) => {
        const a = ACTIONS[id];
        const lock = !open ? 'Closed now' : actionLock(a, s, hour);
        const fx = Object.entries(a.needs ?? {})
          .filter(([, v]) => v !== 0)
          .slice(0, 3)
          .map(([k, v]) => `<span>${v! > 0 ? '+' : '−'}${k}</span>`)
          .join('');
        const price = a.cost ? `<span class="price">${money(a.cost)}</span>` : a.pay ? '<span class="price free">Earns $</span>' : '<span class="price free">Free</span>';
        return `<button class="action" data-act="do:${id}" aria-disabled="${lock ? 'true' : 'false'}">${price}<span style="font-size:22px">${a.emoji}</span><span class="t">${esc(a.label)}</span><span class="m">${a.seconds}s</span>${lock ? `<span class="lock">🔒 ${esc(lock)}</span>` : `<span class="fx">${fx}</span>`}</button>`;
      })
      .join('');
    return `<div class="actions">${extra}${cards}</div>`;
  }

  private openObjectSheet(label: string, emoji: string, actionIds: string[], movableId?: string): void {
    const place = this.state.location.placeId ? PLACE_BY_ID[this.state.location.placeId] : null;
    const open = place ? isOpen(place, nycTime().hour) : true;
    // Bodegas sell prepaid phones when yours is gone.
    const phoneOffer = place?.interior === 'bodega' && !this.state.phone.ok
      ? `<button class="action" data-act="prepaid"><span class="price">${money(PREPAID_PHONE_PRICE)}</span><span style="font-size:22px">📱</span><span class="t">Buy a prepaid phone</span><span class="m">Get your apps back</span></button>`
      : '';
    const isOffice = place?.type === 'work';
    // Home furniture that opens a screen (the closet).
    const homeItem = movableId && this.interior && 'items' in this.interior ? (this.interior as HomeInterior).items.find((i) => i.uid === movableId) : undefined;
    const opensCloset = !!homeItem && FURNITURE.get(homeItem.item)?.opens === 'closet';
    const workBtn = isOffice && this.state.job && CAREER_BY_ID[this.state.job.careerId].placeId === place!.id ? '<button class="btn primary block" style="margin-bottom:10px" data-act="work">💼 Work a shift</button>' : '';
    const sheet = openSheet({
      emoji,
      title: label,
      sub: place ? esc(place.name) : undefined,
      body:
        workBtn +
        (actionIds.length || phoneOffer ? this.actionGrid(actionIds, open, phoneOffer) : `<p class="blurb">${isOffice ? 'This is a workplace. Apply for the job on your phone, then come back for shifts.' : movableId ? 'Just for looks — but it makes the place feel like home.' : 'Nothing to do here right now.'}</p>`) +
        (opensCloset ? '<button class="btn primary block" style="margin-top:10px" data-act="closet">👕 Open closet</button>' : '') +
        (movableId ? '<button class="btn block" style="margin-top:10px" data-act="move-furniture">✋ Move this</button>' : ''),
    });
    onAct(sheet.body, (act, el) => {
      sheet.close();
      if (act === 'prepaid') {
        const err = buyPrepaidPhone(this.state);
        toast(err ?? 'New prepaid phone, same number. Apps unlocked!', { icon: '📱', tone: err ? 'bad' : 'good' });
        return this.save();
      }
      if (act === 'work') return void this.goToWork();
      if (act === 'move-furniture' && movableId) return this.startMoving(movableId);
      if (act === 'closet') return openCloset(this.state, (look) => {
        this.player.setLook(look);
        this.save();
      });
      if (act.startsWith('do:')) void this.runAction(act.slice(3), el);
    });
  }

  // ===================================================================
  // Moving furniture (home only)
  // ===================================================================

  /** Pick up a piece: tap the floor to place it, turn it, then Done. */
  private startMoving(uid: string): void {
    const home = this.interior as HomeInterior | null;
    if (!home || !('floors' in home)) return;
    this.stopMoving(false);
    const bar = html(`<div class="move-bar"><span>Tap the floor to place it</span><button class="btn" data-mv="turn">↻ Turn</button><button class="btn primary" data-mv="done">✓ Done</button></div>`);
    root().appendChild(bar);
    bar.querySelector('[data-mv="turn"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      home.rotateItem(uid);
    });
    bar.querySelector('[data-mv="done"]')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.stopMoving(true);
    });
    home.highlight(uid);
    this.moving = { uid, bar };
  }

  /** Leave move mode; `keep` saves the new arrangement for this home. */
  private stopMoving(keep: boolean): void {
    if (!this.moving) return;
    this.moving.bar.remove();
    const home = this.interior as HomeInterior | null;
    home?.highlight?.(null);
    this.moving = null;
    const placeId = this.state.location.placeId;
    if (keep && home && 'items' in home && placeId) {
      this.state.homes[placeId] = home.items.map((i) => ({ ...i }));
      this.save();
      toast('Saved your new layout', { icon: '🛋️', tone: 'good', ms: 1800 });
    }
  }

  private moveHome(place: PlaceDef): void {
    const s = this.state;
    s.home = { area: place.area, placeId: place.id, weeklyRent: place.rent ?? 0, rentDueDay: nycTime().dateKey };
    toast(`You moved to ${place.name}. Rent: ${money(place.rent ?? 0)}/week.`, { icon: '📦', tone: 'good', ms: 4500 });
    this.save();
    this.enterInterior(place, true);
  }

  // ===================================================================
  // Interiors
  // ===================================================================

  private enterInterior(place: PlaceDef, animate: boolean): void {
    const go = () => {
      this.interior?.dispose();
      this.stopMoving(false);
      if (place.interior === 'apartment' && this.furniture) {
        // Sims-style home: its own floor plan, real furniture, saved arrangement.
        const layout = layoutForPlace(place.id);
        this.interior = buildHome(place, layout, this.state.homes[place.id] ?? layout.furniture, this.furniture);
      } else this.interior = buildInterior(place, place.actions);
      this.interior.scene.add(this.player.root);
      this.player.root.position.copy(this.interior.spawn);
      this.player.root.rotation.set(0, Math.PI, 0);
      this.fitInteriorCamera();
      this.engine.altScene = this.interior.scene;
      this.engine.altCamera = this.interiorCamera;
      this.setMode('interior');
      this.state.location.placeId = place.id;
      this.state.location.area = place.area;
      const door = doorOf(place);
      this.state.location.x = door.x;
      this.state.location.z = door.z;
      if (!this.state.stats.placesVisited.includes(place.id)) this.state.stats.placesVisited.push(place.id);
      bus.emit('place:entered', { placeId: place.id });
      this.refreshHud(true);
    };
    if (!animate) return go();
    fade(true);
    window.setTimeout(() => {
      go();
      fade(false);
      if (place.interior !== 'apartment') toast(`Tap the ${place.interior === 'office' ? 'desk' : 'counter'} to see what’s on offer`, { icon: place.emoji });
    }, 300);
  }

  /**
   * Frame the whole room on any screen shape. A tall phone sees less
   * width, so the camera backs off (and widens its lens) until the room
   * fits side to side, looking down at a Sims-like angle.
   */
  private fitInteriorCamera(): void {
    const cam = this.interiorCamera;
    const el = this.engine.renderer.domElement;
    const aspect = el.clientWidth / Math.max(1, el.clientHeight);
    cam.fov = aspect < 0.8 ? 62 : 48;
    cam.aspect = aspect;
    const roomHalfWidth = this.interior?.halfWidth ?? 7.2;
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * aspect);
    const dist = Math.max(15, roomHalfWidth / Math.tan(hFov / 2));
    cam.position.set(0, dist * 0.72, dist * 0.7);
    cam.lookAt(0, 0.6, -0.5);
    cam.far = dist * 4;
    cam.updateProjectionMatrix();
  }

  private leaveInterior(): void {
    if (!this.interior) return;
    this.stopMoving(true);
    const placeId = this.state.location.placeId;
    fade(true);
    window.setTimeout(() => {
      this.interior?.dispose();
      this.interior = null;
      this.engine.cityScene.add(this.player.root);
      this.setMode('city');
      this.engine.altScene = null;
      this.state.location.placeId = null;
      this.placePlayerAtLocation();
      // Face out of the door.
      if (placeId) {
        const d = doorOf(PLACE_BY_ID[placeId]);
        this.player.root.rotation.y = Math.atan2(d.faceX, d.faceZ);
      }
      fade(false);
      this.refreshHud(true);
    }, 300);
  }

  // ===================================================================
  // Doing things
  // ===================================================================

  private async runAction(actionId: string, _el?: HTMLElement): Promise<void> {
    if (this.busy) return;
    const r = startAction(this.state, actionId);
    if (!r.ok) return toast(r.why, { icon: '🔒', tone: 'bad' });
    this.busy = true;
    const a = r.action;
    if (a.id === 'watchTv') this.interior?.playTvAd?.();
    const bar = progressBar(`${a.emoji} ${a.label}…`);
    const start = performance.now();
    await new Promise<void>((resolve) => {
      const tick = () => {
        const f = (performance.now() - start) / (a.seconds * 1000);
        bar.set(f);
        if (f >= 1) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
    bar.remove();
    const out = finishAction(this.state, a);
    this.busy = false;
    const bits = [`${a.emoji} ${a.label} — done`];
    if (out.earned > 0) bits.push(`+${money(out.earned)}`);
    else if (a.pay && out.earned === 0 && a.id === 'lottoTicket') bits.push('no luck this time');
    toast(bits.join(' · '), { tone: 'good' });
    if (out.skillUp) {
      toast(`Skill up! ${out.skillUp.replace(/^\w/, (c) => c.toUpperCase())}`, { icon: '⭐', tone: 'good' });
      sfx.notify();
    }
    if (a.id === 'lottoTicket' && out.earned >= 50_000) {
      // A rare big win makes the city news.
      bus.emit('news:posted', { id: 'lotto' });
      this.state.news.unshift({ id: `lotto-${nowMs()}`, at: nowMs(), scope: this.state.location.area, emoji: '🎟️', headline: `${this.state.profile.name} wins ${money(out.earned)} on a bodega scratch-off`, personal: true });
    }
    this.save();
    this.refreshHud(true);
  }

  // ===================================================================
  // Work
  // ===================================================================

  private async goToWork(): Promise<void> {
    if (this.busy) return;
    const s = this.state;
    const block = shiftBlocker(s);
    if (block) return toast(block, { icon: '💼', tone: 'bad' });
    const career = CAREER_BY_ID[s.job!.careerId];
    const workplace = PLACE_BY_ID[career.placeId];
    closeSheet();
    // Commute: free inside the same area, a train ride to another borough.
    if (s.location.placeId !== workplace.id) {
      if (workplace.area !== s.location.area) {
        await this.rideTrain(workplace.area, workplace.id, true);
      } else {
        fade(true, 'Heading to work…', workplace.name);
        await wait(700);
        this.state.location.x = doorOf(workplace).x;
        this.state.location.z = doorOf(workplace).z;
        if (this.engine.mode === 'interior') {
          this.interior?.dispose();
          this.interior = null;
        }
        this.enterInterior(workplace, false);
        fade(false);
      }
    }
    await this.runShift();
  }

  private async runShift(): Promise<void> {
    this.busy = true;
    const career = CAREER_BY_ID[this.state.job!.careerId];
    // The shift reads as SHIFT_GAME_HOURS on a little clock that races
    // ahead, but only takes SHIFT_SECONDS. "Skip to end of shift" finishes
    // it at once (a stand-in for the mini-games coming later).
    let skipped = false;
    const bar = progressBar(`${career.emoji} Working as ${jobTitle(this.state)}…`, { skipLabel: '⏩ Skip to end of shift', onSkip: () => (skipped = true) });
    const total = SHIFT_SECONDS * 1000;
    const start = performance.now();
    const startClock = nycTime();
    const startMin = startClock.hour * 60 + startClock.minute;
    const fmt = (min: number) => {
      const h = Math.floor(min / 60) % 24;
      const m = Math.floor(min % 60);
      return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    };
    let style: WorkStyle | null = null;
    let paused = 0;
    await new Promise<void>((resolve) => {
      const tick = () => {
        const f = skipped ? 1 : (performance.now() - start - paused) / total;
        bar.set(f, `${career.emoji} ${jobTitle(this.state)} · ${fmt(startMin + Math.min(1, f) * SHIFT_GAME_HOURS * 60)} → ${fmt(startMin + SHIFT_GAME_HOURS * 60)}`);
        if (f >= 0.45 && !style && !skipped) {
          // Halfway: how do you want to work today?
          const pauseStart = performance.now();
          const m = openModal(`<div class="big">${career.emoji}</div><h2>How are you working today?</h2><p>Your choice affects pay, performance and your needs.</p><div class="choices">${(Object.keys(WORK_STYLES) as WorkStyle[]).map((k) => `<button class="choice" data-act="${k}">${WORK_STYLES[k].emoji} <span>${WORK_STYLES[k].label}<span class="hint">${WORK_STYLES[k].hint}</span></span></button>`).join('')}</div>`);
          onAct(m.el, (act) => {
            style = act as WorkStyle;
            m.close();
            paused += performance.now() - pauseStart;
            requestAnimationFrame(tick);
          });
          return;
        }
        if (f >= 1) return resolve();
        requestAnimationFrame(tick);
      };
      tick();
    });
    bar.remove();
    const r = completeShift(this.state, style ?? 'chill');
    this.state.stats.actionsDone['__shift'] = (this.state.stats.actionsDone['__shift'] ?? 0) + 1;
    this.busy = false;
    toast(`Shift done · +${money(r.pay)} · performance ${r.performanceDelta >= 0 ? '▲' : '▼'}`, { icon: '💵', tone: 'good', ms: 3500 });
    if (r.promoted) {
      sfx.notify();
      const m = openModal(`<div class="big">📈</div><h2>Promoted!</h2><p>You’re now <b>${esc(r.promoted)}</b>. More money per shift.</p><button class="btn primary block" data-act="ok">Let’s go</button>`);
      onAct(m.el, () => m.close());
      this.state.news.unshift({ id: `promo-${nowMs()}`, at: nowMs(), scope: this.state.location.area, emoji: '📈', headline: `${this.state.profile.name} promoted to ${r.promoted}`, personal: true });
    }
    this.save();
    this.refreshHud(true);
  }

  // ===================================================================
  // Travel
  // ===================================================================

  private openMapOverlay(): void {
    const s = this.state;
    const p = this.player.root.position;
    this.overlayClose = openMap({
      area: s.location.area,
      player: { area: s.location.area, x: this.engine.mode === 'city' ? p.x : s.location.x, z: this.engine.mode === 'city' ? p.z : s.location.z },
      hour: nycTime().hour,
      onPick: (id) => {
        this.overlayClose?.();
        this.travelSheet(PLACE_BY_ID[id]);
      },
      onClose: () => (this.overlayClose = null),
    });
  }

  /** Rideshare price: base + distance, times surge (rush hour, bad weather). */
  rideQuote(placeId: string, luxury: boolean): { cost: number; minutes: number; surge: number } {
    const s = this.state;
    const place = PLACE_BY_ID[placeId];
    const d = doorOf(place);
    const t = nycTime();
    const crossing = place.area !== s.location.area;
    const dist = crossing ? 3_500 : Math.hypot(d.x - s.location.x, d.z - s.location.z);
    let surge = 1;
    if (isRushHour(t)) surge += 0.6;
    surge += weatherDef(weatherFor(t.dateKey, t.hour)).surge ?? 0;
    if (t.hour >= 1 && t.hour < 5) surge += 0.3;
    let cost = Math.max(RIDESHARE.minFare, RIDESHARE.base + Math.round((dist / 100) * RIDESHARE.per100m)) * surge;
    if (luxury) cost *= RIDESHARE.luxuryMultiplier;
    cost = Math.round(cost / 25) * 25;
    const minutes = Math.max(3, Math.round(dist / 260 + (surge > 1.4 ? 4 : 1)));
    return { cost, minutes, surge };
  }

  private travelSheet(place: PlaceDef): void {
    const s = this.state;
    const same = place.area === s.location.area;
    const ride = this.rideQuote(place.id, false);
    const lux = this.rideQuote(place.id, true);
    const d = doorOf(place);
    const walkMin = Math.max(1, Math.round(Math.hypot(d.x - s.location.x, d.z - s.location.z) / 80));
    const open = isOpen(place, nycTime().hour);
    const sheet = openSheet({
      emoji: place.emoji,
      title: place.name,
      sub: `${DISTRICTS[place.area].name} · ${open ? 'open now' : 'closed now'}`,
      body: `<p class="blurb">${esc(place.blurb)}</p>
        <div class="travel">
          ${same ? `<button class="opt" data-act="walk"><span style="font-size:24px">🚶</span><span class="grow"><b>Walk</b><small>about ${walkMin} min</small></span><span class="cost">Free</span></button>` : ''}
          <button class="opt" data-act="subway"><span style="font-size:24px">🚇</span><span class="grow"><b>Subway</b><small>${same ? 'a couple of stops' : `to ${DISTRICTS[place.area].name}`}</small></span><span class="cost">${money(SUBWAY_FARE)}</span></button>
          <button class="opt" data-act="ride" ${s.phone.ok ? '' : 'disabled aria-disabled="true"'}><span style="font-size:24px">🚗</span><span class="grow"><b>Rideshare</b><small>${s.phone.ok ? `${ride.minutes} min${ride.surge > 1 ? ` · ⚡ surge ×${ride.surge.toFixed(1)}` : ''}` : 'needs your phone'}</small></span><span class="cost">${money(ride.cost)}</span></button>
          <button class="opt" data-act="lux" ${s.phone.ok ? '' : 'disabled aria-disabled="true"'}><span style="font-size:24px">🖤</span><span class="grow"><b>Rideshare Black</b><small>leather seats, bottled water</small></span><span class="cost">${money(lux.cost)}</span></button>
        </div>`,
    });
    onAct(sheet.body, (act) => {
      sheet.close();
      if (act === 'walk') {
        if (this.engine.mode === 'interior') this.leaveInterior();
        window.setTimeout(() => this.walkToPlace(place.id), this.engine.mode === 'interior' ? 400 : 0);
      }
      if (act === 'subway') void this.rideTrain(place.area, place.id);
      if (act === 'ride') this.rideshare(place.id, false);
      if (act === 'lux') this.rideshare(place.id, true);
    });
  }

  /** Take the subway. Across boroughs this plays the train ride while the next area loads. */
  private async rideTrain(area: AreaId, placeId: string | null, free = false): Promise<void> {
    if (this.busy) return;
    if (!free) {
      const r = changeMoney(this.state, -SUBWAY_FARE, 'Subway fare');
      if (!r.ok) return toast('Not enough for the fare ($2.90)', { icon: '🚇', tone: 'bad' });
    }
    this.busy = true;
    closeSheet();
    sfx.chime();
    fade(true, 'Stand clear of the closing doors…');
    await wait(400);
    const leavingInterior = this.engine.mode === 'interior';
    if (leavingInterior) {
      this.interior?.dispose();
      this.interior = null;
    }
    // Board: show the train car.
    this.transit?.dispose();
    this.transit = buildSubwayRide(this.engine.renderer.domElement.clientWidth / this.engine.renderer.domElement.clientHeight);
    this.engine.altScene = this.transit.scene;
    this.engine.altCamera = this.transit.camera;
    this.setMode('transit');
    fade(false);
    const rideUi = html(`<div class="ride-ui"><span class="chip">🚇 To ${DISTRICTS[area].name}</span><button class="chip" data-act="skip">Skip ⏭</button></div>`);
    root().appendChild(rideUi);
    let skip = false;
    onAct(rideUi, () => (skip = true));
    // While the train rolls, build the destination (if it's a different area).
    await wait(60);
    if (!this.city || this.city.area !== area) this.loadArea(area);
    // A random event may happen on board.
    if (Math.random() < 0.4) {
      const ev = directorPick(this.state, 'subway', true);
      if (ev) await this.showEvent(ev, 'subway');
    }
    const rideStart = performance.now();
    while (!skip && performance.now() - rideStart < 4500) await wait(100);
    rideUi.remove();
    fade(true);
    await wait(300);
    this.transit.dispose();
    this.transit = null;
    // Arrive at the station, then (optionally) walk to the destination.
    const station = stationOf(area);
    const sd = doorOf(station);
    this.state.location = { area, placeId: null, x: sd.x, z: sd.z };
    if (!this.state.stats.placesVisited.includes(station.id)) this.state.stats.placesVisited.push(station.id);
    this.engine.cityScene.add(this.player.root);
    this.setMode('city');
    this.engine.altScene = null;
    this.placePlayerAtLocation();
    fade(false);
    this.busy = false;
    toast(`Arrived at ${station.name}`, { icon: '🚇' });
    this.save();
    if (placeId) {
      const dest = PLACE_BY_ID[placeId];
      if (dest.type === 'work' && dest.id === CAREER_BY_ID[this.state.job?.careerId ?? '']?.placeId && this.state.job) {
        this.state.location.x = doorOf(dest).x;
        this.state.location.z = doorOf(dest).z;
        this.enterInterior(dest, false);
      } else if (placeId !== station.id) this.walkToPlace(placeId);
    }
  }

  /** Call a rideshare: pay, short "ride" fade, arrive at the door. */
  rideshare(placeId: string, luxury: boolean): void {
    if (this.busy) return;
    const s = this.state;
    if (!s.phone.ok) return toast('You need your phone to call a ride.', { icon: '📵', tone: 'bad' });
    const q = this.rideQuote(placeId, luxury);
    const r = changeMoney(s, -q.cost, luxury ? 'Rideshare Black' : 'Rideshare');
    if (!r.ok) return toast(`That ride is ${money(q.cost)}. Not enough cash.`, { icon: '🚗', tone: 'bad' });
    this.busy = true;
    closeSheet();
    const place = PLACE_BY_ID[placeId];
    const cars = ['Toyota Camry', 'Honda Accord', 'Toyota Sienna', 'Tesla Model 3'];
    const car = luxury ? 'Cadillac Escalade' : cars[Math.floor(Math.random() * cars.length)];
    fade(true, `🚗 Your ${car} is here`, `Riding to ${place.name}${place.area !== s.location.area ? ' — over the bridge' : ''}`);
    window.setTimeout(() => {
      if (this.engine.mode === 'interior') {
        this.interior?.dispose();
        this.interior = null;
        this.engine.cityScene.add(this.player.root);
        this.setMode('city');
        this.engine.altScene = null;
      }
      if (!this.city || this.city.area !== place.area) this.loadArea(place.area);
      const d = doorOf(place);
      this.state.location = { area: place.area, placeId: null, x: d.x, z: d.z };
      this.placePlayerAtLocation();
      fade(false);
      this.busy = false;
      toast(`${luxury ? 'Five stars. ' : ''}Dropped off at ${place.name}`, { icon: '📍' });
      this.save();
      window.setTimeout(() => this.openPlace(place), 400);
    }, 2200);
  }

  // ===================================================================
  // Random events
  // ===================================================================

  private whereNow(): EventContext['where'] {
    if (this.engine.mode === 'transit') return 'subway';
    const id = this.state.location.placeId;
    if (id) {
      const p = PLACE_BY_ID[id];
      return p.id === this.state.home.placeId ? 'home' : p.type;
    }
    // Outside: are we standing in a plaza or park?
    const p = this.player.root.position;
    const d = DISTRICTS[this.state.location.area];
    for (let c = 0; c < d.cols; c++)
      for (let r = 0; r < d.rows; r++) {
        const b = blockRect(d, c, r);
        if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ) {
          const k = d.kind(c, r);
          if (k === 'plaza') return 'plaza';
          if (k === 'park') return 'park';
        }
      }
    return 'street';
  }

  private maybeRandomEvent(): void {
    if (this.busy || this.overlayClose || isSheetOpen() || document.querySelector('.modal-wrap')) return;
    const where = this.whereNow();
    if (where === 'home') return; // your apartment is a safe space
    const ev = directorPick(this.state, where);
    if (ev) void this.showEvent(ev, where);
  }

  private showEvent(ev: RandomEventDef, where: EventContext['where']): Promise<void> {
    const ctx = buildContext(this.state, where);
    const choices = ev.choices.filter((c) => !c.show || c.show(ctx));
    sfx.notify();
    return new Promise((resolve) => {
      const m = openModal(`<div class="big">${ev.emoji}</div><h2>${esc(ev.title)}</h2><p>${esc(ev.text(ctx))}</p><div class="choices">${choices.map((c, i) => `<button class="choice" data-act="${i}">${c.emoji} <span>${esc(c.label)}${c.hint ? `<span class="hint">${esc(c.hint)}</span>` : ''}</span></button>`).join('')}</div>`);
      onAct(m.el, (act) => {
        const choice = choices[Number(act)];
        if (!choice) return;
        const outcome = choice.run(ctx);
        const before = this.state.money;
        const text = applyOutcome(this.state, outcome);
        const delta = this.state.money - before;
        if (outcome.tone === 'bad') sfx.bad();
        const flags = ev.redFlags && (outcome.scam || ev.kind === 'scam') ? `<div class="flags"><b>🚩 Red flags</b><ul>${ev.redFlags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : '';
        const lesson = outcome.lesson ? `<div class="lesson">💡 ${esc(outcome.lesson)}</div>` : '';
        const scamNote = outcome.scam === 'spotted' ? '<p style="color:var(--good);font-weight:700;margin-top:-6px">🧠 Scam spotted! Street Smarts up.</p>' : outcome.scam === 'fell' ? '<p style="color:var(--bad);font-weight:700;margin-top:-6px">😬 You got scammed.</p>' : '';
        m.el.innerHTML = `<div class="big">${outcome.tone === 'good' ? '😄' : outcome.tone === 'bad' ? '😖' : '🤷'}</div><h2>${esc(ev.title)}</h2><p>${esc(text)}${delta ? ` <b>${money(delta, { sign: true })}</b>` : ''}</p>${scamNote}${flags}${lesson}<button class="btn primary block" data-act="ok">OK</button>`;
        onAct(m.el, (a2) => {
          if (a2 !== 'ok') return;
          m.close();
          this.save();
          this.refreshHud(true);
          resolve();
        });
      });
    });
  }

  // ===================================================================
  // Overlays, HUD, saving
  // ===================================================================

  private openPhoneApp(app?: string): void {
    if (this.overlayClose) return;
    const close = openPhone(
      {
        state: this.state,
        rideQuote: (id, lux) => this.rideQuote(id, lux),
        rideshare: (id, lux) => {
          this.overlayClose = null;
          this.rideshare(id, lux);
        },
        adStats: () => this.ads?.stats ?? { seconds: {}, views: {}, taps: {} },
        setQuality: (q) => {
          this.state.settings.quality = q;
          this.save();
          toast('Graphics change applies next time you load the game.', { icon: '⚙️' });
        },
        toggleSound: () => {
          this.state.settings.sound = !this.state.settings.sound;
          setSoundEnabled(this.state.settings.sound);
          this.save();
        },
        resetLife: () => {
          deleteGame();
          location.reload();
        },
        save: () => this.save(),
        refresh: () => this.refreshHud(true),
      },
      app,
    );
    // The phone removes itself when closed; poll lightly to clear our reference.
    this.overlayClose = close;
    const watch = window.setInterval(() => {
      if (!document.querySelector('.phone')) {
        window.clearInterval(watch);
        if (this.overlayClose === close) this.overlayClose = null;
      }
    }, 200);
  }

  private openAdCard(slotId: string): void {
    const ad = this.ads?.creativeFor(slotId);
    if (!ad) return;
    this.ads!.recordTap(ad.id);
    const sheet = openSheet({
      emoji: '📢',
      title: ad.brand,
      sub: 'Sponsored',
      body: `<div class="card" style="background:${ad.bg};color:${ad.fg}"><h3 style="color:${ad.fg}">${esc(ad.brand)}</h3><p style="color:${ad.fg};opacity:.85">${esc(ad.line)}</p></div><p class="fine">${ad.link ? `<a href="${ad.link}" target="_blank" rel="noopener noreferrer sponsored">Visit advertiser ↗</a>` : 'This is a placeholder ad for a made-up brand. Real advertisers can book this screen when advertising opens.'}</p>`,
    });
    void sheet;
  }

  private refreshHud(force = false): void {
    if (!this.hud) return;
    const s = this.state;
    const inside = this.engine.mode === 'interior' && !!s.location.placeId;
    let where: { area: string; place?: string; streets?: string[] };
    if (inside) where = { area: DISTRICTS[s.location.area].name, place: PLACE_BY_ID[s.location.placeId!].name };
    else if (this.engine.mode === 'transit') where = { area: 'Subway', place: 'On the train' };
    else where = { area: DISTRICTS[s.location.area].name, streets: crossStreets(DISTRICTS[s.location.area], this.player.root.position.x, this.player.root.position.z).split(' & ') };
    const blocker = s.job ? shiftBlocker(s) : 'none';
    const goal = currentGoal(s);
    this.hud.update(s, where, {
      inside,
      canWork: !!s.job && !blocker && !this.busy,
      workLabel: s.job ? `Work a shift for ${money(CAREER_BY_ID[s.job.careerId].ladder[Math.min(s.job.level, 4)].pay)}` : '',
      goal: goal ? { title: goal.title, hint: goal.hint } : null,
    });
    void force;
  }

  private save(): void {
    if (!this.state) return;
    this.state.lastTick = Math.max(this.state.lastTick, nowMs() - 1000);
    saveGame(this.state);
  }
}

function fmtH(h: number): string {
  if (h === 24 || h === 0) return '12AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? 'AM' : 'PM'}`;
}
