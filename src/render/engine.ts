// =====================================================================
// engine.ts — the renderer, camera, controls and the main loop.
//
// CONTROLS (phone and computer)
//   • Drag with one finger / the mouse: rotate the camera around you.
//   • Pinch with two fingers / scroll wheel: zoom from street level all
//     the way out to see the whole neighbourhood.
//   • Tap / click: walk there, or use the thing you tapped.
// A drag never counts as a tap, so you don't walk away by accident.
// =====================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CAMERA } from '../core/constants.ts';
import type { QualitySettings } from './quality.ts';

export type ViewMode = 'city' | 'interior' | 'transit';

export interface TapHit {
  point: THREE.Vector3;
  object: THREE.Object3D;
  /** Which triangle was hit (merged meshes use it to tell parts apart). */
  faceIndex?: number;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly cityScene = new THREE.Scene();
  readonly hemi = new THREE.HemisphereLight('#f4f8ff', '#9a8f7e', 0.9);
  readonly sun = new THREE.DirectionalLight('#ffffff', 1.2);
  mode: ViewMode = 'city';
  /** Scene used when mode is 'interior' or 'transit'. */
  altScene: THREE.Scene | null = null;
  altCamera: THREE.PerspectiveCamera | null = null;

  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private down = { x: 0, y: 0, t: 0, id: -1, moved: false };
  private onTapCb: ((x: number, y: number) => void) | null = null;
  private clock = new THREE.Clock();
  private frameCb: ((dt: number) => void) | null = null;
  /** Rolling average of frame time, for the performance readout and auto-quality. */
  fps = 60;

