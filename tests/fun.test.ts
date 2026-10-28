import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { initClockFromUrl, nowMs } from '../src/core/clock.ts';
import { activeSection, buySection, extendSection, friendSlots, addSectionSpend, inviteFriend, inviteList, endSectionIfOver, nextSeatIn, SECTION } from '../src/sim/section.ts';
import { slotReturn, slotMultiplier, REEL, dealBlackjack, hit, stand, doubleDown, handValue, rouletteReturn, crashPoint, stake, payout, WHEEL, colourOf } from '../src/sim/casino.ts';
import { placeBet, settleBets, SimFeed, SIM_EVERY, SIM_LENGTH } from '../src/sim/sports.ts';
import { recordScore, redeem, PRIZES, ARCADE_GAMES, payToPlay } from '../src/sim/arcade.ts';

initClockFromUrl('?hour=22');
const life = (cls: 'billionaire' | 'poor' = 'billionaire') => newLife({ name: 'T', origin: 'hustler', spawnClass: cls, look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });

// -------------------------------------------------------------- 🛋️ sections
test("Peter's section: $300 for 10 minutes, 2 friends, up to 12 at $3,300", () => {
  assert.equal(friendSlots(30_000), 2);
  assert.equal(friendSlots(330_000), 12);
  assert.equal(friendSlots(5_000_000), 12);
  assert.ok(friendSlots(150_000) > 2 && friendSlots(150_000) < 12);
  assert.equal(nextSeatIn(330_000), 0);
  const s = life();
  const now = nowMs();
  const r = buySection(s, 'velvetRoom', now);
  assert.ok(r.ok);
  assert.equal(r.section.until - now, SECTION.minutes * 60_000);
  const list = inviteList(s, now);
  assert.ok(list.length >= 12, 'the crew is always up for it');
  assert.equal(inviteFriend(s, 'velvetRoom', list[0].id, now), null);
  assert.equal(inviteFriend(s, 'velvetRoom', list[1].id, now), null);
  assert.match(inviteFriend(s, 'velvetRoom', list[2].id, now) ?? '', /full/i, 'third friend needs more spend');
  addSectionSpend(s, 'velvetRoom', 900_000, now); // bottles
  for (let i = 2; i < 12; i++) assert.equal(inviteFriend(s, 'velvetRoom', list[i].id, now), null, `friend ${i + 1}`);
  assert.match(inviteFriend(s, 'velvetRoom', list[12]?.id ?? 'x', now) ?? '', /full|12/);
  assert.equal(extendSection(s, 'velvetRoom', now), null);
  assert.ok(activeSection(s, 'velvetRoom', now + 15 * 60_000), 'extended by 10 minutes');
  assert.ok(!activeSection(s, 'velvetRoom', now + 21 * 60_000));
  assert.ok(endSectionIfOver(s, now + 21 * 60_000));
  assert.equal(s.section, null);
});

test('no money, no section', () => {
  const s = life('poor');
  s.money = 0;
  s.bank = 0;
  assert.ok(!buySection(s, 'velvetRoom').ok);
});

// ------------------------------------------------------------------- 🎰 casino
test('slots pay back 88–97% over time; three 7s is the jackpot', () => {
  const rtp = slotReturn();
  assert.ok(rtp > 0.88 && rtp < 0.97, `RTP ${rtp}`);
  const seven = REEL.findIndex((r) => r.sym === '7️⃣');
  assert.equal(slotMultiplier([seven, seven, seven]), 250);
  assert.equal(slotMultiplier([0, 1, 2]), 0);
});

test('blackjack: hand values, soft aces, bust, payouts', () => {
  assert.deepEqual(handValue([{ rank: 'A', suit: '♠' }, { rank: 'K', suit: '♥' }]), { total: 21, soft: true });
  assert.equal(handValue([{ rank: 'A', suit: '♠' }, { rank: 'A', suit: '♥' }, { rank: '9', suit: '♣' }]).total, 21);
  assert.equal(handValue([{ rank: 'K', suit: '♠' }, { rank: 'Q', suit: '♥' }, { rank: '5', suit: '♣' }]).total, 25);
  let returned = 0, bet = 0;
  for (let i = 0; i < 4000; i++) {
    const h = dealBlackjack(100);
    // Simple strategy: hit below 17.
    while (!h.done && handValue(h.player).total < 17) hit(h);
    stand(h);
    assert.ok(h.done && h.outcome);
    if (h.outcome === 'bust') assert.equal(h.returned, 0);
    if (h.outcome === 'blackjack') assert.equal(h.returned, 250);
    bet += h.bet;
    returned += h.returned;
  }
  const rtp = returned / bet;
  assert.ok(rtp > 0.85 && rtp < 1.02, `blackjack return ${rtp}`);
  const d = dealBlackjack(100);
  if (!d.done) {
    doubleDown(d);
    assert.ok(d.done && d.bet === 200 && d.player.length === 3);
  }
});

