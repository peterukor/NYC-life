// =====================================================================
// phone-apps.ts — plug-in phone apps.
//
// The built-in apps live in ui/phone.ts. New apps register here instead,
// so adding or removing one never touches the phone itself:
//
//   PHONE_APPS.add({
//     id: 'cars', label: 'Cars', icon: '🚗', bg: '#e63946',
//     render: (ctx) => ({ title: 'Cars', body: '<p>…</p>' }),
//     act: (act, ctx) => { … },   // buttons use data-act="cars.<act>"
//   });
//
// render() returns the page's HTML. A button with data-act="cars.buy:x"
// calls act('buy:x'). After act() the game saves and the app re-renders;
// return 'close' to close the phone, or another app id to open it.
// =====================================================================

import { Registry } from '../core/registry.ts';
import { esc, money } from '../core/format.ts';
import { carsForSale, RARITY_INFO, VEHICLES } from '../data/vehicles.ts';
import { DEBT, fileBankruptcy, payDebt } from '../sim/debt.ts';
import { buyCar, coolScore, drivingCar, GARAGE, licenceSuspended, sellCar } from '../sim/garage.ts';
import { CREWS, doMission, GANG, joinBlocker, joinCrew, leaveCrew, MISSIONS, missionBlocker, RANKS, repPerks, respectOf, SAFE_AREAS, standing, tryRankUp, turfAt } from '../sim/gangs.ts';
import { chargeBill } from '../sim/economy.ts';
import { addDebt } from '../sim/debt.ts';
import { arrest } from '../sim/jail.ts';
import { nowMs } from '../core/clock.ts';
import type { AreaId, GameState } from '../sim/types.ts';
import { DISTRICTS } from '../world/layout.ts';
import type { PhoneHost } from './phone.ts';
import { toast } from './dom.ts';
import { PHONE_GAMES } from './arcade.ts';
import { board, CHALLENGES, daily, POINTS, SEASON, seasonEnds, seasonOf } from '../sim/season.ts';
import { ARCADE_BY_ID, bestScore } from '../sim/arcade.ts';
import { homesForRent, listingName, moveBlocker, moveCost, MOVING } from '../sim/moving.ts';
import { buyHome, homePrice, owns, REAL_ESTATE, sellHome } from '../sim/realestate.ts';
import { layoutForPlace } from '../data/homes.ts';
import { PLACE_BY_ID as PLACES } from '../data/places.ts';
import { personOf, RELATION, vibe } from '../sim/people.ts';
import { textPerson } from '../sim/social.ts';
import { peopleHost, planDate } from './people-ui.ts';

export interface PhoneAppCtx {
  s: GameState;
  host: PhoneHost;
  close: () => void;
  /** Redraw this app if it's still on screen (after data arrives from the server). */
  rerender: (id: string) => void;
}

export interface PhoneAppDef {
  id: string;
  label: string;
  icon: string;
  bg: string;
  needsPhone?: boolean;
  /** Not shown on the home screen (opened from another app). */
  hidden?: boolean;
  order?: number;
  render: (ctx: PhoneAppCtx) => { title: string; body: string };
  act?: (act: string, ctx: PhoneAppCtx) => void | 'close' | string;
  /** After each render: wire up inputs, start loading data. */
  opened?: (ctx: PhoneAppCtx, el: HTMLElement) => void;
}

export const PHONE_APPS = new Registry<PhoneAppDef>('phone app');

const bar = (value: number, max: number, color: string) =>
  `<div style="height:10px;border-radius:6px;background:rgba(0,0,0,.12);overflow:hidden;margin-top:6px"><div style="height:100%;width:${Math.max(0, Math.min(100, (value / max) * 100))}%;background:${color};border-radius:6px"></div></div>`;
const chip = (label: string, color: string) => `<span class="tag" style="background:${color};color:#fff">${esc(label)}</span>`;

