import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { beginActivity, completeActivity, stopActivity } from '../src/sim/home-activity.ts';
import { cartTotal, kitchenOf, orderGroceries, receiveOrders } from '../src/sim/kitchen.ts';
import { cookActionId, DELIVERY_FEE, eatActionId, INGREDIENT_BY_ID, MEAL_BY_ID } from '../src/data/groceries.ts';
import type { SpawnClass } from '../src/data/wardrobe.ts';

const life = (spawnClass: SpawnClass = 'poor') =>
  newLife({ name: 'T', origin: 'hustler', spawnClass, look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
const never = () => 0.99; // no burns, no quirks

test('InstaDash: pays once, cannot overspend, delivers whole packs to the fridge later', () => {
  const s = life();
  const cash = s.money;
  assert.equal(orderGroceries(s, {}).ok, false);
  const r = orderGroceries(s, { pasta: 1, sauce: 1 }, 1_000);
  assert.ok(r.ok);
  assert.equal(s.money, cash - (200 + 350 + DELIVERY_FEE));
  assert.equal(r.total, cartTotal({ pasta: 1, sauce: 1 }));
  assert.equal(receiveOrders(s, 2_000), 0, 'not here yet');
  assert.equal(kitchenOf(s).pantry.pasta ?? 0, 0);
  assert.equal(receiveOrders(s, r.arrivesAt), 1);
  assert.equal(kitchenOf(s).pantry.pasta, INGREDIENT_BY_ID.pasta.units);
  assert.equal(receiveOrders(s, r.arrivesAt + 1), 0, 'delivered once');
  s.money = 100;
  const broke = orderGroceries(s, { chicken: 3 });
  assert.equal(broke.ok, false);
  assert.equal(s.money, 100);
});

test('cooking takes ingredients, stopping gives them back, finishing makes portions', () => {
  const s = life('middle');
  const k = kitchenOf(s);
  const before = { ...k.pantry };
  assert.ok(beginActivity(s, cookActionId('pasta'), { item: 'stove' }).ok);
  assert.equal(k.pantry.pasta ?? 0, before.pasta - 2);
  // Can't start a second pot with what's left.
  stopActivity(s);
  assert.deepEqual(k.pantry, before, 'stopped: all back, nothing copied');
  assert.equal(k.leftovers.pasta ?? 0, 0);
  beginActivity(s, cookActionId('pasta'), { item: 'stove' });
  completeActivity(s, never);
  assert.equal(k.leftovers.pasta, MEAL_BY_ID.pasta.portions);
  assert.equal(k.pantry.pasta ?? 0, before.pasta - 2);
});

test('missing ingredients or skill: nothing is taken or started', () => {
  const s = life('poor');
  const pantry = { ...kitchenOf(s).pantry };
  const r = beginActivity(s, cookActionId('sandwich'), { item: 'oldStove' });
  assert.equal(r.ok, false);
  assert.equal(s.activity, null);
  assert.deepEqual(kitchenOf(s).pantry, pantry);
  const b = life('billionaire');
  const lock = beginActivity(b, cookActionId('chickenVeg'), { item: 'chefRange' });
  assert.equal(lock.ok, false, 'needs Cooking 2');
  b.skills.cooking = 2;
  assert.ok(beginActivity(b, cookActionId('chickenVeg'), { item: 'chefRange' }).ok);
});

test('eating takes one portion when you start; none left means no eating', () => {
  const s = life('poor');
  s.needs.hunger = 10;
  assert.equal(beginActivity(s, eatActionId('eggsToast')).ok, false);
  beginActivity(s, cookActionId('eggsToast'), { item: 'oldStove' });
  completeActivity(s, never);
  assert.equal(kitchenOf(s).leftovers.eggsToast, 1);
  assert.ok(beginActivity(s, eatActionId('eggsToast'), { item: 'oldFridge' }).ok);
  assert.equal(kitchenOf(s).leftovers.eggsToast ?? 0, 0);
  stopActivity(s); // stopped halfway: the portion is eaten, not copied back
  assert.equal(kitchenOf(s).leftovers.eggsToast ?? 0, 0);
});

test('a reload mid-cook keeps everything; old saves get an empty kitchen', () => {
  const s = life('middle');
  beginActivity(s, cookActionId('eggsToast'), { item: 'stove' });
  const loaded = JSON.parse(JSON.stringify(s));
  completeActivity(loaded, never);
  assert.equal(loaded.kitchen.leftovers.eggsToast, 1);
  const old = life();
  delete (old as { kitchen?: unknown }).kitchen;
  assert.deepEqual(kitchenOf(old), { pantry: {}, leftovers: {}, orders: [] });
});

test('everyone can make a cheap, filling meal; snack is always free', async () => {
  const { ACTIONS } = await import('../src/data/actions.ts');
  assert.ok(!ACTIONS.snack.cost && ACTIONS.snack.needs!.hunger! > 0);
  // A sandwich's groceries cost far less than a bodega chopped cheese.
  const per = (id: string, n: number) => (INGREDIENT_BY_ID[id].price / INGREDIENT_BY_ID[id].units) * n;
  const sandwich = per('bread', 2) + per('turkey', 2) + per('cheese', 1);
  assert.ok(sandwich < ACTIONS.choppedCheese.cost! / 2);
});

test('homes that already have a good bed skip the "buy a better bed" goals', async () => {
  const { GOALS } = await import('../src/sim/goals.ts');
  const buy = GOALS.find((g) => g.title === 'Buy a better bed')!;
  const put = GOALS.find((g) => g.title === 'Put your new bed in')!;
  assert.equal(buy.done(life('poor')), false);
  for (const c of ['middle', 'rich', 'billionaire'] as const) assert.ok(buy.done(life(c)) && put.done(life(c)), c);
});
