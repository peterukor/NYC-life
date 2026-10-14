// =====================================================================
// avatar-preview.ts — your character, turning slowly, while you pick a
// body, skin, top, bottoms and hair in the starting screen (Peter,
// 2026-10-14). A small canvas of its own (the city behind the form is
// hidden), disposed when you're done.
// =====================================================================

import * as THREE from 'three';
import { makeAvatar } from '../world/avatar.ts';
import type { Look } from '../sim/types.ts';

export interface AvatarPreview {
  el: HTMLElement;
  setLook(look: Look): void;
  /** A little hop when something changes. */
  bounce(): void;
  dispose(): void;
}

export function avatarPreview(look: Look): AvatarPreview {
  const el = document.createElement('div');
  el.className = 'ob-preview';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', 'Your character');
  const canvas = document.createElement('canvas');
  el.appendChild(canvas);
  const W = 220, H = 240;
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    el.classList.add('no-3d');
  }
  renderer?.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer?.setSize(W, H, false);
  if (renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#9aa3c7', 2.2));
  const sun = new THREE.DirectionalLight('#fff3df', 2.4);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  // A little round floor to stand on.
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 32), new THREE.MeshStandardMaterial({ color: '#ffd23f', roughness: 0.8 }));
  floor.position.y = -0.03;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
  camera.position.set(0, 1.25, 4.3);
  camera.lookAt(0, 0.85, 0);
  const avatar = makeAvatar(look);
  scene.add(avatar.root);
  avatar.setDetail(2);
  let raf = 0, last = performance.now(), hop = 0, alive = true;
  const loop = (now: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    avatar.root.rotation.y += dt * 0.6;
    if (hop > 0) {
      hop = Math.max(0, hop - dt * 3);
      avatar.root.position.y = Math.sin(hop * Math.PI) * 0.18;
    }
    avatar.animate(0, dt);
    renderer?.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return {
    el,
    setLook(l) {
      avatar.setLook(l);
    },
    bounce() {
      hop = 1;
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      avatar.dispose();
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
      el.remove();
    },
  };
}
