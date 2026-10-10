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

## ART DIRECTION CHANGE (user, 2026-10-10) — overrides the steps below where they conflict
The user wants a bright, cartoonish look, like The Sims and Township, and not a look-alike of Lagos Life. The current mannequin bodies with painted-on clothes and dot eyes look wrong to them. The direction:
- **Characters:** Quaternius "Ultimate Modular Men" and "Ultimate Modular Women" (CC0, cartoon style, with real separate clothing and hair meshes). The user downloads them from quaternius.com and attaches them. Retarget the UAL animations (same Unreal-style skeleton names), or use the clips the packs ship with.
- **City:** Kenney City Kit Commercial, Suburban and Roads (CC0), from kenney.nl, also downloaded by the user. Use instancing, pastel saturated colours and chunky rounded shapes. The procedural surfaces in `surfaces.ts` are only a fallback.
- **Rendering:**
  - Toon shading (MeshToonMaterial with a 3-step gradient map) and soft outlines (inverted-hull, on medium/high quality only).
  - A warm, bright palette and a soft sky gradient.
  - A higher 3/4 camera, like Township/Sims.
- **UI:** a rounded, bouncy, colourful Sims/Township feel, distinct from Lagos Life: a mood indicator above the head, big round buttons, playful sounds.

**Asset packs location (user's computer, unzipped):** `/Users/peterukor/Documents/NYC-life Assets`. Request folder access, then copy only the glTF/GLB files (the packs are 3.1 GB and 500 MB in total).

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

## More user requests (2026-10-10, 18:20)
- **Game day = 3 h 23 min real time** (already listed above, confirmed again). Put it in one constant.
- **Clothing tiers:** every item gets `tier: 'plain' | 'premium' | 'exclusive'`. Starting wardrobe depends on spawn class:
  - poor: 5 plain
  - middle: 6 plain + 2 premium
  - upper: 10 plain + 5 premium + 1 exclusive
  - wealthy: 15 premium + 5 exclusive
- **Spawn classes:** poor, middle, upper, wealthy (plus the rare billionaire tier, capped at 15 citywide). These replace or extend the current Origin (trustFund/hustler).
- **Architecture: plug-in "systems."** Each feature is its own module that registers with a central list and talks only through the event bus and shared state. Examples:
  - weather (future snow and heat waves that change needs, NPC routines, prices and events)
  - auto mode
  - economy
  - mini-games
  - businesses
  
  Adding or removing a system must not break the others. Build a `SystemRegistry` with `init`, `update(dt)`, `onDayRollover` and `modifiers` hooks (for example, weather exposes need-decay multipliers that needs.ts reads).

## Conventions
- Conventional Commits with detailed bodies and attribution trailers.
- Branches named `feat/...`.
- Comments in simple, detailed English.
- Money is integer cents and only changes through `sim/economy.ts`.
