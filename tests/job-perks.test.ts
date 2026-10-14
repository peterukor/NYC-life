import test from 'node:test';
import assert from 'node:assert/strict';
import { newLife } from '../src/sim/state.ts';
import { applyForJob } from '../src/sim/work.ts';
import { bustChance, EXPOSURE, heatNow, intimidation, resolveBribe, shiftTwist } from '../src/sim/job-perks.ts';
import { CAREERS, CAREER_BY_ID } from '../src/data/careers.ts';
import { PLACE_BY_ID } from '../src/data/places.ts';
import { minigameFor } from '../src/data/minigames.ts';

const life = () => newLife({ name: 'T', origin: 'hustler', spawnClass: 'poor', look: { body: 'm', skin: '#000', top: '#000', bottom: '#000', hair: '#000' }, birthYear: 1990, traits: [] });
const seq = (...xs: number[]) => () => xs.shift() ?? 0.99;

test("Peter's eight careers, each with 6 rungs (5 raises) and a workplace", () => {
  assert.deepEqual(CAREERS.map((c) => c.id), ['deli', 'bartender', 'trainer', 'tech', 'finance', 'dancer', 'pharmacist', 'cop']);
  assert.equal(CAREER_BY_ID.deli.name, 'Bodega');
  for (const c of CAREERS) {
    assert.equal(c.ladder.length, 6, c.id);
    assert.ok(PLACE_BY_ID[c.placeId], c.placeId);
    assert.ok(c.ladder.every((r, i) => i === 0 || r.pay > c.ladder[i - 1].pay), `${c.id} pay rises`);
    assert.ok(minigameFor(c.id) || c.id === 'deli', `${c.id} has a shift game`);
  }
});

test('dancer: fights by fitness; scary-strong dancers get smaller tips', () => {
  const s = life();
  s.job = { careerId: 'dancer', level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 0, dayKey: '' };
  s.skills.fitness = 5;
  const lost = shiftTwist(s, 22, seq(0.1, 0.5)); // fight; 0.5 < 65% lose chance → lost
  assert.ok(lost?.kind === 'fight' && !lost.won && lost.payMult < 1);
  s.skills.fitness = 10;
  const won = shiftTwist(s, 22, seq(0.1, 0.5));
  assert.ok(won?.kind === 'fight' && won.won);
  assert.equal(intimidation(8), 1);
  assert.ok(Math.abs(intimidation(10) - 0.7) < 1e-9);
});

test('pharmacist: heat builds per shift and cools; high heat can mean a bust', () => {
  const s = life();
  s.job = { careerId: 'pharmacist', level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 0, dayKey: '' };
  for (let i = 0; i < 4; i++) shiftTwist(s, 12, seq(0.99), 1_000);
  assert.ok(heatNow(s, 1_000) > 40);
  assert.ok(heatNow(s, 1_000 + 3_600_000) < heatNow(s, 1_000), 'cools off');
  assert.equal(bustChance(10), 0);
  s.heat = { value: 100, at: 1_000 };
  const r = shiftTwist(s, 12, seq(0.0), 1_000);
  assert.equal(r?.kind, 'busted');
  assert.ok(s.jail);
});

test('cop: envelopes pay but build exposure; Internal Affairs at 100', () => {
  const s = life();
  applyForJob(s, 'trainer'); // (any job; then become a cop)
  s.job = { careerId: 'cop', level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 0, dayKey: '' };
  const offer = shiftTwist(s, 12, seq(0.1));
  assert.equal(offer?.kind, 'bribe');
  const cash = s.money;
  assert.equal(resolveBribe(s, false, 6_000).caught, false);
  assert.equal(s.money, cash);
  let caught = false;
  for (let i = 0; i < 10 && !caught; i++) caught = resolveBribe(s, true, 6_000).caught;
  assert.ok(caught && s.job === null && s.jail, `caught after ${Math.ceil(EXPOSURE.caughtAt / EXPOSURE.perBribe)} envelopes`);
});

test('bartenders earn more late at night', () => {
  const s = life();
  applyForJob(s, 'bartender');
  assert.equal(shiftTwist(s, 14), null);
  assert.equal(shiftTwist(s, 23)?.kind, 'late');
});

