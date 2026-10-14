// =====================================================================
// hangout.ts (ui) — hanging out with a friend (sim/invites.ts → Hangout,
// sim/friends.ts → SHARED). Pick something to do together; it takes a few
// seconds, they react (a line and an emoji over their head), and the
// friendship grows. Doing the same thing again counts for less.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { MEAL_BY_ID } from '../data/groceries.ts';
import { doTogether, friendCard, friendProgress, OUTINGS, sharedFor, treat, type SharedActivity } from '../sim/friends.ts';
import { endHangout, socialOf } from '../sim/invites.ts';
import { kitchenOf, takePortion } from '../sim/kitchen.ts';
import { changeMoney } from '../sim/economy.ts';
import { RELATION } from '../sim/people.ts';
import type { GameState } from '../sim/types.ts';
import { sfx } from './audio.ts';
import { onAct, openSheet, toast } from './dom.ts';

export interface HangoutHost {
  state: GameState;
  saved(): void;
  /** Their 3D reaction. */
  react(emoji: string, happy: boolean): void;
  /** A timed bar for the activity; resolves false if stopped. */
  run(label: string, seconds: number): Promise<boolean>;
  /** Your place has a TV. */
  hasTv(): boolean;
  /** Play Pigeon Pop against them; calls back with both scores. */
  versus(name: string, done: (mine: number, theirs: number) => void): void;
}

const first = (n: string) => n.split(' ')[0];
const TASTE_EMOJI = (t: number) => (t >= 2 ? '🥰' : t >= 0 ? '🙂' : '😬');

/** A cooked portion in the fridge (the best one), if any. */
function portion(s: GameState): string | null {
  const left = kitchenOf(s).leftovers;
  const ids = Object.keys(left).filter((k) => (left[k] ?? 0) > 0);
  return ids.sort((a, b) => (MEAL_BY_ID[b]?.hunger ?? 0) - (MEAL_BY_ID[a]?.hunger ?? 0))[0] ?? null;
}

export function openHangout(host: HangoutHost): void {
  const s = host.state;
  const h = socialOf(s).hangout;
  if (!h) return;
  const m = s.people[h.personId];
  const card = friendCard(h.personId, m);
  const name = first(card.person.name);
  const acts = sharedFor(h.outing);
  const prog = friendProgress(m);
  const body = `<p class="vibes"><span>${card.main.emoji} ${card.main.label}</span><span>${card.second.emoji} ${card.second.label}</span></p>
    ${prog.next !== null ? `<div class="fbar"><i style="width:${Math.round(prog.fraction * 100)}%"></i></div><p class="sub">${RELATION[m.level]} · ${Math.round(prog.fraction * 100)}% to ${RELATION[prog.next]} · +${h.bond} 💛 today</p>` : `<p class="sub">${RELATION[m.level]} · +${h.bond} 💛 today</p>`}
    <div class="travel">${acts.map((a) => {
      const n = h.done[a.id] ?? 0;
      const note = a.special === 'meal' ? (portion(s) ? `${MEAL_BY_ID[portion(s)!]?.emoji ?? '🍽️'} from your fridge` : 'Cook something first') : a.special === 'tv' && !host.hasTv() ? 'No TV here' : n ? `Done ${n}×` : '';
      return `<button class="opt" data-act="do:${a.id}"><span style="font-size:22px">${a.emoji}</span><span class="grow"><b>${esc(a.label)}</b>${note ? `<small>${esc(note)}</small>` : ''}</span>${a.cost ? `<span class="cost">${money(a.cost)}</span>` : ''}</button>`;
    }).join('')}
    <button class="opt" data-act="treat"><span style="font-size:22px">💳</span><span class="grow"><b>Pick up the tab</b><small>Nice, once. Not a friendship plan.</small></span></button>
    </div>
    <button class="btn ghost block" data-act="bye">Call it a day</button>`;
  const sheet = openSheet({ emoji: OUTINGS[h.outing].emoji, title: `With ${name}`, sub: esc(OUTINGS[h.outing].label), body });
  onAct(sheet.body, async (act) => {
    if (act === 'bye') {
      sheet.close();
      const r = endHangout(s);
      host.saved();
      if (r) toast(`Hung out with ${name}: +${r.bond} 💛`, { icon: '🤙', tone: 'good', ms: 3500 });
      return;
    }
    if (act === 'treat') {
      const t = treat(s, h.personId, s.location.area);
      h.bond += t.bond;
      host.react(t.bond ? '😊' : '🙅', t.bond > 0);
      toast(`${name}: ${t.line}`, { icon: '💳', ms: 4500 });
      host.saved();
      return;
    }
    if (!act.startsWith('do:')) return;
    const a = acts.find((x) => x.id === act.slice(3));
    if (!a) return;
    await doActivity(host, a, name, () => sheet.close());
  });
}

async function doActivity(host: HangoutHost, a: SharedActivity, name: string, closeSheet: () => void): Promise<void> {
  const s = host.state;
  const h = socialOf(s).hangout;
  if (!h) return;
  if (a.special === 'tv' && !host.hasTv()) return toast('No TV here. Get one from the furniture shop.', { icon: '📺' });
  let meal: string | null = null;
  if (a.special === 'meal') {
    meal = portion(s);
    if (!meal) return toast('Nothing cooked in the fridge. Cook something first, or order InstaDash for two.', { icon: '🍝' });
  }
  if (a.cost && s.money < a.cost) return toast(`That’s ${money(a.cost)}. Not enough cash on you.`, { icon: a.emoji, tone: 'bad' });
  closeSheet();
  const finish = (line: string, bond: number, emoji: string, happy: boolean) => {
    h.done[a.id] = (h.done[a.id] ?? 0) + 1;
    h.bond += bond;
    host.react(emoji, happy);
    happy ? sfx.win() : sfx.tap();
    toast(`${name}: ${line} ${bond > 0 ? `+${bond} 💛` : bond < 0 ? `${bond} 💛` : ''}`.trim(), { icon: a.emoji, tone: bond > 0 ? 'good' : bond < 0 ? 'bad' : 'info', ms: 5000 });
    host.saved();
  };
  if (a.special === 'versus') {
    if (a.cost) changeMoney(s, -a.cost, 'Arcade: two plays');
    host.versus(name, (mine, theirs) => {
      const r = doTogether(s, h.personId, a, h.done[a.id] ?? 0, s.location.area);
      const line = mine > theirs ? '“Rematch. No, seriously. Rematch.”' : mine < theirs ? '“I’d like to thank the pigeons, and my hands.”' : '“A tie. Nobody tell anyone.”';
      finish(`${line} (${mine} vs ${theirs})`, r.bond, mine >= theirs ? '😤' : '😎', true);
    });
    return;
  }
  if (a.cost) changeMoney(s, -a.cost, `${a.label} with ${name}`);
  const ok = await host.run(`${a.emoji} ${a.label} with ${name}…`, a.seconds);
  if (!ok || !socialOf(s).hangout) return;
  if (meal) {
    takePortion(s, meal);
    a = { ...a, label: `Shared ${MEAL_BY_ID[meal]?.name.toLowerCase() ?? 'a meal'}` };
  }
  const r = doTogether(s, h.personId, a, h.done[a.id] ?? 0, s.location.area);
  finish(r.line, r.bond, TASTE_EMOJI(r.taste), r.taste >= 0);
}