  constructor(private host: HTMLElement, public quality: QualitySettings) {
    this.renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, powerPreference: 'high-performance', alpha: false });
    // Checking every shader for errors makes the browser wait for each one to
    // finish compiling (seconds on phones). Only worth it while developing.
    this.renderer.debug.checkShaderErrors = import.meta.env.DEV;
    this.renderer.setPixelRatio(quality.pixelRatio);
    this.renderer.setSize(host.clientWidth, host.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps cartoon colours bright and true (ACES
    // made them darker and greyer).
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '3D view of the city');
    // Phones (iOS Safari especially) drop the WebGL context when memory is
    // tight or the tab sits in the background: the city goes blank and only
    // the HUD is left (player report, 2026-10-14). Ask for it back; three.js
    // re-uploads everything on restore. If it doesn't come back, the game
    // saves and offers a reload (game.ts, 'nyc:gl-lost').
    const canvas = this.renderer.domElement;
    let lostTimer = 0;
    const giveUp = () => window.dispatchEvent(new Event('nyc:gl-lost'));
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      window.clearTimeout(lostTimer);
      lostTimer = window.setTimeout(giveUp, 4000);
    });
    canvas.addEventListener('webglcontextrestored', () => window.clearTimeout(lostTimer));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.renderer.getContext().isContextLost()) {
        window.clearTimeout(lostTimer);
        lostTimer = window.setTimeout(giveUp, 2500);
      }
    });

    this.camera = new THREE.PerspectiveCamera(50, host.clientWidth / host.clientHeight, 0.5, quality.viewDistance * 3);
    this.camera.position.set(0, 30, 40);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = CAMERA.minDistance;
    this.controls.maxDistance = CAMERA.maxDistance;
    this.controls.minPolarAngle = 0.2; // can look almost straight down (Peter: more top-down)
    // Township-style: the camera always looks down on the city at a
    // comfortable angle, so streets (and you) stay visible.
    this.controls.maxPolarAngle = 0.98;
    this.controls.zoomSpeed = 1.1;
    this.controls.rotateSpeed = 0.7;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE };
    // Safety net (Peter, 2026-10-14: "sometimes the screen just follows my mouse"):
    // if the mouse moves with no button held but the controls still think a
    // drag is on (the release was lost: window switch, focus change), end it.
    type Ctl = { _pointers: number[]; _onPointerUp: (e: PointerEvent) => void };
    const ctl = this.controls as unknown as Ctl;
    const endStuck = (e: PointerEvent) => {
      if (!ctl._pointers?.length) return;
      for (const id of [...ctl._pointers]) {
        try {
          ctl._onPointerUp(new PointerEvent('pointerup', { pointerId: id, pointerType: e.pointerType || 'mouse', clientX: e.clientX, clientY: e.clientY }));
        } catch {
          // releasePointerCapture throws for a pointer that's already gone; the drag is still cleared.
        }
      }
    };
    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' && e.buttons === 0) endStuck(e);
    }, { capture: true });
    window.addEventListener('blur', () => endStuck(new PointerEvent('pointerup')));

    this.cityScene.add(this.hemi, this.sun, this.sun.target);
    this.sun.castShadow = quality.shadows;
    if (quality.shadows) {
      this.sun.shadow.mapSize.set(2048, 2048);
      const s = this.sun.shadow.camera;
      s.left = -90;
      s.right = 90;
      s.top = 90;
      s.bottom = -90;
      s.near = 1;
      s.far = 600;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.6;
    }
    this.cityScene.fog = new THREE.Fog('#bfdcee', quality.viewDistance * 0.35, quality.viewDistance);

    window.addEventListener('resize', () => this.resize());
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (!e.isPrimary) {
        this.down.moved = true; // second finger = pinch, not a tap
        return;
      }
      this.down = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, moved: false };
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.down.id && Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 8) this.down.moved = true;
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== this.down.id || this.down.moved) return;
      // No time limit on purpose: on a busy, slow phone a quick tap can be
      // delivered late, and a press that didn't move is still a tap.
      this.onTapCb?.(e.clientX, e.clientY);
    });
    // Stop the page itself from scrolling or zooming when you pinch the 3D view.
    el.style.touchAction = 'none';
  }

  onTap(cb: (x: number, y: number) => void): void {
    this.onTapCb = cb;
  }

  /** What's under a screen point, among the given objects. */
  pick(x: number, y: number, objects: THREE.Object3D[], camera = this.activeCamera()): TapHit | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, camera);
    // A mesh can say which of its hits count (the city skips buildings that
    // are hidden or faded out: switched-off far stand-ins, see-through walls).
    const hit = this.raycaster.intersectObjects(objects, true).find((h) => {
      const f = h.object.userData.pickFilter as ((h: THREE.Intersection) => boolean) | undefined;
      return !f || f(h);
    });
    return hit ? { point: hit.point, object: hit.object, faceIndex: hit.faceIndex ?? undefined } : null;
  }

  activeCamera(): THREE.PerspectiveCamera {
    return this.mode !== 'city' && this.altCamera ? this.altCamera : this.camera;
  }

  resize(): void {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    this.renderer.setSize(w, h);
    for (const cam of [this.camera, this.altCamera]) {
      if (!cam) continue;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  }

  private firstFrame = false;

  /**
   * Compile the city's shaders before the first frame, in the background
   * where the browser supports it, so the loading screen keeps moving
   * instead of freezing on the first picture. Never waits more than 4 s.
   */
  async warmUp(): Promise<void> {
    try {
      await Promise.race([this.renderer.compileAsync(this.cityScene, this.camera), new Promise((r) => setTimeout(r, 4000))]);
    } catch {
      /* the first frame compiles whatever is left */
    }
    performance.mark('frame:warm');
  }

  start(frame: (dt: number) => void): void {
    this.frameCb = frame;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  private tick(): void {
    // Clamp the time step: after a tab switch we don't want a 10-second jump.
    const dt = Math.min(0.1, this.clock.getDelta());
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 60) * 0.05;
    this.frameCb?.(dt);
    if (this.mode === 'city') {
      this.controls.update();
      this.renderer.render(this.cityScene, this.camera);
      if (!this.firstFrame) {
        this.firstFrame = true;
        performance.mark('frame:first');
      }
    } else if (this.altScene && this.altCamera) {
      this.renderer.render(this.altScene, this.altCamera);
    }
  }

  /** Place the sun's shadow box around the player so shadows stay sharp nearby. */
  followSun(target: THREE.Vector3, dir: THREE.Vector3): void {
    this.sun.position.copy(target).addScaledVector(dir, 250);
    this.sun.target.position.copy(target);
  }
}
