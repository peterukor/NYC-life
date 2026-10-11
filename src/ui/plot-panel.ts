// =====================================================================
// plot-panel.ts — the "rent this" sheet for plots (data/plots.ts):
//   • AD BLOCK: pick units (1–4) on a little map of the block, pick
//     weeks (1–26), add your picture, see the total.
//   • HOME LOT: pick a house type and a term (1, 3 or 6 months).
//   • ISLAND:  6 months at a fixed price, plus a message to the admin
//     team about what you want built there.
// Prices are real US dollars. Payments aren't live yet: "Rent" saves a
// request (sim/plot-requests.ts) and says so.
// =====================================================================

import { esc } from '../core/format.ts';
import { AD_MAX_WEEKS, AD_PRICES, AD_UNITS, adPrice, HOME_TERMS, homePrice, HOMES_PER_BOROUGH, HOUSES, neighbourPlots, type HouseId, type Plot } from '../data/plots.ts';
import { homeRequestsIn, saveRequest } from '../sim/plot-requests.ts';
import { openSheet, toast } from './dom.ts';

const usd = (v: number) => `$${v.toFixed(2)}`;
const TIER_LABEL: Record<Plot['tier'], string> = { harlem: 'Harlem', uptown: 'Uptown', midtown: 'Midtown', downtown: 'Downtown', brooklyn: 'Brooklyn' };
const UNIT_NAMES = ['North-west', 'North-east', 'South-west', 'South-east'];

export function openPlotPanel(plot: Plot, focusUnit = -1): void {
  if (plot.kind === 'ad') return adPanel(plot, focusUnit);
  if (plot.kind === 'home') return homePanel(plot);
  return islandPanel(plot);
}

const soon = () => toast('Payments open soon. Your request is saved, and you’ll be first in line.', { icon: '💳', tone: 'info', ms: 4200 });
const auctionNote = (p: Plot) => (p.auction ? '<p class="plot-note auction">🔨 This plot is going to auction. Bidding opens soon.</p>' : '');

