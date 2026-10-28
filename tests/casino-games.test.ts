// Casino, second floor: hold'em, craps, baccarat, Big Six, scratchers,
// keno, plinko and video poker. Pay tables, hand ranks, the baccarat
// drawing rules, and long simulated runs that always favour the house.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card } from '../src/sim/casino.ts';
import {
  baccaratReturn, bacTotal, bankerDraws, bestHand, bigSixReturn, bigSixRtp, blindsFor, compareHands, crapsCanBet, crapsOddsRoom, crapsRoll, dealBaccarat,
  drawKeno, equity, KENO, KENO_PAY, kenoChance, kenoReturn, kenoRtp, newBaccaratShoe, newPokerTable, npcDecide, PLINKO, plinkoChance, plinkoDrop, plinkoRtp,
  pokerAct, pokerOptions, potOf, printScratch, raiseSizes, rollDice, SCRATCHERS, scratchPrize, scratchRtp, seeded, SIX, SIX_WHEEL, spinBigSix, startHand,
  vpDeal, vpDraw, vpEvaluate, vpSuggest, type CrapsTable, type PokerTable,
} from '../src/sim/casino-games.ts';

/** 'As' → ace of spades, 'Th' → ten of hearts. */
const c = (s: string): Card => ({ rank: s[0] === 'T' ? '10' : s[0], suit: { s: '♠', h: '♥', d: '♦', c: '♣' }[s[1]]! });
const cs = (s: string) => s.split(' ').map(c);
const rank = (s: string) => bestHand(cs(s));

// ------------------------------------------------------------- hand ranks

test('poker hands: every category, named', () => {
  assert.equal(rank('As Ks Qs Js Ts').name, 'Royal flush');
  assert.equal(rank('9h 8h 7h 6h 5h').name, 'Straight flush, Nine high');
  assert.equal(rank('9h 9d 9s 9c 2h').name, 'Four Nines');
  assert.equal(rank('Kh Kd Ks 2c 2h').name, 'Full house, Kings full of Twos');
  assert.equal(rank('Ah 9h 7h 4h 2h').name, 'Flush, Ace high');
  assert.equal(rank('Ts 9h 8d 7c 6h').name, 'Straight, Ten high');
  assert.equal(rank('7s 7h 7d Kc 2h').name, 'Three Sevens');
  assert.equal(rank('Js Jh 4d 4c 2h').name, 'Two pair, Jacks and Fours');
  assert.equal(rank('Qs Qh 9d 4c 2h').name, 'Pair of Queens');
  assert.equal(rank('Ks Jh 9d 4c 2h').name, 'King high');
});

test('the wheel A-2-3-4-5 is a five-high straight (the lowest), and A-5 suited is a straight flush', () => {
  const wheel = rank('Ah 2d 3c 4s 5h');
  assert.equal(wheel.cat, 4);
  assert.equal(wheel.name, 'Straight, Five high');
  assert.equal(compareHands(rank('2h 3d 4c 5s 6h'), wheel), 1, 'six-high beats the wheel');
  assert.equal(compareHands(wheel, rank('As Ah Ad Kc Qh')), 1, 'wheel beats trips');
  assert.equal(rank('As 2s 3s 4s 5s').name, 'Straight flush, Five high');
  // No wrap-around: Q-K-A-2-3 is nothing.
  assert.equal(rank('Qs Kh Ad 2c 3h').cat, 0);
});

test('flush beats straight, full house beats flush, kickers break ties', () => {
  assert.equal(compareHands(rank('2h 5h 7h 9h Jh'), rank('Ts 9h 8d 7c 6h')), 1);
  assert.equal(compareHands(rank('2h 2d 2c 3s 3h'), rank('Ah Kh Qh Jh 9h')), 1);
  // Same pair, kicker decides.
  assert.equal(compareHands(rank('Ah Ad Kc 7s 2h'), rank('As Ac Qd 7h 2d')), 1);
  // Same two pair, fifth card decides.
  assert.equal(compareHands(rank('Kh Kd 9c 9s 8h'), rank('Ks Kc 9d 9h 7d')), 1);
  // Dead even: split.
  assert.equal(compareHands(rank('Ah Kd Qc Js 9h'), rank('As Kc Qd Jh 9d')), 0);
  // Flush vs flush: second card.
  assert.equal(compareHands(rank('Ah Qh 9h 5h 2h'), rank('As Js Ts 9s 8s')), 1);
});

