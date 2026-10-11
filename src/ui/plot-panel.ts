// =====================================================================
// plot-panel.ts — the "rent this" sheet for plots (data/plots.ts).
// Every rent is a WEEKLY SUBSCRIPTION: billed each week, cancel any
// time, ends by itself after 26 weeks (then re-rent to keep it).
//   • AD BLOCK: pick a half (north / south) or both, how many weeks,
//     add your picture. Can merge with the ad block next door.
//   • HOME LOT: pick a house; a block holds 16 tiny homes, 8 townhouses,
//     4 villas or 2 mansions. Can merge with the lot next door.
//   • ISLAND:  weekly, plus a message to the admin team about what to
//     build there.
// Prices are real US dollars. Payments aren't live yet: "Subscribe"
// saves a request (sim/plot-requests.ts) and says so.
// =====================================================================

import { esc } from '../core/format.ts';
import { AD_PRICES, AD_UNIT_NAMES, AD_UNITS, adPrice, BLOCK_SPACES, homePrice, homeWeekly, HOMES_PER_BOROUGH, HOUSES, islandWeekly, MAX_WEEKS, neighbourPlots, type HouseId, type Plot } from '../data/plots.ts';
import { homeRequestsIn, saveRequest } from '../sim/plot-requests.ts';
import { openSheet, toast } from './dom.ts';

const usd = (v: number) => `$${v.toFixed(2)}`;
const TIER_LABEL: Record<Plot['tier'], string> = { harlem: 'Harlem', uptown: 'Uptown', midtown: 'Midtown', downtown: 'Downtown', brooklyn: 'Brooklyn', bronx: 'The Bronx' };

export function openPlotPanel(plot: Plot, focusUnit = -1): void {
  if (plot.kind === 'ad') return adPanel(plot, focusUnit);
  if (plot.kind === 'home') return homePanel(plot);
  return islandPanel(plot);
}

const soon = () => toast('Payments open soon. Your request is saved, and you’ll be first in line.', { icon: '💳', tone: 'info', ms: 4200 });
const auctionNote = (p: Plot) => (p.auction ? '<p class="plot-note auction">🔨 This plot is going to auction. Bidding opens soon.</p>' : '');
const subNote = '<p class="plot-note">🔁 Weekly subscription: cancel any time. It ends by itself after 26 weeks (6 months); re-rent to keep it.</p>';
/** The "how many weeks" slider. */
const weeksField = (weeks: number) => `<label class="plot-field">Subscribe for <b data-weeks>${weeks} weeks</b><input type="range" min="1" max="${MAX_WEEKS}" value="${weeks}" data-range></label>`;
const mergeButton = (m: Plot, what: string) => `<button class="plot-merge" data-merge="${esc(m.id)}" aria-pressed="false">🔗 <b>Merge with the ${what} next door</b><small>${esc(m.name)} · ${what === 'block' ? 'rent both whole blocks and they become ONE giant billboard' : 'rent both and build one big estate across them'}</small></button>`;

/** Wires the weeks slider and merge buttons shared by the ad and home sheets. */
function common(b: HTMLElement, mates: Plot[], st: { weeks: number; merge: Plot | null }, refresh: () => void, onMerge?: () => void): void {
  b.querySelector<HTMLInputElement>('[data-range]')!.addEventListener('input', (e) => {
    st.weeks = Number((e.target as HTMLInputElement).value);
    refresh();
  });
  b.querySelectorAll<HTMLElement>('[data-merge]').forEach((el) =>
    el.addEventListener('click', () => {
      st.merge = st.merge?.id === el.dataset.merge ? null : (mates.find((m) => m.id === el.dataset.merge) ?? null);
      if (st.merge) onMerge?.();
      refresh();
    }),
  );
}
const showWeeks = (b: HTMLElement, st: { weeks: number; merge: Plot | null }) => {
  b.querySelector('[data-weeks]')!.textContent = `${st.weeks} week${st.weeks > 1 ? 's' : ''}`;
  b.querySelectorAll<HTMLElement>('[data-merge]').forEach((el) => el.setAttribute('aria-pressed', String(st.merge?.id === el.dataset.merge)));
};

