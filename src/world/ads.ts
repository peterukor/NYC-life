// =====================================================================
// ads.ts — filling billboards and screens, rotating ads, and counting
// views fairly.
//
// ROTATION: each slot cycles through creatives every AD_ROTATE_SECONDS.
// To keep phones fast, only the closest few screens rotate "live"; the
// rest keep showing one still ad.
//
// FAIR COUNTING: a view is counted only while the ad is inside the
// camera's view AND covers at least AD_MIN_SCREEN_FRACTION of the
// screen height AND faces the camera. Advertisers get real numbers.
// In multiplayer, views will be reported to (and checked by) the server.
// =====================================================================

import * as THREE from 'three';
import { AD_MAX_LIVE, AD_MIN_SCREEN_FRACTION, AD_ROTATE_SECONDS } from '../core/constants.ts';
import { adTexture, HOUSE_ADS, type AdCreative } from '../render/textures.ts';
import type { QualityTier } from '../render/quality.ts';
import type { AdSlot } from './city.ts';

const STATS_KEY = 'nyclife.adstats.v1';

export interface AdStats {
  /** Seconds each creative was genuinely seen, keyed by creative id. */
  seconds: Record<string, number>;
  /** Number of separate "views" (each time it came into view). */
  views: Record<string, number>;
  taps: Record<string, number>;
}

interface SlotState {
  slot: AdSlot;
  queue: AdCreative[];
  index: number;
  timer: number;
  visibleLastCheck: boolean;
  live: boolean;
}

export class AdManager {
  private slots: SlotState[] = [];
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private tmp = new THREE.Vector3();
  private checkTimer = 0;
  stats: AdStats = loadStats();

  constructor(slots: AdSlot[], private tier: QualityTier) {
    // Deal the house ads out so neighbouring screens don't show the same thing.
    slots.forEach((slot, i) => {
      const queue = [...HOUSE_ADS.slice(i % HOUSE_ADS.length), ...HOUSE_ADS.slice(0, i % HOUSE_ADS.length)];
      const st: SlotState = { slot, queue, index: 0, timer: Math.random() * AD_ROTATE_SECONDS, visibleLastCheck: false, live: false };
      this.slots.push(st);
      this.show(st);
    });
  }

  private show(st: SlotState): void {
    const ad = st.queue[st.index % st.queue.length];
    const mat = st.slot.mesh.material as THREE.MeshBasicMaterial;
    mat.map = adTexture(ad, st.slot.width / st.slot.height);
    mat.needsUpdate = true;
    st.slot.mesh.userData.creativeId = ad.id;
  }

  /** The creative currently on a slot (for the tap-to-see-ad card). */
  creativeFor(slotId: string): AdCreative | null {
    const st = this.slots.find((s) => s.slot.id === slotId);
    return st ? st.queue[st.index % st.queue.length] : null;
  }

  recordTap(creativeId: string): void {
    this.stats.taps[creativeId] = (this.stats.taps[creativeId] ?? 0) + 1;
    saveStats(this.stats);
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    // 1) Decide which screens are "live" (closest N in front of the camera).
    const camPos = camera.position;
    const maxLive = AD_MAX_LIVE[this.tier];
    const sorted = this.slots
      .map((st) => ({ st, d: st.slot.center.distanceToSquared(camPos) }))
      .sort((a, b) => a.d - b.d);
    sorted.forEach((x, i) => (x.st.live = i < maxLive));

    // 2) Rotate live screens.
    for (const st of this.slots) {
      if (!st.live) continue;
      st.timer += dt;
      if (st.timer >= AD_ROTATE_SECONDS) {
        st.timer = 0;
        st.index += 1;
        this.show(st);
      }
    }

    // 3) Count genuine views twice a second (cheap enough for any phone).
    this.checkTimer += dt;
    if (this.checkTimer < 0.5) return;
    const elapsed = this.checkTimer;
    this.checkTimer = 0;
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    let changed = false;
    for (const st of this.slots) {
      const s = st.slot;
      let seen = false;
      if (this.frustum.containsPoint(s.center)) {
        const toCam = this.tmp.copy(camPos).sub(s.center);
        const dist = toCam.length();
        const facing = toCam.normalize().dot(s.normal) > 0.25;
        // Screen-height fraction covered by the ad at this distance.
        const fraction = s.height / (2 * dist * Math.tan(fovRad / 2));
        seen = facing && fraction >= AD_MIN_SCREEN_FRACTION;
      }
      if (seen) {
        const id = st.queue[st.index % st.queue.length].id;
        this.stats.seconds[id] = (this.stats.seconds[id] ?? 0) + elapsed;
        if (!st.visibleLastCheck) this.stats.views[id] = (this.stats.views[id] ?? 0) + 1;
        changed = true;
      }
      st.visibleLastCheck = seen;
    }
    if (changed && Math.random() < 0.1) saveStats(this.stats);
  }

  dispose(): void {
    saveStats(this.stats);
    this.slots = [];
  }
}

function loadStats(): AdStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw) as AdStats;
  } catch {
    /* storage unavailable */
  }
  return { seconds: {}, views: {}, taps: {} };
}

function saveStats(s: AdStats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