// ---------------------------------------------------------------------
// Debt & bankruptcy (opened from the Bank app)
// ---------------------------------------------------------------------
PHONE_APPS.add({
  id: 'debt',
  label: 'Debt',
  icon: '📞',
  bg: '#9d0208',
  hidden: true,
  render: ({ s }) => ({
    title: 'File for bankruptcy?',
    body: `<div class="card"><h3>⚖️ A fresh start, at a price</h3>
      <p>You owe <b>${money(s.debt?.owed ?? 0)}</b>. Bankruptcy wipes it — and also:</p>
      <ul style="margin:8px 0 0 18px;line-height:1.6">
        <li>all your cash and bank money</li><li>all stocks and businesses</li><li>all your cars</li><li>your lease (you move to the city shelter)</li>
      </ul>
      <p style="margin-top:8px">You keep your skills, clothes, friends and rep. You walk out with ${money(DEBT.freshStartCash)}. You can’t file again for ${DEBT.cooldownDays} days.</p>
      <button class="btn block" style="margin-top:12px;background:var(--bad);color:#fff" data-act="debt.file">Yes — file for bankruptcy</button>
      <button class="btn ghost block" style="margin-top:8px" data-act="debt.back">No, take me back</button></div>`,
  }),
  act: (act, { s }) => {
    if (act === 'pay') {
      const paid = payDebt(s);
      toast(paid ? `Paid ${money(paid)} toward your debt.${s.debt ? '' : ' Debt free! 🎉'}` : 'You have nothing to pay with.', { icon: '🏦', tone: paid ? 'good' : 'bad' });
      return 'bank';
    }
    if (act === 'ask') return 'debt';
    if (act === 'back') return 'bank';
    if (act === 'file') {
      const err = fileBankruptcy(s);
      if (err) {
        toast(err, { icon: '⚖️', tone: 'bad' });
        return 'bank';
      }
      toast('Bankruptcy filed. Your bunk is at the city shelter. Up from here. 🌱', { icon: '⚖️', ms: 5000 });
      return 'bank';
    }
  },
});

// ---------------------------------------------------------------------
// Cars: dealership, your garage, licence and the Cool meter
// ---------------------------------------------------------------------
const carIcon = (r: string) => (r === 'veryRare' || r === 'exclusive' ? '🏎️' : r === 'premium' ? '🚘' : '🚗');

