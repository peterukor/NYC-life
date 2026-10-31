import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORKPLACE_LAYOUTS, WORKPLACE_LAYOUT_FOR } from '../src/data/venues.ts';
import { FURNITURE } from '../src/data/furniture.ts';
import { PLACE_BY_ID } from '../src/data/places.ts';
import { NIGHT_ROOMS } from '../src/data/night-rooms.ts';
import { ACTIONS } from '../src/data/actions.ts';

/** What you could do in each room before the 2026-10-31 rebuild: none of it may go missing. */
const BEFORE: Record<string, string[]> = {
  comedyCellar: ['dateHere', 'happyHour', 'openMic', 'watchComedy'],
  theStoop: ['dateHere', 'happyHour', 'jukeboxSong', 'karaoke', 'petBodegaCat', 'playPool', 'poolGame'],
  lenoxLounge: ['dateHere', 'happyHour', 'jazzSet', 'jazzSitIn', 'playPiano'],
  pixelPalace: ['airHockey', 'dateHere', 'happyHour', 'playAirhockey', 'playAxe', 'playBeats', 'playBreakout', 'playClaw', 'playDash', 'playPigeons', 'playPinball', 'playRooftop', 'playSnake', 'prizeCounter'],
  empireCasino: ['casinoCashier', 'dateHere', 'happyHour', 'playBaccarat', 'playBigSix', 'playBlackjack', 'playPoker', 'playRocket', 'playRoulette', 'playSlots', 'playVideoPoker'],
};

/** Everything a room's pieces offer (the same rule as world/home-interior.ts uses to make tappable objects). */
function offered(placeId: string): Set<string> {
  const place = PLACE_BY_ID[placeId];
  const layout = WORKPLACE_LAYOUTS[WORKPLACE_LAYOUT_FOR[placeId]];
  const out = new Set<string>();
  for (const f of layout.furniture) {
    const d = FURNITURE.get(f.item);
    if (!d || d.deco || d.hang) continue;
    for (const a of d.placeActions ? place.actions : d.actions) out.add(a);
  }
  return out;
}

test('the five rebuilt night rooms keep every action they had, and add a few', () => {
  for (const [placeId, before] of Object.entries(BEFORE)) {
    const key = WORKPLACE_LAYOUT_FOR[placeId];
    assert.ok(NIGHT_ROOMS[key], `${placeId} uses its rebuilt room (${key})`);
    const now = offered(placeId);
    for (const a of before) assert.ok(now.has(a), `${placeId}: ${a} still reachable`);
    for (const a of now) assert.ok(ACTIONS[a], `${placeId}: ${a} is a real action`);
  }
  // Pixel Palace's blurb promises Hoop Shot: the old room had no Hoop Shot cabinet.
  assert.ok(offered('pixelPalace').has('playHoops'));
});

test('night rooms: pieces exist, 6 worker spots, waiters stop at real tables, and each has its own look', () => {
  const looks = new Set<string>();
  for (const [key, l] of Object.entries(NIGHT_ROOMS)) {
    assert.equal(l.id, key);
    assert.equal(l.workers?.length, 6, `${key}: 6 worker spots`);
    for (const f of l.furniture) assert.ok(FURNITURE.get(f.item), `${key}: ${f.item}`);
    assert.equal(new Set(l.furniture.map((f) => f.uid)).size, l.furniture.length, `${key}: unique uids`);
    for (const f of l.furniture) {
      const hw = l.width / 2, hd = l.depth / 2;
      assert.ok(Math.abs(f.x) < hw && Math.abs(f.z) < hd, `${key}: ${f.uid} inside the room`);
    }
    if (l.life?.runner) for (const t of [l.life.runner.from, ...l.life.runner.to]) assert.ok(l.furniture.some((f) => f.uid === t), `${key}: runner stop ${t}`);
    looks.add(l.rooms.map((r) => `${r.style?.floor}|${r.style?.wall}`).join(','));
  }
  assert.equal(looks.size, Object.keys(NIGHT_ROOMS).length, 'no two rooms dressed the same');
  // Different from the arcade and casino rebuilt just before (Canal Street, the Bowery).
  const floors = (k: string) => WORKPLACE_LAYOUTS[k].rooms.map((r) => r.style?.floor);
  assert.ok(!floors('arcade4').some((f) => floors('arcade3').includes(f)), 'Pixel Palace floors differ from Canal Street');
  assert.ok(!floors('casino5').some((f) => floors('casino3').includes(f)), 'Empire floors differ from the Bowery');
});