test('seven cards: the best five are used', () => {
  // Board pairs; the hole cards make a straight.
  assert.equal(bestHand(cs('6d 7c 8h 9s Ts Td 2c')).name, 'Straight, Ten high');
  // Two trips make a full house with the higher trips on top.
  assert.equal(bestHand(cs('5h 5d 5c 9s 9h 9d Ac')).name, 'Full house, Nines full of Fives');
  // Three pairs: best two plus the best kicker.
  const h = bestHand(cs('Ah Ad 8c 8s 3h 3d Kc'));
  assert.deepEqual([h.cat, ...h.kick], [2, 14, 8, 13]);
  // Six to a flush plus a straight: the flush wins, highest five suited.
  const f = bestHand(cs('2h 4h 6h 8h Th Qh 9c'));
  assert.equal(f.name, 'Flush, Queen high');
  // Straight flush hidden in seven with a bigger plain straight.
  assert.equal(bestHand(cs('5s 6s 7s 8s 9s Td Jc')).name, 'Straight flush, Nine high');
});

// ----------------------------------------------------------------- hold'em

/** Chips at the table (stacks plus the pot). */
const chips = (t: PokerTable) => t.seats.reduce((a, s) => a + s.stack, 0) + (t.handOver ? 0 : potOf(t));

test('hold\'em: blinds posted, options and raise sizes are legal, folding around gives the blinds away', () => {
  const t = newPokerTable(10_000, 3, seeded(1));
  assert.deepEqual(blindsFor(10_000), { sb: 100, bb: 200 });
  startHand(t, seeded(2));
  assert.equal(potOf(t), 300);
  assert.equal(t.seats.filter((s) => s.hole.length === 2).length, 4);
  const o = pokerOptions(t);
  assert.equal(o.toCall, 200);
  assert.equal(o.minRaiseTo, 400);
  const sizes = raiseSizes(t);
  assert.ok(sizes.length >= 2 && sizes.every((r) => r.to >= o.minRaiseTo && r.to <= o.maxRaiseTo));
  assert.equal(sizes[sizes.length - 1].label, 'All-in');
  const before = chips(t);
  while (!t.handOver) pokerAct(t, { type: 'fold' });
  const w = t.winners[0];
  assert.equal(t.winners.length, 1);
  assert.equal(w.amount, 300, 'no flop, no rake');
  assert.equal(t.rake, 0);
  assert.equal(chips(t), before);
});

test('hold\'em: check it down to a showdown with a rake, chips conserved', () => {
  const t = newPokerTable(10_000, 2, seeded(3));
  startHand(t, seeded(4));
  const before = chips(t);
  let guard = 0;
  while (!t.handOver && guard++ < 50) pokerAct(t, pokerOptions(t).canCheck ? { type: 'check' } : { type: 'call' });
  assert.equal(t.street, 'showdown');
  assert.equal(t.board.length, 5);
  assert.equal(t.rake, Math.min(Math.floor(600 * 0.05), 600));
  assert.equal(chips(t) + t.rake, before);
  assert.ok(t.winners.every((w) => w.hand));
});

test('hold\'em: all-ins make side pots that only the right players can win', () => {
  const t = newPokerTable(10_000, 2, seeded(5));
  // Rig stacks: a short stack, two deep ones.
  t.seats[0].stack = 1_000;
  t.seats[1].stack = 10_000;
  t.seats[2].stack = 10_000;
  startHand(t, seeded(6));
  const before = chips(t);
  let guard = 0;
  while (!t.handOver && guard++ < 50) {
    const o = pokerOptions(t);
    pokerAct(t, o.minRaiseTo ? { type: 'raise', to: o.maxRaiseTo } : { type: 'call' });
  }
  assert.equal(t.board.length, 5, 'ran it out');
  assert.equal(chips(t) + t.rake, before);
  // The short stack can win at most three times what it put in.
  const short = t.winners.find((w) => w.seat === 0);
  if (short) assert.ok(short.amount <= 3_000);
});

