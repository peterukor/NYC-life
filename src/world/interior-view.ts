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

  readonly camera: THREE.PerspectiveCamera;
  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  /** Frame a room whole. `keep` holds on to the zoom and pan (a resize). */
  frame(target: THREE.Vector3, position: THREE.Vector3, halfW: number, halfD: number, zoomable: boolean, keep = false): void {
    this.baseTarget.copy(target);
    this.baseOffset.copy(position).sub(target);
    this.half.set(halfW, halfD);
    this.enabled = zoomable;
    if (!keep || !zoomable) {
      this.zoom = START_ZOOM;
      this.pan.set(0, 0);
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
    this.camera.position.copy(t).addScaledVector(this.baseOffset, 1 / this.zoom);
    this.camera.lookAt(t);
    this.camera.updateMatrixWorld();
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
