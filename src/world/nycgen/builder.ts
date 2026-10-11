// =====================================================================
// builder.ts — writes lots of simple shapes into ONE geometry.
//
// Everything the city generator makes (walls, cornices, fire escapes,
// trees, hydrants, parked cars…) goes through a CityMeshBuilder. At the
// end, build() returns one BufferGeometry: one draw call for a whole
// block, however many little things are in it.
//
// Each vertex carries:
//   position, normal   — the shape and its lighting
//   color              — the paint colour (walls, props)
//   aCell              — where it sits on the facade grid (bays, floors)
//   aInfo              — x: atlas tile number, y: building id (for fading)
// =====================================================================

import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class CityMeshBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private cell: number[] = [];
  private info: number[] = [];
  private idx: number[] = [];
  /** Building id stamped on everything added until it's changed. */
  bid = 0;
  /** When set, overrides bid for everything (far stand-ins use one id per block). */
  lockBid: number | null = null;
  private c = new THREE.Color();

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  private vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, tile: number): number {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(this.c.r, this.c.g, this.c.b);
    this.cell.push(u, v);
    this.info.push(tile, this.lockBid ?? this.bid);
    return this.pos.length / 3 - 1;
  }

  /**
   * A flat four-cornered face (corners counter-clockwise seen from the
   * front). cu/cv = how many atlas tiles across and up it spans; u0/v0
   * shift the pattern.
   */
  quad(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, d: THREE.Vector3Like, color: THREE.ColorRepresentation, tile = 0, cu = 1, cv = 1, u0 = 0, v0 = 0): void {
    this.c.set(color);
    const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
    const fx = d.x - a.x, fy = d.y - a.y, fz = d.z - a.z;
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const i0 = this.vert(a.x, a.y, a.z, nx, ny, nz, u0, v0, tile);
    this.vert(b.x, b.y, b.z, nx, ny, nz, u0 + cu, v0, tile);
    this.vert(c.x, c.y, c.z, nx, ny, nz, u0 + cu, v0 + cv, tile);
    this.vert(d.x, d.y, d.z, nx, ny, nz, u0, v0 + cv, tile);
    this.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  /**
   * An axis-aligned box. `faces` picks which sides to draw (skip hidden
   * ones to save triangles): any of "nsewtb" (north −z, south +z, east
   * +x, west −x, top, bottom).
   */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: THREE.ColorRepresentation, faces = 'nsewt'): void {
    const V = (x: number, y: number, z: number) => ({ x, y, z });
    if (faces.includes('s')) this.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), color);
    if (faces.includes('n')) this.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), color);
    if (faces.includes('e')) this.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), color);
    if (faces.includes('w')) this.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), color);
    if (faces.includes('t')) this.quad(V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), color);
    if (faces.includes('b')) this.quad(V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), color);
  }

  /** A flat rectangle lying on the ground or a roof at height y. */
  flat(x0: number, x1: number, z0: number, z1: number, y: number, color: THREE.ColorRepresentation, tile = 0, tileSize = 0): void {
    const cu = tileSize ? (x1 - x0) / tileSize : 1;
    const cv = tileSize ? (z1 - z0) / tileSize : 1;
    this.quad({ x: x0, y, z: z1 }, { x: x1, y, z: z1 }, { x: x1, y, z: z0 }, { x: x0, y, z: z0 }, color, tile, cu, cv);
  }

  /**
   * A wall facing one way, textured with a facade tile: `bays` windows
   * across, `floors` storeys up. dir: 'n' | 's' | 'e' | 'w'.
   */
  facade(dir: 'n' | 's' | 'e' | 'w', x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, color: THREE.ColorRepresentation, tile: number, bays: number, floors: number, u0 = 0, v0 = 0): void {
    const V = (x: number, y: number, z: number) => ({ x, y, z });
    switch (dir) {
      case 's': return this.quad(V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), color, tile, bays, floors, u0, v0);
      case 'n': return this.quad(V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), color, tile, bays, floors, u0, v0);
      case 'e': return this.quad(V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), color, tile, bays, floors, u0, v0);
      case 'w': return this.quad(V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), color, tile, bays, floors, u0, v0);
    }
  }

  /** A low-poly cylinder (water tanks, poles, tree trunks). */
  cyl(x: number, z: number, y0: number, y1: number, rBottom: number, rTop: number, color: THREE.ColorRepresentation, sides = 8, cap = true): void {
    this.c.set(color);
    const base = this.vertexCount;
    const slope = (rBottom - rTop) / Math.max(0.001, y1 - y0);
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const cx = Math.cos(a), sz = Math.sin(a);
      const n = new THREE.Vector3(cx, slope, sz).normalize();
      this.vert(x + cx * rBottom, y0, z + sz * rBottom, n.x, n.y, n.z, 0, 0, 0);
      this.vert(x + cx * rTop, y1, z + sz * rTop, n.x, n.y, n.z, 0, 0, 0);
    }
    for (let i = 0; i < sides; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    if (cap && rTop > 0.001) {
      const center = this.vert(x, y1, z, 0, 1, 0, 0, 0, 0);
      const ring = this.vertexCount;
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        this.vert(x + Math.cos(a) * rTop, y1, z + Math.sin(a) * rTop, 0, 1, 0, 0, 0, 0);
      }
      for (let i = 0; i < sides; i++) this.idx.push(center, ring + ((i + 1) % sides), ring + i);
    }
  }

  /** A cone (water tank roofs, tree tops, umbrellas). */
  cone(x: number, z: number, y0: number, y1: number, r: number, color: THREE.ColorRepresentation, sides = 8): void {
    this.cyl(x, z, y0, y1, r, 0.001, color, sides, false);
  }

  /** A soft, puffy ball (tree crowns, bushes, fruit): smooth-shaded, cartoon style. */
  blob(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: THREE.ColorRepresentation): void {
    this.add(BLOB, color, x, y, z, rx, ry, rz);
  }

  /** A cheap faceted ball (far-away trees). */
  blobLow(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: THREE.ColorRepresentation): void {
    this.add(BLOB_LOW, color, x, y, z, rx, ry, rz);
  }

  /**
   * A soft-cornered box (cars, planters, bins, kiosks): reads as a
   * cartoon toy instead of a hard block. Sits on y0, centred on x/z.
   */
  rounded(x: number, z: number, y0: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, rotY = 0): void {
    // A chamfered box: 44 triangles (a RoundedBoxGeometry is 108). The
    // bevelled edges catch the light, which reads as "soft" on screen.
    void rotY;
    const r = Math.min(w, h, d) * 0.22;
    const x0 = x - w / 2, x1 = x + w / 2, y1 = y0 + h, z0 = z - d / 2, z1 = z + d / 2;
    const V = (px: number, py: number, pz: number) => ({ x: px, y: py, z: pz });
    // Main faces, inset by r on every side.
    this.quad(V(x0 + r, y0 + r, z1), V(x1 - r, y0 + r, z1), V(x1 - r, y1 - r, z1), V(x0 + r, y1 - r, z1), color); // +z
    this.quad(V(x1 - r, y0 + r, z0), V(x0 + r, y0 + r, z0), V(x0 + r, y1 - r, z0), V(x1 - r, y1 - r, z0), color); // -z
    this.quad(V(x1, y0 + r, z1 - r), V(x1, y0 + r, z0 + r), V(x1, y1 - r, z0 + r), V(x1, y1 - r, z1 - r), color); // +x
    this.quad(V(x0, y0 + r, z0 + r), V(x0, y0 + r, z1 - r), V(x0, y1 - r, z1 - r), V(x0, y1 - r, z0 + r), color); // -x
    this.quad(V(x0 + r, y1, z1 - r), V(x1 - r, y1, z1 - r), V(x1 - r, y1, z0 + r), V(x0 + r, y1, z0 + r), color); // top
    this.quad(V(x0 + r, y0, z0 + r), V(x1 - r, y0, z0 + r), V(x1 - r, y0, z1 - r), V(x0 + r, y0, z1 - r), color); // bottom
    // Top edge bevels.
    this.quad(V(x0 + r, y1 - r, z1), V(x1 - r, y1 - r, z1), V(x1 - r, y1, z1 - r), V(x0 + r, y1, z1 - r), color);
    this.quad(V(x1 - r, y1 - r, z0), V(x0 + r, y1 - r, z0), V(x0 + r, y1, z0 + r), V(x1 - r, y1, z0 + r), color);
    this.quad(V(x1, y1 - r, z1 - r), V(x1, y1 - r, z0 + r), V(x1 - r, y1, z0 + r), V(x1 - r, y1, z1 - r), color);
    this.quad(V(x0, y1 - r, z0 + r), V(x0, y1 - r, z1 - r), V(x0 + r, y1, z1 - r), V(x0 + r, y1, z0 + r), color);
    // Bottom edge bevels.
    this.quad(V(x0 + r, y0, z1 - r), V(x1 - r, y0, z1 - r), V(x1 - r, y0 + r, z1), V(x0 + r, y0 + r, z1), color);
    this.quad(V(x1 - r, y0, z0 + r), V(x0 + r, y0, z0 + r), V(x0 + r, y0 + r, z0), V(x1 - r, y0 + r, z0), color);
    this.quad(V(x1 - r, y0, z1 - r), V(x1 - r, y0, z0 + r), V(x1, y0 + r, z0 + r), V(x1, y0 + r, z1 - r), color);
    this.quad(V(x0 + r, y0, z0 + r), V(x0 + r, y0, z1 - r), V(x0, y0 + r, z1 - r), V(x0, y0 + r, z0 + r), color);
    // Vertical edge bevels.
    this.quad(V(x1 - r, y0 + r, z1), V(x1, y0 + r, z1 - r), V(x1, y1 - r, z1 - r), V(x1 - r, y1 - r, z1), color);
    this.quad(V(x1, y0 + r, z0 + r), V(x1 - r, y0 + r, z0), V(x1 - r, y1 - r, z0), V(x1, y1 - r, z0 + r), color);
    this.quad(V(x0 + r, y0 + r, z0), V(x0, y0 + r, z0 + r), V(x0, y1 - r, z0 + r), V(x0 + r, y1 - r, z0), color);
    this.quad(V(x0, y0 + r, z1 - r), V(x0 + r, y0 + r, z1), V(x0 + r, y1 - r, z1), V(x0, y1 - r, z1 - r), color);
    // Corner triangles (top four; the bottom ones are never seen).
    const tri = (a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like) => this.quad(a, b, c, c, color);
    tri(V(x1 - r, y1 - r, z1), V(x1, y1 - r, z1 - r), V(x1 - r, y1, z1 - r));
    tri(V(x1, y1 - r, z0 + r), V(x1 - r, y1 - r, z0), V(x1 - r, y1, z0 + r));
    tri(V(x0 + r, y1 - r, z0), V(x0, y1 - r, z0 + r), V(x0 + r, y1, z0 + r));
    tri(V(x0, y1 - r, z1 - r), V(x0 + r, y1 - r, z1), V(x0 + r, y1, z1 - r));
  }


  /** Copy any small geometry in (scaled, rotated about Y, moved). Non-indexed or indexed. */
  add(src: THREE.BufferGeometry, color: THREE.ColorRepresentation, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rotY = 0): void {
    this.c.set(color);
    const p = src.getAttribute('position');
    const n = src.getAttribute('normal');
    const cs = Math.cos(rotY), sn = Math.sin(rotY);
    const base = this.vertexCount;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i) * sx, py = p.getY(i) * sy, pz = p.getZ(i) * sz;
      let nx = n.getX(i) / sx, ny = n.getY(i) / sy, nz = n.getZ(i) / sz;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      this.vert(x + px * cs + pz * sn, y + py, z - px * sn + pz * cs, nx * cs + nz * sn, ny, -nx * sn + nz * cs, 0, 0, 0);
    }
    const index = src.getIndex();
    if (index) for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }

  /**
   * Copy a geometry made by another CityMeshBuilder (keeps its colours,
   * tiles and cells), moved to (x, y, z) and turned by rotY around Y.
   */
  addBuilt(src: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0): void {
    const p = src.getAttribute('position');
    const n = src.getAttribute('normal');
    const col = src.getAttribute('color');
    const cell = src.getAttribute('aCell');
    const info = src.getAttribute('aInfo');
    const cs = Math.cos(rotY), sn = Math.sin(rotY);
    const base = this.vertexCount;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), pz = p.getZ(i);
      const nx = n.getX(i), nz = n.getZ(i);
      this.c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
      this.vert(x + px * cs + pz * sn, y + p.getY(i), z - px * sn + pz * cs, nx * cs + nz * sn, n.getY(i), -nx * sn + nz * cs, cell.getX(i), cell.getY(i), info.getX(i));
    }
    const index = src.getIndex()!;
    for (let i = 0; i < index.count; i++) this.idx.push(base + index.getX(i));
  }

  /** A thin box from point a to point b (railings, ladders, legs). */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, thick: number, color: THREE.ColorRepresentation): void {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    const geo = BEAM.clone();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), Math.abs(dy) > len * 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    geo.scale(thick, thick, len).applyMatrix4(m);
    this.add(geo, color, (ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  }

  build(): THREE.BufferGeometry | null {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aCell', new THREE.Float32BufferAttribute(this.cell, 2));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 2));
    const n = this.vertexCount;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

/** Unit sphere-ish blob with smooth normals (shared vertices): puffy, not faceted. */
const BLOB = (() => {
  const g = new THREE.SphereGeometry(1, 7, 5); // 56 triangles, smooth
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  return m;
})();
const BLOB_LOW = new THREE.IcosahedronGeometry(1, 0);

/** Unit box centred on the origin, long along z (for beam()). */
const BEAM = new THREE.BoxGeometry(1, 1, 1);