test('hold\'em: equity is sane (aces are a big favourite, 7-2 a dog)', () => {
  const aces = equity(cs('As Ah'), [], 1, seeded(7), 2_000);
  const junk = equity(cs('7d 2c'), [], 1, seeded(8), 2_000);
  assert.ok(aces > 0.8 && aces < 0.89, `aces ${aces}`);
  assert.ok(junk > 0.27 && junk < 0.4, `7-2 ${junk}`);
  // A made nut flush on the river is (nearly) a lock.
  assert.ok(equity(cs('Ah Kh'), cs('2h 7h 9h Jc 3d'), 3, seeded(9), 400) > 0.95);
});

test('hold\'em: the regulars fold trash to a big bet and raise monsters', () => {
  const t = newPokerTable(10_000, 1, seeded(10));
  startHand(t, seeded(11));
  // Put the NPC to act facing a pot-sized river bet with nothing.
  const npc = t.seats.findIndex((s) => !s.human);
  t.board = cs('2c 7d 9h Js Kd');
  t.street = 'river';
  t.seats[npc].hole = cs('3s 4h');
  t.seats.forEach((s) => ((s.bet = 0), (s.acted = false)));
  t.currentBet = 2_000;
  t.seats[1 - npc].bet = 2_000;
  t.seats[1 - npc].totalIn += 2_000;
  t.seats[1 - npc].stack -= 2_000;
  t.toAct = npc;
  const steady = { ...t.seats[npc].style, bluff: 0 };
  t.seats[npc].style = steady;
  assert.equal(npcDecide(t, npc, seeded(12), 300).type, 'fold');
  t.seats[npc].hole = cs('Kh Ks');
  assert.equal(npcDecide(t, npc, seeded(13), 300).type, 'raise');
});

test('hold\'em: a long session at the table bleeds chips to the rake, never creates any', () => {
  const rand = seeded(42);
  const t = newPokerTable(20_000, 5, rand);
  let raked = 0, tableIn = 0, tableOut = 0, boughtIn = 20_000;
  const H = 200;
  for (let h = 0; h < H; h++) {
    if (t.seats[0].stack <= 0) (t.seats[0].stack = 20_000), (boughtIn += 20_000); // the "you" seat rebuys
    startHand(t, rand);
    const start = chips(t);
    let guard = 0;
    while (!t.handOver && guard++ < 200) pokerAct(t, npcDecide(t, t.toAct, rand, 30));
    assert.ok(t.handOver, 'hand finished');
    assert.equal(chips(t) + t.rake, start, `hand ${h} conserves chips`);
    for (const s of t.seats) assert.ok(s.stack >= 0);
    assert.ok(t.winners.length >= 1);
    raked += t.rake;
    tableIn += start;
    tableOut += chips(t);
  }
  assert.ok(raked > 0);
  assert.equal(t.rakeTotal, raked);
  assert.ok(tableOut / tableIn < 1);
  const you = t.seats[0].stack / boughtIn;
  console.log(`  hold'em: rake ${(raked / H / t.bb).toFixed(2)} big blinds a hand; the "you" seat (playing like a regular) kept ${(you * 100).toFixed(1)}% of its buy-ins over ${H} hands`);
});

// ------------------------------------------------------------------- craps

test('craps: come-out naturals, craps, bar 12 and the point', () => {
  const t: CrapsTable = { point: null, bets: { pass: 100, dontPass: 100 } };
  let r = crapsRoll(t, [3, 4]);
  assert.deepEqual(r.returned, { pass: 200 });
  assert.deepEqual(r.lost, ['dontPass']);
  t.bets = { pass: 100, dontPass: 100 };
  r = crapsRoll(t, [1, 2]);
  assert.deepEqual(r.returned, { dontPass: 200 });
  t.bets = { pass: 100, dontPass: 100 };
  r = crapsRoll(t, [6, 6]);
  assert.deepEqual(r.returned, { dontPass: 100 }, 'bar 12: don’t pass pushes');
  assert.deepEqual(r.lost, ['pass']);
  t.bets = { pass: 100, dontPass: 100 };
  r = crapsRoll(t, [5, 5]);
  assert.equal(r.point, 10);
  assert.deepEqual(r.returned, {});
  assert.ok(crapsCanBet(t, 'pass'), 'no new line bets once the point is on');
  assert.equal(crapsCanBet(t, 'passOdds'), null);
  assert.equal(crapsOddsRoom(t, 'passOdds'), 200);
});

