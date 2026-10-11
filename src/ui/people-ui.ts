// =====================================================================
// people-ui.ts — talking to people on the street, dates, confrontations
// and Speak loud.
//
//   openPerson()   — tap someone: who they are (as far as you know), how
//                    they feel about you, and what you can do
//   planDate()     — they said yes: pick a spot, go, three rounds of
//                    conversation, then maybe invite them home
//   confront()     — someone with a grudge comes at you: apologise, run,
//                    or fight
//   openSpeak()    — Speak loud: your words float over your head and
//                    nearby people react
//
// All the rules live in sim/people.ts, sim/social.ts, sim/dates.ts and
// sim/speech.ts; this file is only the screens.
// =====================================================================

import { nowMs, nycTime } from '../core/clock.ts';
import { esc, money } from '../core/format.ts';
import { PLACE_BY_ID } from '../data/places.ts';
import { DATE_SPOTS, dateRound, finishDate, payForDate, stayOver, type DateSpot } from '../sim/dates.ts';
import { memoryOf, moodToday, personOf, RELATION, remember, vibe } from '../sim/people.ts';
import { doSocial, SOCIAL_ACTIONS, socialContext, streetFight, swingChance } from '../sim/social.ts';
import { cleanSpeech, QUICK_LINES, reactions, SPEECH } from '../sim/speech.ts';
import type { AreaId, GameState } from '../sim/types.ts';
import { say } from './bubbles.ts';
import { closeSheet, onAct, openModal, openSheet, toast } from './dom.ts';

export interface PeopleHost {
  state: GameState;
  area: () => AreaId;
  /** Where a person is now (null = gone). */
  where: (personId: string) => { x: number; z: number } | null;
  player: () => { x: number; z: number };
  /** People near a point, nearest first. */
  nearby: (x: number, z: number, r: number) => { personId: string; d: number }[];
  hold: (personId: string, seconds: number) => void;
  approach: (personId: string) => void;
  /** Fade-travel to a place, then run `then` there. */
  goTo: (placeId: string, label: string, then: () => void) => void;
  goHome: (then: () => void) => void;
  save: () => void;
  refresh: () => void;
  sfx: (kind: 'good' | 'bad' | 'tap') => void;
}

const first = (name: string) => name.split(' ')[0];

/** The game registers itself here so other screens (Contacts) can start dates. */
let bound: PeopleHost | null = null;
export function bindPeople(h: PeopleHost): void {
  bound = h;
}
export function peopleHost(): PeopleHost | null {
  return bound;
}

/** Tap on a person in the street. */
export function openPerson(h: PeopleHost, personId: string): void {
  const s = h.state;
  const p = personOf(personId);
  h.hold(personId, 25);
  const area = h.area();
  const m0 = memoryOf(s, personId);
  // Grudge-holders may not wait for you to speak.
  if (m0 && m0.grudge >= 50 && Math.random() < swingChance(p, m0) * 0.6) return confront(h, personId);

  const render = () => {
    const m = memoryOf(s, personId);
    const c = socialContext(s, personId, area, nycTime().hour);
    const v = vibe(m);
    const mood = moodToday(personId);
    const known = p.quirks.filter((q) => m?.known.includes(q.id));
    const actions = SOCIAL_ACTIONS.all().filter((a) => a.show({ ...c, times: m?.today.acts[a.id] ?? 0 }));
    return `
      <div class="person-head">
        <div class="person-av">${v.emoji}</div>
        <div><div class="sub">${p.age} · ${esc(p.job)} · ${m ? RELATION[m.level] : 'Stranger'}${m?.hasNumber ? ' · 📱' : ''}${m?.key ? ' · 🔑' : ''}</div>
        <div class="sub">${v.label}${m ? ` · mood: ${mood === 'great' ? 'great 😄' : mood === 'grumpy' ? 'grumpy 😒' : mood === 'busy' ? 'in a rush ⏱️' : 'fine'}` : ''}</div></div>
      </div>
      ${m ? `<div class="likes-bar" title="How much they like you"><i style="left:${(m.likes + 100) / 2}%"></i></div>` : ''}
      ${known.length ? `<div class="row" style="flex-wrap:wrap;gap:6px;margin:8px 0">${known.map((q) => `<span class="tag">${q.emoji} ${esc(q.label)}</span>`).join('')}</div>` : '<p class="sub" style="margin:8px 0">Chat to learn what they’re into.</p>'}
      <div class="social-grid">${actions.map((a) => `<button class="btn ${a.risky ? 'risky' : ''}" data-act="soc:${a.id}">${a.emoji} ${esc(a.label)}</button>`).join('')}</div>`;
  };

  const sheet = openSheet({ emoji: '🧑', title: p.name, sub: 'New Yorker', body: render() });
  const bubbleAt = () => h.where(personId);
  onAct(sheet.body, (act) => {
    if (!act.startsWith('soc:')) return;
    const r = doSocial(s, personId, area, act.slice(4), nycTime().hour);
    if (r.say) say(bubbleAt, r.say, { who: first(p.name), tone: r.tone === 'bad' ? 'rude' : 'nice' });
    h.sfx(r.tone === 'good' ? 'good' : r.tone === 'bad' ? 'bad' : 'tap');
    h.save();
    h.refresh();
    if (s.jail) {
      sheet.close();
      return toast(r.text, { tone: 'bad', ms: 5000 });
    }
    if (r.fight) {
      sheet.close();
      return fightPrompt(h, personId, r.text);
    }
    if (r.date) {
      sheet.close();
      toast(r.text, { icon: '💘', tone: 'good' });
      return planDate(h, personId);
    }
    toast(r.text, { tone: r.tone, ms: 3500 });
    sheet.body.innerHTML = render();
  });
}

