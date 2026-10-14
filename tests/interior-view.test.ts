import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InteriorView, MAX_ZOOM } from '../src/world/interior-view.ts';

const make = (zoomable: boolean) => {
  const cam = new THREE.PerspectiveCamera(62, 0.5, 0.1, 200);
  const v = new InteriorView(cam);
  v.frame(new THREE.Vector3(0, 0.6, -0.5), new THREE.Vector3(0, 20, 19), 9, 6, zoomable);
  return v;
};

test('rooms open whole; small homes never zoom or pan', () => {
  const v = make(false);
  v.zoomAt(2, 0, 0);
  v.dragBy(0, 0, 0.5, 0.5);
  assert.equal(v.zoom, 1);
  assert.equal(v.pan.length(), 0);
});

test('big homes zoom within limits and pan stays inside the room', () => {
  const v = make(true);
  v.zoomAt(10, 0, 0);
  assert.equal(v.zoom, MAX_ZOOM);
  for (let i = 0; i < 50; i++) v.dragBy(0, 0, 0.9, 0);
  assert.ok(Math.abs(v.pan.x) <= 9 * (1 - 1 / MAX_ZOOM) + 1e-6);
  // Zooming back out recentres.
  v.zoomAt(0.01, 0, 0);
  assert.equal(v.zoom, 1);
  assert.equal(v.pan.length(), 0);
});

test('following brings an off-screen character back into view', () => {
  const v = make(true);
  v.zoomAt(MAX_ZOOM, 0, 0);
  const who = new THREE.Vector3(-8, 0, 4);
  assert.equal(v.sees(who, 0.6), false);
  for (let i = 0; i < 200; i++) v.follow(who, 0.05);
  assert.ok(v.sees(who, 0.95));
});
