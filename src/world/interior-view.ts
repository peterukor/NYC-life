// =====================================================================
// interior-view.ts — the camera inside a home: framing, pinch-to-zoom
// and drag-to-pan (Peter, 2026-10-13).
//
// Every room opens framed whole (zoom 1). The big homes (the Upper East
// Side two-bed and the penthouse, HomeLayout.zoomable) can then be pinched
// closer (up to MAX_ZOOM) and dragged around; the pan is kept inside the
// room, and shrinks back to nothing as you zoom out. Small homes keep the
// fixed view.
//
// Lagos Life style (Peter, 2026-10-27): the view also SWINGS round the
// room (rotate, in 45° steps, gliding) and can look straight DOWN (top
// view, a floor plan). Whenever it moves, `onView` tells the home which
// way the camera faces so the walls nearest it drop down.
//
// Only the 3D camera moves: the HUD, needs and sheets are page elements
// and stay the same size. Gestures never count as taps (render/engine.ts
// drops any press that moved or had a second finger).
// =====================================================================

import * as THREE from 'three';

export const MAX_ZOOM = 2.8;
/** Zoom out past "the room fits" to see more around it (Peter, 2026-10-14), and start a little wider. */
export const MIN_ZOOM = 0.62; // a little further out than 0.7 (Peter, 2026-10-15)
export const START_ZOOM = 0.92;

export class InteriorView {
  /** 1 = the whole room; bigger = closer. */
  zoom = 1;
  /** Where the camera looks, relative to the framed centre (floor metres). */
  readonly pan = new THREE.Vector2();
  /** Can this room zoom and pan? */
  enabled = false;
  private baseTarget = new THREE.Vector3();
  private baseOffset = new THREE.Vector3();
  /** Half the room's floor (for keeping the pan inside it). */
  private half = new THREE.Vector2(6, 5);

  /** Pixels the picture is lifted up by (a menu covers the bottom of the screen), and the screen size. */
  private liftPx = 0;
  private screen = new THREE.Vector2(1, 1);
  /** Swing round the room (radians, 0 = the usual front view), and where it's gliding to. */
  azimuth = 0;
  private azTarget = 0;
  /** Looking straight down: 0 = normal, 1 = top view (glides between). */
  private topK = 0;
  private topTarget = 0;
  /** Told after every move: the camera's direction from the room (x, z) and the view mode. */
  onView: ((dirX: number, dirZ: number, mode: 'cutaway' | 'top') => void) | null = null;

  readonly camera: THREE.PerspectiveCamera;
  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /** Lift the picture up by `px` (0 = centred again): a menu is covering the bottom. */
  setLift(px: number, width: number, height: number): void {
    this.liftPx = px;
    this.screen.set(width, height);
    this.apply();
  }

  /** Swing the view round by `step` radians (it glides there). */
  rotate(step: number): void {
    this.azTarget += step;
  }

  /** Top view on or off (glides). */
  setTop(on: boolean): void {
    this.topTarget = on ? 1 : 0;
  }
  get isTop(): boolean {
    return this.topTarget > 0.5;
  }

  /** Glide towards the wanted swing and tilt. Returns whether the camera moved. */
  tick(dt: number): boolean {
    const da = this.azTarget - this.azimuth, dk = this.topTarget - this.topK;
    if (Math.abs(da) < 1e-4 && Math.abs(dk) < 1e-4) return false;
    const k = 1 - Math.exp(-dt * 7);
    this.azimuth = Math.abs(da) < 1e-3 ? this.azTarget : this.azimuth + da * k;
    this.topK = Math.abs(dk) < 1e-3 ? this.topTarget : this.topK + dk * k;
    this.apply();
    return true;
  }

  /** Back to the front view (a new room). */
  resetSwing(): void {
    this.azimuth = this.azTarget = 0;
    this.topK = this.topTarget = 0;
  }

  /** Frame a room whole. `keep` holds on to the zoom and pan (a resize). */
  frame(target: THREE.Vector3, position: THREE.Vector3, halfW: number, halfD: number, zoomable: boolean, keep = false, swing = 0, startZoom = START_ZOOM): void {
    this.baseTarget.copy(target);
    this.baseOffset.copy(position).sub(target);
    this.half.set(halfW, halfD);
    this.enabled = zoomable;
    if (!keep || !zoomable) {
      this.zoom = startZoom;
      this.pan.set(0, 0);
      this.resetSwing();
      // Long homes on a tall phone: look along the long side so it fills the screen.
      this.azimuth = this.azTarget = swing;
    }
    this.apply();
  }

