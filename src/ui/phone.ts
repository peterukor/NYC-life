// =====================================================================
// phone.ts — your in-game phone: the main menu of the game.
//
// Apps: Jobs, Rideshare, Bank, News, Me (skills & mood), Ad Center,
// Help, Settings. If your phone was stolen or swapped, the phone shows
// the recovery screen instead (Find My, police report, prepaid phone).
// =====================================================================

import { clockLabel, nycTime } from '../core/clock.ts';
import { esc, money } from '../core/format.ts';
import { CAREERS, CAREER_BY_ID } from '../data/careers.ts';
import { PLACES, PLACE_BY_ID, isOpen } from '../data/places.ts';
import { deposit, withdraw } from '../sim/economy.ts';
import { computeMood, NEED_INFO } from '../sim/needs.ts';
import { PREPAID_PHONE_PRICE, reportToPolice, trackWithFindMy } from '../sim/phone.ts';
import { CLASSES, ORIGINS, TRAITS } from '../sim/state.ts';
import { OPEN_AREAS, isOpenArea, NEED_KEYS, SKILL_KEYS, type AreaId, type GameState, type SkillKey } from '../sim/types.ts';
import { DISTRICTS } from '../world/layout.ts';
import { WEATHER_INFO, weatherFor } from '../sim/weather.ts';
import { applyForJob, hireBlocker, jobTitle, quitJob, shiftPay } from '../sim/work.ts';
import { HOUSE_ADS } from '../render/textures.ts';
import type { AdStats } from '../world/ads.ts';
import { html, onAct, root, toast } from './dom.ts';
import { STOCKS } from '../data/stocks.ts';
import { BUSINESS_TYPES } from '../data/businesses.ts';
import { businessValue, buyBusiness, candidates, fire, hire, TAX } from '../sim/business.ts';
import { PATHS } from '../data/paths.ts';
import { joinPath, leavePath, levelBlockers, levelTasks, pathLevel, pathTitle, taskProgress, tryLevelUp } from '../sim/paths.ts';
import { PHONE_APPS, type PhoneAppCtx } from './phone-apps.ts';
import './instadash.ts'; // registers the InstaDash app
import { bankruptcyBlocker, DEBT } from '../sim/debt.ts';
import { buyStock, dayChange, netWorth, portfolioValue, priceOf, recentPrices, sellStock, TRADE_FEE } from '../sim/market.ts';

export interface PhoneHost {
  state: GameState;
  /** Price (cents) and minutes for a rideshare to a place, given current surge. */
  rideQuote: (placeId: string, luxury: boolean) => { cost: number; minutes: number; surge: number };
  rideshare: (placeId: string, luxury: boolean) => void;
  adStats: () => AdStats;
  setQuality: (q: GameState['settings']['quality']) => void;
  toggleSound: () => void;
  resetLife: () => void;
  save: () => void;
  refresh: () => void;
}

const SKILL_LABEL: Record<SkillKey, string> = { charisma: 'Charisma', hustle: 'Hustle', fitness: 'Fitness', cooking: 'Cooking', coding: 'Coding', music: 'Music', streetSmarts: 'Street Smarts' };

const APPS = [
  { id: 'jobs', label: 'Jobs', icon: '💼', bg: '#2a9d8f', needsPhone: true },
  { id: 'ride', label: 'Rideshare', icon: '🚗', bg: '#00b4d8', needsPhone: true },
  { id: 'bank', label: 'Bank', icon: '🏦', bg: '#0b3d91', needsPhone: true },
  { id: 'stocks', label: 'Stocks', icon: '📈', bg: '#06a77d', needsPhone: true },
  { id: 'path', label: 'Life Path', icon: '🪜', bg: '#8338ec', needsPhone: false },
  { id: 'biz', label: 'Business', icon: '🏪', bg: '#fb5607', needsPhone: true },
  { id: 'news', label: 'City News', icon: '📰', bg: '#e63946', needsPhone: false },
  { id: 'me', label: 'Me', icon: '🙂', bg: '#6d597a', needsPhone: false },
  { id: 'ads', label: 'Ad Center', icon: '📢', bg: '#f4a261', needsPhone: true },
  { id: 'help', label: 'Help', icon: '💡', bg: '#457b9d', needsPhone: false },
  { id: 'settings', label: 'Settings', icon: '⚙️', bg: '#4a4e69', needsPhone: false },
];

