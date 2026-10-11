// =====================================================================
// Brooklyn Bridge — cartoon version.
//
// Reference points kept: two granite towers, each with a pair of tall
// pointed (Gothic) arches; the road deck between them; the big curved
// main cables and the web of hangers. Chunky proportions for the toy
// look. Stands at the Brooklyn waterfront and spans out over the river.
// =====================================================================

import * as THREE from 'three';
import { streetZ } from '../layout.ts';
import { LANDMARKS } from './registry.ts';
import { Toy } from './toy.ts';

const GRANITE = '#d8b98c';
const GRANITE_DARK = '#b8946a';
const DECK = '#6f6a73';
const CABLE = '#f4efe6';

LANDMARKS.add({
  id: 'brooklynBridge',
  build({ block, district, group, track }) {
    const x = (block.minX + block.maxX) / 2;
    const shore = streetZ(district, 0) - district.streetW / 2;
    const span = 420;
    const toy = new Toy();

    // Deck with a lighter walkway down the middle (the famous promenade).
    toy.block(16, 2.2, span, x, 11, shore - span / 2 + 20, DECK, 0.2);
    toy.block(5, 0.5, span, x, 13.2, shore - span / 2 + 20, '#c9a77c', 0.3);
    // Ramp down to the street.
    const ramp = new THREE.BoxGeometry(16, 2, 62).rotateX(Math.atan2(12, 62)).translate(x, 6, shore + 19);
    toy.add(ramp, DECK);

    // Towers with twin pointed arches.
    const towerZs = [shore - 60, shore - 330];
    for (const tz of towerZs) {
      toy.block(8, 86, 11, x - 9.5, 0, tz, GRANITE, 0.08); // west leg
      toy.block(8, 86, 11, x + 9.5, 0, tz, GRANITE, 0.08); // east leg
      toy.block(4, 86, 11, x, 0, tz, GRANITE, 0.08); // centre pier
      toy.block(27, 26, 11.6, x, 60, tz, GRANITE, 0.06); // top
      toy.block(29, 3, 12.6, x, 86, tz, GRANITE_DARK, 0.3); // cornice
      toy.block(27, 10, 11.6, x, 0, tz, GRANITE_DARK, 0.06); // base
      // Pointed arch tops (two little gables under the top block).
      for (const ax of [x - 4.5, x + 4.5]) {
        const arch = new THREE.CylinderGeometry(0.01, 3.2, 6, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 3.6).translate(ax, 57, tz);
        toy.add(arch, GRANITE);
      }
    }

    // Main cables: two thick curved tubes per side between the towers.
    for (const side of [-7.5, 7.5]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const z = towerZs[0] + (towerZs[1] - towerZs[0]) * t;
        pts.push(new THREE.Vector3(x + side, 86 - 70 * 4 * t * (1 - t), z));
      }
      toy.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.9, 6), CABLE);
    }
    group.add(toy.build('landmark-brooklyn-bridge'));

    // The hanger web: thin lines (cheap) from cables to deck.
    const lines: THREE.Vector3[] = [];
    for (const side of [-7.5, 7.5]) {
      for (let i = 1; i < 24; i++) {
        const t = i / 24;
        const z = towerZs[0] + (towerZs[1] - towerZs[0]) * t;
        const y = 86 - 70 * 4 * t * (1 - t);
        lines.push(new THREE.Vector3(x + side, y, z), new THREE.Vector3(x + side, 13.4, z));
        // Diagonal stays near the towers — the bridge's signature web.
        if (t < 0.3 || t > 0.7) lines.push(new THREE.Vector3(x + side, 84, t < 0.5 ? towerZs[0] : towerZs[1]), new THREE.Vector3(x + side, 13.4, z));
      }
    }
    group.add(new THREE.LineSegments(track(new THREE.BufferGeometry().setFromPoints(lines)), track(new THREE.LineBasicMaterial({ color: CABLE }))));
  },
});
