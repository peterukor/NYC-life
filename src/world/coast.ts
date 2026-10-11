// =====================================================================
// coast.ts — the REAL shape of New York around the streets you can walk.
//
//   • Water everywhere (the rivers, the harbour, the bay).
//   • Every borough's real coastline (world/geo-proj.ts). The borough
//     you're in is paved (its roads), the others are plain land you can
//     see across the water — Brooklyn from the Manhattan waterfront, etc.
//   • EXPANDABLE LAND: outside the playable street grid, the borough is
//     laid out in empty lots (same street pattern), with "FOR SALE"
//     signs. These are the plots players will buy and build on later.
//
// Cheap: one draw call per borough's land, one for all the lots, two for
// the signs.
// =====================================================================

import * as THREE from 'three';
import { Rng } from '../core/rng.ts';
import { BOROUGHS, onLand, outline, type BoroughId, type XZ } from './geo-proj.ts';
import { districtBounds, type DistrictDef } from './layout.ts';

type Track = <T extends { dispose(): void }>(x: T) => T;

/** The main outline of a district's borough (for the maps). */
export function landShape(d: DistrictDef): XZ[] {
  return outline(d.borough)[0] ?? [];
}

export { onLand };

function shapeGeo(rings: XZ[][], track: Track): THREE.BufferGeometry {
  const shapes = rings.map((ring) => new THREE.Shape(ring.map((p) => new THREE.Vector2(p.x, -p.z))));
  const geo = track(new THREE.ShapeGeometry(shapes, 1));
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export interface Coast {
  group: THREE.Group;
  /** The paved land of this borough (you can tap it to walk). */
  ground: THREE.Mesh;
}

/**
 * Build the water, all five boroughs' land, and this borough's expandable
 * lots. `paved` is the road material for this borough's land.
 */
export function buildCoast(d: DistrictDef, paved: THREE.Material, track: Track): Coast {
  const g = new THREE.Group();
  g.name = 'coast';

  const water = new THREE.Mesh(track(new THREE.PlaneGeometry(16000, 16000)), track(new THREE.MeshPhongMaterial({ color: '#2f7fa8', shininess: 90, specular: new THREE.Color('#9fd3ff') })));
  water.rotation.x = -Math.PI / 2;
  water.position.set(1500, -0.6, 1500);
  water.name = 'water';
  g.add(water);

  // This borough, paved; the other four merged into one plain-land mesh.
  const ground = new THREE.Mesh(shapeGeo(outline(d.borough), track), paved);
  ground.receiveShadow = true;
  ground.name = 'ground';
  g.add(ground);
  const others = new THREE.Mesh(shapeGeo(BOROUGHS.filter((b) => b.id !== d.borough).flatMap((b) => outline(b.id)), track), track(new THREE.MeshLambertMaterial({ color: '#cdbfa8' })));
  others.position.y = -0.05;
  others.name = 'land-other-boroughs';
  g.add(others);

  // Expandable lots: the rest of this borough, in the same street pattern.
  g.add(buildLots(d, d.borough, track));
  return { group: g, ground };
}

const LOT_COLORS = ['#b9cf8f', '#c8d69a', '#d6c9a2', '#c2c79a', '#cfd8a4'];

function buildLots(d: DistrictDef, borough: BoroughId, track: Track): THREE.Group {
  const out = new THREE.Group();
  out.name = 'expandable-lots';
  const built = districtBounds(d, 8);
  const pts = outline(borough).flat();
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minZ = Math.min(...pts.map((p) => p.z));
  const maxZ = Math.max(...pts.map((p) => p.z));
  const px = d.blockW + d.avenueW;
  const pz = d.blockD + d.streetW;
  const rng = new Rng(`lots-${d.id}`);
  const pos: number[] = [];
  const col: number[] = [];
  const signs: THREE.Matrix4[] = [];
  const c = new THREE.Color();
  // Lots line up with the playable grid's streets, then carry on across the borough.
  const c0 = Math.floor((minX - d.origin.x) / px);
  const c1 = Math.ceil((maxX - d.origin.x) / px);
  const r0 = Math.floor((minZ - d.origin.z) / pz);
  const r1 = Math.ceil((maxZ - d.origin.z) / pz);
  for (let ci = c0; ci < c1; ci++) {
    for (let ri = r0; ri < r1; ri++) {
      const x0 = d.origin.x + ci * px + d.avenueW / 2 + 2;
      const x1 = d.origin.x + (ci + 1) * px - d.avenueW / 2 - 2;
      const z0 = d.origin.z + ri * pz + d.streetW / 2 + 2;
      const z1 = d.origin.z + (ri + 1) * pz - d.streetW / 2 - 2;
      if (x1 > built.minX && x0 < built.maxX && z1 > built.minZ && z0 < built.maxZ) continue; // the playable streets
      if (![[x0, z0], [x1, z0], [x0, z1], [x1, z1]].every(([x, z]) => onLand(borough, x, z))) continue;
      c.set(rng.pick(LOT_COLORS));
      const y = 0.08;
      pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
      if (rng.chance(0.18)) signs.push(new THREE.Matrix4().makeTranslation(x0 + 6, 0, z1 - 4));
    }
  }
  if (pos.length) {
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, track(new THREE.MeshLambertMaterial({ vertexColors: true })));
    mesh.receiveShadow = true;
    mesh.name = 'lots';
    out.add(mesh);
  }
  if (signs.length && typeof document !== 'undefined') {
    // A little "LAND FOR SALE" board on a post (instanced).
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const g2 = canvas.getContext('2d');
    if (g2) {
      g2.fillStyle = '#ffffff';
      g2.fillRect(0, 0, 128, 64);
      g2.fillStyle = '#e63946';
      g2.fillRect(0, 0, 128, 18);
      g2.fillStyle = '#ffffff';
      g2.font = 'bold 13px sans-serif';
      g2.textAlign = 'center';
      g2.fillText('LAND', 64, 14);
      g2.fillStyle = '#1c2340';
      g2.font = 'bold 22px sans-serif';
      g2.fillText('FOR SALE', 64, 46);
    }
    const tex = track(new THREE.CanvasTexture(canvas));
    tex.colorSpace = THREE.SRGBColorSpace;
    const boards = new THREE.InstancedMesh(track(new THREE.BoxGeometry(6, 3, 0.3).translate(0, 4.5, 0)), track(new THREE.MeshLambertMaterial({ map: tex })), signs.length);
    const posts = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.4, 4, 0.4).translate(0, 2, 0)), track(new THREE.MeshLambertMaterial({ color: '#6b4f3a' })), signs.length);
    signs.forEach((m, i) => {
      boards.setMatrixAt(i, m);
      posts.setMatrixAt(i, m);
    });
    boards.name = 'for-sale-signs';
    out.add(boards, posts);
  }
  return out;
}