test('work rooms: 6 spots, NPCs fill them, players replace NPCs, a 7th player gets a new copy', async () => {
  const { assignRoom, leaveRoom, openRoom, playersIn, ROOM_SIZE } = await import('../src/sim/workroom.ts');
  const room = openRoom('theStoop');
  assert.equal(room.slots.length, ROOM_SIZE);
  assert.equal(playersIn(room), 0);
  const rooms = [room];
  for (let i = 0; i < 6; i++) assignRoom(rooms, 'theStoop', `p${i}`, `P${i}`);
  assert.equal(playersIn(room), 6);
  const seventh = assignRoom(rooms, 'theStoop', 'p6', 'P6');
  assert.equal(rooms.length, 2);
  assert.equal(seventh.room.instance, 1);
  leaveRoom(room, 'p2');
  assert.equal(playersIn(room), 5);
  assert.equal(room.slots[2].kind, 'npc', 'an NPC is back in the spot');
  assert.equal(assignRoom(rooms, 'theStoop', 'p0', 'P0').slot, 0, 'rejoining keeps your spot');
});

test('every workplace has its own room with 6 worker spots and pieces that exist', async () => {
  const { WORKPLACE_LAYOUTS, WORKPLACE_LAYOUT_FOR } = await import('../src/data/venues.ts');
  const { FURNITURE } = await import('../src/data/furniture.ts');
  for (const c of CAREERS) {
    const l = WORKPLACE_LAYOUTS[WORKPLACE_LAYOUT_FOR[c.placeId]];
    assert.ok(l, `${c.id} has a workplace room`);
    assert.equal(l.workers?.length, 6, `${c.id}: 6 worker spots`);
    for (const f of l.furniture) assert.ok(FURNITURE.get(f.item), `${l.id}: ${f.item}`);
    assert.ok(l.furniture.some((f) => FURNITURE.get(f.item)?.placeActions), `${l.id} has a work station`);
  }
  const ids = new Set(Object.values(WORKPLACE_LAYOUTS).flatMap((l) => l.furniture.map((f) => f.item)));
  assert.ok(ids.size > 40, 'lots of their own pieces');
});

test('rooms hold up to 30 people: 6 workers plus 24 visitors; NPC visitors make room for players', async () => {
  const { assignVisitor, npcVisitors, openRoom, ROOM_CAPACITY, VISITOR_SPOTS, headcount } = await import('../src/sim/workroom.ts');
  assert.equal(ROOM_CAPACITY, 30);
  const rooms = [openRoom('velvetRoom')];
  assert.equal(npcVisitors(rooms[0], 18), 18);
  for (let i = 0; i < 20; i++) assignVisitor(rooms, 'velvetRoom', `v${i}`, `V${i}`);
  assert.equal(npcVisitors(rooms[0], 18), VISITOR_SPOTS - 20, 'fewer NPCs once players arrive');
  assert.ok(headcount(rooms[0], npcVisitors(rooms[0], 18)) <= ROOM_CAPACITY);
  for (let i = 20; i < 30; i++) assignVisitor(rooms, 'velvetRoom', `v${i}`, `V${i}`);
  assert.equal(rooms.length, 2, 'a full room opens another copy');
  assert.equal(rooms[0].visitors.length, VISITOR_SPOTS);
});

test('finance perks: cheaper trades (cheaper with each raise) and a desk tip; tech perks: freelance pays more', async () => {
  const { tradeFee, deskTip } = await import('../src/sim/market.ts');
  const { ACTIONS } = await import('../src/data/actions.ts');
  const s = life();
  const normal = tradeFee(100_000, s);
  s.job = { careerId: 'finance', level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 0, dayKey: '' };
  const analyst = tradeFee(100_000, s);
  s.job.level = 4;
  const md = tradeFee(100_000, s);
  assert.ok(analyst < normal && md < analyst, `${normal} → ${analyst} → ${md}`);
  assert.ok(deskTip(s));
  s.job.careerId = 'bartender';
  assert.equal(deskTip(s), null);
  const pay = ACTIONS.freelance.pay as (x: typeof s) => number;
  s.skills.coding = 3;
  const plain = pay(s);
  s.job = { careerId: 'tech', level: 0, performance: 50, shiftsAtLevel: 0, shiftsTotal: 0, shiftsToday: 0, dayKey: '' };
  assert.ok(pay(s) >= Math.round(plain * 1.3) - 25);
});
