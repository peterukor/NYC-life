// =====================================================================
// dom.ts — small helpers for building the interface with plain HTML.
//
// No UI framework: the game's menus are simple, and skipping React
// keeps the download small and fast on cheap phones. Every helper here
// returns a "close" function so screens clean up after themselves.
// =====================================================================

import { esc } from '../core/format.ts';
import { sfx } from './audio.ts';

export const root = (): HTMLElement => document.getElementById('ui')!;

/** Turn an HTML string into a real element. */
export function html<T extends HTMLElement = HTMLElement>(markup: string): T {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as T;
}

/** Short pop-up message at the top of the screen. */
export function toast(text: string, opts: { icon?: string; tone?: 'good' | 'bad' | 'info'; ms?: number } = {}): void {
  let box = root().querySelector<HTMLElement>('.toasts');
  if (!box) {
    box = html('<div class="toasts" role="status" aria-live="polite"></div>');
    root().appendChild(box);
  }
  const el = html(`<div class="toast ${opts.tone ?? ''}">${opts.icon ? `<span>${opts.icon}</span>` : ''}<span>${esc(text)}</span></div>`);
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild!.remove();
  window.setTimeout(() => {
    el.classList.add('leaving');
    window.setTimeout(() => el.remove(), 260);
  }, opts.ms ?? 2800);
}

export interface Sheet {
  el: HTMLElement;
  body: HTMLElement;
  close: () => void;
}

let openSheetClose: (() => void) | null = null;

/** Bottom sheet that slides up. Only one is open at a time. */
export function openSheet(opts: { emoji: string; title: string; sub?: string; body: string; onClose?: () => void; className?: string }): Sheet {
  openSheetClose?.();
  const backdrop = html('<div class="backdrop"></div>');
  const el = html(`
    <section class="sheet${opts.className ? ` ${opts.className}` : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.title)}">
      <div class="sheet-head">
        <div class="emoji" aria-hidden="true">${opts.emoji}</div>
        <div><h2>${esc(opts.title)}</h2>${opts.sub ? `<p>${opts.sub}</p>` : ''}</div>
        <button class="close" aria-label="Close">✕</button>
      </div>
      <div class="sheet-body">${opts.body}</div>
    </section>`);
  root().append(backdrop, el);
  sfx.open();
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    el.classList.add('open');
  });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (openSheetClose === close) openSheetClose = null;
    backdrop.classList.remove('open');
    el.classList.remove('open');
    window.setTimeout(() => {
      backdrop.remove();
      el.remove();
    }, 320);
    opts.onClose?.();
  };
  backdrop.addEventListener('click', close);
  el.querySelector('.close')!.addEventListener('click', close);
  openSheetClose = close;
  return { el, body: el.querySelector('.sheet-body')!, close };
}

export function closeSheet(): void {
  openSheetClose?.();
}

export function isSheetOpen(): boolean {
  return openSheetClose !== null;
}

/** A centred dialog (used for random events). */
export function openModal(markup: string): { el: HTMLElement; close: () => void } {
  const wrap = html(`<div class="modal-wrap"><div class="modal" role="dialog" aria-modal="true">${markup}</div></div>`);
  root().appendChild(wrap);
  return { el: wrap.querySelector('.modal')!, close: () => wrap.remove() };
}

/** Progress bar for actions in progress. Returns an updater and a remover. */
export function progressBar(label: string, opts: { skipLabel?: string; onSkip?: () => void; compact?: boolean } = {}): { set: (f: number, label?: string) => void; remove: () => void } {
  const el = html(`<div class="progress${opts.compact ? ' compact' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span class="lbl">${esc(label)}</span><div class="bar"><i></i></div>${opts.onSkip ? `<button class="btn skip">${esc(opts.skipLabel ?? 'Skip')}</button>` : ''}</div>`);
  root().appendChild(el);
  if (opts.onSkip) el.querySelector('.skip')!.addEventListener('click', () => opts.onSkip!());
  const bar = el.querySelector<HTMLElement>('.bar i')!;
  const lbl = el.querySelector<HTMLElement>('.lbl')!;
  return {
    set(f, l) {
      bar.style.width = `${Math.round(Math.min(1, Math.max(0, f)) * 100)}%`;
      el.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      if (l) lbl.textContent = l;
    },
    remove: () => el.remove(),
  };
}

/** Black fade for travel and scene changes. */
export function fade(on: boolean, text = '', sub = '', ad?: FadeAd): void {
  let el = root().querySelector<HTMLElement>('.fade');
  if (!el) {
    el = html('<div class="fade" aria-live="polite"></div>');
    root().appendChild(el);
  }
  // Travel loading screens are an ad (Peter, 2026-10-14): a big card, the trip underneath.
  const card = ad
    ? `<div class="fade-ad" style="--bg:${ad.bg};--fg:${ad.fg};--ac:${ad.accent};--ad-s:${ad.seconds ?? 2}s"><em class="fade-ad-tag">Ad</em><strong>${esc(ad.brand)}</strong><span>${esc(ad.line)}</span><i class="fade-ad-bar"></i></div>`
    : '';
  if (on || !el.classList.contains('on')) el.innerHTML = text || ad ? `${card}<div>${esc(text)}${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>` : '';
  el.classList.toggle('with-ad', !!ad && on);
  el.classList.toggle('on', on);
}

/** What a loading-screen ad needs (render/textures.ts AdCreative fits). */
export interface FadeAd {
  brand: string;
  line: string;
  bg: string;
  fg: string;
  accent: string;
  /** How long the ad stays up (its progress bar fills in this time). */
  seconds?: number;
}

/** Attach one click handler to a container that fires for any [data-act] button inside. */
export function onAct(container: HTMLElement, fn: (act: string, el: HTMLElement) => void): void {
  container.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (t && container.contains(t) && t.getAttribute('aria-disabled') !== 'true') fn(t.dataset.act!, t);
  });
}

export const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