  /** Put the camera where zoom and pan say (clamped first). */
  apply(): void {
    this.zoom = THREE.MathUtils.clamp(this.zoom, this.enabled ? MIN_ZOOM : 1, this.enabled ? MAX_ZOOM : 1);
    // The further in, the further you may pan (none at all when zoomed out).
    const room = Math.max(0, 1 - 1 / this.zoom);
    this.pan.x = THREE.MathUtils.clamp(this.pan.x, -this.half.x * room, this.half.x * room);
    this.pan.y = THREE.MathUtils.clamp(this.pan.y, -this.half.y * room, this.half.y * room);
    const t = this.baseTarget.clone().add(new THREE.Vector3(this.pan.x, 0, this.pan.y));
    // Swing round the room, then tilt towards straight down for the top view.
    const off = this.baseOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.azimuth);
    if (this.topK > 0) {
      const len = off.length();
      const flat = new THREE.Vector3(off.x, 0, off.z).normalize();
      const top = new THREE.Vector3(0, len, 0).addScaledVector(flat, len * 0.02);
      off.lerp(top, this.topK).setLength(len * (1 + 0.05 * this.topK));
    }
    this.camera.position.copy(t).addScaledVector(off, 1 / this.zoom);
    if (this.liftPx > 0) this.camera.setViewOffset(this.screen.x, this.screen.y, 0, this.liftPx, this.screen.x, this.screen.y);
    else if (this.camera.view) this.camera.clearViewOffset();
    this.camera.up.set(0, 1, 0);
    if (this.topK > 0.98) this.camera.up.set(-off.x, 0, -off.z).normalize();
    this.camera.lookAt(t);
    this.camera.updateMatrixWorld();
    this.onView?.(off.x, off.z, this.topK > 0.6 ? 'top' : 'cutaway');
  }

  /** Where a point on the canvas (normalised -1..1) lands on the floor. */
  floorAt(ndcX: number, ndcY: number): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  }

  /** Drag: the floor under your finger moves with it. */
  dragBy(fromX: number, fromY: number, toX: number, toY: number): void {
    if (!this.enabled || this.zoom <= 1.001) return;
    const a = this.floorAt(fromX, fromY), b = this.floorAt(toX, toY);
    if (!a || !b) return;
    this.pan.x += a.x - b.x;
    this.pan.y += a.z - b.z;
    this.apply();
  }

  /** Zoom by a factor, keeping the floor under (ndcX, ndcY) where it is. */
  zoomAt(factor: number, ndcX: number, ndcY: number): void {
    if (!this.enabled) return;
    const before = this.floorAt(ndcX, ndcY);
    this.zoom *= factor;
    this.apply();
    const after = this.floorAt(ndcX, ndcY);
    if (before && after) {
      this.pan.x += before.x - after.x;
      this.pan.y += before.z - after.z;
      this.apply();
    }
  }

  /**
   * Keep someone in view while zoomed: if they're near the edge of the
   * screen, glide the camera towards them. Returns whether it moved.
   */
  follow(world: THREE.Vector3, dt: number, margin = 0.6): boolean {
    if (!this.enabled || this.zoom <= 1.001) return false;
    const p = world.clone().setY(world.y + 0.8).project(this.camera);
    if (Math.abs(p.x) < margin && Math.abs(p.y) < margin) return false;
    const want = new THREE.Vector2(world.x - this.baseTarget.x, world.z - this.baseTarget.z);
    if (this.topK > 0.5) return false;
    const k = Math.min(1, dt * 3);
    this.pan.lerp(want, k);
    this.apply();
    return true;
  }

  /** Is a world point on screen (inside the margin, -1..1)? */
  sees(world: THREE.Vector3, margin = 0.95): boolean {
    const p = world.clone().setY(world.y + 0.8).project(this.camera);
    return Math.abs(p.x) <= margin && Math.abs(p.y) <= margin && p.z < 1;
  }
}