PHONE_APPS.add({
  id: 'cars',
  label: 'Cars',
  icon: '🏎️',
  bg: '#d62828',
  order: 10,
  render: ({ s }) => {
    const cool = coolScore(s);
    const l = s.garage.licence;
    const sus = licenceSuspended(s);
    const driving = drivingCar(s);
    const mine = s.garage.cars
      .map((c) => {
        const v = VEHICLES.get(c.model);
        if (!v) return '';
        const r = RARITY_INFO[v.rarity];
        return `<div class="list-item"><div style="width:26px;height:26px;border-radius:50%;background:${c.paint};border:2px solid rgba(0,0,0,.15)"></div><div class="grow"><div class="title">${carIcon(v.rarity)} ${esc(v.name)} ${chip(r.label, r.color)}</div><div class="sub">Resale ${money(Math.round(v.price * GARAGE.resale))}</div></div>
          ${driving?.uid === c.uid ? '<button class="btn" data-act="cars.park">Park</button>' : `<button class="btn primary" data-act="cars.drive:${c.uid}">Drive</button>`}
          <button class="btn ghost" data-act="cars.sell:${c.uid}">Sell</button></div>`;
      })
      .join('');
    const tiers = (['common', 'premium', 'exclusive', 'veryRare'] as const)
      .map((tier) => {
        const list = carsForSale().filter((v) => v.rarity === tier);
        const r = RARITY_INFO[tier];
        return `<h3 style="margin:14px 0 6px;font-size:15px">${chip(r.label, r.color)} <span class="sub">+${r.cool} Cool when you drive one</span></h3>${list
          .map((v) => {
            const can = s.money + s.bank >= v.price;
            return `<div class="list-item"><div style="font-size:24px">${carIcon(v.rarity)}</div><div class="grow"><div class="title">${esc(v.name)} · ${money(v.price)}</div><div class="sub">${esc(v.blurb ?? '')}<br>Top speed ${Math.round(v.speed[1] * 7.2)} mph</div>
              <div class="row" style="margin-top:6px;gap:6px">${v.paints.map((p) => `<button aria-label="Buy in ${p}" data-act="cars.buy:${v.id}:${p}" ${can ? '' : 'disabled'} style="width:26px;height:26px;border-radius:50%;background:${p};border:2px solid rgba(0,0,0,.2);opacity:${can ? 1 : 0.4}"></button>`).join('')}</div></div></div>`;
          })
          .join('')}`;
      })
      .join('');
    // A purchase waiting for "yes": say exactly where the money comes from
    // (the top bar only shows cash, so a bank-paid car looked cheap).
    const pend = pendingCar && VEHICLES.get(pendingCar.model);
    const confirm = pend
      ? (() => {
          const cash = Math.min(s.money, pend.price);
          const bank = pend.price - cash;
          return `<div class="card" style="border:3px solid var(--ink)"><h3>🚗 Buy the ${esc(pend.name)}?</h3><p>Price <b>${money(pend.price)}</b>: ${money(cash)} from your cash${bank > 0 ? ` + <b>${money(bank)} from your bank</b>` : ''}.</p><div class="row" style="gap:8px;margin-top:10px"><button class="btn block" data-act="cars.cancel">Cancel</button><button class="btn primary block" data-act="cars.confirm">Buy it</button></div></div>`;
        })()
      : '';
    return {
      title: 'Cars',
      body: `${confirm}<div class="card"><h3>😎 Cool ${cool.total}/100</h3>${bar(cool.total, 100, 'linear-gradient(90deg,#3a86ff,#ff006e)')}<p class="sub" style="margin-top:6px">Car +${cool.car} · Outfit +${cool.outfit} · Fame +${cool.fame}. Cool makes people warmer to you and fame grow faster.</p></div>
        <div class="card"><h3>🪪 Licence ${sus ? '<span style="color:var(--bad)">SUSPENDED</span>' : 'OK'}</h3>${sus ? `<p>Back in ${Math.ceil((l.suspendedUntil - nowMs()) / 60000)} real minutes. Driving now risks arrest.</p>` : `<p>${l.points}/${GARAGE.suspendAt} points · ${l.tickets} tickets ever. Points fade over time.</p>${bar(l.points, GARAGE.suspendAt, 'var(--bad)')}`}</div>
        <h3 style="margin:14px 0 6px;font-size:15px">Your garage (${s.garage.cars.length}/5)</h3>
        ${mine || '<p class="blurb">No car yet. NYC has the subway… but a car is a statement.</p>'}
        <h3 style="margin:18px 0 0;font-size:16px">🏬 Dealership</h3><p class="sub">Tap a colour to buy. Paid from cash, then bank.</p>${tiers}`,
    };
  },
  act: (act, { s }) => {
    const [what, a, b] = act.split(':');
    if (what === 'buy') pendingCar = { model: a, paint: b };
    if (what === 'cancel') pendingCar = null;
    if (what === 'confirm' && pendingCar) {
      const err = buyCar(s, pendingCar.model, pendingCar.paint);
      pendingCar = null;
      toast(err ?? `It’s yours! Tap Drive to take it out.`, { icon: '🚗', tone: err ? 'bad' : 'good' });
    }
    if (what === 'drive') {
      s.garage.driving = a;
      toast('Behind the wheel. Tap anywhere to drive there; “Drive there” is on every place.', { icon: '🚗', ms: 3500 });
      return 'close';
    }
    if (what === 'park') s.garage.driving = null;
    if (what === 'sell') {
      const got = sellCar(s, a);
      toast(`Sold for ${money(got)} (paid into your bank).`, { icon: '🚗' });
    }
  },
});

