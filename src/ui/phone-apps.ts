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
import type { GameState } from '../sim/types.ts';
import type { PhoneHost } from './phone.ts';
import { toast } from './dom.ts';
import { personOf, RELATION, vibe } from '../sim/people.ts';
import { textPerson } from '../sim/social.ts';
import { peopleHost, planDate } from './people-ui.ts';

export interface PhoneAppCtx {
  s: GameState;
  host: PhoneHost;
  close: () => void;
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
    return {
      title: 'Cars',
      body: `<div class="card"><h3>😎 Cool ${cool.total}/100</h3>${bar(cool.total, 100, 'linear-gradient(90deg,#3a86ff,#ff006e)')}<p class="sub" style="margin-top:6px">Car +${cool.car} · Outfit +${cool.outfit} · Fame +${cool.fame}. Cool makes people warmer to you and fame grow faster.</p></div>
        <div class="card"><h3>🪪 Licence ${sus ? '<span style="color:var(--bad)">SUSPENDED</span>' : 'OK'}</h3>${sus ? `<p>Back in ${Math.ceil((l.suspendedUntil - nowMs()) / 60000)} real minutes. Driving now risks arrest.</p>` : `<p>${l.points}/${GARAGE.suspendAt} points · ${l.tickets} tickets ever. Points fade over time.</p>${bar(l.points, GARAGE.suspendAt, 'var(--bad)')}`}</div>
        <h3 style="margin:14px 0 6px;font-size:15px">Your garage (${s.garage.cars.length}/5)</h3>
        ${mine || '<p class="blurb">No car yet. NYC has the subway… but a car is a statement.</p>'}
        <h3 style="margin:18px 0 0;font-size:16px">🏬 Dealership</h3><p class="sub">Tap a colour to buy. Paid from cash, then bank.</p>${tiers}`,
    };
  },
  act: (act, { s }) => {
    const [what, a, b] = act.split(':');
    if (what === 'buy') {
      const err = buyCar(s, a, b);
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
// Contacts: people whose number you have. Text them, ask them out.
// ---------------------------------------------------------------------
let lastReply: { id: string; text: string } | null = null;

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
              return `<div class="list-item" style="flex-wrap:wrap"><div style="font-size:24px">${v.emoji}</div><div class="grow"><div class="title">${esc(p.name)}${m.key ? ' 🔑' : ''}</div><div class="sub">${RELATION[m.level]} · ${esc(p.job)} · ${m.area === 'brooklyn' ? 'Brooklyn' : 'Manhattan'}</div>${reply}</div>
                <button class="btn" data-act="contacts.hey:${id}">👋 Text</button>${p.dates && m.level >= 2 ? `<button class="btn primary" data-act="contacts.date:${id}">💘 Date?</button>` : ''}</div>`;
            })
            .join('')
        : '<p class="blurb">No numbers yet. Get to know people on the street (tap someone), then ask for their number.</p>',
    };
  },
  act: (act, { s, close }) => {
    const [what, id] = act.split(':');
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
            return `<div class="list-item" style="border-left:6px solid ${c.color}"><div style="font-size:24px">${c.emoji}</div><div class="grow"><div class="title">${esc(c.name)} ${chip(lab, col)}</div><div class="sub">${c.area === 'brooklyn' ? 'Brooklyn' : 'Manhattan'} · ${c.temper === 'hot' ? '🔥 hot-headed' : '🧊 cool-headed'} · muscle ${c.muscle}/10<br>${esc(c.blurb)}</div>${bar(respectOf(s, c.id) + 100, 200, c.color)}</div>
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
