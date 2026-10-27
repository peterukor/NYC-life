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
  /** Furniture colour slot for what's added next (see assets/furniture-kit.ts): 0 fixed, 1 main, 2 frame, 3 glow. */
  private slotNow = 0;
  private slots: number[] = [];

  /**
   * Add pieces in a colour slot: in slots 1 and 2 the colour you give is
   * only the shading (use white, or grey for a darker part) and the
   * player's chosen colour is multiplied in; slot 3 lights up at night.
   */
  inSlot(slot: number, fn: () => void): this {
    const was = this.slotNow;
    this.slotNow = slot;
    fn();
    this.slotNow = was;
    return this;
  }

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
    this.slots.push(this.slotNow);
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
    // Only pieces that use slots carry the slot attribute.
    if (this.slots.some((s) => s)) {
      this.parts.forEach((g, i) => g.setAttribute('_slot', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(this.slots[i]), 1)));
    }
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