/** They want to fight. Fight, run, or try to talk them down. */
function fightPrompt(h: PeopleHost, personId: string, lead: string): void {
  const p = personOf(personId);
  const m = openModal(`<div class="big">😤</div><h2>${esc(first(p.name))} squares up</h2><p class="blurb">${esc(lead)}</p>
    <button class="btn primary block" data-act="fight">👊 Fight</button>
    <button class="btn block" style="margin-top:8px" data-act="run">🏃 Run</button>
    <button class="btn ghost block" style="margin-top:8px" data-act="calm">🙏 Back down</button>`);
  onAct(m.el, (act) => {
    m.close();
    const s = h.state;
    if (act === 'fight') {
      const r = streetFight(s, personId, h.area());
      h.sfx(r.won ? 'good' : 'bad');
      toast(r.text, { tone: r.won ? 'good' : 'bad', ms: 5500 });
    } else if (act === 'run') {
      if (Math.random() < 0.45 + (s.skills.fitness ?? 0) * 0.06) toast('You got away. Heart pounding.', { icon: '🏃', ms: 3500 });
      else {
        const r = streetFight(s, personId, h.area());
        toast(`They caught you. ${r.text}`, { tone: r.won ? 'good' : 'bad', ms: 5500 });
      }
    } else {
      const mem = remember(s, personId, h.area(), nowMs());
      if (p.warmth !== 'mean' && Math.random() < 0.6) {
        mem.grudge = Math.max(0, mem.grudge - 10);
        say(() => h.where(personId), 'Yeah, that’s what I thought.', { who: first(p.name), tone: 'rude' });
        toast('You backed down. Pride hurts, face doesn’t.', { icon: '🙏' });
      } else {
        const r = streetFight(s, personId, h.area());
        toast(`They swung anyway. ${r.text}`, { tone: r.won ? 'good' : 'bad', ms: 5500 });
      }
    }
    h.save();
    h.refresh();
  });
}

/** Someone with a grudge comes at you in the street. */
export function confront(h: PeopleHost, personId: string): void {
  const p = personOf(personId);
  const mem = remember(h.state, personId, h.area(), nowMs());
  mem.lastConfront = nowMs();
  say(() => h.where(personId), 'YOU. Remember me?', { who: first(p.name), tone: 'rude', loud: true });
  fightPrompt(h, personId, `${p.name} hasn’t forgotten what you did.`);
}

/** Pick a date spot, go there, and have the date. */
export function planDate(h: PeopleHost, personId: string): void {
  const s = h.state;
  const p = personOf(personId);
  const sheet = openSheet({
    emoji: '💘',
    title: `Date with ${first(p.name)}`,
    sub: 'Where to?',
    body: `<div class="travel">${DATE_SPOTS.filter((d) => PLACE_BY_ID[d.placeId]).map((d) => `<button class="opt" data-act="spot:${d.id}"><span style="font-size:24px">${d.emoji}</span><span class="grow"><b>${esc(d.label)}</b><small>${esc(PLACE_BY_ID[d.placeId].name)}</small></span><span class="cost">${d.cost ? money(d.cost) : 'Free'}</span></button>`).join('')}</div>`,
  });
  onAct(sheet.body, (act) => {
    const spot = DATE_SPOTS.find((d) => `spot:${d.id}` === act);
    if (!spot) return;
    const err = payForDate(s, spot);
    if (err) return toast(err, { icon: '💸', tone: 'bad' });
    sheet.close();
    closeSheet();
    h.goTo(spot.placeId, `💘 Meeting ${first(p.name)}…`, () => runDate(h, personId, spot));
  });
}