test('craps: hitting the point pays the line plus true odds; seven-out pays the dark side', () => {
  const t: CrapsTable = { point: 4, bets: { pass: 100, passOdds: 200, dontPass: 100, dontOdds: 200 } };
  let r = crapsRoll(t, [2, 2]);
  assert.deepEqual(r.returned, { pass: 200, passOdds: 600 }); // 2:1 odds on 4
  assert.deepEqual(r.lost.sort(), ['dontOdds', 'dontPass']);
  assert.equal(t.point, null);
  const u: CrapsTable = { point: 6, bets: { pass: 100, passOdds: 200, dontPass: 100, dontOdds: 600 } };
  r = crapsRoll(u, [3, 4]);
  assert.deepEqual(r.returned, { dontPass: 200, dontOdds: 1100 }); // lay 6: wins 5 for 6
  assert.equal(r.call, 'Seven out');
  // 5 on a point of 8: nothing happens to the line.
  const v: CrapsTable = { point: 8, bets: { pass: 100, passOdds: 100 } };
  r = crapsRoll(v, [2, 3]);
  assert.deepEqual(r.returned, {});
  assert.deepEqual(v.bets, { pass: 100, passOdds: 100 });
  // 6:5 on eight.
  assert.deepEqual(crapsRoll(v, [4, 4]).returned, { pass: 200, passOdds: 220 });
});

test('craps: the field pays double on 2 and triple on 12, loses on 5-8', () => {
  const roll = (d: [number, number]) => crapsRoll({ point: 9, bets: { field: 100 } }, d).returned.field ?? 0;
  assert.equal(roll([1, 1]), 300);
  assert.equal(roll([6, 6]), 400);
  assert.equal(roll([5, 6]), 200);
  assert.equal(roll([2, 2]), 200);
  for (const d of [[1, 4], [3, 3], [3, 4], [4, 4]] as [number, number][]) assert.equal(roll(d), 0);
});

test('craps: a long night on pass + odds, don’t pass + odds and the field all lose a little', () => {
  const rand = seeded(77);
  const runs = { pass: [0, 0], dont: [0, 0], field: [0, 0] };
  const t1: CrapsTable = { point: null, bets: {} }, t2: CrapsTable = { point: null, bets: {} };
  for (let i = 0; i < 300_000; i++) {
    if (t1.point === null && !t1.bets.pass) (t1.bets.pass = 100), (runs.pass[0] += 100);
    if (t1.point !== null && !t1.bets.passOdds) (t1.bets.passOdds = 200), (runs.pass[0] += 200);
    if (t2.point === null && !t2.bets.dontPass) (t2.bets.dontPass = 100), (runs.dont[0] += 100);
    if (t2.point !== null && !t2.bets.dontOdds) (t2.bets.dontOdds = 200), (runs.dont[0] += 200);
    const d = rollDice(rand);
    const sum = (r: ReturnType<typeof crapsRoll>) => Object.values(r.returned).reduce((a, b) => a + (b ?? 0), 0);
    runs.pass[1] += sum(crapsRoll(t1, d));
    runs.dont[1] += sum(crapsRoll(t2, d));
    runs.field[0] += 100;
    runs.field[1] += crapsRoll({ point: null, bets: { field: 100 } }, d).returned.field ?? 0;
  }
  for (const [k, [inn, out]] of Object.entries(runs)) {
    const rtp = out / inn;
    console.log(`  craps ${k}: ${(rtp * 100).toFixed(2)}%`);
    assert.ok(rtp < 1 && rtp > 0.9, `${k} ${rtp}`);
  }
});

// ---------------------------------------------------------------- baccarat

