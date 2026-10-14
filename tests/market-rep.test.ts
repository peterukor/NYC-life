import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { STOCKS } from '../src/data/stocks.ts';
import { BOTTLES } from '../src/data/bottles.ts';
import { eventFor, priceAt } from '../src/sim/market.ts';
import { buyBottle } from '../src/sim/celebrate.ts';
import { addRep, repOf, repRank, repTitle, tradeRep } from '../src/sim/rep.ts';

const life = () => newLife({ name: 'T', origin: 'hustler', spawnClass: 'billionaire', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });

test('15 companies plus 2 funds, every one with a risk type', () => {
  const all = STOCKS.all();
  assert.equal(all.filter((s) => s.risk !== 'fund').length, 15);
  assert.equal(all.filter((s) => s.risk === 'fund').length, 2);
  for (const r of ['blue', 'growth', 'penny', 'meme'] as const) assert.ok(all.some((s) => s.risk === r), r);
  assert.equal(new Set(all.map((s) => s.ticker)).size, all.length, 'tickers are unique');
});

test('prices are the same for everyone (seeded) and never hit zero', () => {
  for (const st of STOCKS.all()) {
    const a = priceAt(st.id, 24 * 300 + 13);
    assert.equal(priceAt(st.id, 24 * 300 + 13), a);
    assert.ok(a >= 1);
  }
});

test('funds never get events; memes squeeze sometimes; earnings are monthly', () => {
  const fund = STOCKS.all().find((s) => s.risk === 'fund')!;
  const meme = STOCKS.all().find((s) => s.risk === 'meme')!;
  const blue = STOCKS.all().find((s) => s.risk === 'blue')!;
  let squeezes = 0, earnings = 0;
  for (let d = 0; d < 1000; d++) {
    assert.equal(eventFor(fund, d), null);
    if (eventFor(meme, d)?.kind === 'squeeze') squeezes++;
    if (eventFor(blue, d)?.kind === 'earnings') earnings++;
  }
  assert.ok(squeezes > 10 && squeezes < 60, `meme squeezes in 1000 days: ${squeezes}`);
  assert.ok(earnings >= 30 && earnings <= 35, `earnings days: ${earnings}`);
});

test('🔥 street rep grows with bottle size', () => {
  const s = life();
  const before = repOf(s).street;
  const r1 = buyBottle(s, BOTTLES[0].id);
  assert.ok(r1.ok);
  const small = repOf(s).street - before;
  const r2 = buyBottle(s, BOTTLES[6].id);
  assert.ok(r2.ok && r2.street > small);
});

test('💼 corporate rep: nothing for losses, more for profit, a bonus for 10×+', () => {
  assert.equal(tradeRep(-5000, 0.5), 0);
  assert.ok(tradeRep(100_000, 1.5) > 0);
  assert.ok(tradeRep(100_000, 10) > tradeRep(100_000, 1.5));
  assert.ok(tradeRep(100_000, 100) > tradeRep(100_000, 50));
  assert.ok(tradeRep(1e12, 1) <= 300, 'profit share is capped');
});

test('rep ranks up with titles', () => {
  const s = life();
  assert.equal(repRank(s, 'corporate'), 0);
  assert.equal(addRep(s, 'corporate', 10), null);
  assert.equal(addRep(s, 'corporate', 45), 'Retail Trader');
  assert.equal(repTitle(s, 'corporate'), 'Retail Trader');
  addRep(s, 'street', 1e6);
  assert.equal(repTitle(s, 'street'), 'City Icon');
});
