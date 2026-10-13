// =====================================================================
// toy.ts — a tiny "toy kit" for building cartoon landmarks out of soft,
// rounded blocks.
//
// Every piece is given a flat colour and merged into ONE mesh with
// vertex colours, so even a detailed landmark costs a single draw call.
// Rounded boxes (soft bevelled edges) are what make it read as a toy /
// cartoon rather than a box model.
// =====================================================================

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class Toy {
  private parts: THREE.BufferGeometry[] = [];

  /** Add any geometry with a colour, already positioned. */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(g);
    return this;
  }

  /** A soft-edged block centred at (x, y0 + h/2, z), sitting on height y0. */
  block(w: number, h: number, d: number, x: number, y0: number, z: number, color: THREE.ColorRepresentation, radius = 0.12): this {
    const r = Math.min(radius * Math.min(w, h, d), Math.min(w, h, d) / 2 - 0.01);
    return this.add(new RoundedBoxGeometry(w, h, d, 2, Math.max(0.01, r)).translate(x, y0 + h / 2, z), color);
  }

  /** A cylinder sitting on height y0 (rTop/rBottom for tapers). */
  cyl(rTop: number, rBottom: number, h: number, x: number, y0: number, z: number, color: THREE.ColorRepresentation, sides = 16): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBottom, h, sides).translate(x, y0 + h / 2, z), color);
  }

  sphere(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation): this {
    return this.add(new THREE.SphereGeometry(r, 12, 8).translate(x, y, z), color);
  }

  /** Everything merged into one geometry (vertex colours, normals). */
  geometry(): THREE.BufferGeometry {
    const geo = mergeGeometries(this.parts)!;
    geo.computeVertexNormals();
    return geo;
  }

  /** Merge everything into one mesh (one draw call). */
  build(name: string): THREE.Mesh {
    const geo = mergeGeometries(this.parts)!;
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