/** A shoe that deals these cards in order (P1 B1 P2 B2, then thirds). */
const rigged = (s: string) => cs(s).reverse();

test('baccarat: naturals stand, the player draws on 0-5, the banker follows the tableau', () => {
  // Natural 9 for the player: nobody draws.
  let co = dealBaccarat(rigged('4h 2d 5c 3s Ks Ks'));
  assert.equal(co.natural, true);
  assert.deepEqual([co.player.length, co.banker.length, co.winner], [2, 2, 'player']);
  // Player 6 stands; banker 5 draws (no player third card → banker draws on 0-5).
  co = dealBaccarat(rigged('3h 2d 3c 3s 4s'));
  assert.deepEqual([co.player.length, co.banker.length], [2, 3]);
  assert.equal(co.bankerTotal, 9);
  // Player 4 draws an 8; banker 3 stands on a player 8.
  co = dealBaccarat(rigged('2h Kd 2c 3s 8d 9c'));
  assert.deepEqual([co.player.length, co.banker.length], [3, 2]);
  // Player draws a 2; banker 4 draws.
  co = dealBaccarat(rigged('Ah Kd 2c 4s 2d 9c'));
  assert.deepEqual([co.player.length, co.banker.length], [3, 3]);
  assert.equal(bacTotal(co.banker), 3);
  // The whole tableau.
  const want: Record<number, number[]> = { 3: [0, 1, 2, 3, 4, 5, 6, 7, 9], 4: [2, 3, 4, 5, 6, 7], 5: [4, 5, 6, 7], 6: [6, 7], 7: [] };
  for (let bt = 0; bt <= 7; bt++)
    for (let p3 = 0; p3 <= 9; p3++) assert.equal(bankerDraws(bt, p3), bt <= 2 || want[bt].includes(p3), `banker ${bt}, player third ${p3}`);
  assert.equal(bankerDraws(5, null), true);
  assert.equal(bankerDraws(6, null), false);
});

test('baccarat: pays even on player, 0.95 on banker, 8 to 1 on a tie (sides push)', () => {
  assert.equal(baccaratReturn('player', 'player'), 2);
  assert.equal(baccaratReturn('banker', 'banker'), 1.95);
  assert.equal(baccaratReturn('tie', 'tie'), 9);
  assert.equal(baccaratReturn('player', 'tie'), 1);
  assert.equal(baccaratReturn('banker', 'player'), 0);
  assert.equal(bacTotal(cs('9h 8d')), 7);
  assert.equal(bacTotal(cs('Kh Qd Ts')), 0);
});

test('baccarat: a long shoe-by-shoe run returns about 98.9% / 98.8% / 85.6%', () => {
  const rand = seeded(5);
  const tot = { player: 0, banker: 0, tie: 0 };
  const N = 200_000;
  let shoe = newBaccaratShoe(rand);
  for (let i = 0; i < N; i++) {
    if (shoe.length < 20) shoe = newBaccaratShoe(rand);
    const co = dealBaccarat(shoe);
    for (const b of ['player', 'banker', 'tie'] as const) tot[b] += baccaratReturn(b, co.winner);
  }
  for (const [b, v] of Object.entries(tot)) {
    const rtp = v / N;
    console.log(`  baccarat ${b}: ${(rtp * 100).toFixed(2)}%`);
    assert.ok(rtp < 1, b);
  }
  assert.ok(Math.abs(tot.banker / N - 0.9894) < 0.006);
  assert.ok(Math.abs(tot.player / N - 0.9876) < 0.006);
});

// ------------------------------------------------------------------ big six