/** Three rounds of conversation, then the verdict. */
function runDate(h: PeopleHost, personId: string, spot: DateSpot): void {
  const p = personOf(personId);
  let round = 0;
  let score = 0;
  const m = openModal('');
  const show = () => {
    if (round >= 3) return end();
    const topics = dateRound(p, round);
    m.el.innerHTML = `<div class="big">${spot.emoji}</div><h2>${esc(first(p.name))}</h2><p class="blurb">Round ${round + 1} of 3 · What do you bring up?</p>
      ${topics.map((t, i) => `<button class="btn block" style="margin-top:8px" data-act="t:${i}:${t.value}">${esc(t.text)}</button>`).join('')}`;
  };
  const end = () => {
    const r = finishDate(h.state, personId, h.area(), score, spot);
    h.save();
    h.refresh();
    m.el.innerHTML = `<div class="big">${r.grade === 'great' ? '🥰' : r.grade === 'good' ? '😊' : r.grade === 'awkward' ? '😅' : '😬'}</div><h2>${r.grade === 'great' ? 'Great date!' : r.grade === 'good' ? 'Nice date' : r.grade === 'awkward' ? 'Awkward…' : 'Disaster'}</h2><p class="blurb">${esc(r.text)}</p>
      ${r.canInvite ? `<button class="btn primary block" data-act="home">🌙 Invite ${esc(first(p.name))} home</button>` : ''}
      <button class="btn ${r.canInvite ? 'ghost' : 'primary'} block" style="margin-top:8px" data-act="bye">Say goodnight</button>`;
  };
  show();
  onAct(m.el, (act) => {
    if (act.startsWith('t:')) {
      const v = Number(act.split(':')[2]);
      score += v;
      const line = v >= 2 ? 'Oh my god, I LOVE that!' : v === 0 ? 'Mm, yeah, totally.' : 'Ugh. Can we talk about something else?';
      toast(`${first(p.name)}: “${line}”`, { icon: v >= 2 ? '😍' : v === 0 ? '🙂' : '😒', ms: 2200 });
      if (v >= 2) {
        const q = p.quirks[round % p.quirks.length];
        const mem = remember(h.state, personId, h.area(), nowMs());
        if (!mem.known.includes(q.id)) mem.known.push(q.id);
      }
      round++;
      return show();
    }
    m.close();
    if (act === 'home') {
      h.goHome(() => {
        const text = stayOver(h.state, personId, h.area());
        h.save();
        h.refresh();
        const mm = openModal(`<div class="big">🌙</div><h2>The next morning</h2><p class="blurb">${esc(text)}</p><button class="btn primary block" data-act="ok">Okay</button>`);
        onAct(mm.el, () => mm.close());
      });
    }
  });
}

let lastShout = 0;

/** Speak loud: pick a line or type one. Everyone nearby sees it. */
export function openSpeak(h: PeopleHost): void {
  const sheet = openSheet({
    emoji: '📣',
    title: 'Speak loud',
    sub: 'Everyone nearby will see it',
    body: `<div class="row" style="gap:6px"><input id="speak-in" maxlength="${SPEECH.maxLength}" placeholder="Say something…" style="flex:1;min-width:0;padding:10px 12px;border-radius:12px;border:2px solid var(--ink);font:inherit"><button class="btn primary" data-act="send">Say</button></div>
      <div class="social-grid" style="margin-top:10px">${QUICK_LINES.map((l, i) => `<button class="btn" data-act="q:${i}">${esc(l)}</button>`).join('')}</div>`,
  });
  const input = sheet.body.querySelector<HTMLInputElement>('#speak-in')!;
  const send = (raw: string) => {
    if (performance.now() - lastShout < SPEECH.cooldownMs) return toast('Catch your breath first.', { icon: '😮‍💨' });
    const { text, rude } = cleanSpeech(raw);
    if (!text) return;
    lastShout = performance.now();
    sheet.close();
    say(() => h.player(), text, { loud: true, ms: 6000 });
    const me = h.player();
    const listeners = h.nearby(me.x, me.z, SPEECH.hearing);
    const replies = reactions(h.state, h.area(), listeners, rude, nowMs());
    replies.forEach((r, i) =>
      window.setTimeout(() => {
        say(() => h.where(r.personId), r.text, { who: first(personOf(r.personId).name), tone: r.tone });
        if (r.confront) {
          h.approach(r.personId);
          window.setTimeout(() => confront(h, r.personId), 1800);
        }
      }, 900 + i * 900),
    );
    h.save();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') send(input.value);
  });
  onAct(sheet.body, (act) => {
    if (act === 'send') send(input.value);
    if (act.startsWith('q:')) send(QUICK_LINES[Number(act.slice(2))]);
  });
}