test('roulette: European wheel, payouts', () => {
  assert.equal(WHEEL.length, 37);
  assert.equal(new Set(WHEEL).size, 37);
  assert.equal(colourOf(0), 'green');
  assert.equal(rouletteReturn('red', 1), 2);
  assert.equal(rouletteReturn('red', 0), 0);
  assert.equal(rouletteReturn('n17', 17), 36);
  assert.equal(rouletteReturn('dozen3', 30), 3);
  // Every bet type returns 36/37 on average.
  for (const b of ['red', 'odd', 'low', 'dozen2', 'n7'] as const) {
    let sum = 0;
    for (let n = 0; n <= 36; n++) sum += rouletteReturn(b, n);
    assert.ok(Math.abs(sum / 37 - 36 / 37) < 1e-9, b);
  }
});

test('rocket: crashes at 1.00× sometimes, rarely past 10×, ~3% edge', () => {
  let n = 0, early = 0, big = 0, ret2x = 0;
  for (let i = 0; i < 20000; i++) {
    const c = crashPoint();
    n++;
    if (c <= 1.0) early++;
    if (c >= 10) big++;
    if (c >= 2) ret2x += 2;
  }
  assert.ok(early / n > 0.01 && early / n < 0.06);
  assert.ok(big / n > 0.07 && big / n < 0.12);
  assert.ok(Math.abs(ret2x / n - 0.97) < 0.03, `cashing out at 2× returns ${ret2x / n}`);
});

test('casino bets come from cash, within limits, and track the net', () => {
  const s = life();
  s.money = 10_000;
  assert.match(stake(s, 100, 'Slots') ?? '', /Minimum/);
  assert.match(stake(s, 1_000_000, 'Slots') ?? '', /limit/);
  assert.equal(stake(s, 1_000, 'Slots'), null);
  assert.equal(s.money, 9_000);
  payout(s, 2_500, 'Slots');
  assert.equal(s.money, 11_500);
  assert.equal(s.fun!.casinoNet, 1_500);
});

// ---------------------------------------------------------------- 🏟️ sports
test('sportsbook: bet before kickoff, paid after the final, closed once it starts', () => {
  const s = life();
  s.money = 100_000;
  const now = nowMs();
  const next = SimFeed.fixtures(now, now + 60 * 60_000).find((f) => f.startsAt > now)!;
  assert.ok(next && next.odds.home > 1 && next.odds.away > 1);
  assert.ok(1 / next.odds.home + 1 / next.odds.away > 1, 'the book has a margin');
  assert.equal(placeBet(s, next.id, 'home', 10_000, now), null);
  assert.equal(placeBet(s, next.id, 'away', 10_000, now), null);
  assert.match(placeBet(s, next.id, 'home', 10_000, next.startsAt + 1) ?? '', /closed/);
  assert.equal(settleBets(s, next.startsAt + 60_000).length, 0, 'not final yet');
  const settled = settleBets(s, next.endsAt + 1);
  assert.equal(settled.length, 2);
  const r = SimFeed.result(next, next.endsAt + 1)!;
  if (r.winner === 'draw') assert.ok(settled.every((b) => b.settled === 'push' && b.paid === 10_000));
  else assert.equal(settled.filter((b) => b.settled === 'won').length, 1);
  assert.equal(settleBets(s, next.endsAt + 2).length, 0, 'paid once');
  // Same result for everyone.
  assert.deepEqual(SimFeed.result(next, next.endsAt + 1), r);
  assert.equal(SIM_LENGTH > SIM_EVERY, true);
});

test('live scores never go past the final', () => {
  const now = nowMs();
  for (const f of SimFeed.fixtures(now - SIM_LENGTH, now + SIM_EVERY * 10)) {
    const end = SimFeed.result(f, f.endsAt)!;
    const mid = SimFeed.live!(f, f.startsAt + SIM_LENGTH / 2)!;
    assert.ok(mid.home <= end.home && mid.away <= end.away);
  }
});

// ---------------------------------------------------------------- 🕹️ arcade
test('arcade: $2 a play, tickets for scores, prizes cost tickets', () => {
  const s = life();
  assert.equal(ARCADE_GAMES.length, 12); // + Stack, Dash (2026-10-15); + Pinball, Skee-Ball, Breakout, Rooftop, Air Hockey (2026-10-27)
  const m = s.money;
  assert.equal(payToPlay(s), null);
  assert.equal(s.money, m - 200);
  const r = recordScore(s, 'pigeons', 120);
  assert.ok(r.tickets > 0 && r.best);
  assert.ok(!recordScore(s, 'pigeons', 50).best);
  const cheapest = PRIZES[0];
  assert.equal(redeem(s, cheapest.id), null);
  assert.match(redeem(s, 'liberty') ?? '', /Needs/);
});
