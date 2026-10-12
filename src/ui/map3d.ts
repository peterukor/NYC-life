// =====================================================================
// map3d.ts — the MAP is the real city seen from the sky (Lagos Life
// style): the camera lifts high over the 3D borough so you see the real
// buildings, landmarks, the coastline and the billboards. On top float
// labels for places and little 📢 markers for every billboard (tap one to
// rent it). Drag to pan, pinch/scroll to zoom. "Whole city" opens the
// flat illustrated map of all five boroughs.
//
// This file is only the overlay (labels, buttons). game.ts moves the
// camera (openMap3D / closeMap3D).
// =====================================================================

import * as THREE from 'three';
import { esc } from '../core/format.ts';
import { doorOf, isOpen, placesIn, type PlaceDef } from '../data/places.ts';
import type { AreaId } from '../sim/types.ts';
import { html, onAct, root } from './dom.ts';
import { HOODS } from '../data/neighborhoods.ts';
import { AD_PRICES, islandWeekly, plotsIn } from '../data/plots.ts';
import { project, type BoroughId } from '../world/geo-proj.ts';

export interface Map3DOptions {
  area: AreaId;
  borough: BoroughId;
  areaName: string;
  hour: number;
  homeId: string;
  billboards: { id: string; center: THREE.Vector3; tier: string }[];
  player: () => { x: number; z: number };
  onPlace: (place: PlaceDef) => void;
  onBillboard: (slotId: string) => void;
  /** Tap an ad block, home lot or island for rent (data/plots.ts). */
  onPlot: (plotId: string) => void;
  onWholeCity: () => void;
  /** Gang view on/off (game.ts tints turf blocks). */
  onGang: (on: boolean) => void;
  onClose: () => void;
}

export interface Map3D {
  update: (camera: THREE.Camera, w: number, h: number, camDist: number) => void;
  close: () => void;
}

