import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { InteriorView, MAX_ZOOM, MIN_ZOOM, START_ZOOM } from '../src/world/interior-view.ts';

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
  // Zooming back out recentres, and goes past "the room fits" to see more around it.
  v.zoomAt(0.01, 0, 0);
  assert.equal(v.zoom, MIN_ZOOM);
  assert.equal(v.pan.length(), 0);
});

test('rooms open a little wider than a tight fit', () => {
  assert.equal(make(true).zoom, START_ZOOM);
  assert.ok(START_ZOOM < 1 && MIN_ZOOM < START_ZOOM);
});

test('following brings an off-screen character back into view', () => {
  const v = make(true);
  v.zoomAt(MAX_ZOOM, 0, 0);
  const who = new THREE.Vector3(-8, 0, 4);
  assert.equal(v.sees(who, 0.6), false);
  for (let i = 0; i < 200; i++) v.follow(who, 0.05);
  assert.ok(v.sees(who, 0.95));
});

// Turning the room (the ↺ ↻ buttons and a two-finger twist, Peter 2026-11-01).
test('turning: 45° steps, measured from the opening corner, and the walls are told which way it faces', () => {
  const cam = new THREE.PerspectiveCamera(62, 0.5, 0.1, 200);
  const v = new InteriorView(cam);
  const seen: [number, number][] = [];
  v.onView = (x, z) => seen.push([x, z]);
  v.frame(new THREE.Vector3(0, 0.4, 0), new THREE.Vector3(0, 16, 14), 8, 6, true, false, -Math.PI / 4);
  assert.equal(v.turn, 0);
  v.rotate(Math.PI / 4);
  assert.ok(Math.abs(v.turn - Math.PI / 4) < 1e-9);
  // It glides there.
  for (let i = 0; i < 200; i++) v.tick(1 / 30);
  assert.ok(Math.abs(v.azimuth - 0) < 1e-6, 'opening −45° plus one step = 0');
  // The camera's direction from the room goes to the walls (here: straight in from +z).
  const [x, z] = seen[seen.length - 1];
  assert.ok(Math.abs(x) < 1e-6 && z > 0);
  // Every one of the 8 angles keeps the room centre in the middle of the picture.
  for (let k = 0; k < 8; k++) {
    v.setTurn((k * Math.PI) / 4, true);
    const c = new THREE.Vector3(0, 0.4, 0).project(cam);
    assert.ok(Math.abs(c.x) < 1e-6 && Math.abs(c.y) < 1e-6, `angle ${k * 45}`);
  }
});

test('turning: a twist follows the fingers, then settles on the nearest step; a new room starts again', () => {
  const v = make(true);
  v.twistBy(0.5);
  assert.ok(Math.abs(v.azimuth - 0.5) < 1e-9, 'follows straight away');
  v.settle();
  assert.ok(Math.abs(v.turn - Math.PI / 4) < 1e-9, '0.5 rad settles on 45°');
  v.twistBy(-1.4);
  v.settle();
  assert.ok(Math.abs(v.turn + Math.PI / 4) < 1e-9, 'back past the start to −45°');
  v.frame(new THREE.Vector3(0, 0.6, -0.5), new THREE.Vector3(0, 20, 19), 9, 6, true);
  assert.equal(v.turn, 0);
  // A resize keeps the turn.
  v.setTurn(Math.PI / 2, true);
  v.frame(new THREE.Vector3(0, 0.6, -0.5), new THREE.Vector3(0, 20, 19), 9, 6, true, true);
  assert.ok(Math.abs(v.turn - Math.PI / 2) < 1e-9);
});