function adPanel(p: Plot, focusUnit: number): void {
  const price = AD_PRICES[p.tier];
  const picked = new Set<number>(focusUnit >= 0 ? [focusUnit] : []);
  let weeks = 4;
  let hasImage = false;
  const mates = neighbourPlots(p);
  let merge: Plot | null = null;
  const sheet = openSheet({
    emoji: '📢',
    title: 'Ad space',
    sub: `${esc(p.name)} · ${TIER_LABEL[p.tier]}`,
    body: `
      <p class="blurb">Four giant billboards on this block. Rent one, or all four. ${usd(price.unit)} a unit, or ${usd(price.block)} for the whole block, per week.</p>
      ${auctionNote(p)}
      <div class="plot-units" role="group" aria-label="Billboard units">
        ${Array.from({ length: AD_UNITS }, (_, i) => `<button class="plot-unit" data-u="${i}" aria-pressed="false"><b>${i + 1}</b><small>${UNIT_NAMES[i]}</small></button>`).join('')}
      </div>
      <div class="row"><button class="btn" data-all>Whole block</button><span class="plot-hint">Tap the units you want</span></div>
      ${mates.map((m) => `<button class="plot-merge" data-merge="${esc(m.id)}" aria-pressed="false">🔗 <b>Merge with the block next door</b><small>${esc(m.name)} · rent both whole blocks and they become ONE giant billboard</small></button>`).join('')}
      <label class="plot-field">For <b data-weeks>${weeks} weeks</b><input type="range" min="1" max="${AD_MAX_WEEKS}" value="${weeks}" data-range></label>
      <label class="plot-field">Your ad picture<input type="file" accept="image/*" data-file></label>
      <img class="plot-preview" alt="" hidden>
      <p class="plot-note">Every ad is checked by our team before it goes live. Longest rental: 6 months.</p>
      <button class="btn primary plot-go" data-go disabled>Pick a unit</button>
      <p class="plot-id">Plot ${esc(p.id)}</p>`,
  });
  const b = sheet.body;
  const go = b.querySelector<HTMLButtonElement>('[data-go]')!;
  const refresh = () => {
    b.querySelectorAll<HTMLElement>('.plot-unit').forEach((el) => el.setAttribute('aria-pressed', String(picked.has(Number(el.dataset.u)))));
    b.querySelector('[data-weeks]')!.textContent = `${weeks} week${weeks > 1 ? 's' : ''}`;
    b.querySelectorAll<HTMLElement>('[data-merge]').forEach((el) => el.setAttribute('aria-pressed', String(merge?.id === el.dataset.merge)));
    const total = adPrice(p.tier, picked.size, weeks) + (merge ? adPrice(merge.tier, AD_UNITS, weeks) : 0);
    go.disabled = !picked.size || !!p.auction || !!merge?.auction;
    go.textContent = p.auction ? 'Auction opens soon' : merge ? `Rent both blocks, merged · ${usd(total)}` : picked.size ? `Rent ${picked.size === AD_UNITS ? 'whole block' : `${picked.size} unit${picked.size > 1 ? 's' : ''}`} · ${usd(total)}` : 'Pick a unit';
  };
  b.querySelectorAll<HTMLElement>('.plot-unit').forEach((el) =>
    el.addEventListener('click', () => {
      const u = Number(el.dataset.u);
      if (picked.has(u)) picked.delete(u);
      else picked.add(u);
      if (picked.size < AD_UNITS) merge = null; // merging needs both whole blocks
      refresh();
    }),
  );
  b.querySelector('[data-all]')!.addEventListener('click', () => {
    for (let i = 0; i < AD_UNITS; i++) picked.add(i);
    refresh();
  });
  b.querySelectorAll<HTMLElement>('[data-merge]').forEach((el) =>
    el.addEventListener('click', () => {
      merge = merge?.id === el.dataset.merge ? null : (mates.find((m) => m.id === el.dataset.merge) ?? null);
      if (merge) for (let i = 0; i < AD_UNITS; i++) picked.add(i);
      refresh();
    }),
  );
  b.querySelector<HTMLInputElement>('[data-range]')!.addEventListener('input', (e) => {
    weeks = Number((e.target as HTMLInputElement).value);
    refresh();
  });
  b.querySelector<HTMLInputElement>('[data-file]')!.addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    const img = b.querySelector<HTMLImageElement>('.plot-preview')!;
    if (!f) return;
    hasImage = true;
    img.src = URL.createObjectURL(f);
    img.hidden = false;
  });
  go.addEventListener('click', () => {
    saveRequest({ plotId: p.id, kind: 'ad', borough: p.borough, units: [...picked].sort(), weeks, hasImage, mergeWith: merge?.id, totalUsd: adPrice(p.tier, picked.size, weeks) + (merge ? adPrice(merge.tier, AD_UNITS, weeks) : 0), at: Date.now() });
    sheet.close();
    soon();
  });
  refresh();
}