export function openMap3D(o: Map3DOptions): Map3D {
  const el = html(`
    <div class="map3d">
      <div class="map3d-top">
        <div class="map3d-title"><b>${esc(o.areaName)}</b><small>Drag to move · pinch to zoom · tap a place</small></div>
        <button class="btn" data-act="gang" title="Gang view">🧢</button>
        <button class="btn" data-act="city">🗺️ City</button>
        <button class="btn" data-act="close" aria-label="Close map">✕</button>
      </div>
      <div class="map3d-labels"></div>
    </div>`);
  root().appendChild(el);
  const layer = el.querySelector<HTMLElement>('.map3d-labels')!;
  let gang = false;
  const places = placesIn(o.area);
  type Item = { el: HTMLElement; x: number; y: number; z: number; minZoom: number; maxZoom?: number };
  const items: Item[] = [];

  // Big neighbourhood names, the way they're written on the flat map.
  for (const hd of HOODS.filter((x) => x.borough === o.borough)) {
    const p = project(hd.at[0], hd.at[1]);
    const label = html(`<div class="m3-hood">${esc(hd.name.toUpperCase())}</div>`);
    layer.appendChild(label);
    items.push({ el: label, x: p.x, y: 4, z: p.z, minZoom: 99999, maxZoom: 260 });
  }
  for (const p of places) {
    const d = p.model ? project(p.model[0], p.model[1]) : doorOf(p);
    const big = !!p.landmark || p.type === 'landmark' || p.id === o.homeId;
    const label = html(`<button class="m3-pin${big ? ' big' : ''}${p.id === o.homeId ? ' home' : ''}${isOpen(p, o.hour) ? '' : ' closed'}" data-act="place:${p.id}"><span class="ico">${p.emoji}</span><span class="nm">${esc(p.id === o.homeId ? 'Home' : p.name)}</span></button>`);
    layer.appendChild(label);
    // Landmarks and home always show; everything else when you zoom in.
    items.push({ el: label, x: d.x, y: big ? 26 : 8, z: d.z, minZoom: big ? 99999 : 520 });
  }
  // Billboards: one chip per cluster (Times Square has dozens of screens),
  // and smaller ones only appear as you zoom in — never a wall of icons.
  const shown: THREE.Vector3[] = [];
  // The giant standalone boards (ids '…-XL-…') rank with the hub screens:
  // you see them from high up.
  const big = (b: { id: string; tier: string }) => b.tier === 'hub' || b.id.includes('-XL-');
  const order = { hub: 0, avenue: 1, street: 2 } as Record<string, number>;
  for (const b of [...o.billboards].sort((a, c) => (big(a) ? 0 : 1) - (big(c) ? 0 : 1) || (order[a.tier] ?? 3) - (order[c.tier] ?? 3))) {
    if (shown.some((s) => s.distanceTo(b.center) < (big(b) ? 60 : 30))) continue;
    shown.push(b.center);
    const chip = html(`<button class="m3-ad${big(b) ? ' hub' : ''}" data-act="ad:${b.id}" aria-label="Billboard">📢</button>`);
    layer.appendChild(chip);
    items.push({ el: chip, x: b.center.x, y: b.center.y + 2, z: b.center.z, minZoom: big(b) ? 1100 : b.tier === 'avenue' ? 420 : 230 });
  }
  // Plots for rent: every ad block and island has a bright card you can
  // see from high up; empty home lots get a small 🏠 tag up close.
  const cards: HTMLElement[] = [];
  for (const pl of plotsIn(o.area)) {
    const label =
      pl.kind === 'island'
        ? `🏝️ ${esc(pl.name)}<small>FOR RENT · $${islandWeekly(pl.islandPrice ?? 0).toFixed(2)}/wk</small>`
        : pl.kind === 'ad'
          ? `📢 AD SPACE<small>left & right halves · from $${AD_PRICES[pl.tier].unit}/wk</small>`
          : '🏠 Lot for rent';
    const card = html(`<button class="m3-plot ${pl.kind === 'island' ? 'island' : pl.kind === 'home' ? 'lot' : ''}" data-act="plot:${esc(pl.id)}"><span>${label}</span></button>`);
    layer.appendChild(card);
    if (pl.kind !== 'home') cards.push(card);
    items.push({ el: card, x: pl.center.x, y: pl.kind === 'home' ? 4 : 30, z: pl.center.z, minZoom: pl.kind === 'home' ? 420 : 99999 });
  }
  const me = html('<div class="m3-me" aria-label="You are here"></div>');
  layer.appendChild(me);

  const v = new THREE.Vector3();
  const place = (e: HTMLElement, x: number, y: number, z: number, camera: THREE.Camera, w: number, h: number) => {
    v.set(x, y, z).project(camera);
    const off = v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1;
    e.style.display = off ? 'none' : '';
    if (!off) e.style.transform = `translate(-50%, -100%) translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
  };

  onAct(el, (act) => {
    if (act === 'close') return o.onClose();
    if (act === 'city') return o.onWholeCity();
    if (act === 'gang') {
      gang = !gang;
      el.querySelector('[data-act="gang"]')!.classList.toggle('primary', gang);
      return o.onGang(gang);
    }
    if (act.startsWith('place:')) {
      const p = places.find((x) => x.id === act.slice(6));
      if (p) o.onPlace(p);
    }
    if (act.startsWith('ad:')) o.onBillboard(act.slice(3));
    if (act.startsWith('plot:')) o.onPlot(act.slice(5));
  });

  return {
    update(camera, w, h, camDist) {
      // Zoomed all the way out: show the whole city (flat map).
      if (camDist > 1420) return o.onWholeCity();
      // Far out, plot cards shrink to one line.
      for (const c of cards) c.classList.toggle('compact', camDist > 750);
      for (const it of items) {
        if (camDist > it.minZoom || (it.maxZoom && camDist < it.maxZoom)) it.el.style.display = 'none';
        else place(it.el, it.x, it.y, it.z, camera, w, h);
      }
      const p = o.player();
      place(me, p.x, 3, p.z, camera, w, h);
    },
    close() {
      el.remove();
    },
  };
}