// ---------------------------------------------------------------------
// 🏆 Leaderboard (Peter, 2026-10-15): this season's board (3 days, top 3
// paid), today's three challenges, your streak, your records.
// ---------------------------------------------------------------------
PHONE_APPS.add({
  id: 'leaders',
  label: 'Leaderboard',
  icon: '🏆',
  bg: '#ffb703',
  needsPhone: false,
  render: ({ s }) => {
    const st = seasonOf(s);
    const rows = board(s);
    const me = rows.findIndex((r) => r.you);
    const left = Math.max(0, seasonEnds() - nowMs());
    const h = Math.floor(left / 3_600_000);
    const d = daily(s);
    const recs: [string, string][] = [
      ['♟️ Chess rating', String(s.chess?.rating ?? '—')],
      ['🎣 Biggest fish', s.fishing?.best ? `${s.fishing.best.lb} lb` : '—'],
      ['🚴 Best loop', s.bike?.best ? `${s.bike.best} s` : '—'],
      ['🥪 Bodega Stack', String(bestScore(s, 'stack') || '—')],
      ['🛵 Delivery Dash', String(bestScore(s, 'dash') || '—')],
      ['🥊 Fights won', String(s.stats.fightsWon ?? 0)],
      ['💨 Cops escaped', String(s.stats.chasesEscaped ?? 0)],
      ['🏆 Best season', `${st.best} pts`],
    ];
    return {
      title: 'Leaderboard',
      body: `<div class="card" style="border:3px solid #ffb703"><h3>🏆 Season ${st.id}: you’re #${me + 1}</h3><p><b>${st.points} points</b> · ends in ${h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`} · top 3 win 🥇 ${money(SEASON.prizes[0])} · 🥈 ${money(SEASON.prizes[1])} · 🥉 ${money(SEASON.prizes[2])}</p></div>
        <div class="travel">${rows.map((r, i) => `<div class="opt" style="${r.you ? 'border-color:var(--ink);background:#fff3c4' : ''}"><span style="font-size:20px;min-width:30px">${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span><span class="grow"><b>${esc(r.name)}${r.you ? ' (you)' : ''}</b></span><span class="cost">${r.points}</span></div>`).join('')}</div>
        <p class="sub">Earn points: win fights, escape the cops, win at chess, catch fish, race the loop, play games, hang art, pop bottles, work shifts, explore, and finish daily challenges.</p>
        <h3 style="margin:14px 0 6px">✅ Today’s challenges ${d.done.length}/${d.picks.length}</h3>
        ${d.picks.map((id) => { const c = CHALLENGES.find((x) => x.id === id)!; const n = Math.min(c.need, d.progress[id] ?? 0); const done = d.done.includes(id); return `<div class="list-item"><div style="font-size:24px">${done ? '✅' : c.emoji}</div><div class="grow"><div class="title">${esc(c.label)}</div><div class="sub">${done ? 'Done!' : `${n}/${c.need}`} · ${money(c.cash)} + ${POINTS.challenge} 🏆</div></div></div>`; }).join('')}
        <p class="sub">All three: +${money(50_000)} bonus. New challenges every game day.</p>
        <h3 style="margin:14px 0 6px">🔥 Streak: ${s.streak?.days ?? 0} day${(s.streak?.days ?? 0) === 1 ? '' : 's'}</h3>
        <p class="sub">Come back every day: the welcome-back gift grows for 7 days.</p>
        <h3 style="margin:14px 0 6px">📒 Your records</h3>
        ${recs.map(([k, v]) => `<div class="skill-row"><span>${k}</span><span style="flex:1"></span><b>${esc(v)}</b></div>`).join('')}`,
    };
  },
});

// ---------------------------------------------------------------------
// 📱 Games (Peter, 2026-10-15: "add playable games that can be played on
// phone that are fun"). Free here, for the high score; the same games at
// Pixel Palace pay out 🎟️ tickets for prizes (a reason to go out).
// ---------------------------------------------------------------------
PHONE_APPS.add({
  id: 'games',
  label: 'Games',
  icon: '🎮',
  bg: '#ff4fa3',
  needsPhone: true,
  render: ({ s }) => ({
    title: 'Games',
    body: `<p class="sub">Free on your phone. Play the same games at 🕹️ Pixel Palace to win 🎟️ tickets and prizes.</p>${PHONE_GAMES.map((id) => {
      const g = ARCADE_BY_ID[id];
      return `<button class="list-item tap" style="width:100%;text-align:left" data-act="games.play:${id}"><div style="font-size:30px">${g.emoji}</div><div class="grow"><div class="title">${esc(g.name)}</div><div class="sub">${esc(g.howTo)}<br>🏆 Best ${bestScore(s, id)}</div></div><span class="btn primary">▶️</span></button>`;
    }).join('')}`,
  }),
  act: (act, { host }) => {
    const [what, id] = act.split(':');
    if (what === 'play' && host.playGame) {
      host.playGame(id);
      return 'close';
    }
  },
});

// ---------------------------------------------------------------------
// 🏠 Homes: move house (Peter, 2026-10-15). sim/moving.ts has the rules.
// ---------------------------------------------------------------------
let pendingHome: string | null = null;
PHONE_APPS.add({
  id: 'homes',
  label: 'Homes',
  icon: '🏠',
  bg: '#e76f51',
  needsPhone: true,
  render: ({ s }) => {
    const pend = pendingHome ? PLACES[pendingHome] : null;
    const confirm = pend
      ? `<div class="card" style="border:3px solid var(--ink)"><h3>📦 Move to ${esc(listingName(s, pend))}?</h3><p>Today: <b>${money(moveCost(pend, s))}</b> (movers ${money(moveCost(pend, s) - (pend.rent ?? 0))} + first week ${money(pend.rent ?? 0)}). Then ${money(pend.rent ?? 0)} every week, from cash then bank.${s.home.weeklyRent === 0 && s.home.placeId !== 'shelter' ? ' <b>Your family pays your rent where you live now; they won’t pay for the new place.</b>' : ''} Your furniture stays arranged in each home; anything bought is in 📦 Storage.</p><div class="row" style="gap:8px;margin-top:10px"><button class="btn block" data-act="homes.cancel">Cancel</button><button class="btn primary block" data-act="homes.confirm">Move</button></div></div>`
      : '';
    const rows = homesForRent()
      .map((p) => {
        const mine = p.id === s.home.placeId;
        const lay = layoutForPlace(p.id);
        const c = lay.conditions;
        const extras = [c?.roommates?.length ? `👥 ${c.roommates.length} roommates` : '', c?.doorman ? '🛎️ doorman' : '', c?.housekeeper ? '🧹 housekeeper' : '', `${lay.rooms.length} rooms`].filter(Boolean).join(' · ');
        const why = mine ? null : moveBlocker(s, p);
        const own = owns(s, p.id);
        const price = homePrice(p);
        const tenants = own && !mine ? `<br>🔑 Rented out: +${money(Math.round((p.rent ?? 0) * REAL_ESTATE.keep))}/week` : '';
        const deal = price ? (own ? `<button class="btn ghost" data-act="homes.sell:${p.id}" ${mine ? 'disabled' : ''}>Sell ${money(Math.round(price * REAL_ESTATE.sellBack))}</button>` : `<button class="btn" data-act="homes.buy:${p.id}" ${s.money + s.bank >= price ? '' : 'disabled'}>Buy ${money(price)}</button>`) : '';
        return `<div class="list-item" style="flex-wrap:wrap"><div style="font-size:26px">${p.emoji}</div><div class="grow"><div class="title">${esc(listingName(s, p))}${mine ? ' · <span style="color:var(--good)">you live here</span>' : ''}${own ? ' · 🔑 yours' : ''}</div><div class="sub">${own && mine ? 'No rent: you own it' : p.rent ? `${money(p.rent)}/week` : 'Free'} · ${esc(extras)}<br>${esc(p.blurb)}${tenants}${why ? `<br><i>${esc(why)}</i>` : ''}</div></div><div class="row" style="gap:6px;width:100%;justify-content:flex-end;margin-top:6px">${deal}${mine ? '' : `<button class="btn ${why ? '' : 'primary'}" data-act="homes.pick:${p.id}" ${why ? 'disabled' : ''}>Move</button>`}</div></div>`;
      })
      .join('');
    const owned = (s.owned ?? []).length;
    return { title: 'Homes', body: `${confirm}<p class="sub">Move any time: movers + the first week up front. Landlords want to see ${MOVING.proofWeeks} weeks of rent in your cash + bank. 🔑 Or buy: live rent-free, or rent it out for weekly income.${owned ? ` You own ${owned}.` : ''}</p>${rows}` };
  },
  act: (act, { s, host }) => {
    const [what, id] = act.split(':');
    if (what === 'buy') {
      const err = buyHome(s, id);
      toast(err ?? `It’s yours! ${s.home.placeId === id ? 'No more rent here.' : 'Tenants will pay you rent every week.'}`, { icon: '🔑', tone: err ? 'bad' : 'good', ms: 4000 });
    }
    if (what === 'sell') {
      const r = sellHome(s, id);
      toast('error' in r ? r.error : `Sold for ${money(r.got)}.`, { icon: '🔑', tone: 'error' in r ? 'bad' : 'good' });
    }
    if (what === 'pick') pendingHome = id;
    if (what === 'cancel') pendingHome = null;
    if (what === 'confirm' && pendingHome) {
      const id2 = pendingHome;
      pendingHome = null;
      const err = host.moveHome?.(id2);
      if (err) toast(err, { icon: '🏠', tone: 'bad' });
      else return 'close';
    }
    void s;
  },
});

/** The car you tapped, waiting for "Buy it" (Cars app). */
let pendingCar: { model: string; paint: string } | null = null;

// ---------------------------------------------------------------------
// Contacts: people whose number you have. Text them, ask them out.
// ---------------------------------------------------------------------
let lastReply: { id: string; text: string } | null = null;
/** Link Up registers this so Contacts → Invite opens its composer (no import cycle). */
let inviteHook: ((personId: string) => void) | null = null;
export function onContactInvite(fn: (personId: string) => void): void {
  inviteHook = fn;
}

PHONE_APPS.add({
  id: 'contacts',
  label: 'Contacts',
  icon: '💬',
  bg: '#06a77d',
  needsPhone: true,
  order: 9,
  render: ({ s }) => {
    const list = Object.entries(s.people)
      .filter(([, m]) => m.hasNumber)
      .sort((a, b) => b[1].likes - a[1].likes);
    return {
      title: 'Contacts',
      body: list.length
        ? list
            .map(([id, m]) => {
              const p = personOf(id);
              const v = vibe(m);
              const reply = lastReply?.id === id ? `<div class="sms">${esc(lastReply.text)}</div>` : '';
              return `<div class="list-item" style="flex-wrap:wrap"><div style="font-size:24px">${v.emoji}</div><div class="grow"><div class="title">${esc(p.name)}${m.key ? ' 🔑' : ''}</div><div class="sub">${RELATION[m.level]} · ${esc(p.job)} · ${DISTRICTS[m.area as AreaId].name}</div>${reply}</div>
                <button class="btn" data-act="contacts.hey:${id}">👋 Text</button><button class="btn" data-act="contacts.invite:${id}">🤙 Invite</button>${p.dates && m.level >= 2 ? `<button class="btn primary" data-act="contacts.date:${id}">💘 Date?</button>` : ''}</div>`;
            })
            .join('')
        : '<p class="blurb">No numbers yet. Get to know people on the street (tap someone), then ask for their number.</p>',
    };
  },
  act: (act, { s, close }) => {
    const [what, id] = act.split(':');
    if (what === 'invite') {
      inviteHook?.(id);
      return 'linkup';
    }
    const r = textPerson(s, id, what === 'date' ? 'date' : 'hey');
    lastReply = { id, text: r.reply };
    if (r.date) {
      const h = peopleHost();
      if (h) {
        close();
        planDate(h, id);
        return 'close';
      }
    }
  },
});

/** Street-rep perks and the missions you can run where you're standing. */
function perksCard(s: GameState): string {
  const p = repPerks(s);
  const here = s.location.placeId ? null : turfAt(s, s.location.area, s.location.x, s.location.z);
  const zone = s.location.placeId ? 'inside' : SAFE_AREAS.includes(s.location.area) ? 'safe zone' : here ? `${here.emoji} ${here.name} turf` : 'neutral ground';
  return `<div class="card"><h3>🗡️ Street rep ${p.rep}</h3>
    <p class="sub">Getaway +${Math.round(p.getaway * 100)}% · Carrying: ${p.weapon.emoji} ${esc(p.weapon.name)} · You’re on: ${esc(zone)}</p>
    <div class="stack" style="margin-top:8px">${MISSIONS.map((m) => {
      const why = s.location.placeId ? 'Go outside first.' : missionBlocker(s, m.id, s.location.area, s.location.x, s.location.z);
      return `<button class="btn ${why ? '' : 'primary'} block" data-act="crew.mission:${m.id}" ${why ? 'disabled' : ''} title="${esc(why ?? m.blurb)}">${m.emoji} ${esc(m.name)}${why ? ` — <small>${esc(why)}</small>` : ''}</button>`;
    }).join('')}</div></div>`;
}

// ---------------------------------------------------------------------
// Crew: the five crews, respect, joining and ranks
// ---------------------------------------------------------------------
const STANDING_LABEL = { family: ['Family', '#2a9d8f'], friendly: ['Friendly', '#06a77d'], neutral: ['Neutral', '#8d99ae'], rival: ['Rival', '#f4a261'], enemy: ['Enemy', '#e63946'] } as const;

PHONE_APPS.add({
  id: 'crew',
  label: 'Crews',
  icon: '🧢',
  bg: '#3d405b',
  order: 11,
  render: ({ s }) => {
    const mine = s.gang.crew ? CREWS.get(s.gang.crew) : null;
    const next = mine && s.gang.rank + 1 < RANKS.length ? GANG.rankRespect[s.gang.rank + 1] : null;
    return {
      title: 'Crews',
      body: `<p class="blurb">Five crews run pieces of Brooklyn. <b>Manhattan is a safe zone</b> (so are DUMBO, Brooklyn Heights and Downtown). Crews remember everything you do. Open the Map and switch on <b>🧢 Gang view</b> to see who owns which blocks.</p>
        ${perksCard(s)}
        ${mine ? `<div class="card" style="border-left:6px solid ${mine.color}"><h3>${mine.emoji} ${esc(mine.name)} · ${RANKS[s.gang.rank]}</h3><p>Respect ${respectOf(s, mine.id)}/100${next !== null ? ` · next rank at ${next}` : ' · you run this crew'}</p>${bar(respectOf(s, mine.id) + 100, 200, mine.color)}
          ${next !== null && respectOf(s, mine.id) >= next ? `<button class="btn primary block" style="margin-top:10px" data-act="crew.rank">⬆ Become ${RANKS[s.gang.rank + 1]}</button>` : '<p class="sub" style="margin-top:8px">Earn respect: take favours on your turf, back your crew, keep your mouth shut.</p>'}
          <button class="btn ghost block" style="margin-top:8px" data-act="crew.leave">Leave the crew (they won’t like it)</button></div>` : ''}
        ${CREWS.all()
          .map((c) => {
            const st = standing(s, c.id);
            const [lab, col] = STANDING_LABEL[st];
            const block = joinBlocker(s, c.id);
            return `<div class="list-item" style="border-left:6px solid ${c.color}"><div style="font-size:24px">${c.emoji}</div><div class="grow"><div class="title">${esc(c.name)} ${chip(lab, col)}</div><div class="sub">${DISTRICTS[c.area].name} · ${c.temper === 'hot' ? '🔥 hot-headed' : '🧊 cool-headed'} · muscle ${c.muscle}/10<br>${esc(c.blurb)}</div>${bar(respectOf(s, c.id) + 100, 200, c.color)}</div>
              ${s.gang.crew === c.id ? '' : `<button class="btn ${block ? '' : 'primary'}" data-act="crew.join:${c.id}" ${block ? `title="${esc(block)}"` : ''}>Join</button>`}</div>`;
          })
          .join('')}`,
    };
  },
  act: (act, { s }) => {
    const [what, id] = act.split(':');
    if (what === 'mission') {
      const r = doMission(s, id, s.location.area, s.location.x, s.location.z);
      if (r.hospital) {
        const { short } = chargeBill(s, r.hospital, 'ER visit (crew business)');
        addDebt(s, short);
      }
      if (r.arrest) {
        toast(`${r.text} ${arrest(s, r.arrest.reason, r.arrest.hours, r.arrest.bail)}`, { icon: '🚔', tone: 'bad', ms: 5000 });
        return 'close';
      }
      toast(r.text, { icon: r.tone === 'good' ? '🚩' : '🤕', tone: r.tone, ms: 4000 });
      return;
    }
    if (what === 'join') {
      const err = joinCrew(s, id);
      toast(err ?? `You’re ${RANKS[0]} for ${CREWS.get(id)?.name} now. Every other crew noticed.`, { icon: CREWS.get(id)?.emoji ?? '🧢', tone: err ? 'bad' : 'good', ms: 4000 });
    }
    if (what === 'leave') leaveCrew(s);
    if (what === 'rank') {
      const t = tryRankUp(s);
      if (t) toast(`You’re a ${t} now.`, { icon: '⬆️', tone: 'good' });
    }
  },
});
