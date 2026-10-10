// =====================================================================
// geo.ts — a small helper for building lots of boxes into ONE mesh.
//
// Drawing 2,000 separate buildings would mean 2,000 "draw calls", which
// kills phones. Instead we write every building's walls into one big
// list of triangles per material and draw them all at once. This file
// is the tool that writes those triangles, with texture coordinates
// measured in metres so window grids line up at the right size.
// =====================================================================

import * as THREE from 'three';

export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];

  get empty(): boolean {
    return this.pos.length === 0;
  }

  /**
   * Add one flat rectangle given its four corners (counter-clockwise when
   * seen from the front) and how many texture tiles it spans in u and v.
   */
  quad(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, d: THREE.Vector3Like, u0: number, u1: number, v0: number, v1: number): void {
    const ab = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
    const ad = new THREE.Vector3(d.x - a.x, d.y - a.y, d.z - a.z);
    const n = ab.cross(ad).normalize();
    const P = [a, b, c, a, c, d];
    const U = [
      [u0, v0], [u1, v0], [u1, v1],
      [u0, v0], [u1, v1], [u0, v1],
    ];
    for (let i = 0; i < 6; i++) {
      this.pos.push(P[i].x, P[i].y, P[i].z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(U[i][0], U[i][1]);
    }
  }

  /**
   * A building block: four textured walls (window tiles sized `tile`
   * metres) from height y0 to y1. Roofs are added separately.
   * `uOffset` shifts the window pattern so neighbours don't look cloned.
   */
  walls(minX: number, maxX: number, minZ: number, maxZ: number, y0: number, y1: number, tile: [number, number], uOffset = 0): void {
    const [tw, th] = tile;
    const v0 = y0 / th;
    const v1 = y1 / th;
    const wx = (maxX - minX) / tw;
    const wz = (maxZ - minZ) / tw;
    const V = (x: number, y: number, z: number) => ({ x, y, z });
    // South face (+z)
    this.quad(V(minX, y0, maxZ), V(maxX, y0, maxZ), V(maxX, y1, maxZ), V(minX, y1, maxZ), uOffset, uOffset + wx, v0, v1);
    // North face (−z)
    this.quad(V(maxX, y0, minZ), V(minX, y0, minZ), V(minX, y1, minZ), V(maxX, y1, minZ), uOffset, uOffset + wx, v0, v1);
    // East face (+x)
    this.quad(V(maxX, y0, maxZ), V(maxX, y0, minZ), V(maxX, y1, minZ), V(maxX, y1, maxZ), uOffset, uOffset + wz, v0, v1);
    // West face (−x)
    this.quad(V(minX, y0, minZ), V(minX, y0, maxZ), V(minX, y1, maxZ), V(minX, y1, minZ), uOffset, uOffset + wz, v0, v1);
  }

  /** A flat horizontal rectangle at height y (roofs, slabs, markings). */
  flat(minX: number, maxX: number, minZ: number, maxZ: number, y: number, tile = 1): void {
    const V = (x: number, z: number) => ({ x, y, z });
    this.quad(V(minX, maxZ), V(maxX, maxZ), V(maxX, minZ), V(minX, minZ), 0, (maxX - minX) / tile, 0, (maxZ - minZ) / tile);
  }

  /** A solid box (slabs, kerbs, benches) with all six faces. */
  box(minX: number, maxX: number, y0: number, y1: number, minZ: number, maxZ: number): void {
    this.walls(minX, maxX, minZ, maxZ, y0, y1, [1, 1]);
    this.flat(minX, maxX, minZ, maxZ, y1);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