export function openPhone(host: PhoneHost, startApp?: string): () => void {
  const el = html('<div class="phone" role="dialog" aria-label="Phone"></div>');
  root().appendChild(el);
  const s = host.state;

  const close = () => el.remove();

  const home = () => {
    const t = nycTime();
    const w = WEATHER_INFO[weatherFor(t.dateKey, t.hour)];
    el.innerHTML = `
      <div class="phone-bar"><span>${clockLabel(t)}</span><span>${s.phone.ok ? '●●● 5G' : 'No SIM'}</span></div>
      <button class="phone-close" data-act="close" aria-label="Close phone">✕</button>
      <div class="phone-home">
        <div class="phone-time">${clockLabel(t).replace(/ (AM|PM)/, '')}</div>
        <div class="phone-date">${new Date(`${t.dateKey}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })} · New York · ${w.emoji} ${w.label}</div>
        ${s.phone.ok ? '' : `<div class="card" style="margin-bottom:14px;background:rgba(255,69,58,.15)"><h3>📵 Your phone is gone</h3><p>${esc(s.phone.lostReason ?? 'Lost')}. Most apps are locked until you get it back.</p><button class="btn primary block" style="margin-top:10px" data-act="app:recover">Get it back</button></div>`}
        <div class="apps">${[...APPS, ...PHONE_APPS.where((a) => !a.hidden).sort((a, b) => (a.order ?? 100) - (b.order ?? 100))].map((a) => `<button class="app" data-act="app:${a.id}" ${a.needsPhone && !s.phone.ok ? 'aria-disabled="true" disabled' : ''}><span class="icon" style="background:${a.bg}">${a.icon}</span>${a.label}</button>`).join('')}</div>
      </div>`;
  };

  const page = (title: string, body: string) => {
    el.innerHTML = `<div class="phone-app"><header><button class="back" data-act="home" aria-label="Back">‹</button><h2>${title}</h2><button class="back" style="margin-left:auto" data-act="close" aria-label="Close phone">✕</button></header><div class="content">${body}</div></div>`;
  };

  const apps: Record<string, () => void> = {
    jobs() {
      const current = s.job ? CAREER_BY_ID[s.job.careerId] : null;
      page('Jobs', `
        ${current ? `<div class="card"><h3>${current.emoji} ${esc(jobTitle(s))} · ${current.name}</h3><p>${money(shiftPay(s))} per shift · performance ${Math.round(s.job!.performance)}% · ${s.job!.shiftsToday} shifts today<br>Work at ${esc(PLACE_BY_ID[current.placeId].name)}. Tap “Go to work” on the main screen.</p><button class="btn ghost block" style="margin-top:10px" data-act="quit">Quit this job</button></div><br>` : ''}
        ${CAREERS.map((c) => {
          const block = hireBlocker(s, c);
          const mine = s.job?.careerId === c.id;
          const where = PLACE_BY_ID[c.placeId];
          return `<div class="list-item"><div class="grow"><div class="title">${c.emoji} ${c.name} — ${c.ladder[0].title}</div><div class="sub">${esc(c.blurb)}<br>${money(c.ladder[0].pay)}/shift → ${c.ladder[c.ladder.length - 1].title} ${money(c.ladder[c.ladder.length - 1].pay)} · 📍 ${esc(where.name)}</div>${block ? `<div class="sub" style="color:var(--bad);font-weight:700">🔒 ${esc(block)}</div>` : ''}</div>${mine ? '<span class="tag open">Your job</span>' : `<button class="btn ${block ? '' : 'primary'}" data-act="hire:${c.id}" ${block ? 'disabled' : ''}>Apply</button>`}</div>`;
        }).join('')}`);
    },
    ride() {
      const t = nycTime();
      page('Rideshare', `
        <p class="blurb">Pick where you’re going. Prices rise at rush hour and in bad weather. Luxury rides are fancier (and faster to find).</p>
        ${PLACES.filter((p) => isOpenArea(p.area) && (p.type !== 'home' || p.id === s.home.placeId))
          .map((p) => {
            const q = host.rideQuote(p.id, false);
            const here = s.location.placeId === p.id;
            return `<div class="list-item"><div class="grow"><div class="title">${p.emoji} ${esc(p.name)}</div><div class="sub">${DISTRICTS[p.area].name} · ${q.minutes} min${q.surge > 1 ? ` · ⚡ surge ×${q.surge.toFixed(1)}` : ''}${isOpen(p, t.hour) ? '' : ' · closed now'}</div></div>${here ? '<span class="tag">You’re here</span>' : `<button class="btn primary" data-act="ride:${p.id}">${money(q.cost)}</button>`}</div>`;
          })
          .join('')}`);
    },
    bank() {
      page('Big Apple Bank', `
        <div class="card"><p>Cash on you</p><div class="big-number">${money(s.money)}</div><p style="margin-top:8px">In the bank (safe from pickpockets and scams)</p><div class="big-number" style="color:var(--good)">${money(s.bank)}</div></div>
        <div class="row" style="margin-top:10px">
          <button class="btn" data-act="dep:5000">Deposit $50</button><button class="btn" data-act="dep:all">Deposit all</button>
          <button class="btn" data-act="wd:5000">Withdraw $50</button><button class="btn" data-act="wd:20000">Withdraw $200</button>
        </div>
        ${s.debt ? `<div class="card" style="border:2px solid var(--bad)"><h3>📞 In collections: ${money(s.debt.owed)}</h3><p>Unpaid bills since ${esc(s.debt.since)}. Collectors take ${Math.round(DEBT.dailyGrab * 100)}% a day from your cash and bank, and add interest when they can’t.</p><button class="btn primary block" style="margin-top:10px" data-act="debt.pay">Pay off what I can</button>${bankruptcyBlocker(s) ? `<p class="sub" style="margin-top:8px">${esc(bankruptcyBlocker(s)!)}</p>` : `<button class="btn block" style="margin-top:8px;color:var(--bad)" data-act="debt.ask">File for bankruptcy…</button>`}</div>` : ''}
        ${s.loan ? `<div class="card"><h3>🎓 Student loan</h3><p>${money(s.loan.owed)} left · ${money(s.loan.weekly)} taken every week automatically.</p></div>` : ''}
        ${s.home.weeklyRent ? `<div class="card"><h3>🏠 Rent</h3><p>${money(s.home.weeklyRent)} every week (cash first, then bank).</p></div>` : `<div class="card"><h3>🏠 Rent</h3><p>Paid by Dad. Must be nice.</p></div>`}
        <h3 style="margin:16px 0 8px;font-size:15px">History</h3>
        ${s.ledger.length ? s.ledger.slice(0, 40).map((l) => `<div class="list-item"><div class="grow"><div class="title">${esc(l.reason)}</div><div class="sub">${new Date(l.at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></div><div class="amt ${l.delta > 0 ? 'pos' : 'neg'}">${money(l.delta, { sign: true })}</div></div>`).join('') : '<p class="blurb">No transactions yet.</p>'}`);
    },
    path() {
      const active = s.paths.active ? PATHS.get(s.paths.active) : null;
      if (!active) {
        page('Life Path', `
          <p class="blurb">Pick a ladder to climb. Rep comes fast at first and very slowly at the top. Every level asks for a different mix of things, so no two climbs are the same.</p>
          ${PATHS.all().map((p) => `<div class="card"><h3>${p.emoji} ${p.name}</h3><p>${esc(p.blurb)}</p><p class="sub" style="margin-top:6px">${p.titles.map((t, i) => `${i + 1}. ${esc(t)}`).join(' → ')}</p>${p.warning ? `<p style="margin-top:6px;color:var(--bad);font-size:12px">⚠️ ${esc(p.warning)}</p>` : ''}<button class="btn primary block" style="margin-top:10px" data-act="path:join:${p.id}">Start as ${esc(p.titles[0])}${s.paths.levels[p.id] ? ` (you were ${esc(p.titles[s.paths.levels[p.id] - 1])})` : ''}</button></div>`).join('')}`);
        return;
      }
      const lvl = pathLevel(s, active.id);
      const top = lvl >= active.titles.length;
      const rep = Math.floor(s.paths.rep[active.id] ?? 0);
      const need = active.repCurve[Math.min(lvl, active.repCurve.length - 1)];
      const tasks = levelTasks(s, active.id);
      const blockers = levelBlockers(s, active.id);
      page('Life Path', `
        <div class="card"><h3>${active.emoji} ${esc(pathTitle(s, active.id))}</h3><p>${active.name} · level ${lvl} of ${active.titles.length}</p>
          <div class="skill-row" style="margin-top:8px"><span>Rep</span><div class="bar"><i style="width:${top ? 100 : Math.min(100, (rep / need) * 100)}%;background:#8338ec"></i></div><span>${rep}${top ? '' : `/${need}`}</span></div></div>
        ${top ? '<p class="blurb">You’re at the top. Legend.</p>' : `<h3 style="margin:14px 0 8px;font-size:15px">To become ${esc(active.titles[lvl])}</h3>
        ${tasks.map((t) => {
          const pr = taskProgress(s, active.id, t);
          const done = pr.have >= pr.need;
          const show = t.kind === 'netWorth' ? `${money(pr.have)} / ${money(pr.need)}` : `${Math.min(pr.have, pr.need)} / ${pr.need}`;
          return `<div class="list-item"><div style="font-size:20px">${done ? '✅' : '⬜'}</div><div class="grow"><div class="title">${esc(t.label)}</div><div class="sub">${show}</div></div></div>`;
        }).join('')}
        <button class="btn ${blockers.length ? '' : 'primary'} block" style="margin-top:10px" data-act="path:up" ${blockers.length ? 'disabled' : ''}>${blockers.length ? `Still needed: ${blockers.length}` : `⬆ Become ${esc(active.titles[lvl])}`}</button>`}
        <button class="btn ghost block" style="margin-top:10px" data-act="path:leave">Step away from this path (progress is kept)</button>`);
    },
    biz() {
      const t = nycTime();
      const board = candidates(t.dateKey);
      const owned = s.business.owned;
      page('Business', `
        <div class="card"><p>Businesses worth</p><div class="big-number">${money(businessValue(s))}</div><p style="margin-top:6px">Tax is ${Math.round(TAX.rate * 100)}% of profit, every game day. Staff quality makes or breaks you.</p></div>
        ${owned.map((b) => {
          const bt = BUSINESS_TYPES.get(b.type)!;
          return `<div class="card"><h3>${bt.emoji} ${esc(b.name)}</h3>
            <p>${b.staff.length}/${bt.staff} staff${b.last ? ` · yesterday: ${money(b.last.revenue)} sales, ${b.last.profit >= 0 ? 'profit' : 'loss'} ${money(Math.abs(b.last.profit))}, tax ${money(b.last.tax)}` : ' · opens tomorrow'}</p>
            ${b.staff.map((x) => `<div class="list-item"><div class="grow"><div class="title">${esc(x.name)}</div><div class="sub">Skill ${x.skill}/10 · ${money(x.wage)}/day</div></div><button class="btn" data-act="biz:fire:${b.uid}:${encodeURIComponent(x.name)}">Fire</button></div>`).join('')}
            ${b.staff.length < bt.staff ? `<p class="sub" style="margin:8px 0 4px">Hire today:</p>${board.filter((c) => !b.staff.some((x) => x.name === c.name)).map((c) => `<div class="list-item"><div class="grow"><div class="title">${esc(c.name)}</div><div class="sub">Skill ${c.skill}/10 · ${money(c.wage)}/day</div></div><button class="btn primary" data-act="biz:hire:${b.uid}:${encodeURIComponent(c.name)}">Hire</button></div>`).join('')}` : ''}
          </div>`;
        }).join('')}
        ${owned.length ? `<div class="card"><h3>🧾 Creative accounting</h3><p>Report only ${Math.round(TAX.fraudReports * 100)}% of profit and pay way less tax… until the IRS audits you. If they do, you pay it all back ×${TAX.penalty}.</p><button class="btn ${s.business.fraud ? 'primary' : ''} block" style="margin-top:8px" data-act="biz:fraud">${s.business.fraud ? '✅ Cooking the books (tap to stop)' : 'Start cooking the books'}</button></div>` : ''}
        <h3 style="margin:14px 0 8px;font-size:15px">Buy a business</h3>
        ${BUSINESS_TYPES.all().map((bt) => `<div class="list-item"><div style="font-size:24px">${bt.emoji}</div><div class="grow"><div class="title">${bt.name} · ${money(bt.price)}</div><div class="sub">${esc(bt.blurb)}<br>~${money(bt.revenue)}/day sales · ${bt.staff} staff</div></div><button class="btn ${s.money + s.bank >= bt.price ? 'primary' : ''}" data-act="biz:buy:${bt.id}" ${s.money + s.bank >= bt.price ? '' : 'disabled'}>Buy</button></div>`).join('')}`);
    },
    stocks() {
      const spark = (prices: number[]) => {
        if (prices.length < 2) return '';
        const lo = Math.min(...prices);
        const hi = Math.max(...prices);
        const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * 60},${18 - ((p - lo) / Math.max(1, hi - lo)) * 16}`).join(' ');
        const up = prices[prices.length - 1] >= prices[0];
        return `<svg class="spark" viewBox="0 0 60 20" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? '#1a9e55' : '#e0283f'}" stroke-width="2" stroke-linejoin="round"/></svg>`;
      };
      const pv = portfolioValue(s);
      page('Stocks', `
        <div class="card"><p>Net worth</p><div class="big-number">${money(netWorth(s))}</div><p style="margin-top:6px">Investments ${money(pv)} · Cash ${money(s.money)} · Bank ${money(s.bank)}</p></div>
        <p class="blurb">Made-up companies, real lessons: index funds are calm, single stocks swing, meme coins can vanish. Prices move once per game day. Fee: ${money(TRADE_FEE.flat)} + ${TRADE_FEE.rate * 100}% per trade.</p>
        ${STOCKS.all().map((st) => {
          const price = priceOf(st.id);
          const ch = dayChange(st.id);
          const h = s.portfolio[st.id];
          const val = h ? Math.round(h.shares * price) : 0;
          const gain = h ? val - h.cost : 0;
          return `<div class="list-item stock"><div style="font-size:24px">${st.emoji}</div><div class="grow"><div class="title">${st.ticker} · ${esc(st.name)}</div><div class="sub">${esc(st.sector)}${st.fund ? ' · 🛡️ safer' : ''} · ${money(price)} <b style="color:${ch >= 0 ? 'var(--good)' : 'var(--bad)'}">${ch >= 0 ? '▲' : '▼'} ${Math.abs(ch).toFixed(1)}%</b></div>${h ? `<div class="sub">You own ${money(val)} (${gain >= 0 ? '+' : ''}${money(gain)})</div>` : ''}<div class="row" style="margin-top:6px"><button class="btn" data-act="buy:${st.id}:5000">Buy $50</button><button class="btn" data-act="buy:${st.id}:50000">Buy $500</button>${h ? `<button class="btn" data-act="sell:${st.id}">Sell all</button>` : ''}</div></div>${spark(recentPrices(st.id, 14))}</div>`;
        }).join('')}`);
    },
    news() {
      const tabs: ('all' | 'city' | AreaId)[] = ['all', 'city', ...OPEN_AREAS];
      let tab: (typeof tabs)[number] = 'all';
      const render = () => {
        const items = s.news.filter((n) => tab === 'all' || n.scope === tab);
        page('City News', `
          <div class="seg">${tabs.map((t) => `<button data-act="ntab:${t}" class="${t === tab ? 'on' : ''}">${t === 'all' ? 'All' : t === 'city' ? 'Citywide' : DISTRICTS[t as AreaId].name}</button>`).join('')}</div>
          ${items.length ? items.map((n) => `<div class="list-item"><div style="font-size:24px">${n.emoji}</div><div class="grow"><div class="title">${esc(n.headline)}</div><div class="sub">${n.scope === 'city' ? 'Citywide' : DISTRICTS[n.scope as AreaId].name} · ${new Date(n.at).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' })}${n.personal ? ' · 📍 you' : ''}</div></div></div>`).join('') : '<p class="blurb">Quiet day in the city.</p>'}`);
      };
      render();
      newsTab = (t) => {
        tab = t as typeof tab;
        render();
      };
    },
    me() {
      const mood = computeMood(s);
      page('Me', `
        <div class="card"><h3>${esc(s.profile.name)} · ${s.profile.spawnClass ? `${CLASSES[s.profile.spawnClass].emoji} ${CLASSES[s.profile.spawnClass].title}` : `${ORIGINS[s.profile.origin].emoji} ${ORIGINS[s.profile.origin].title}`}</h3><p>${mood.emoji} ${mood.label} · ${esc(jobTitle(s))}<br>${s.profile.traits.map((t) => `${TRAITS[t]?.emoji ?? ''} ${TRAITS[t]?.label ?? t}`).join(' · ')}</p></div>
        <h3 style="margin:14px 0 8px;font-size:15px">Needs</h3>
        ${NEED_KEYS.map((k) => `<div class="skill-row"><span>${NEED_INFO[k].emoji} ${NEED_INFO[k].label}</span><div class="bar"><i style="width:${Math.round(s.needs[k])}%;background:${NEED_INFO[k].color}"></i></div><span>${Math.round(s.needs[k])}</span></div>`).join('')}
        <h3 style="margin:14px 0 8px;font-size:15px">Skills</h3>
        ${SKILL_KEYS.map((k) => `<div class="skill-row"><span>${SKILL_LABEL[k]}</span><div class="bar"><i style="width:${Math.min(100, (s.skills[k] % 1) * 100)}%"></i></div><span>${Math.floor(s.skills[k])}</span></div>`).join('')}
        <h3 style="margin:14px 0 8px;font-size:15px">Mood boosts & hits</h3>
        ${s.moodlets.length ? s.moodlets.map((m) => `<div class="list-item"><div style="font-size:22px">${m.emoji}</div><div class="grow"><div class="title">${esc(m.label)}</div><div class="sub">wears off in ${Math.max(1, Math.round((m.expiresAt - Date.now()) / 60000))} min</div></div><div class="amt ${m.value > 0 ? 'pos' : 'neg'}">${m.value > 0 ? '+' : ''}${m.value}</div></div>`).join('') : '<p class="blurb">Nothing special right now.</p>'}
        <div class="card"><p>🧠 Scams spotted: <b>${s.stats.scamsSpotted}</b> · fallen for: <b>${s.stats.scamsFallenFor}</b></p></div>`);
    },
    ads() {
      const st = host.adStats();
      const rows = HOUSE_ADS.map((a) => ({ a, sec: st.seconds[a.id] ?? 0, views: st.views[a.id] ?? 0, taps: st.taps[a.id] ?? 0 })).sort((x, y) => y.sec - x.sec);
      page('Ad Center', `
        <p class="blurb">How often each ad was <b>really</b> seen on your screen: it only counts when the ad is in view, facing you, and big enough to read. Advertisers will see these numbers (from all players) on their dashboard.</p>
        ${rows.map((r) => `<div class="list-item"><div class="grow"><div class="title">${esc(r.a.brand)}</div><div class="sub">${esc(r.a.line)}</div></div><div class="amt pos">${r.views} views<br><span class="sub">${Math.round(r.sec)}s · ${r.taps} taps</span></div></div>`).join('')}
        <div class="card"><h3>Want your brand in the city?</h3><p>Times Square screens, rooftop billboards, bus shelters, subway car cards and TV spots. Advertising opens with the multiplayer launch.</p></div>`);
    },
    help() {
      page('Help & guide', `
        <div class="card"><h3>👋 The basics</h3><p>Keep your six needs up (the bars bottom-left). Tap a glowing ring on the sidewalk to go into a place. Tap the street to walk. Drag to look around, pinch to zoom out over the whole neighbourhood.</p></div>
        <div class="card"><h3>💼 Money</h3><p>Get a job in Jobs, then tap “Go to work”. Shifts run 6 AM–11 PM New York time, up to 4 a day. Gigs (freelance, flipping sneakers, busking) pay too. Keep savings in the Bank — cash can be pickpocketed.</p></div>
        <div class="card"><h3>🕐 Real time</h3><p>The game clock is the real time in New York. Bars open at night, rush hour is busy, and rent comes due every 7 real days.</p></div>
        <div class="card"><h3>🚇 Getting around</h3><p>Open the Map and tap a place: walk (free), take the subway ($2.90) or call a Rideshare. Brooklyn is a train ride away.</p></div>
        <div class="card"><h3>🚩 Scams</h3><p>If a stranger puts something on you and asks for money, a “job” asks you to pay, or an email says you’re a billionaire’s heir — walk away. The game shows the red flags after each one.</p></div>`);
    },
    settings() {
      const q = s.settings.quality;
      page('Settings', `
        <div class="card"><h3>Graphics</h3><p>Lower settings run smoother on older phones.</p>
          <div class="seg" style="margin-top:10px">${(['auto', 'low', 'medium', 'high'] as const).map((x) => `<button data-act="q:${x}" class="${q === x ? 'on' : ''}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div></div>
        <div class="card"><h3>Sound</h3><button class="btn block" data-act="sound">${s.settings.sound ? '🔊 On' : '🔇 Off'}</button></div>
        <div class="card"><h3>Start over</h3><p>Deletes this life on this device. There’s no undo.</p><button class="btn block" style="margin-top:10px;color:var(--bad)" data-act="reset">Start a new life</button></div>
        <p class="fine">NYC Life preview · single-player · saves on this device. Places are inspired by real New York; brands are fictional unless marked “Sponsored”.</p>`);
    },
    recover() {
      page('Get your phone back', `
        <p class="blurb">${esc(s.phone.lostReason ?? 'Your phone is missing')}. Here’s what you’d do in real life, too:</p>
        <button class="list-item" style="width:100%;text-align:left" data-act="findmy"><div style="font-size:24px">📍</div><div class="grow"><div class="title">Track it with Find My</div><div class="sub">Log in from a friend’s laptop. Works better with Street Smarts.</div></div></button>
        <button class="list-item" style="width:100%;text-align:left" data-act="police"><div style="font-size:24px">🚓</div><div class="grow"><div class="title">Report it to the police</div><div class="sub">Non-emergency report. If someone hands it in, you’ll get a call.</div></div></button>
        <div class="list-item"><div style="font-size:24px">🏪</div><div class="grow"><div class="title">Buy a prepaid phone (${money(PREPAID_PHONE_PRICE)})</div><div class="sub">Any bodega sells one. Go into a bodega and tap the counter.</div></div></div>
        <div class="lesson">Real-life tip: also call your carrier to block the SIM and change your important passwords.</div>`);
    },
  };

  let newsTab: ((t: string) => void) | null = null;

  // Plug-in apps (ui/phone-apps.ts).
  const ctx: PhoneAppCtx = { s, host, close: () => close() };
  const openRegistered = (id: string) => {
    const app = PHONE_APPS.get(id);
    if (!app) return home();
    const r = app.render(ctx);
    page(r.title, r.body);
  };

  onAct(el, (act) => {
    if (act === 'close') return close();
    if (act === 'home') return home();
    if (act.startsWith('app:')) {
      const id = act.slice(4);
      if (apps[id]) return apps[id]();
      return openRegistered(id);
    }
    // Acts from plug-in apps look like "cars.buy:metroSedan".
    const dot = act.indexOf('.');
    if (dot > 0 && PHONE_APPS.has(act.slice(0, dot))) {
      const app = PHONE_APPS.require(act.slice(0, dot));
      const r = app.act?.(act.slice(dot + 1), ctx);
      host.save();
      host.refresh();
      if (r === 'close') return close();
      if (typeof r === 'string') return apps[r] ? apps[r]() : openRegistered(r);
      return openRegistered(app.id);
    }
    if (act.startsWith('ntab:')) return newsTab?.(act.slice(5));
    if (act.startsWith('hire:')) {
      const id = act.slice(5);
      const err = applyForJob(s, id);
      if (err) return toast(err, { icon: '🔒', tone: 'bad' });
      const c = CAREER_BY_ID[id];
      toast(`Hired! ${c.ladder[0].title} at ${PLACE_BY_ID[c.placeId].name}. Tap 💼 Go to work when you're ready.`, { icon: c.emoji, tone: 'good', ms: 4500 });
      host.save();
      host.refresh();
      return apps.jobs();
    }
    if (act === 'quit') {
      quitJob(s);
      host.save();
      host.refresh();
      return apps.jobs();
    }
    if (act.startsWith('ride:')) {
      close();
      return host.rideshare(act.slice(5), false);
    }
    if (act.startsWith('dep:') || act.startsWith('wd:')) {
      const [kind, amt] = act.split(':');
      const cents = amt === 'all' ? s.money : Number(amt);
      const r = kind === 'dep' ? deposit(s, cents) : withdraw(s, cents);
      if (!r.ok) toast(r.why, { icon: '🏦', tone: 'bad' });
      host.save();
      host.refresh();
      return apps.bank();
    }
    if (act.startsWith('biz:')) {
      const [, what, a, b] = act.split(':');
      let err: string | null = null;
      if (what === 'buy') err = buyBusiness(s, a);
      if (what === 'hire') {
        const who = candidates(nycTime().dateKey).find((c) => c.name === decodeURIComponent(b));
        err = who ? hire(s, a, who) : 'They took another job.';
      }
      if (what === 'fire') fire(s, a, decodeURIComponent(b));
      if (what === 'fraud') s.business.fraud = !s.business.fraud;
      if (err) toast(err, { icon: '🏪', tone: 'bad' });
      else if (what === 'buy') toast('It’s yours! Hire staff so it opens properly.', { icon: '🏪', tone: 'good' });
      host.save();
      host.refresh();
      return apps.biz();
    }
    if (act.startsWith('path:')) {
      const [, what, id] = act.split(':');
      if (what === 'join') joinPath(s, id);
      if (what === 'leave') leavePath(s);
      if (what === 'up') {
        const t = tryLevelUp(s, s.paths.active!);
        if (t) toast(`You’re now a ${t}!`, { icon: '📈', tone: 'good', ms: 4000 });
      }
      host.save();
      host.refresh();
      return apps.path();
    }
    if (act.startsWith('buy:') || act.startsWith('sell:')) {
      const [kind, id, amt] = act.split(':');
      if (kind === 'buy') {
        const err = buyStock(s, id, Number(amt));
        toast(err ?? `Bought ${money(Number(amt))} of ${STOCKS.get(id)?.ticker}`, { icon: '📈', tone: err ? 'bad' : 'good' });
      } else {
        const r = sellStock(s, id);
        toast('error' in r ? r.error : `Sold for ${money(r.got)}`, { icon: '📈', tone: 'error' in r ? 'bad' : 'good' });
      }
      host.save();
      host.refresh();
      return apps.stocks();
    }
    if (act.startsWith('q:')) {
      host.setQuality(act.slice(2) as GameState['settings']['quality']);
      return apps.settings();
    }
    if (act === 'sound') {
      host.toggleSound();
      return apps.settings();
    }
    if (act === 'reset') {
      if (window.confirm('Delete this life and start over?')) {
        close();
        host.resetLife();
      }
      return;
    }
    if (act === 'findmy') {
      const r = trackWithFindMy(s);
      toast(r.text, { icon: r.found ? '📱' : '📍', tone: r.found ? 'good' : 'info', ms: 4500 });
      host.save();
      host.refresh();
      return r.found ? home() : apps.recover();
    }
    if (act === 'police') {
      toast(reportToPolice(s), { icon: '🚓', ms: 4500 });
      host.save();
      return;
    }
  });

  if (startApp && apps[startApp]) apps[startApp]();
  else if (startApp && PHONE_APPS.has(startApp)) openRegistered(startApp);
  else home();
  return close;
}
