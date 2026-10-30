// =====================================================================
// weather-fx.ts — what the weather LOOKS like in the city.
//
// Reads today's weather definition (sim/weather.ts) and shows it:
//   • rain streaks or drifting snowflakes around the camera
//   • wet, darker streets; snow settling on roofs, paths and trees
//   • flood water filling the roads (sidewalks stay just above it)
// Everything fades in and out smoothly when the weather changes.
//
// Cheap on phones: the falling particles are moved entirely on the
// graphics card (one draw call), and their count follows the quality
// tier. All the numbers come from the weather definitions, so a new
// weather type needs no changes here.
// =====================================================================

import * as THREE from 'three';
import { SYSTEMS, type SystemContext } from '../core/systems.ts';
import { worldUniforms } from '../render/world-uniforms.ts';
import { weatherDef } from '../sim/weather.ts';
import { districtBounds } from '../world/layout.ts';

const BOX = 70; // the particle box around the camera's focus, in metres
const HEIGHT = 45;

let precip: THREE.Points | null = null;
let precipMat: THREE.ShaderMaterial | null = null;
let flood: THREE.Mesh | null = null;
let groundMats: { mat: THREE.MeshLambertMaterial; color: THREE.Color }[] = [];
const cur = { rain: 0, snow: 0, wet: 0, flood: 0, snowGround: 0 };
let time = 0;
/** Jump straight to the current weather (no slow fade) right after loading. */
let snap = true;

function makePrecip(count: number): THREE.Points {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * BOX;
    pos[i * 3 + 1] = Math.random() * HEIGHT;
    pos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  precipMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uRain: { value: 0 },
      uSnow: { value: 0 },
      uScale: { value: 300 },
    },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime, uRain, uSnow, uScale;
      uniform vec3 uCenter;
      varying float vAlpha;
      varying float vSnow;
      void main() {
        // Rain falls fast and straight; snow drifts down slowly and sways.
        float speed = mix(26.0, 2.6, uSnow);
        vec3 p = position;
        p.y = mod(position.y - uTime * speed * (0.8 + seed * 0.4), ${HEIGHT.toFixed(1)});
        p.x += sin(uTime * 0.8 + seed * 40.0) * 1.2 * uSnow;
        // Wrap the box around the camera's focus so the weather follows you.
        vec3 w = vec3(uCenter.x + mod(p.x - uCenter.x + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)}, p.y, uCenter.z + mod(p.z - uCenter.z + ${(BOX / 2).toFixed(1)}, ${BOX.toFixed(1)}) - ${(BOX / 2).toFixed(1)});
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = mix(1.3, 1.1, uSnow) * uScale / -mv.z;
        // uRain = amount falling (0–1): only that share of particles shows.
        vAlpha = step(seed, uRain);
        vSnow = uSnow;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying float vSnow;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        // Snow: soft round flakes. Rain: thin vertical streaks.
        float flake = 1.0 - smoothstep(0.25, 0.5, length(c));
        float streak = (1.0 - smoothstep(0.04, 0.12, abs(c.x))) * (1.0 - smoothstep(0.3, 0.5, abs(c.y)));
        float a = mix(streak * 0.55, flake * 0.9, vSnow) * vAlpha;
        if (a < 0.02) discard;
        gl_FragColor = vec4(mix(vec3(0.75, 0.85, 1.0), vec3(1.0), vSnow), a);
      }`,
  });
  const pts = new THREE.Points(g, precipMat);
  pts.frustumCulled = false;
  pts.name = 'weather-precip';
  return pts;
}

SYSTEMS.add({
  id: 'weather-fx',
  order: 50,
  areaLoaded(ctx: SystemContext) {
    const count = ctx.quality.tier === 'low' ? 500 : ctx.quality.tier === 'medium' ? 1100 : 2000;
    snap = true;
    precip = makePrecip(count);
    ctx.scene.add(precip);
    // Flood water: a sheet just above the road, below the sidewalks (0.18 m).
    const b = districtBounds(ctx.district, 40);
    flood = new THREE.Mesh(
      new THREE.PlaneGeometry(b.maxX - b.minX, b.maxZ - b.minZ),
      new THREE.MeshLambertMaterial({ color: '#6b8a8c', transparent: true, opacity: 0, depthWrite: false }), // muddy floodwater, not river blue (2026-10-30)
    );
    flood.rotation.x = -Math.PI / 2;
    flood.position.set((b.minX + b.maxX) / 2, 0.12, (b.minZ + b.maxZ) / 2);
    flood.name = 'weather-flood';
    flood.visible = false;
    ctx.scene.add(flood);
    // Remember the ground materials so snow can whiten them.
    groundMats = [];
    ctx.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m.name === 'ground' || m.name === 'sidewalks') && m.material instanceof THREE.MeshLambertMaterial) groundMats.push({ mat: m.material, color: m.material.color.clone() });
    });
  },
  update(dt: number, ctx: SystemContext) {
    time += dt;
    const w = weatherDef(ctx.weather);
    const k = snap ? 1 : Math.min(1, dt * 0.5); // smooth changes over a few seconds
    snap = false;
    const lerp = (key: keyof typeof cur, target: number) => (cur[key] += (target - cur[key]) * k);
    lerp('rain', w.precip?.kind === 'rain' ? w.precip.density : 0);
    lerp('snow', w.precip?.kind === 'snow' ? w.precip.density : 0);
    lerp('wet', w.ground?.wet ?? 0);
    lerp('snowGround', w.ground?.snow ?? 0);
    lerp('flood', w.ground?.flood ?? 0);
    worldUniforms.uSnow.value = cur.snowGround;
    worldUniforms.uWet.value = cur.wet * 0.8;
    if (precip && precipMat) {
      precip.visible = cur.rain > 0.01 || cur.snow > 0.01;
      precipMat.uniforms.uTime.value = time;
      // uSnow picks the look (flakes vs streaks); uRain is how much is falling.
      precipMat.uniforms.uSnow.value = cur.snow > cur.rain ? 1 : 0;
      // Zoomed far out, falling particles would show as a column around
      // you: fade them out and let the wet/snowy ground tell the story.
      const camDist = ctx.camera.position.distanceTo(ctx.player);
      const near = 1 - THREE.MathUtils.smoothstep(camDist, 90, 150);
      precipMat.uniforms.uRain.value = Math.max(cur.rain, cur.snow) * near;
      precip.visible &&= near > 0.01;
      precipMat.uniforms.uCenter.value.copy(ctx.player);
      precipMat.uniforms.uScale.value = window.innerHeight * 0.45;
    }
    if (flood) {
      flood.visible = cur.flood > 0.01;
      const m = flood.material as THREE.MeshLambertMaterial;
      m.opacity = cur.flood * 0.5;
      flood.position.y = 0.06 + cur.flood * 0.08 + Math.sin(time * 1.3) * 0.01;
    }
    for (const g of groundMats) g.mat.color.copy(g.color).lerp(new THREE.Color('#f4f7fb'), cur.snowGround * 0.75).multiplyScalar(1 - cur.wet * 0.12);
  },
  areaUnloaded() {
    for (const o of [precip, flood]) {
      if (!o) continue;
      o.removeFromParent();
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    precip = null;
    flood = null;
    precipMat = null;
    groundMats = [];
  },
});
