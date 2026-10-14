import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { initClockFromUrl, nowMs } from '../src/core/clock.ts';
import { Rng } from '../src/core/rng.ts';
import { moodToday, remember } from '../src/sim/people.ts';
import { DAILY_BOND_CAP, doTogether, friendProgress, historyOf, LOG_MAX, logWith, OUTING_IDS, SHARED, SHARED_BY_ID, tasteFor, treat, vibesOf, VIBES } from '../src/sim/friends.ts';
import { acceptCounter, answerIncoming, endHangout, expirePlans, maybeIncoming, npcAnswer, planHere, sendInvite, socialOf, startHangout } from '../src/sim/invites.ts';
import { mayEnter } from '../src/sim/guests.ts';
import { buySection, freeloadersLeave, FREELOADER_PATIENCE, inviteFriend, inviteList, noteBottle, talkToGuest } from '../src/sim/section.ts';

initClockFromUrl('?hour=15');
const life = () => newLife({ name: 'T', origin: 'hustler', spawnClass: 'billionaire', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
/** A contact at a given level. */
function friend(s: ReturnType<typeof life>, id: string, likes = 35) {
  const m = remember(s, id, 'manhattan', nowMs());
  m.hasNumber = true;
  m.likes = likes;
  m.level = likes >= 55 ? 3 : likes >= 30 ? 2 : likes >= 8 ? 1 : 0;
  return m;
}
const ids = Array.from({ length: 80 }, (_, i) => `p-${i}`);

test('everyone has two vibes; tastes differ between people', () => {
  const seen = new Set<string>();
  for (const id of ids) {
    const v = vibesOf(id);
    assert.ok(VIBES[v.main] && VIBES[v.second] && v.main !== v.second);
    assert.deepEqual(vibesOf(id), v, 'stable');
    seen.add(v.main);
    for (const o of OUTING_IDS) assert.ok(tasteFor(id, o) >= -1 && tasteFor(id, o) <= 2);
  }
  assert.ok(seen.size >= 5, 'variety of personalities');
});

test('history keeps the last 8 things, newest first', () => {
  const s = life();
  const m = friend(s, 'p-1');
  for (let i = 0; i < 12; i++) logWith(m, '•', `thing ${i}`);
  assert.equal(historyOf(m).length, LOG_MAX);
  assert.equal(historyOf(m)[0].text, 'thing 11');
});

test('doing things together builds friendship; repeats count less; daily cap', () => {
  const s = life();
  const id = ids.find((x) => tasteFor(x, 'park') >= 1)!;
  const m = friend(s, id, 10);
  const walk = SHARED_BY_ID.walkTalk;
  const a = doTogether(s, id, walk, 0, 'manhattan');
  const b = doTogether(s, id, walk, 1, 'manhattan');
  assert.ok(a.bond > 0 && b.bond < a.bond, `${a.bond} then ${b.bond}`);
  for (let i = 0; i < 20; i++) doTogether(s, id, SHARED[i % 5], 0, 'manhattan');
  assert.ok(m.bond!.n <= DAILY_BOND_CAP);
  assert.ok(historyOf(m).length > 0);
});

test('paying is not friendship: a paid activity gives no more than a free one, and treating helps once a day', () => {
  for (const a of SHARED) if (a.cost) assert.ok(a.bond <= 10, `${a.id} bond doesn't scale with cost`);
  const free = SHARED_BY_ID.walkTalk, paid = SHARED_BY_ID.iceCream;
  assert.ok(paid.bond <= free.bond, 'ice cream for two ≤ a walk');
  const s = life();
  friend(s, 'p-3', 10);
  assert.equal(treat(s, 'p-3', 'manhattan').bond, 2);
  assert.equal(treat(s, 'p-3', 'manhattan').bond, 0);
});

test('friendship progress toward the next level', () => {
  const s = life();
  const m = friend(s, 'p-4', 19);
  const p = friendProgress(m);
  assert.equal(p.level, 1);
  assert.equal(p.next, 2);
  assert.ok(p.fraction > 0.4 && p.fraction < 0.6);
});

test('invites: no number → no; strangers can’t be invited; avoids → no or counter; friends often say yes', () => {
  const s = life();
  assert.equal(npcAnswer(s, 'nobody', 'park', nowMs() + 20_000, new Rng(1)).status, 'declined');
  let yes = 0, total = 0;
  for (const id of ids) {
    friend(s, id, 60);
    const a = npcAnswer(s, id, 'park', nowMs() + 20_000, new Rng(`t-${id}`));
    if (tasteFor(id, 'park') < 0) assert.notEqual(a.status, 'accepted', 'avoids the park');
    if (tasteFor(id, 'park') >= 1) (total++, a.status === 'accepted' && yes++);
    assert.ok(a.reply && a.reply.length > 0);
    if (a.status === 'countered') assert.ok(a.counter);
  }
  assert.ok(yes / total > 0.4, `close friends who like the park mostly say yes (${yes}/${total})`);
});

test('the club at 3 PM: they suggest a better time', () => {
  const s = life();
  const id = ids.find((x) => tasteFor(x, 'club') >= 1)!;
  friend(s, id, 60);
  const a = npcAnswer(s, id, 'club', nowMs() + 20_000, new Rng(5));
  if (a.status !== 'declined') {
    assert.equal(a.status, 'countered');
    assert.ok(a.counter!.at > nowMs() + 60_000);
  }
});

test('a plan: accept the counter, show up, hang out, history; or stand them up', () => {
  const s = life();
  const id = ids.find((x) => tasteFor(x, 'park') >= 1)!;
  friend(s, id, 60);
  let inv = sendInvite(s, id, 'park', 'now');
  for (let k = 0; inv.status !== 'accepted' && k < 20; k++) {
    if (inv.status === 'countered') acceptCounter(s, inv.id);
    else inv = sendInvite(s, id, 'park', 'now');
    socialOf(s).sentToday.counts = {};
  }
  assert.equal(inv.status, 'accepted');
  assert.ok(planHere(s, inv.placeId, inv.at), 'the plan is here at that time');
  startHangout(s, inv, inv.at);
  assert.ok(socialOf(s).hangout);
  const end = endHangout(s);
  assert.equal(end?.personId, id);
  // Stand someone up.
  const id2 = ids.find((x) => x !== id && tasteFor(x, 'arcade') >= 1)!;
  const m2 = friend(s, id2, 60);
  const inv2 = sendInvite(s, id2, 'arcade', 'now');
  inv2.status = 'accepted';
  const likes = m2.likes;
  const missed = expirePlans(s, inv2.until + 1);
  assert.equal(missed.length, 1);
  assert.ok(m2.likes < likes && historyOf(m2)[0].text.includes('stood'));
});

test('friends invite you too, and you can answer', () => {
  const s = life();
  // Someone who isn't busy today (busy days are rolled from the date, so a fixed id fails some days).
  const who = Array.from({ length: 40 }, (_, i) => `p-${i}`).find((id) => moodToday(id) !== 'busy')!;
  friend(s, who, 60);
  let inv = null;
  for (let k = 0; k < 50 && !inv; k++) inv = maybeIncoming(s, () => 0.01, nowMs() + k * 41 * 60_000);
  assert.ok(inv && inv.from.id === who && inv.status === 'pending');
  assert.equal(answerIncoming(s, inv!.id, true)?.status, 'accepted');
});

test('door rule (sections and homes, players later)', () => {
  const me = { kind: 'player' as const, id: 'me', name: 'Me' };
  const v = { kind: 'player' as const, id: 'p2', name: 'Them' };
  assert.equal(mayEnter('inviteOnly', v, me, { invited: false, level: 3, taken: 0, capacity: 5 }), 'Invite only');
  assert.equal(mayEnter('inviteOnly', v, me, { invited: true, level: 0, taken: 0, capacity: 5 }), null);
  assert.equal(mayEnter('friends', v, me, { invited: false, level: 2, taken: 0, capacity: 5 }), null);
  assert.equal(mayEnter('open', v, me, { invited: false, level: 0, taken: 5, capacity: 5 }), 'Full');
  assert.equal(mayEnter('open', me, me, { invited: false, level: 0, taken: 5, capacity: 5 }), null);
});

test('section: spending buys seats, talking builds friendship, bottle-only guests leave', () => {
  const s = life();
  const now = nowMs();
  assert.ok(buySection(s, 'velvetRoom', now).ok);
  s.section!.spent = 1_000_000; // 12 seats
  const crew = inviteList(s, now).filter((p) => !p.contact).slice(0, 12);
  for (const p of crew) assert.equal(inviteFriend(s, 'velvetRoom', p.id, now), null);
  const guests = s.section!.guests!;
  const fl = crew.filter((p) => guests[p.id].freeloader);
  const real = crew.filter((p) => !guests[p.id].freeloader);
  assert.ok(fl.length > 0 && real.length > 0, `some bottle-only guests (${fl.length}/12)`);
  // Talking: a real one gives friendship, then their number.
  const r1 = talkToGuest(s, 'velvetRoom', real[0].id, now)!;
  assert.ok(r1.bond > 0 && !r1.freeloader);
  const r2 = talkToGuest(s, 'velvetRoom', real[0].id, now)!;
  assert.ok(r2.newContact, 'swapped numbers');
  // A bottle-only guest: no friendship, and you find out.
  const f1 = talkToGuest(s, 'velvetRoom', fl[0].id, now)!;
  assert.ok(f1.freeloader && f1.bond === 0 && s.section!.guests![fl[0].id].revealed);
  // Bottles keep them around; when the bottles stop, they go.
  noteBottle(s, 'velvetRoom', now);
  assert.equal(freeloadersLeave(s, now + 60_000).length, 0);
  const gone = freeloadersLeave(s, now + FREELOADER_PATIENCE + 1000);
  assert.equal(gone.length, fl.length);
  assert.ok(s.section!.friends.every((id) => !gone.includes(id)));
});