function homePanel(p: Plot): void {
  let house: HouseId = 'townhouse';
  let months = 6;
  const used = homeRequestsIn(p.borough);
  const full = used >= HOMES_PER_BOROUGH;
  const mates = neighbourPlots(p);
  let merge: Plot | null = null;
  const total = () => homePrice(p.tier, house, months) * (merge ? 2 : 1);
  const sheet = openSheet({
    emoji: '🏡',
    title: 'Empty lot for rent',
    sub: `${esc(p.name)} · ${TIER_LABEL[p.tier]}`,
    body: `
      <p class="blurb">Pick a house and we’ll build it here. It’s yours to live in for as long as you rent, up to 6 months, then you can renew.</p>
      ${auctionNote(p)}
      <div class="plot-houses">
        ${HOUSES.map((h) => `<button class="plot-house" data-h="${h.id}" aria-pressed="false"><span>${h.emoji}</span><b>${esc(h.name)}</b><small>${esc(h.blurb)}</small><em data-hp="${h.id}"></em></button>`).join('')}
      </div>
      ${mates.map((m) => `<button class="plot-merge" data-merge="${esc(m.id)}" aria-pressed="false">🔗 <b>Merge with the lot next door</b><small>${esc(m.name)} · rent both and build one big estate across them (2× the price)</small></button>`).join('')}
      <div class="row plot-terms">${HOME_TERMS.map((t) => `<button class="btn" data-m="${t.months}">${t.months} month${t.months > 1 ? 's' : ''}</button>`).join('')}</div>
      <p class="plot-note">${full ? `You already have ${HOMES_PER_BOROUGH} homes in this borough (the most allowed).` : `You can rent up to ${HOMES_PER_BOROUGH} homes per borough (${used} so far).`}</p>
      <button class="btn primary plot-go" data-go></button>
      <p class="plot-id">Plot ${esc(p.id)}</p>`,
  });
  const b = sheet.body;
  const go = b.querySelector<HTMLButtonElement>('[data-go]')!;
  const refresh = () => {
    b.querySelectorAll<HTMLElement>('.plot-house').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.h === house)));
    b.querySelectorAll<HTMLElement>('[data-merge]').forEach((el) =>
    el.addEventListener('click', () => {
      merge = merge?.id === el.dataset.merge ? null : (mates.find((m) => m.id === el.dataset.merge) ?? null);
      refresh();
    }),
  );
  b.querySelectorAll<HTMLElement>('[data-m]').forEach((el) => el.classList.toggle('primary', Number(el.dataset.m) === months));
    for (const h of HOUSES) b.querySelector(`[data-hp="${h.id}"]`)!.textContent = `${usd(homePrice(p.tier, h.id, months))} / ${months} mo`;
    b.querySelectorAll<HTMLElement>('[data-merge]').forEach((el) => el.setAttribute('aria-pressed', String(merge?.id === el.dataset.merge)));
    go.disabled = full || !!p.auction || !!merge?.auction;
    go.textContent = p.auction ? 'Auction opens soon' : `Rent ${merge ? 'both lots, merged, ' : ''}for ${months} month${months > 1 ? 's' : ''} · ${usd(total())}`;
  };
  b.querySelectorAll<HTMLElement>('.plot-house').forEach((el) =>
    el.addEventListener('click', () => {
      house = el.dataset.h as HouseId;
      refresh();
    }),
  );
  b.querySelectorAll<HTMLElement>('[data-merge]').forEach((el) =>
    el.addEventListener('click', () => {
      merge = merge?.id === el.dataset.merge ? null : (mates.find((m) => m.id === el.dataset.merge) ?? null);
      refresh();
    }),
  );
  b.querySelectorAll<HTMLElement>('[data-m]').forEach((el) =>
    el.addEventListener('click', () => {
      months = Number(el.dataset.m);
      refresh();
    }),
  );
  go.addEventListener('click', () => {
    saveRequest({ plotId: p.id, kind: 'home', borough: p.borough, house, months, mergeWith: merge?.id, totalUsd: total(), at: Date.now() });
    sheet.close();
    soon();
  });
  refresh();
}

function islandPanel(p: Plot): void {
  const price = p.islandPrice ?? 0;
  const sheet = openSheet({
    emoji: '🏝️',
    title: p.name,
    sub: 'A whole private island · for rent',
    body: `
      <p class="blurb">Rent the entire island for 6 months. Tell us what you want on it (a mansion, a giant ad, a festival ground) and our team will build it for you.</p>
      ${auctionNote(p)}
      <label class="plot-field">What should we build?<textarea rows="4" maxlength="600" placeholder="e.g. A beach house with a pier, and my brand on a big sign facing Manhattan" data-msg></textarea></label>
      <p class="plot-note">6 months · ${usd(price)}. Our team reads every message and will get back to you.</p>
      <button class="btn primary plot-go" data-go ${p.auction ? 'disabled' : ''}>${p.auction ? 'Auction opens soon' : `Rent island · ${usd(price)}`}</button>
      <p class="plot-id">Plot ${esc(p.id)}</p>`,
  });
  const b = sheet.body;
  b.querySelector('[data-go]')!.addEventListener('click', () => {
    const msg = b.querySelector<HTMLTextAreaElement>('[data-msg]')!.value.trim();
    if (!msg) return toast('Tell us what you’d like on the island first.', { icon: '✏️', tone: 'info' });
    saveRequest({ plotId: p.id, kind: 'island', borough: p.borough, months: 6, message: msg.slice(0, 600), totalUsd: price, at: Date.now() });
    sheet.close();
    soon();
  });
}