test('big six: 54 spots with the standard counts, every bet loses over time', () => {
  assert.equal(SIX_WHEEL.length, 54);
  for (const x of SIX) assert.equal(SIX_WHEEL.filter((s) => s === x.sym).length, x.count, x.sym);
  assert.equal(bigSixReturn('20', '20'), 21);
  assert.equal(bigSixReturn('joker', 'logo'), 0);
  assert.equal(bigSixReturn('1', '1'), 2);
  const rand = seeded(6);
  const N = 300_000;
  const back: Record<string, number> = {};
  for (let i = 0; i < N; i++) {
    const s = SIX_WHEEL[spinBigSix(rand)];
    for (const x of SIX) back[x.sym] = (back[x.sym] ?? 0) + bigSixReturn(x.sym, s);
  }
  for (const x of SIX) {
    const exact = bigSixRtp(x.sym);
    assert.ok(exact < 0.9 && exact > 0.75, `${x.sym} ${exact}`);
    assert.ok(Math.abs(back[x.sym] / N - exact) < 0.03, x.sym);
    console.log(`  big six ${x.sym}: ${(exact * 100).toFixed(2)}% (sim ${((back[x.sym] / N) * 100).toFixed(2)}%)`);
  }
  // Two of the same never sit next to each other for the rare spots.
  for (let i = 0; i < 54; i++) if (SIX_WHEEL[i] !== '1' && SIX_WHEEL[i] !== '2') assert.notEqual(SIX_WHEEL[i], SIX_WHEEL[(i + 1) % 54]);
});

// -------------------------------------------------------------- scratchers

test('scratchers: three of an amount wins it; layouts never lie; about 66% back', () => {
  const rand = seeded(8);
  for (const t of SCRATCHERS) {
    assert.ok(scratchRtp(t) > 0.6 && scratchRtp(t) < 0.72);
    let paid = 0, wins = 0, big = 0;
    const N = 60_000;
    for (let i = 0; i < N; i++) {
      const card = printScratch(t, rand);
      assert.equal(card.cells.length, 9);
      assert.equal(scratchPrize(card.cells), card.prize, 'the card shows what it pays');
      if (card.prize) assert.equal(card.winCells.length, 3);
      paid += card.prize;
      if (card.prize) wins++;
      if (card.prize >= t.price * 100) big++;
    }
    const rtp = paid / (N * t.price);
    console.log(`  scratch ${t.id}: ${(rtp * 100).toFixed(2)}%, wins 1 in ${(N / wins).toFixed(1)}, big wins ${big}`);
    assert.ok(rtp < 1 && rtp > 0.55);
    assert.ok(wins / N > 0.2, 'about one in four wins something');
  }
  assert.equal(scratchPrize([500, 500, 1000, 500, 2000, 1000, 2500, 5000, 50000]), 500);
  assert.equal(scratchPrize([500, 500, 1000, 1000, 2000, 2000, 2500, 5000, 50000]), 0);
});

// -------------------------------------------------------------------- keno

test('keno: twenty different numbers, sensible pay table, every ticket size below 100%', () => {
  const d = drawKeno(seeded(9));
  assert.equal(d.length, 20);
  assert.equal(new Set(d).size, 20);
  assert.ok(d.every((n) => n >= 1 && n <= 80));
  // The chances for any ticket add up to 1.
  for (let n = 1; n <= KENO.maxSpots; n++) {
    let p = 0;
    for (let k = 0; k <= n; k++) p += kenoChance(n, k);
    assert.ok(Math.abs(p - 1) < 1e-9);
    const rtp = kenoRtp(n);
    assert.ok(rtp > 0.8 && rtp < 0.9, `${n} spots: ${rtp}`);
    // Catching more never pays less (0 catches on 10 is a bonus, so start at 1).
    for (let k = 2; k <= n; k++) assert.ok(kenoReturn(n, k) >= kenoReturn(n, k - 1));
    assert.ok(Object.keys(KENO_PAY[n]).length >= 1);
  }
  assert.equal(kenoReturn(10, 10), 10_000);
  assert.equal(kenoReturn(5, 2), 0);
  // Simulated 5- and 10-spot tickets.
  const rand = seeded(10);
  for (const n of [1, 5, 10]) {
    const pick = Array.from({ length: n }, (_, i) => i * 7 + 1);
    let back = 0;
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const drawn = new Set(drawKeno(rand));
      back += kenoReturn(n, pick.filter((x) => drawn.has(x)).length);
    }
    console.log(`  keno ${n}-spot: exact ${(kenoRtp(n) * 100).toFixed(2)}%, sim ${((back / N) * 100).toFixed(2)}%`);
    assert.ok(back / N < 1);
  }
});

// ------------------------------------------------------------------ plinko

