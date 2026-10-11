# Adding, editing and removing content in NYC Life

The game is built from **plug-ins**: most things are a list entry in
one data file, or a small self-contained file that registers itself.
To add something, you add an entry. To remove it, you delete it.
Nothing else in the game needs to change.

Every list is a `Registry` (`src/core/registry.ts`). If two entries
share an id, the game stops at once with a clear error message instead
of quietly replacing one with the other.

After any change, run `npm run build` and `npm test`. The tests check
that new entries are complete (for example, a car with no paint colour
fails the test).

| I want to… | Edit this | What to add |
|---|---|---|
| Add a car, bus or truck | `src/data/vehicles.ts` | An entry with an id, rarity, `trafficWeight`, `parkWeight`, a speed range (m/s), paints, a price, and `build()` (draw it from toy shapes; copy a similar vehicle). |
| Make a car rarer or faster | `src/data/vehicles.ts` | Change `trafficWeight` / `parkWeight` / `speed`. |
| Take a vehicle off the streets | `src/data/vehicles.ts` | Set both weights to 0 (it stays in the game, for the shop), or delete the entry. |
| Add a weather (fog, hail…) | `src/sim/weather.ts` | An entry with the odds by month/hour, sky greyness, sun, particles (`rain`/`snow`), ground effects (`wet`, `snow`, `flood`), the needs it speeds up, the rideshare surge and a news tip. The sky, effects, needs and news all pick it up automatically. |
| Add something that runs every frame (a parade, fireworks, a street mini-game) | New file in `src/systems/`, then one import line in `src/systems/index.ts` | `SYSTEMS.add({ id, areaLoaded, update, tick, areaUnloaded })`. See `src/systems/weather-fx.ts` for a full example. If a system crashes, it's switched off and the rest of the game keeps going. |
| Switch a system off | `src/systems/index.ts` | Delete its import line. |
| Change how NPCs behave (where they go, when, how fast) | `src/data/crowd-brain.ts` | Edit `NEXT_STOP` (where people go after each kind of place), `timeBias` (time of day), `CROWD_DENSITY` (how busy each hour is). |
| Add a type of NPC (jogger, shopper…) | `src/data/crowd-brain.ts` | An entry in `PERSONALITIES`: its share of the crowd, which stops it loves or avoids, its walking speed and how long it lingers. |
| Add a kind of map pin (party, breaking news, friend…) | `src/data/pins.ts` | A `PIN_KINDS` entry (colour, priority, whether it may bounce, zoom rules) and a `PIN_SOURCES` entry (a function returning today's pins). The pin system only ever shows `MAX_PINS` (4) at once, merges overlapping pins and lets only one bounce. Never raise MAX_PINS without a good reason: pins must not overwhelm the screen. |
| Add a piece of home furniture | `scripts/build-furniture-assets.mjs` (add the model's file name to `MODELS` and re-run it), then `src/data/furniture.ts` | An entry with its parts (models plus offsets), the actions it offers (sleep, cook…) and a price. |
| Add or change a home floor plan | `src/data/homes.ts` | A layout: size, room floors, inner walls with door gaps, and the starting furniture. Point a home place at it in `HOME_LAYOUT_FOR`. |
| Add a button to the ☰ menu | `src/ui/side-panel.ts` | An entry in `PANEL_BUTTONS` (label, emoji, and what it opens). |
| Add something to "Happening now" | `src/data/pins.ts` | Any new pin source (sales, events, friends…) also appears in the menu's HAPPENING NOW list, which shows at most 5 lines. |
| Add a random event | `src/sim/events.ts` | An entry in `EVENTS`: when it can happen (`weight`), its `rarity` (common, uncommon, rare, veryRare or legendary), the text and the choices with their outcomes. Rarity multiplies the weight; a badge shows on rarer messages. |
| Add a landmark | New file in `src/world/landmarks/`, then one import line in `src/world/landmarks/index.ts` | `LANDMARKS.add({ id, build(ctx) })`, plus a place in `src/data/places.ts`. |
| Add clothes | `src/data/wardrobe.ts` | An entry in `CLOTHES`. |
| Add a place (shop, bar, gym) | `src/data/places.ts` | Its block, side, slot, type, hours and actions. |
| Add a building style | `src/world/nycgen/buildings.ts` | Add the style to `Style`, `STYLE_RULES`, `PAL` and `ZONE_MIX`, then add any special details in `emitDetailed()`. |
| Add a street prop (bench, kiosk…) | `src/world/nycgen/props.ts` | A small function that draws it, called from `emitBlockProps()`. |
| Change prices, rent, needs or balance numbers | `src/core/constants.ts` | Change the number. |
| Make game days longer or shorter | `src/core/constants.ts` | `GAME_DAY_REAL_MINUTES` (203 = 3 h 23 min; 1440 = real time). |

## Testing a change quickly

Run `npx vite preview --port 4173`, then open the game with these
options in the address bar:

- `?weather=snow` forces a weather. Use any weather id, such as
  `heatwave` or `flood`.
- `?quality=low` uses the cheap-phone settings. `medium` and `high`
  also work.
- `?hour=11` jumps the game clock to 11 AM (use `?hour=21` for night).
- `?clock=-6h` shifts the real clock.
- `?clockmode=real` runs on the real New York clock instead of game time.
- `?qa=1` turns on the test hooks (`window.__nyc`).

The test scripts are:

- `node scripts/qa-smoke.mjs`: 11 automatic play checks.
- `node scripts/qa-shots.mjs`: screenshots.
- `Q=low node scripts/qa-perf.mjs`: triangle and draw-call counts.
