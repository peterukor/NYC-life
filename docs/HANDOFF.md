# NYC Life — handoff notes (read this first)

Branch: **`feat/nyc-generator`** (branched from `feat/prototype-foundation`).

Build and test:
- `npm run build && npx vite preview --port 4173 &`
- `node scripts/qa-smoke.mjs`: 11 play checks.
- `node scripts/qa-shots.mjs`: screenshots.
- `node scripts/qa-home.mjs`: homes and move mode.
- `Q=low node scripts/qa-perf.mjs`: triangles and draw calls.
- `npm test`

How to add or change content: **`docs/ADDING-CONTENT.md`**.

## Current state (2026-10-11, overnight session)
- **City look (Megapolis/Supercell direction).** A procedural NYC generator in `src/world/nycgen/` has replaced the Kenney buildings.
  - `atlas.ts`: the painted facade atlas plus one shared city material. It handles see-through, night windows, snow and wet streets.
  - `builder.ts`: merges each block into one mesh.
  - `buildings.ts`: 6 building styles with stoops, fire escapes, awnings, cornices, water towers and roof gardens.
  - `props.ts`: trees, parked cars, lamps, cafés, fruit stands, food carts and scaffolding.
  - `city-blocks.ts`: near/far level of detail.
  - Performance on low-tier phones: 149k–277k triangles and 57–124 draw calls.
- **Roads:** two lanes with double yellow lines and parking lanes.
- **Plug-in systems:**
  - `core/systems.ts` holds `SYSTEMS` and `SystemRunner`. A system that crashes is switched off.
  - `systems/index.ts` lists what's on: weather-fx, traffic, pins.
- **Vehicles:** `data/vehicles.ts`, 13 toy vehicles with rarity, weights, speeds, paints and prices.
- **Weather:** `sim/weather.ts` is a `WEATHER` registry with snow, heat wave and flash flood. Weather drives the sky, need drain, rideshare surge and news. `systems/weather-fx.ts` adds rain, snow, wet streets, snow on roofs and flood water. Force one with `?weather=snow`.
- **NPC brain:** `data/crowd-brain.ts` holds personalities, next-stop tables and density.
- **Map pins:** `data/pins.ts` and `systems/pins.ts`. At most 4 pins show, overlapping pins merge, and only one bounces. Sources so far: home, work, daily sales, landmarks.
- **Homes:**
  - Furniture: `scripts/build-furniture-assets.mjs` builds `public/models/furniture.glb`; the pieces are listed in `data/furniture.ts`.
  - Three floor plans in `data/homes.ts`; `world/home-interior.ts` builds them with Sims-style cutaway walls.
  - Move mode: "Move this" on any piece, then tap the floor, Turn, Done. Saved in `state.homes`.
- **Still from before:** folk characters (`world/folk.ts`), the UI redesign, landmarks (`world/landmarks/`), wardrobe (`data/wardrobe.ts`).

## Done overnight (after the generator), newest last
- **Clothing:** tiers and starting wardrobe by class, plus a closet at home (`ui/closet.ts`).
- **Game clock:** 1 game day = 3 h 23 min (`GAME_DAY_REAL_MINUTES`). Test with `?hour=11`; `?clockmode=real` uses the real clock.
- **Work:** shifts read as 4 game hours, with "Skip to end of shift".
- **Landmarks:** cartoon Chrysler, Flatiron and Statue of Liberty, plus a real Times Square (One Times Square tower, TKTS steps, plaza seating).
- **2D map:** Apple Maps transit style (`ui/map.ts`).
- **☰ menu** (`ui/side-panel.ts`): HAPPENING NOW (at most 5 items) and shortcuts. Buttons are a registry.
- **Event rarity tiers:** common to legendary (`RARITY` in `sim/events.ts`). Legendary events: a true inheritance and a fatal crash, which starts a new life.
- **Auto mode** (`sim/auto.ts`, `ui/auto-mode.ts`): the routine runs while you're away, it can't fill every bar, and staying on auto mode for 6 days puts you in a rut that 2 varied game days cure.
- **Investing:** shared seeded market (`sim/market.ts`, `data/stocks.ts`), Phone → Stocks, `netWorth()`. `marketMood()` is the recession seam.
- **Spawn classes:** pick poor, middle, upper or wealthy at the start (`CLASSES` in `sim/state.ts`).

- **Life paths** (`data/paths.ts`, `sim/paths.ts`, Phone → Life Path): Crime Boss, CEO, Celebrity. Rep, seeded checklists, betrayal gates, the Celebrity streak, risky actions that can get you busted.
- **Clothing stores** (4 shops, by tier, `ui/store.ts`).
- **NPCs go home:** they walk to a residential block and vanish inside for a while.
- **Mini-games** (`data/minigames.ts`): "Play the shift" (Order Rush for every job) or skip.
- **Businesses** (`data/businesses.ts`, `sim/business.ts`, Phone → Business): buy, hire and fire staff, 32% daily tax, creative accounting with audits.

## Next steps, in order
1. **Jail system:** busts and audits only fine you for now. Add jail time, gang territory and the "gang view" map overlay (DESIGN-SPEC).
2. **Player cars:** buy from `VEHICLES` (prices exist), drive, Cool meter, speeding tickets, losing your licence.
3. **Multiplayer server (Colyseus skill in repo):** player homes on blocks, visiting (follow home, shared address, spare key), friends pins, billionaire cap, recession and reset vote (seams: `marketMood()`, `sim/economy.ts`).
4. **More mini-games** per job (the interface is ready).
5. **Visual polish:** more building styles (warehouses for Brooklyn, a church), parks with paths, and interiors for shops and venues using the furniture kit.

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