test('plinko: binomial slots, symmetric multipliers, every risk below 100%', () => {
  let p = 0;
  for (let k = 0; k <= 12; k++) p += plinkoChance(k);
  assert.ok(Math.abs(p - 1) < 1e-12);
  const rand = seeded(11);
  for (const risk of ['low', 'medium', 'high'] as const) {
    const m = PLINKO[risk];
    assert.equal(m.length, 13);
    assert.deepEqual(m, [...m].reverse());
    const exact = plinkoRtp(risk);
    assert.ok(exact < 0.99 && exact > 0.95, `${risk} ${exact}`);
    let back = 0;
    const N = 400_000;
    for (let i = 0; i < N; i++) {
      const d = plinkoDrop(rand);
      assert.equal(d.path.length, 12);
      back += m[d.slot];
    }
    console.log(`  plinko ${risk}: exact ${(exact * 100).toFixed(2)}%, sim ${((back / N) * 100).toFixed(2)}%`);
    if (risk !== 'high') assert.ok(back / N < 1);
  }
  // Riskier boards: bigger edges, emptier middle.
  assert.ok(PLINKO.high[0] > PLINKO.medium[0] && PLINKO.medium[0] > PLINKO.low[0]);
  assert.ok(PLINKO.high[6] < PLINKO.medium[6] && PLINKO.medium[6] < PLINKO.low[6]);
});

// ------------------------------------------------------------ video poker

test('video poker: the 9/6 Jacks or Better pay table', () => {
  const pays = (s: string) => vpEvaluate(cs(s))?.pays ?? 0;
  assert.equal(pays('As Ks Qs Js Ts'), 800);
  assert.equal(pays('9s 8s 7s 6s 5s'), 50);
  assert.equal(pays('As 2s 3s 4s 5s'), 50);
  assert.equal(pays('9s 9h 9d 9c 2s'), 25);
  assert.equal(pays('9s 9h 9d 2c 2s'), 9);
  assert.equal(pays('As 9s 7s 4s 2s'), 6);
  assert.equal(pays('Ah 2s 3s 4d 5s'), 4);
  assert.equal(pays('9s 9h 9d Kc 2s'), 3);
  assert.equal(pays('9s 9h 3d 3c 2s'), 2);
  assert.equal(pays('Js Jh 9d 3c 2s'), 1);
  assert.equal(pays('Ts Th 9d 3c 2s'), 0, 'tens are not enough');
  assert.equal(pays('As Kh 9d 3c 2s'), 0);
});

test('video poker: hold suggestions keep the right cards, draw replaces the rest', () => {
  assert.deepEqual(vpSuggest(cs('As Ks Qs Js 2d')), [true, true, true, true, false], 'four to a royal');
  assert.deepEqual(vpSuggest(cs('Jd Jh 5c 8s 2d')), [true, true, false, false, false], 'high pair');
  assert.deepEqual(vpSuggest(cs('2h 7h 9h Kh 4c')), [true, true, true, true, false], 'four to a flush');
  assert.deepEqual(vpSuggest(cs('9s 9h 9d 9c 2s')).filter(Boolean).length, 5);
  const r = vpDeal(seeded(12));
  assert.equal(r.hand.length, 5);
  assert.equal(r.deck.length, 47);
  const kept = r.hand.slice(0, 2);
  r.held = [true, true, false, false, false];
  vpDraw(r);
  assert.deepEqual(r.hand.slice(0, 2), kept);
  assert.equal(new Set(r.hand.map((x) => x.rank + x.suit)).size, 5, 'no duplicate cards');
});

test('video poker: a long run with the hint strategy returns a bit under 100%', () => {
  const rand = seeded(13);
  let back = 0;
  const N = 300_000;
  for (let i = 0; i < N; i++) {
    const r = vpDeal(rand);
    r.held = vpSuggest(r.hand);
    vpDraw(r);
    back += vpEvaluate(r.hand)?.pays ?? 0;
  }
  const rtp = back / N;
  console.log(`  video poker (hint strategy): ${(rtp * 100).toFixed(2)}%`);
  assert.ok(rtp < 1 && rtp > 0.9, String(rtp));
});