function adPanel(p: Plot, focusUnit: number): void {
  const price = AD_PRICES[p.tier];
  const picked = new Set<number>(focusUnit >= 0 ? [focusUnit] : []);
  const st = { weeks: 4, merge: null as Plot | null };
  let hasImage = false;
  const mates = neighbourPlots(p);
  const sheet = openSheet({
    emoji: '📢',
    title: 'Ad space',
    sub: `${esc(p.name)} · ${TIER_LABEL[p.tier]}`,
    body: `
      <p class="blurb">This block is split in two halves, each with two giant billboards. ${usd(price.unit)} a week for a half, ${usd(price.block)} a week for the whole block.</p>
      ${auctionNote(p)}
      <div class="plot-units halves" role="group" aria-label="Halves of the block">
        ${AD_UNIT_NAMES.map((n, i) => `<button class="plot-unit" data-u="${i}" aria-pressed="false"><b>${n}</b><small>2 billboards · ${usd(price.unit)}/wk</small></button>`).join('')}
      </div>
      <div class="row"><button class="btn" data-all>Whole block · ${usd(price.block)}/wk</button></div>
      ${mates.map((m) => mergeButton(m, 'block')).join('')}
      ${weeksField(st.weeks)}
      <label class="plot-field">Your ad picture<input type="file" accept="image/*" data-file></label>
      <img class="plot-preview" alt="" hidden>
      ${subNote}
      <p class="plot-note">Every ad is checked by our team before it goes live.</p>
      <button class="btn primary plot-go" data-go disabled>Pick a half</button>
      <p class="plot-id">Plot ${esc(p.id)}</p>`,
  });
  const b = sheet.body;
  const go = b.querySelector<HTMLButtonElement>('[data-go]')!;
  const weekly = () => adPrice(p.tier, picked.size, 1) + (st.merge ? adPrice(st.merge.tier, AD_UNITS, 1) : 0);
  const refresh = () => {
    if (picked.size < AD_UNITS) st.merge = null; // merging needs both whole blocks
    b.querySelectorAll<HTMLElement>('.plot-unit').forEach((el) => el.setAttribute('aria-pressed', String(picked.has(Number(el.dataset.u)))));
    showWeeks(b, st);
    go.disabled = !picked.size || !!p.auction || !!st.merge?.auction;
    const what = st.merge ? 'both blocks, merged' : picked.size === AD_UNITS ? 'the whole block' : picked.size ? AD_UNIT_NAMES[[...picked][0]].toLowerCase() : '';
    go.textContent = p.auction ? 'Auction opens soon' : picked.size ? `Subscribe to ${what} · ${usd(weekly())}/week` : 'Pick a half';
  };
  b.querySelectorAll<HTMLElement>('.plot-unit').forEach((el) =>
    el.addEventListener('click', () => {
      const u = Number(el.dataset.u);
      if (picked.has(u)) picked.delete(u);
      else picked.add(u);
      refresh();
    }),
  );
  b.querySelector('[data-all]')!.addEventListener('click', () => {
    for (let i = 0; i < AD_UNITS; i++) picked.add(i);
    refresh();
  });
  common(b, mates, st, refresh, () => {
    for (let i = 0; i < AD_UNITS; i++) picked.add(i);
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
    saveRequest({ plotId: p.id, kind: 'ad', borough: p.borough, units: [...picked].sort(), weeks: st.weeks, hasImage, mergeWith: st.merge?.id, totalUsd: weekly() * st.weeks, at: Date.now() });
    sheet.close();
    soon();
  });
  refresh();
}

