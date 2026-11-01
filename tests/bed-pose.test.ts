// Lying on beds (world/bed-pose.ts): Peter, 2026-11-01, "the head got cut
// off". The rays are real ones cast down the game's bed models
// (tests/fixtures/bed-samples.json, from __nyc.bedSamples): the sleeper's
// head must land on the pillow inside the headboard, the back on the
// mattress, and the whole body on the bed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bedSpot, DEFAULT_BODY, liePose, type BedSample } from '../src/world/bed-pose.ts';

type Bed = { lineX: number; fp: { minZ: number; maxZ: number }; samples: [number, number[]][] };
const BEDS = JSON.parse(readFileSync(new URL('./fixtures/bed-samples.json', import.meta.url), 'utf8')) as Record<string, Bed>;
const samples = (b: Bed): BedSample[] => b.samples.map(([z, tops]) => ({ z, tops }));

/** What the old pose did: feet 22% past the middle, so the head top ended up here (bed z). */
const oldHeadTop = (b: Bed, length = DEFAULT_BODY.length) => (b.fp.minZ + b.fp.maxZ) / 2 + (b.fp.maxZ - b.fp.minZ) * 0.22 - length;

for (const [name, bed] of Object.entries(BEDS)) {
  const decks = name === 'bunkBed' ? (['top', 'bottom'] as const) : (['top'] as const);
  for (const deck of decks) {
    test(`${name}${deck === 'bottom' ? ' (bottom bunk)' : ''}: head on the pillow inside the headboard, body on the mattress`, () => {
      const spot = bedSpot(samples(bed), deck);
      assert.ok(spot, 'found the mattress');
      // Every model has its headboard at −z.
      assert.equal(spot.headSign, -1);
      // The mattress run starts inside the footprint and is long enough for a person.
      assert.ok(spot.headZ >= bed.fp.minZ - 0.01 && spot.footZ <= bed.fp.maxZ + 0.01);
      assert.ok(spot.footZ - spot.headZ > 1.8, `mattress ${spot.footZ - spot.headZ} m`);
      assert.ok(spot.pillow >= spot.surface && spot.pillow - spot.surface < 0.3);
      const pose = liePose(spot, DEFAULT_BODY, bed.lineX);
      const headTop = pose.z - DEFAULT_BODY.length; // head goes to −z from the feet
      // The head is on the mattress, not in the headboard…
      assert.ok(headTop >= spot.headZ, `head top ${headTop} vs mattress start ${spot.headZ}`);
      assert.ok(headTop - spot.headZ < 0.1, 'and right up by the pillow');
      // …and the feet are on the bed too.
      assert.ok(pose.z <= spot.footZ + 0.12, `feet ${pose.z} vs foot ${spot.footZ}`);
      // Lying down, the head a little up on the pillow, the back on the mattress (not sunk into it).
      assert.ok(pose.pitch >= -Math.PI / 2 && pose.pitch < -Math.PI / 2 + 0.25);
      const backAtHips = pose.y + Math.sin(pose.pitch + Math.PI / 2) * DEFAULT_BODY.length * 0.5 - DEFAULT_BODY.back;
      assert.ok(Math.abs(backAtHips - spot.surface) < 0.06, `hips' back ${backAtHips} vs mattress ${spot.surface}`);
      // The old pose ran the head past the end of the mattress (into the headboard and the wall).
      assert.ok(oldHeadTop(bed) < spot.headZ, 'the old pose really did cut the head off');
    });
  }
}

test('bunks: the decks are told apart', () => {
  const s = samples(BEDS.bunkBed);
  const top = bedSpot(s, 'top')!, bottom = bedSpot(s, 'bottom')!;
  assert.equal(top.levels, 2);
  assert.ok(top.surface > 1.3 && top.surface < 1.7, `top deck ${top.surface}`);
  assert.ok(bottom.surface > 0.35 && bottom.surface < 0.6, `bottom deck ${bottom.surface}`);
  // A plain bed has one deck whichever you ask for.
  const twin = samples(BEDS.twinBed);
  assert.deepEqual(bedSpot(twin, 'bottom'), bedSpot(twin, 'top'));
});

test('a thick headboard is not a pillow (the double bed)', () => {
  const spot = bedSpot(samples(BEDS.bedDouble), 'top')!;
  // The headboard is a 0.75 m high block 0.2 m deep at the head: the mattress starts after it.
  assert.ok(spot.headZ > BEDS.bedDouble.fp.minZ + 0.18, `mattress starts at ${spot.headZ}`);
  assert.ok(spot.pillow < 0.7, `pillow ${spot.pillow}`);
});

test('a bed turned round (headboard at +z) lays the head at +z', () => {
  const flipped = samples(BEDS.bedDouble).map((x) => ({ z: -x.z, tops: x.tops }));
  const spot = bedSpot(flipped, 'top')!;
  assert.equal(spot.headSign, 1);
  const pose = liePose(spot, DEFAULT_BODY);
  assert.equal(pose.yaw, Math.PI);
  assert.ok(pose.z + DEFAULT_BODY.length <= spot.headZ + 1e-9);
});

test('too few rays, or nothing to lie on: no spot', () => {
  assert.equal(bedSpot([{ z: 0, tops: [0.5] }]), null);
  assert.equal(bedSpot(Array.from({ length: 30 }, (_, i) => ({ z: i * 0.05, tops: [] }))), null);
});
