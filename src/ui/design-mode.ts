// =====================================================================
// design-mode.ts — make your home yours (Peter, 2026-10-27: "Lagos Life
// level house customisation is a must… wow me").
//
// A panel along the bottom with tabs:
//   🛋️ Buy      every piece by category, with a little 3D picture: tap to
//               buy, it appears in the room and you drag it into place
//   🎨 Walls    paint or paper a whole room, or one accent wall (tap it)
//   🟫 Floors   planks, chevron, marble, terrazzo, tiles, carpet… per room
//   💡 Lights   lamps on after dark / always / off, and see it at night
//   ✨ Styles   one tap: a whole look for every room
//   📦 Storage  what you own that isn't out
// Tap a piece while designing to move it, recolour it (main colour,
// frame, bulb colour) or put it away. The camera buttons swing the view
// round the room or look straight down.
//
// The 3D work (picking, painting, lights) is done by the home itself
// (world/home-interior.ts); this file is only the menu.
// =====================================================================

import type * as THREE from 'three';
import { html, root, toast } from './dom.ts';
import { esc, money } from '../core/format.ts';
import { CATEGORIES, FURNITURE, FURNITURE_QUALITY, type Category } from '../data/furniture.ts';
import { FLOORS, LIGHT_COLORS, PALETTE, PRESETS, WALLS, floorStyle, parseStyle, roomKind, styleKey, wallStyle, type HomeStyle } from '../data/home-style.ts';
import type { HomeInterior } from '../world/home-interior.ts';
import type { InteriorView } from '../world/interior-view.ts';
import { swatchURL } from '../render/home-surfaces.ts';
import { cancelThumbs, furnitureThumb } from '../render/furniture-thumbs.ts';
import { sfx } from './audio.ts';

export interface DesignHost {
  home: () => HomeInterior | null;
  /** Cash on hand (cents). */
  cash: () => number;
  /** Take money for something; false (and a toast) if you can't afford it. */
  pay: (cents: number, what: string) => boolean;
  /** Save the home's furniture and style. */
  save: () => void;
  /** Buy a piece and bring it into the room (then you drag it into place). */
  buyAndPlace: (item: string) => void;
  /** Pick a piece up to move it. */
  move: (uid: string) => void;
  /** Put a piece away into storage. */
  store: (uid: string) => void;
  /** Bring a stored piece out. */
  placeStored: (item: string) => void;
  storage: () => string[];
  view: InteriorView;
  /** A ray from the camera through a screen point. */
  ray: (x: number, y: number) => THREE.Ray;
  /** The piece under a screen point (its uid), if any. */
  pieceAt: (x: number, y: number) => string | null;
  /** The room the player is standing in. */
  playerRoom: () => number;
  onClose: () => void;
}

type Tab = 'buy' | 'walls' | 'floors' | 'lights' | 'styles' | 'storage' | 'piece';

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'buy', label: 'Buy', emoji: '🛋️' },
  { id: 'walls', label: 'Walls', emoji: '🎨' },
  { id: 'floors', label: 'Floors', emoji: '🟫' },
  { id: 'lights', label: 'Lights', emoji: '💡' },
  { id: 'styles', label: 'Styles', emoji: '✨' },
  { id: 'storage', label: 'Storage', emoji: '📦' },
];

/** Room area in square metres (floors are priced by the metre). */
const area = (r: [number, number, number, number]) => Math.max(1, (r[2] - r[0]) * (r[3] - r[1]));

export class DesignMode {
  private el: HTMLElement;
  private body: HTMLElement;
  private tab: Tab = 'buy';
  private cat: Category = 'seating';
  /** What the Walls / Floors tabs change: a room, or one wall face. */
  private room = 0;
  private wallKey: string | null = null;
  /** The piece being recoloured (Piece tab). */
  private piece: string | null = null;
  private night = false;
  private hidden = false;