function homePanel(p: Plot): void {
  let house: HouseId = 'townhouse';
  const st = { weeks: 4, merge: null as Plot | null };
  const used = homeRequestsIn(p.borough);
  const full = used >= HOMES_PER_BOROUGH;
  const mates = neighbourPlots(p);
  const count = (h: (typeof HOUSES)[number]) => Math.floor(BLOCK_SPACES / h.spaces);
  const sheet = openSheet({
    emoji: '🏡',
    title: 'Empty lot for rent',
    sub: `${esc(p.name)} · ${TIER_LABEL[p.tier]}`,
    body: `
      <p class="blurb">Pick a house and we’ll build it here. This block has room for ${HOUSES.map((h) => `${count(h)} ${h.name.toLowerCase()}s`).join(', ').replace(/, ([^,]*)$/, ' or $1')}. Mix and match until it’s full.</p>
      ${auctionNote(p)}
      <div class="plot-houses">
        ${HOUSES.map((h) => `<button class="plot-house" data-h="${h.id}" aria-pressed="false"><span>${h.emoji}</span><b>${esc(h.name)}</b><small>${esc(h.blurb)} Up to ${count(h)} per block.</small><em>${usd(homeWeekly(p.tier, h.id))} / week</em></button>`).join('')}
      </div>
      ${mates.map((m) => mergeButton(m, 'lot')).join('')}
      ${weeksField(st.weeks)}
      ${subNote}
      <p class="plot-note">${full ? `You already have ${HOMES_PER_BOROUGH} homes in this borough (the most allowed).` : `You can rent up to ${HOMES_PER_BOROUGH} homes per borough (${used} so far).`}</p>
      <button class="btn primary plot-go" data-go></button>
      <p class="plot-id">Plot ${esc(p.id)}</p>`,
  });
  const b = sheet.body;
  const go = b.querySelector<HTMLButtonElement>('[data-go]')!;
  const weekly = () => homeWeekly(p.tier, house) * (st.merge ? 2 : 1);
  const refresh = () => {
    b.querySelectorAll<HTMLElement>('.plot-house').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.h === house)));
    showWeeks(b, st);
    go.disabled = full || !!p.auction || !!st.merge?.auction;
    go.textContent = p.auction ? 'Auction opens soon' : `Subscribe${st.merge ? ' to both lots' : ''} · ${usd(weekly())}/week`;
  };
  b.querySelectorAll<HTMLElement>('.plot-house').forEach((el) =>
    el.addEventListener('click', () => {
      house = el.dataset.h as HouseId;
      refresh();
    }),
  );
  common(b, mates, st, refresh);
  go.addEventListener('click', () => {
    saveRequest({ plotId: p.id, kind: 'home', borough: p.borough, house, weeks: st.weeks, mergeWith: st.merge?.id, totalUsd: homePrice(p.tier, house, st.weeks) * (st.merge ? 2 : 1), at: Date.now() });
    sheet.close();
    soon();
  });
  refresh();
}

function islandPanel(p: Plot): void {
  const price = p.islandPrice ?? 0;
  const weekly = islandWeekly(price);
  const sheet = openSheet({
    emoji: '🏝️',
    title: p.name,
    sub: 'A whole private island · for rent',
    body: `
      <p class="blurb">Rent the entire island. Tell us what you want on it (a mansion, a giant ad, a festival ground) and our team will build it for you.</p>
      ${auctionNote(p)}
      <label class="plot-field">What should we build?<textarea rows="4" maxlength="600" placeholder="e.g. A beach house with a pier, and my brand on a big sign facing Manhattan" data-msg></textarea></label>
      ${subNote}
      <p class="plot-note">${usd(weekly)} a week (${usd(price)} for the full 6 months). Our team reads every message and will get back to you.</p>
      <button class="btn primary plot-go" data-go ${p.auction ? 'disabled' : ''}>${p.auction ? 'Auction opens soon' : `Subscribe · ${usd(weekly)}/week`}</button>
      <p class="plot-id">Plot ${esc(p.id)}</p>`,
  });
  const b = sheet.body;
  b.querySelector('[data-go]')!.addEventListener('click', () => {
    const msg = b.querySelector<HTMLTextAreaElement>('[data-msg]')!.value.trim();
    if (!msg) return toast('Tell us what you’d like on the island first.', { icon: '✏️', tone: 'info' });
    saveRequest({ plotId: p.id, kind: 'island', borough: p.borough, weeks: MAX_WEEKS, message: msg.slice(0, 600), totalUsd: price, at: Date.now() });
    sheet.close();
    soon();
  });
}
