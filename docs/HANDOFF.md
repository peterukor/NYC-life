# NYC Life — handoff notes (read this first)

Branch: `feat/prototype-foundation`. Build with `npm run build`, preview with `npx vite preview --port 4173`, then QA with `node scripts/qa-smoke.mjs` (play-through) and `node scripts/qa-looks.mjs` (character close-ups → test-results/).

## Current state (2026-10-10)
- Playable single-player prototype: Manhattan + Brooklyn, subway, jobs, needs, events/scams, news, ads, map, phone. Real NYC clock drives day/night and weather.
- **Characters (new):** real rigged bodies + ~26 animations from Quaternius' Universal Animation Library (CC0). Files: `public/models/*.glb` (≈470 KB). Rebuild them with `node scripts/build-character-assets.mjs <path>/quaternius` (source: github.com/tilakpatell/tilakverse-assets, CC0).
  - `src/world/people.ts`: `Person` class. Clothes are painted per vertex by body part. Hair, hats, skirts, hoods, glasses and backpacks are small meshes glued to bones.
  - `src/world/avatar.ts`: the player wrapper. It shows the simple figure until the models load, and has a `setAction(anim)` for activities.
- **Wardrobe:** `src/data/wardrobe.ts`, a `CLOTHES` registry. `Look` (in `sim/types.ts`) has optional clothing ids.
- **Registry pattern:** `src/core/registry.ts`. Use it for every new content type.
- **City look upgrade (written, NOT wired yet):** `src/render/surfaces.ts` has detailed facades, shopfronts, sidewalk, asphalt, roof, grass and plaza textures, plus `surfaceMaterial()` (PBR on medium/high quality). The old facade code was removed from textures.ts, which now re-exports from surfaces.

## Next steps, in order
1. **Wire `surfaces.ts` into `world/city.ts`:**
   - Call `setSurfaceDetail(tier)` before `buildCity`.
   - Use `surfaceMaterial(facadeTextures(style), {glow:true})` in `facadeMaterial`.
   - Add a ground-floor shopfront band (walls 0–4.5 m with `shopfrontTextures()`, upper facade from 4.5 m).
   - Ground textures on asphalt (repeat = size/8), sidewalk, roof, grass, plaza and dirt materials.
   - Add cornices: a global "trim" geo with a slab overhang at the roof edge of non-glass buildings.
   - Add rooftop HVAC boxes.
   - Replace ball trees with clustered lumpy foliage.
2. **Sky and environment:**
   - Gradient sky dome shader following the camera, with a sun glow, stars and a moon at night.
   - A PMREM environment map built from the same gradient and refreshed every few seconds, set as `cityScene.environment`, with `environmentIntensity` scaled by `sky.hemi`. Keep the draw-call check under 250.
3. **Fix the hair hairline:** check `test-results/looks-sheet.png`; the hair cap used to cover the face, and is now trimmed by `trimBelowHairline`. Then do hats.
4. **Closet and shops:**
   - Closet object in the apartment that opens a wardrobe sheet (slots, owned items, colour swatches).
   - A clothing store place to buy items.
   - Save owned ids in `state.wardrobe` (migrate in save.ts).
   - Use the onboarding hair-style picker.
5. **Activity animations:** call `player.setAction('eat'|'sit'|'phone'…)` during activities, and clear it after.
6. **Animated nearby crowd:** use `Person` for the nearest ~12–40 NPCs, and keep the instanced capsules for far ones.
7. Write `docs/ADDING-CONTENT.md` (registries, wardrobe, places, events, careers, districts, vehicles). Turn vehicles into a `VEHICLES` registry in traffic.ts.

## User requests not started yet (all must be modular: nothing should break the whole game)
- **Game clock:** one in-game day = 3 h 23 min real time. Replace the real-NYC-clock mapping in `core/clock.ts` with a configurable ratio (constant), and keep `?clock=` for testing.
- **Auto mode:**
  - The avatar runs a pre-planned routine while you're away. The player can pick the tasks it repeats.
  - On return, the player sees a summary of messages and events.
  - The routine can never fill every bar.
  - If auto mode runs longer than about 6 real days, the character becomes depressed (a moodlet). It takes about 2 in-game days of varied, non-routine activity to recover.
- **Mini-games framework:**
  - A plug-in interface for in-game games (activities and work tasks), with leaderboards and multiplayer later.
  - For now, work shows a timer that "skips time": a shift reads as 4 hours but finishes quickly.
- **Careers:** blue-collar, health and office jobs, plus player-owned businesses that can employ people (registry).
- **Life reset:** a player can restart their life.
- **Billionaire cap:**
  - At most 15 billionaires in the whole city.
  - The chance of starting as a billionaire or a billionaire's child is very low, and falls as more exist.
  - This needs the server, so build it as a seam in `sim/economy.ts`.
- **Money system:**
  - Investing (stocks/funds sim).
  - A recession when too much money is in circulation.
  - **Reset vote:** if 30% vote yes, balances are recalculated by wealth percentile.
  - **Target class split:** about 50% lower, 33% middle, 10% upper, 7% ultra-wealthy.
  - **Suggested method:** rank players by net worth and map each rank to a target band on a log scale, so order is preserved.
  - This also needs the server; build the seams now.

## Conventions
- Conventional Commits with detailed bodies and attribution trailers.
- Branches named `feat/...`.
- Comments in simple, detailed English.
- Money is integer cents and only changes through `sim/economy.ts`.
