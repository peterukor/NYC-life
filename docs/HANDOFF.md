# NYC Life — handoff notes (read this first)

Branch: `feat/prototype-foundation`. Build with `npm run build`, preview with `npx vite preview --port 4173`, then QA with `node scripts/qa-smoke.mjs` (play-through) and `node scripts/qa-looks.mjs` (character close-ups → test-results/).

## Current state (2026-10-10, evening)
- **Art direction done (cartoon, Township/Sims-like):**
  - Buildings, props and cars come from the Kenney kits.
    - Packed by `scripts/build-kenney-assets.mjs` into `public/models/kit-*.glb`.
    - Source copied from the user's folder into `/home/claude/assets-src/kenney` (not in the repo).
  - People come from Quaternius' Ultimate Animated Character Pack (19 characters; `scripts/build-folk-assets.mjs` → `public/models/folk.glb`).
  - Runtime code:
    - `assets/kit.ts`: loader, wall/roof tint shader, night windows.
    - `world/kitcity.ts`: block planner, PALETTES, near/far detail levels.
    - `world/folk.ts`: Actor, FOLK_ROLES, slot recolouring.
    - `world/crowd.ts`: animated near crowd, instanced far crowd.
    - `world/traffic.ts`: STREET_MIX.
- **UI redesign done** ("subway signage meets toy box"): `src/ui/styles.css` and `src/ui/hud.ts`.
  - Needs are subway line bullets, location is street-sign blades, money is a MetroCard.
  - Fonts are Lilita One and Nunito.
- **Landmarks:** `world/landmarks/` registry, one file each.
  - Done: Empire State, Brooklyn Bridge, Atlantic Arena (Barclays-like).
  - Times Square is still the plain hub plaza: it needs a cartoon One Times Square tower and the TKTS red steps.
- **Wardrobe:** see `data/wardrobe.ts` (CLOTHES registry). The cartoon character mapping is `avatar.ts → folkLookOf()`. Clothes recolour the top, bottom, hair and skin slots.
- **QA:**
  - `npm run build && npx vite preview --port 4173 &`
  - `CLOCK=-6h node scripts/qa-smoke.mjs` (11 checks)
  - `CLOCK=-6h node scripts/qa-shots.mjs` (screenshots plus the heaviest meshes)
  - `npm test`

## Next steps, in order
1. Closet in the apartment and clothing stores (uses the CLOTHES registry).
   - Add `tier: plain|premium|exclusive`.
   - Starting wardrobe by spawn class (table below).
   - Map tops to folk characters: suit, doctor, chef, worker.
2. Game clock ratio: one in-game day = 3 h 23 min real time (`core/clock.ts`, one constant).
3. Work: show a "skip to end of shift" button plus a timer that reads as 4 in-game hours.
4. Times Square cartoon upgrade; more landmarks (Statue of Liberty, Chrysler, Flatiron, Central Park).
5. Plug-in systems (SystemRegistry), then auto mode, economy, careers and jobs, events by rarity (see DESIGN-SPEC.md).
6. Write `docs/ADDING-CONTENT.md`.

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

## Landmarks (user, 18:23)
- Every major landmark must be a **very cartoony but instantly recognisable** version of the real one (chunky, exaggerated proportions, bright colours, Township-style). Hand-build each one from primitives in its own file under `src/world/landmarks/` (one file per landmark, registered in a `LANDMARKS` registry).
- Keep the list to major landmarks only: Empire State, Times Square, Brooklyn Bridge, Statue of Liberty, Central Park, the Flatiron, the Chrysler Building and similar.
- Add a note for the lawyer: some landmark owners (for example, the Empire State Building) claim trademarks on their building's image for commercial use. Check before launch; a parody name or a looser design is the fallback.

## Conventions
- Conventional Commits with detailed bodies and attribution trailers.
- Branches named `feat/...`.
- Comments in simple, detailed English.
- Money is integer cents and only changes through `sim/economy.ts`.

## 2026-10-10 — Megapolis/Supercell detail pass (IN PROGRESS)
- New procedural NYC generator in `src/world/nycgen/` replaces Kenney kit buildings:
  `atlas.ts` (painted facade atlas + shared city material, see-through, night windows),
  `builder.ts` (merges everything per block into one mesh), `buildings.ts` (brownstone,
  walkup, prewar, modern, glass, deco styles; stoops, fire escapes, awnings, cornices,
  water towers, roof gardens), `props.ts` (puffy trees, parked toy cars/taxis, lamps,
  hydrants, cafés, fruit stands, food carts, scaffolding), `city-blocks.ts` (near/far LOD).
- First run: area view 123 calls / 534k tris — TOO MANY TRIANGLES. Next: cut near-block
  tris (~37k each → target ~12k: fewer blob segments on trees, fewer parked cars,
  simplify fire-escape beams), shrink near radius on low tier, then screenshot review.
- Furniture/home-layout work from the previous session was lost (never pushed): redo
  `scripts/build-furniture-assets.mjs`, `src/data/furniture.ts`, `src/data/homes.ts`.