  constructor(private host: DesignHost) {
    const home = host.home();
    this.room = Math.max(0, host.playerRoom());
    this.el = html(`
      <div class="design" role="dialog" aria-label="Design your home">
        <div class="design-cam">
          <button class="cam-btn" data-cam="left" aria-label="Swing the view left">⟲</button>
          <button class="cam-btn" data-cam="right" aria-label="Swing the view right">⟳</button>
          <button class="cam-btn" data-cam="top" aria-label="Look from above">⬇️</button>
          <button class="cam-btn" data-cam="night" aria-label="See it at night">🌙</button>
        </div>
        <section class="design-panel">
          <div class="design-head">
            <nav class="design-tabs" role="tablist">${TABS.map((t) => `<button role="tab" data-tab="${t.id}"><span aria-hidden="true">${t.emoji}</span>${t.label}</button>`).join('')}</nav>
            <button class="design-done" data-done aria-label="Done designing">✓</button>
          </div>
          <div class="design-body"></div>
        </section>
      </div>`);
    this.body = this.el.querySelector('.design-body')!;
    root().appendChild(this.el);
    requestAnimationFrame(() => this.el.classList.add('open'));
    this.el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => this.show(b.dataset.tab as Tab)));
    this.el.querySelector('[data-done]')!.addEventListener('click', () => this.close());
    this.el.querySelectorAll<HTMLElement>('[data-cam]').forEach((b) =>
      b.addEventListener('click', () => {
        sfx.tap();
        const k = b.dataset.cam;
        if (k === 'left') host.view.rotate(Math.PI / 4);
        else if (k === 'right') host.view.rotate(-Math.PI / 4);
        else if (k === 'top') {
          host.view.setTop(!host.view.isTop);
          b.classList.toggle('on', host.view.isTop);
        } else if (k === 'night') {
          this.night = !this.night;
          b.classList.toggle('on', this.night);
          b.textContent = this.night ? '☀️' : '🌙';
          host.home()?.previewHour(this.night ? 22 : 13);
        }
      }),
    );
    void home;
    this.show('buy');
  }

  /** Hide the panel while a piece is being moved (the move bar takes over), and back. */
  suspend(on: boolean): void {
    this.hidden = on;
    this.el.classList.toggle('suspended', on);
  }

  get open(): boolean {
    return !this.hidden;
  }

  /** A tap on the room while designing. Returns true when it was used here. */
  onTap(x: number, y: number): boolean {
    if (this.hidden) return false;
    const home = this.host.home();
    if (!home) return false;
    if (this.tab === 'walls' || this.tab === 'floors') {
      const hit = home.pickSurface(this.host.ray(x, y));
      if (!hit) return true;
      sfx.tap();
      this.room = hit.room;
      this.wallKey = hit.kind === 'wall' && this.tab === 'walls' ? hit.key : null;
      this.render();
      return true;
    }
    const uid = this.host.pieceAt(x, y);
    if (uid) {
      sfx.tap();
      this.piece = uid;
      this.show('piece');
      return true;
    }
    return true; // designing: taps never walk you around
  }

  close(): void {
    cancelThumbs();
    this.host.home()?.previewHour(null);
    this.host.view.setTop(false);
    this.el.classList.remove('open');
    window.setTimeout(() => this.el.remove(), 300);
    this.host.save();
    this.host.onClose();
  }

  // ------------------------------------------------------------------ tabs

  private show(tab: Tab): void {
    this.tab = tab;
    this.el.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab || (tab === 'piece' && false))));
    this.render();
  }

  private render(): void {
    const home = this.host.home();
    if (!home) return;
    const b = this.body;
    if (this.tab === 'buy') b.innerHTML = this.buyHtml();
    else if (this.tab === 'walls') b.innerHTML = this.wallsHtml(home);
    else if (this.tab === 'floors') b.innerHTML = this.floorsHtml(home);
    else if (this.tab === 'lights') b.innerHTML = this.lightsHtml(home);
    else if (this.tab === 'styles') b.innerHTML = this.stylesHtml(home);
    else if (this.tab === 'storage') b.innerHTML = this.storageHtml();
    else b.innerHTML = this.pieceHtml(home);
    this.wire(home);
    // Little 3D pictures, drawn as they're needed.
    b.querySelectorAll<HTMLImageElement>('img[data-thumb]').forEach((img) => {
      void furnitureThumb(img.dataset.thumb!).then((url) => {
        if (url && img.isConnected) {
          img.src = url;
          img.classList.add('ready');
        }
      });
    });
  }

  private buyHtml(): string {
    const cash = this.host.cash();
    const list = FURNITURE.all().filter((d) => d.category === this.cat && d.price > 0).sort((a, c) => a.price - c.price);
    return `
      <div class="chips" role="tablist">${CATEGORIES.map((c) => `<button data-cat="${c.id}" aria-selected="${c.id === this.cat}"><span aria-hidden="true">${c.emoji}</span>${c.name}</button>`).join('')}</div>
      <div class="buy-grid">${list.map((d) => `
        <button class="buy-card${cash < d.price ? ' poor' : ''}" data-buy="${d.id}" aria-label="${esc(d.name)}, ${money(d.price)}">
          <span class="thumb"><img data-thumb="${d.id}" alt=""><i aria-hidden="true">${d.emoji}</i></span>
          <span class="nm">${esc(d.name)}</span>
          <span class="pr">${money(d.price)}${d.quality && d.quality !== 'basic' ? ` · ${FURNITURE_QUALITY[d.quality].label}` : ''}</span>
        </button>`).join('')}</div>`;
  }

  /** Who the Walls / Floors tab is changing, in words. */
  private targetLine(home: HomeInterior, what: 'walls' | 'floors'): string {
    const r = home.layout.rooms[this.room];
    const name = r ? r.label : 'this room';
    if (what === 'walls' && this.wallKey) return `🎯 One wall in the <b>${esc(name)}</b> <button class="link" data-whole>whole room instead</button>`;
    return `🎯 The <b>${esc(name)}</b> · <span class="hint">tap ${what === 'walls' ? 'a wall' : 'a floor'} to choose</span>`;
  }

  private wallsHtml(home: HomeInterior): string {
    const cur = this.wallKey ? home.style.faces?.[this.wallKey] ?? this.roomWall(home) : this.roomWall(home);
    const { id, color } = parseStyle(cur);
    const def = wallStyle(id);
    const price = this.wallPrice(id);
    return `
      <p class="design-target">${this.targetLine(home, 'walls')}</p>
      <div class="dz-swatches">${WALLS.map((w) => `<button class="dz-swatch${w.id === id ? ' on' : ''}" data-wall="${w.id}" aria-label="${esc(w.name)}"><img src="${swatchURL('wall', styleKey(w.id, w.tint ? (w.id === id ? color : undefined) ?? w.color : undefined))}" alt=""><span>${esc(w.name)}</span></button>`).join('')}</div>
      ${def?.tint ? `<div class="palette" aria-label="Colour">${PALETTE.map((c) => `<button class="dot${c === color ? ' on' : ''}" data-wallcol="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>` : ''}
      <p class="design-note">${money(price)} ${this.wallKey ? 'for this wall' : 'for the room'} · changing it again costs the same</p>`;
  }

  private floorsHtml(home: HomeInterior): string {
    const cur = this.roomFloor(home);
    const { id, color } = parseStyle(cur);
    const def = floorStyle(id);
    const r = home.layout.rooms[this.room];
    return `
      <p class="design-target">${this.targetLine(home, 'floors')}</p>
      <div class="dz-swatches">${FLOORS.map((f) => `<button class="dz-swatch${f.id === id ? ' on' : ''}" data-floor="${f.id}" aria-label="${esc(f.name)}"><img src="${swatchURL('floor', styleKey(f.id, f.tint ? (f.id === id ? color : undefined) ?? f.color : undefined))}" alt=""><span>${esc(f.name)}<small>${money(Math.round((f.price * (r ? area(r.rect) : 10)) / 100) * 100)}</small></span></button>`).join('')}</div>
      ${def?.tint ? `<div class="palette" aria-label="Colour">${PALETTE.map((c) => `<button class="dot${c === color ? ' on' : ''}" data-floorcol="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>` : ''}`;
  }

  private lightsHtml(home: HomeInterior): string {
    const mode = home.style.lights ?? 'auto';
    const lamps = home.items.filter((i) => FURNITURE.get(i.item)?.light).length;
    return `
      <div class="seg" role="radiogroup" aria-label="Lamps">${(['auto', 'on', 'off'] as const).map((m) => `<button role="radio" aria-checked="${m === mode}" data-lights="${m}">${{ auto: '🌗 After dark', on: '💡 Always on', off: '🌑 Off' }[m]}</button>`).join('')}</div>
      <p class="design-note">${lamps ? `${lamps} light${lamps > 1 ? 's' : ''} in your home.` : 'No lamps yet.'} Lamps glow, light the floor and wash the walls after dark. Tap a lamp to change its bulb colour.</p>
      <button class="btn block" data-night>${this.night ? '☀️ Back to daytime' : '🌙 See it at night'}</button>
      <button class="btn primary block" data-buylights style="margin-top:8px">💡 Shop lights</button>`;
  }

  private stylesHtml(home: HomeInterior): string {
    return `<div class="preset-grid">${PRESETS.map((p) => {
      const cost = this.presetCost(home, p.id);
      return `<button class="preset" data-preset="${p.id}">
        <span class="pv">${(['living', 'bed', 'kitchen', 'bath'] as const).map((k) => `<img src="${swatchURL('wall', p[k].wall!, 40)}" alt=""><img src="${swatchURL('floor', p[k].floor!, 40)}" alt="">`).slice(0, 2).join('')}<i style="--a:${p.fabric};--b:${p.frame}"></i></span>
        <span class="nm">${p.emoji} ${esc(p.name)}</span><span class="pr">${money(cost)}</span></button>`;
    }).join('')}</div><p class="design-note">Every room's floor and walls, plus your sofas and beds recoloured to match. Your furniture stays where it is.</p>`;
  }

  private storageHtml(): string {
    const counts = new Map<string, number>();
    for (const id of this.host.storage()) counts.set(id, (counts.get(id) ?? 0) + 1);
    if (!counts.size) return '<p class="design-note">Nothing in storage. Tap a piece and choose 📦 Put away to keep it here.</p>';
    return `<div class="buy-grid">${[...counts].map(([id, n]) => {
      const d = FURNITURE.get(id);
      return d ? `<button class="buy-card" data-stored="${id}"><span class="thumb"><img data-thumb="${id}" alt=""><i aria-hidden="true">${d.emoji}</i></span><span class="nm">${esc(d.name)}</span><span class="pr">${n > 1 ? `×${n} · ` : ''}Place</span></button>` : '';
    }).join('')}</div>`;
  }

  private pieceHtml(home: HomeInterior): string {
    const it = home.items.find((i) => i.uid === this.piece);
    const d = it && FURNITURE.get(it.item);
    if (!it || !d) return '<p class="design-note">Tap a piece in the room.</p>';
    const slots = home.recolorable(it.item);
    const rows: string[] = [];
    if (slots.includes('a')) rows.push(`<div class="pal-row"><span>${d.light ? 'Shade' : 'Main'}</span><div class="palette">${PALETTE.map((c) => `<button class="dot${c === it.a ? ' on' : ''}" data-pa="${c}" style="--c:${c}" aria-label="Main colour ${c}"></button>`).join('')}</div></div>`);
    if (slots.includes('b')) rows.push(`<div class="pal-row"><span>Frame</span><div class="palette">${PALETTE.map((c) => `<button class="dot${c === it.b ? ' on' : ''}" data-pb="${c}" style="--c:${c}" aria-label="Frame colour ${c}"></button>`).join('')}</div></div>`);
    if (slots.includes('lc')) rows.push(`<div class="pal-row"><span>Bulb</span><div class="palette">${LIGHT_COLORS.filter((l) => d.light?.colorful || ['warm', 'soft', 'cool', 'amber'].includes(l.id)).map((l) => `<button class="dot glow${l.color === it.lc ? ' on' : ''}" data-plc="${l.color}" style="--c:${l.color}" aria-label="${l.name}"></button>`).join('')}</div></div>`);
    return `
      <div class="piece-head"><span class="pe" aria-hidden="true">${d.emoji}</span><b>${esc(d.name)}</b>
        <span class="piece-acts">${home.movable && !d.fixed ? '<button class="btn" data-pmove>✋ Move</button><button class="btn" data-pstore>📦 Put away</button>' : ''}</span></div>
      ${rows.length ? rows.join('') + '<button class="link" data-preset-colours>Reset colours</button>' : '<p class="design-note">This one comes in one finish.</p>'}`;
  }

  // ------------------------------------------------------------------ actions

  private wire(home: HomeInterior): void {
    const b = this.body;
    const on = (sel: string, fn: (el: HTMLElement) => void) => b.querySelectorAll<HTMLElement>(sel).forEach((el) => el.addEventListener('click', () => fn(el)));
    on('[data-cat]', (el) => {
      this.cat = el.dataset.cat as Category;
      this.render();
    });
    on('[data-buy]', (el) => this.host.buyAndPlace(el.dataset.buy!));
    on('[data-stored]', (el) => this.host.placeStored(el.dataset.stored!));
    on('[data-whole]', () => {
      this.wallKey = null;
      this.render();
    });
    on('[data-wall]', (el) => {
      const def = wallStyle(el.dataset.wall!)!;
      const cur = parseStyle(this.wallKey ? home.style.faces?.[this.wallKey] ?? this.roomWall(home) : this.roomWall(home));
      this.applyWall(home, styleKey(def.id, def.tint ? (cur.id === def.id ? cur.color : undefined) ?? def.color : undefined));
    });
    on('[data-wallcol]', (el) => {
      const cur = parseStyle(this.wallKey ? home.style.faces?.[this.wallKey] ?? this.roomWall(home) : this.roomWall(home));
      this.applyWall(home, styleKey(cur.id || 'paint', el.dataset.wallcol));
    });
    on('[data-floor]', (el) => {
      const def = floorStyle(el.dataset.floor!)!;
      const cur = parseStyle(this.roomFloor(home));
      this.applyFloor(home, styleKey(def.id, def.tint ? (cur.id === def.id ? cur.color : undefined) ?? def.color : undefined));
    });
    on('[data-floorcol]', (el) => {
      const cur = parseStyle(this.roomFloor(home));
      this.applyFloor(home, styleKey(cur.id, el.dataset.floorcol));
    });
    on('[data-lights]', (el) => {
      home.setLights(el.dataset.lights as 'auto' | 'on' | 'off');
      this.host.save();
      this.render();
    });
    on('[data-night]', () => {
      this.night = !this.night;
      home.previewHour(this.night ? 22 : 13);
      const nb = this.el.querySelector<HTMLElement>('[data-cam="night"]')!;
      nb.classList.toggle('on', this.night);
      nb.textContent = this.night ? '☀️' : '🌙';
      this.render();
    });
    on('[data-buylights]', () => {
      this.cat = 'lights';
      this.show('buy');
    });
    on('[data-preset]', (el) => this.applyPreset(home, el.dataset.preset!));
    on('[data-pmove]', () => this.host.move(this.piece!));
    on('[data-pstore]', () => {
      this.host.store(this.piece!);
      this.piece = null;
      this.show('buy');
    });
    const recolour = (k: 'a' | 'b' | 'lc', v: string | undefined) => {
      if (!this.piece) return;
      sfx.tap();
      home.setFinish(this.piece, { [k]: v });
      this.host.save();
      this.render();
    };
    on('[data-pa]', (el) => recolour('a', el.dataset.pa));
    on('[data-pb]', (el) => recolour('b', el.dataset.pb));
    on('[data-plc]', (el) => recolour('lc', el.dataset.plc));
    on('[data-preset-colours]', () => {
      if (!this.piece) return;
      home.setFinish(this.piece, { a: undefined, b: undefined, lc: undefined });
      this.host.save();
      this.render();
    });
  }

  private roomWall(home: HomeInterior): string {
    return home.roomWall(this.room);
  }
  private roomFloor(home: HomeInterior): string {
    return home.roomFloor(this.room);
  }
  private wallPrice(id: string): number {
    const p = wallStyle(id)?.price ?? 5_000;
    return this.wallKey ? Math.round(p * 0.4) : p;
  }

  private applyWall(home: HomeInterior, s: string): void {
    const id = parseStyle(s).id;
    if (!this.host.pay(this.wallPrice(id), 'walls')) return;
    const st: HomeStyle = structuredClone(home.style);
    if (this.wallKey) (st.faces ??= {})[this.wallKey] = s;
    else {
      (st.rooms ??= {})[this.room] = { ...(st.rooms[this.room] ?? {}), wall: s };
      // A new room colour replaces accent walls in that room.
      const faces = st.faces ?? {};
      for (const k of Object.keys(faces)) if (home.faceRoom(k) === this.room) delete faces[k];
    }
    home.setStyle(st);
    sfx.cash();
    this.host.save();
    this.render();
  }

  private applyFloor(home: HomeInterior, s: string): void {
    const r = home.layout.rooms[this.room];
    if (!r) return;
    const price = Math.round(((floorStyle(parseStyle(s).id)?.price ?? 3_000) * area(r.rect)) / 100) * 100;
    if (!this.host.pay(Math.round(price), 'the floor')) return;
    const st: HomeStyle = structuredClone(home.style);
    (st.rooms ??= {})[this.room] = { ...(st.rooms[this.room] ?? {}), floor: s };
    home.setStyle(st);
    sfx.cash();
    this.host.save();
    this.render();
  }

  private presetCost(home: HomeInterior, id: string): number {
    const p = PRESETS.find((x) => x.id === id)!;
    let c = 0;
    home.layout.rooms.forEach((r) => {
      const k = p[roomKind(r.label)];
      c += (floorStyle(parseStyle(k.floor).id)?.price ?? 3_000) * area(r.rect) * 0.8 + (wallStyle(parseStyle(k.wall).id)?.price ?? 5_000) * 0.8;
    });
    return Math.round(c / 100) * 100;
  }

  private applyPreset(home: HomeInterior, id: string): void {
    const p = PRESETS.find((x) => x.id === id);
    if (!p || !this.host.pay(this.presetCost(home, id), `the ${p.name} look`)) return;
    const st: HomeStyle = { ...structuredClone(home.style), rooms: {}, faces: {} };
    home.layout.rooms.forEach((r, i) => {
      st.rooms![i] = { ...p[roomKind(r.label)] };
    });
    home.setStyle(st);
    // Soft furnishings and frames to match.
    for (const it of home.items) {
      const d = FURNITURE.get(it.item);
      if (!d || d.fixed) continue;
      const slots = home.recolorable(it.item);
      const patch: { a?: string; b?: string; lc?: string } = {};
      if (slots.includes('a') && (d.kind === 'couch' || d.kind === 'chair' || d.kind === 'bed' || d.kind === 'rug')) patch.a = p.fabric;
      if (slots.includes('b')) patch.b = p.frame;
      if (slots.includes('lc')) patch.lc = LIGHT_COLORS.find((l) => l.id === p.light)?.color;
      if (Object.keys(patch).length) home.setFinish(it.uid, patch);
    }
    sfx.cheer();
    toast(`${p.emoji} ${p.name}: done`, { icon: '✨', tone: 'good', ms: 2200 });
    this.host.save();
  }
}
