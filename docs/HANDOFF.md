# NYC Life — handoff notes (read this first)

Branch: **`feat/visual-upgrade`** (latest work, not merged to main yet: Peter merges when he's happy). Older notes below mention earlier branches.

Build and test:
- `npm run build && npx vite preview --port 4173 &`
- `node scripts/qa-smoke.mjs`: 11 play checks.
- `node scripts/qa-shots.mjs`: screenshots.
- `node scripts/qa-home.mjs`: homes and move mode.
- `node scripts/qa-homes.mjs`: the four starter homes (born reveal, clashes, reachability, roommates, shots). `CLASSES=rich,billionaire` to narrow.
- `node scripts/qa-roommates.mjs`: roommates wander and chat.
- `CLASS=billionaire node scripts/qa-smoke.mjs`: smoke for any class.
- `Q=low node scripts/qa-perf.mjs`: triangles and draw calls.
- `npm test`

- `CLASS=rich STEPS='home|design|tab:walls|night|swing|top' node scripts/qa-design.mjs`: homes and the design menu (shots in test-results/design-*.png).
- `node scripts/qa-design-flow.mjs`: the design menu by taps (paint, floor, buy a light, recolour, a style).
- `node scripts/qa-street-people.mjs`: the new people on the street.

How to add or change content: **`docs/ADDING-CONTENT.md`**.

## Visual upgrade (2026-10-27, branch feat/visual-upgrade)

Peter's plan: redo the people, NPCs and every location with the Quaternius/Kenney packs from his computer (`/Users/peterukor/Documents/NYC-life Assets`), keep the city map and navigation exactly as they are. Five stages: 1 people → 2 homes and customisation → 3 the 47 existing rooms → 4 the 59 new rooms → 5 social (home visits; needs the server hosted). Old saves auto-match; costumes became party/Halloween items.

**Stage 1, people (done).** `scripts/build-people-assets.mjs` builds `public/models/people-{m,f}.glb` (Quaternius modular outfits merged per look, colour slots) and `people-{m,f}.anim` (39 clips from the Universal Animation Library, retargeted in `scripts/people/retarget.mjs`, packed by `scripts/people/anim-pack.mjs`, read by `src/world/people-anims.ts`). Hair and accessories are built from the bare head (`scripts/people/hair.mjs`, `accessories.mjs`). `world/folk.ts` makes the people; `world/avatar.ts` maps a saved Look onto parts; NPCs get varied everyday outfits and real activity poses (venue-life, section-crew).

**Stage 2, homes (done, first pass).**
- Furniture: `scripts/build-interior-assets.mjs <Quaternius OBJ> <Kenney GLTF>` → `public/models/interior.glb` (228 models) + `src/data/interior-models.json` (sizes, default colours). Every vertex has a colour slot (`_slot`: 0 fixed, 1 main, 2 frame, 3 glow); `assets/furniture-kit.ts` gives each piece a material for its colours (`materialFor`). `scripts/interior/interior-preview.html` + `shot.mjs` make contact sheets of the pack.
- Catalogue: `data/furniture-catalog.ts` (~190 pieces in 11 buy categories) on top of `data/furniture.ts`. Code-built decor (LED strips, neon, fairy lights, chandeliers, pendants, lamps, art, mirrors, rugs, plants, wall TV, fire) in `world/furniture-deco.ts`. Pieces can hang from the ceiling (`hang`), sit on tables (`deco`), hang on walls (`wall`), and give light (`light`).
- Looks: `data/home-style.ts` (15 floors, 11 wall finishes, a palette, bulb colours, 8 one-tap presets) drawn in code by `render/home-surfaces.ts`. Saved per home in `state.homeStyles`; piece colours on each `HomeItem` (`a`, `b`, `lc`).
- `world/home-interior.ts` rebuilt: per-room floors and walls (merged by finish), accent walls, skirting, window frames with a day/night city view, cutaway walls that follow the camera (a shader on the wall materials), time-of-day light, warm lamp light after dark with light pools, wall washes and halos, 0/2/4 real point lights by tier, contact shadows, sun shadows on high.
- Camera (`world/interior-view.ts`): swing round (45° steps), top view, and long homes on a phone held upright open swung a quarter turn so they fill the screen. The design menu lifts the room above itself.
- Design menu (`ui/design-mode.ts`, dock button 🎨 Design at home): Buy (3D thumbnails, `render/furniture-thumbs.ts`), Walls (whole room or tap one wall), Floors, Lights (after dark / on / off, see it at night), Styles, Storage; tap a piece to move, recolour or put it away.
- Bigger plans: the loft (18×12), the UES two-bed (18×13) and the penthouse (26×16, six rooms). `HomeLayout.version` bumps reset old saved arrangements (bought pieces go to Storage, game.ts `migrateHome`).
- Perf (penthouse at night): 110 draw calls / 85k triangles on low and medium, 171 on high (shadow pass).
- Not done yet: over-the-shoulder / first-person cameras, two-floor homes with stairs, a townhouse, free 45° turning in move mode.

**Stage 3, the existing rooms (first pass done).** `data/venue-looks.ts` dresses every venue plan from `data/venues.ts` (23 plans, used by all the bars, clubs, bodegas, cafés, pizza places, offices and workplaces): rooms grow 10–25% (pieces against a wall stay against it), each gets a lighting `mood` (bright, cozy, bar, club, arcade, casino, outdoor), floors and walls (new finishes: arcade cosmic carpet, casino carpet, gloss black, gym rubber, grass, asphalt, dark wood panelling, tufted velvet, black brick, acoustic foam, hedges), colours for the old pieces, extra lights / LED strips / plants / art, and neon words on the walls (`layout.signs`, drawn in home-interior.ts). Clubs get sweeping light beams (venue-life.ts). `node scripts/qa-venues.mjs` screenshots every venue into test-results/venues-sheet.png and lists clashes (none) and draw calls (53–117).
- Still to do in stage 3: swap the chunky code-built work pieces (counters, slot machines, cabinets…) for higher-detail ones where it helps, more variety between venues of the same kind.

**Peter's second round (2026-10-27): "not rectangular, too small, dead".** He compared it with Lagos Life (angled view, big many-roomed houses, lively clubs).
- View: every home and venue now opens at a 45° corner angle (`game.ts fitInteriorCamera`, `startZoomFor`), like Lagos Life.
- Shaped plans: `HomeLayout.shaped` + `door`. The home is the union of its rooms; `world/footprint.ts` traces the outer walls (`outline`), checks placement (`rectInsideRooms`) and finds the door (`doorOfLayout`). Walls, windows (auto-spaced), base, door, spawn, wall-snapping and clash checks all follow the outline.
- Homes v3: UES "Upper East Side residence" (30×22, ten rooms incl. cinema, study, guest room) and the penthouse became the "Billionaires' Row mansion" (40×28 U shape, eleven rooms: great room, pool hall with a pool, spa, library, gym, cinema, dining hall…). Old arrangements reset to Storage via `version`.
- Venues: `venue-looks.ts` can `notch` corners out (no more plain boxes), `remove`/`move`/`swap` pieces, and add `screens` (animated video walls: galaxy, waves, stocks, game). New nightlife pieces: LED dance floor, light-up bar, bottle shelf, truss ring with moving heads, VIP riser, lounge set with candles, live stage, neon arch (glow pulses: disco, breathe, chase via `Finish.pulse` and `FURNITURE_TIME`). Every location got a lively pass; moods are brighter.
- Skills added: interior-design-expert and color-theory-palette-harmony-expert (`.claude/skills/THIRD_PARTY_SKILLS.md`).
- QA: `scripts/qa-venues.mjs` (hides random events/tips), `scripts/qa-design.mjs`.

**Square homes (Peter, 2026-10-27, third round: "all apartments should be square", big living rooms, walk-in closets and showers in the big rooms, a guest bathroom, no pool).** Every home is now a square `shaped` plan, sized by wealth: shelter and Harlem walk-up 10×10, studio 12×12, loft 16×16 (two bedrooms), Upper East Side residence 20×20 and Billionaires' Row penthouse 24×24 (primary suite with walk-in closet and en-suite, a second bedroom with a glass shower, a third bedroom, open living / dining / kitchen with an island, a pool-table den or game lounge, a guest bathroom; the penthouse adds a grand piano). Versions bumped (old arrangements go to Storage). The plans were laid out with a small generator that uses real footprints (`scripts/qa-footprints.mjs` dumps them via `__nyc.footprints`). Inside walls now stay waist-high (1.05 m, `INNER_LOW` in home-interior.ts) when cut away, Lagos Life style; outer walls still drop to 0.55 m. Square homes open showing the whole floor (`startZoomFor`). `qa-venues.mjs` also checks `blockedUse` and can print `STATS=1` mesh counts. Penthouse: ~180–200 draw calls at full view (one per piece); merging static furniture would be the next perf step if an iPhone X struggles.

**Lagos Life homes (Peter, 2026-10-27, fourth round: "still looks dead… be creative"; rectangles are fine, not long or narrow).** Plans are now rectangles sized by wealth (shelter and walk-up 10×8, studio 11×9, loft 14×11, Upper East Side 28×20, Billionaires' Row 36×26 — Peter asked twice for bigger; the billionaire home has four bedrooms, a cinema, entry lounge with piano, game room, gym, study and bar; big homes open zoomed in a little, pinch out to see it all; ~235–250 draw calls at full view) and packed denser, with bold palettes: big glossy tiles with grout lines (`bigTile:#hex` floor), black/pink, terracotta/mustard, mustard selfcon. New pieces in the catalogue: split AC, ring light, standing fan, water dispenser, velvet throne, four-poster bed, glass partition, bordered rug, pop-art poster, wall clock (`furniture-deco.ts`). Homes sit in a garden (`world/home-yard.ts`: lawn, paving round the house and to the door, bushes and trees, garden lamps that glow after dark, your car on the driveway — or `layout.yardCar` if you don't own one). Night interiors are brighter. The shelter has two bunk beds instead of five singles. Layouts were generated with clash checks against real footprints; `qa-venues.mjs` reports clashes and unreachable pieces (none).

**Two floors (2026-10-27, evening).** Peter: rich back to the v7 plan (now v9), and an upper floor for the billionaire home. `HomeLayout.upper` names the floor above (`penthouseUp`, `upstairs: true`: no front door gap; the garden sits a storey below with the ground floor's outside walls, `home-yard.ts` `storey`). New fixed pieces `stairsUp` / `stairsDown` (`opens: 'stairs'`) switch floors (game.ts `changeFloor`, `homeFloor`); each floor saves its furniture and style under its own key (`placeId`, `placeId@up`). Reloading puts you back on the ground floor. QA: `UP=1 IDS=penthouse node scripts/qa-venues.mjs`. Upstairs is the owner's floor (owner's suite, boutique closet, spa bath, glam room, library, sky lounge with a bar, sunroom, teen room, guest suite, music studio, balcony, laundry, guest bath); downstairs the old primary suite became the guest suite.

**Clubs rebuilt (2026-10-27, night).** Peter: 5 clubs, 3 night clubs (a ladder) and 2 open 24/7, spread over the boroughs, every one different, pole stages for NPC dancers only, "make this lit". `data/clubs.ts`: Basement 718 (`basement212`, moved to the Bronx, tier 1) → The Velvet Room (Midtown, tier 2) → Aurum (members only, tier 4); `allDay` clubs Skye Rooftop LIC (`skyeRooftop`, moved to Queens) and Warehouse 9 (`warehouseRave`, Brooklyn), both no `hours` (never close) and open to anyone. Rooms in `data/club-rooms.ts` (club1, club, club4, club3, club5; no venue-looks dressing). New pieces: `polePodium`, `cagePole` (no actions: players can't get on), `speakerStack`, `champagneTower`, five LED floor palettes (`ledFloorGold/Neon/Velvet/RedBlue/Sunset`), `glassRail` wall, `backdrop: 'skyline'` (the rooftop's Manhattan view). `venue-life.ts`: pole dancers (circle the pole, spin up, slide down, pose; 💸 floats), laser fans that stop at the floor, haze, a drop every ~30 s (CO2 jets, confetti, strobe), packed rooms (26 extra standing/dancing spots). 135–167 draw calls at full view.

**Bars, arcades, casinos (2026-10-27, late).** Peter: cut bars to 4 (spread out), 3 arcades with more games and leaderboards for all players, 4 casinos with more games (poker, craps, baccarat, Big Six, scratch cards, keno, Plinko, plus pool 8-ball/9-ball), all different. Comedy club left as it was. Places: The Rusty Nail moved to Brooklyn; St Nicholas Pub and Dyckman hookah lounge removed (saves standing in them wake up at home, `sim/save.ts`); new `kingsArcade` (Brooklyn), `hubArcade` (Bronx), `astoriaRoyale` (Queens), `navyYardClub` (Brooklyn), `luckyStar` (Bronx). Rooms in `data/fun-rooms.ts` (bar1–3, stoopBar, arcade, arcade2–3, casino, casino2–4; no venue-looks dressing). New fixed pieces in `world/furniture-fun.ts` + `data/furniture.ts` (cabBreakout, cabRooftop, pinballMachine, skeeBall, pokerTable, crapsTable, baccaratTable, bigSixWheel, plinkoBoard, scratchKiosk, videoPoker, kenoBoard); cabinet/slot/keno screens glow (`pulse`). Leaderboards: server `POST /api/scores`, `GET /api/scores/:game` (best per player, caps in `RULES.scoreGames`, rate limited; server test added); client `net/scores.ts` (posts after each arcade game when signed in; offline board = you vs weekly regulars), `ui/scoreboard.ts` (in the cabinet's end screen and the prize counter's 🏆 High scores). Venue name boards are skipped when a room has its own `signs`.

**Stage 4** (the 59 new rooms): Peter said "not yet for now". **Stage 5** (social) needs the server hosted.

## Batch 7: the north and better mini games (2026-10-16)

- North Manhattan (data/north.ts): 24 places from 110th St to Inwood, real landmarks (Grant's Tomb, the Cloisters, the High Bridge, the Little Red Lighthouse, each with an official site) plus local spots (Apollyon Amateur Night, Lenox Lounge jazz, Rucker Park, dominoes, a laundromat, El Barrio murals, La Marqueta, a Dominican bakery, a boxing club, Dyckman hookah, the canoe club, Mofongo King). 12 odd activities (twists via sim/oddities.ts) and 12 plain food/fun actions. Harlem Soul and the chimi truck serve their own food now. tests/north.test.ts keeps 30+ places north of 110th.
- Game feel toolkit (ui/juice.ts): Fx for canvas games (particles, floating scores, shake, flash, hit-stop, stamps), Combo, and DOM helpers popAt / shakeEl / burstAt. Reduced motion = gentler.
- Arcade (ui/arcade-games.ts, split out of arcade.ts): Snake combos, golden slices, slow-mo soda and roadworks; Hoops ON FIRE, money balls and bonus time; Pigeon Pop combos, golden-pigeon frenzy and bread; Beat Street PERFECT/GREAT/GOOD, crowd meter, hype ×2 and a grade; Stack falling overhang, regrowth and golden layers; Dash cash lines, magnet, helmet, turbo and close calls; Claw steering, sway, grip and shiny prizes. Ticket rates retuned in sim/arcade.ts.
- Fight (Punch-Out): left/right hook tells, dodge the other way, counters, crits, star punch, K.O. Chase (Subway Surfers): jump, skateboard, cash (kept if you escape), close calls, a distance-to-the-cop bar.
- Fishing: nibbles vs bites, perfect hook, fish runs, sweet spot, treasure, perfect catch +25%, catch streaks, new junk. Bike: rocket start, cadence rhythm, slipstream, clean-line corner boosts, sprint. Shifts: service streak (+10% tips each, max +50%), ⭐ VIP customers (double tips), customer mood. Workout coach and perfect-form reps; the raise boss reacts; casino near-miss suspense and bigger wins; chess banter and capture/check effects; easel stickers, mirror, spray and a critic.
- QA: scripts/qa-games.mjs plays every arcade game; batch2/4 bots updated for the new fight and fishing rules. Tests 193.

## Backend (2026-10-16): built and tested, not deployed yet

- `server/` (own package, Node 22+, runs .ts directly): Colyseus 0.18 rooms + an HTTP API under /api on one port, SQLite via node:sqlite. README there has settings, deploy steps and the API list. Dockerfile at the repo root (copies src/core for the shared game clock).
- Accounts: username + password + email (Peter's choice). scrypt hashes, sessions stored as SHA-256, forgot/reset by email link (?reset=), confirm email (?verify=), change password/email, delete account. Emails go to the log until RESEND_API_KEY is set.
- Features: cloud save with revisions; real players' season board (points capped 300/post, 2,500/hour; top 3 claim prizes once; local NPC prizes stop while signed in via useRealBoard); gallery + likes; transfers ($3k/game day straight, more = admin-reviewed wire; needs a confirmed email; receiver collects); reports; admin (ADMINS env).
- Live city: room "city" per area (filterBy area, 60 seats). Server clamps moves to 32 m/s, "travel" jumps once per 3 s, emotes from a list, chat 80 chars filtered and rate-limited, 20 s reconnection, one seat per account.
- Game side: net/api.ts (server from VITE_API_URL or ?api=, token in localStorage), net/online.ts (all of the above + other players drawn with makeAvatar and name sprites), ui/online-app.ts (🌐 Online phone app + 💬 chip on the street), gallery players' wall in ui/art.ts. The SDK loads only when signed in (separate chunk). With no server set, nothing connects and the app says "coming soon".
- Turning it on: deploy the server (https), then set the GitHub repo variable API_URL; deploy-pages.yml passes it to the build.
- Tests: server/test (15: every API flow, two live clients). Browser QA: scripts/qa-online.mjs (two players: sign up, email link, see each other, chat, money, board, gallery like, password reset) against a local server.
- Known limits: the economy still runs on the phone (server caps what it can). Next: deploy, then server-side economy checks, story mode, gangs vs players, employing players.

## Batch 6: Peter's fixes and the uptown expansion (2026-10-16)

- Fixes: tip "Got it" now takes taps (`.hint-tip` added to the pointer-events list in styles.css); the fast-travel list scrolls on its own (min-height:0 + touch-action pan-y + stopPropagation) without moving the map.
- Shifts: played shift 80 s (SHIFT_PLAY_SECONDS), DESIGN_ROOM 5,600 (≈7 orders reach the top). PAY_BOOST: auto 2×, played max 2.5× (careerBand). Real shift = 4+ orders. Shift rep ×2 (SHIFT_REP_BOOST). Season points: played shift 25 (+15 all orders right), auto 6.
- Clubs: section $300 (+1 seat per $300, extend $150); 12 bottles $500–$80,000 (new: Prosecco di Bodega, Grey Gooze, Hennerssy XO, Clase Azulé, Midas Magnum); covers lowered; BOTTLE_STREET_REP has 12 entries.
- 🗺️ Full City Map (sim/citymap.ts, $250, button along the bottom of the flat city map): without it the map shows homes, stations, landmarks, visited places and anything within 350 m; with it everything, names from further out, and kind filters.
- Uptown (data/uptown.ts, 17 places, Midtown → Inwood): darkly funny activities with random twists (sim/oddities.ts → result card): coffin showroom, rage room, open-office escape room, heartbreak karaoke, lost & found, tram scream therapy, pessimistic psychic, Museum of Bad Decisions, rat tour, paid study, barbershop GOAT debates, haunted open house, storage auctions, medieval stocks, haunted Inwood hike; plus bagels, soul food and a chimi truck.
- Bank: type any amount to withdraw or deposit; Withdraw all. Stocks: tabs (Mine, Funds, Blue, Growth, Penny, Meme) at the top.
- Businesses: daily sales ×1.5 (data/businesses.ts).
- Fridge says to cook at the stove. QA: scripts/qa-batch6.mjs. Tests 190.

## Batch 5: hooks, homes, roommates, tips (2026-10-16)

- 🏆 Leaderboard (sim/season.ts, Phone → 🏆): season points from almost everything fun; 3-real-day seasons vs seeded city regulars; top 3 paid $2,000 / $1,000 / $500 once. Three daily challenges per game day (+$500 for all three). Real-day streak gift ($50 × day, max 7).
- 🔑 Buy homes (sim/realestate.ts, Phone → 🏠 Homes): price = 260 weeks of rent; live in one you own = no rent; others are rented out (80% of rent weekly, 12% repair chance); sell for 90% (not where you live).
- New life paths: 🥊 Fighter, 🎨 Artist, 🎲 Game Shark (rep from milestone actions).
- Roommates have lives (sim/roommate-life.ts + world/roommates.ts): every 40–75 s one beat: heads out, comes home, comes home with a date (chat in the living room → behind their door, bouncing emoji sprite over the door, three funny lines, the guest leaves; nothing shown), eats your leftovers, borrows $20 (paid back $25 later, 70%), kitchen party, shares food. Night-shift Danny is often out at night. Beats wait if a menu is open. QA hooks: `__nyc.roommateBeat(kind, name)`, `__nyc.dateOn()`.
- 💡 Tips for new players (sim/hints.ts, ui/hints.ts): one tip at a time, each once, ≥45 s apart, never over menus. Settings → All / Fewer (key ones) / Off, plus "show again". Off also hides the goal card's how-to line.
- QA: scripts/qa-batch5.mjs. Tests 186.

## Batch 4: games & places (2026-10-15)

- **📱 Games phone app:** free to play, for the high score (`PHONE_GAMES`, `playArcade(..., { phone: true })`).
  - Same engine as Pixel Palace, but 🎟️ tickets only at the arcade (`recordScore` `phone` → 0 tickets).
  - New games in ui/arcade.ts: 🥪 Bodega Stack (stacker) and 🛵 Delivery Dash (3-lane runner). They also have cabinets at the arcade (`cabStack`, `cabDash`).
- **♟️ Chess** (`sim/chess.ts`): full rules, verified by standard perft counts (start, Kiwipete, positions 3 and 4).
  - Alpha-beta opponents: Kid Kasparov, Professor Pawn, Fast Eddie, Grandmaster Gloria (depth, blunder rate, rating, stakes).
  - Bets, Elo rating, rep and news in `sim/chess-club.ts`; board UI in `ui/chess.ts`.
  - The Chess House (Thompson St, `chessHouse` layout). Park chess tables (`chess` action) open the same thing.
- **🎨 Bowery Art Parlor** (`sim/art.ts`, `ui/art.ts`): paint (10 colours, 3 sizes, eraser, undo), title it, hang it.
  - Likes climb over ~5 h toward a target set by quality (coverage, colours, strokes) and fame.
  - Milestones give 🎬 celebrity rep and a toast (`artTick` in `funTick`). At 60 likes a collector makes an offer (`sellArt`).
  - The gallery shows your pieces first, then the day's wall.
- **🎣 Pier 84** (`sim/fishing.ts`, `ui/fishing.ts`): cast (power), hook on the bite, reel while keeping tension in the green.
  - 10 catches, from a boot or a shopping cart up to a sturgeon or a shark (protected: you get rep and a photo, no sale).
  - The morning derby runs 6–11 AM against seeded regulars, paid after 11 (`settleDerby`).
- **🚴 Central Park Bike Loop** (`sim/cycling.ts`, `ui/cycling.ts`): $5 bike; alternate taps to pedal; corners have safe speeds.
  - "Corner ahead" warning, braking when you coast, a wipe-out costs 2.5 s.
  - The field is seeded per hour. Prizes for the top 3.
- **Go-outside perks:**
  - Trading floor (Midtown Tower): no fees, +50% corporate rep (`atTradingFloor`, `FLOOR_REP_BONUS`).
  - Arcade tickets, chess money, art, fishing and races all happen in person only.
- **New place type `fun`** (crowd routines updated). Place-card actions now go through `serviceAction` first (`runAction`).
- **Tests:** chess (perft), fun-places. QA: `scripts/qa-batch4.mjs` (bots play a stack game, chess, painting, fishing, a race). `qa-workplaces` on chessHouse and artParlor: 0 clashes.

## Batch 3: club tiers (2026-10-15)

- **Four Manhattan clubs, one per tier** (`data/clubs.ts`):
  - 🎧 Basement 212 (LES, open door)
  - 🌙 The Velvet Room
  - 🌆 Skye Rooftop (Meatpacking)
  - 💎 Aurum (members only)
  - Rooms club1 / club / club3 / club4 in `WORKPLACE_LAYOUTS`: bigger each tier, with more crowd, floor and booths.
- **The door** (`sim/clubs.ts` `doorCheck`, game `clubDoor`):
  - You're in on a 🔥 street rep rank or 😎 Cool.
  - Knowing Dre the promoter gets you one tier up (Aurum needs the promoter and the heir).
  - Turned away? Bribe = 6× cover; charisma helps; no bribing Aurum.
  - Cover is charged on entry. Staff walk in free.
- **Bigger = more fun:**
  - Bottle shows × `show` (spotlight, fireworks, admirers).
  - Street rep per bottle × `rep`.
  - The DJ drops more often (`dropEvery`: the room cheers, you get fun).
  - Better connections to meet.
- **📺 Club screen** (`world/club-screen.ts`): an LED wall with the club name, the DJ and tonight's top spenders (regulars, fixed per night, plus you).
  - Bottles and sections put your name on it, plus a big `.club-marquee` banner.
  - It runs on real time, so a slow phone doesn't hold your name up longer.
- **🍸 Mingle** (`mingle`): meet connections by tier: promoter, stylist (+10 Cool), realtor (no movers' fee), producer (music ×1.25), hedge fund guy (stock tips, corporate rep), heir (bottles 10% off).
  - Listed in Phone → Me, with which club doors are open to you.
- **Tests:** `tests/clubs.test.ts` (7). QA: `scripts/qa-batch3.mjs`, and `PLACES=basement212,velvetRoom,skyeRooftop,aurumClub node scripts/qa-workplaces.mjs` (0 clashes).

## Batch 2: interactive street life (2026-10-15)

- **🥊 Fights you play** (`ui/minigames.ts` `playFight`, rules in `sim/brawl.ts`):
  - A needle sweeps a bar; tap in the green to hit. Miss, or hesitate, and they swing: tap DODGE in time.
  - The zone, needle speed and dodge window come from fitness + street smarts + crew weapon vs foe power (1–10).
  - Win: 🔥 street rep. Lose: rep down, and a beating from a tough foe means an ER bill.
  - Used by: people you fight in the street (`PeopleHost.fight`), subway fights (`subwayIncident(..., { playable: true })` → `subwayBrawl`), and event choices with `fight`.
- **🚔 Police chases** (`playChase`): a 3-lane runner. Dodge stuff; a 🍩 stops the cop.
  - Heat 1–5 (`heatFor`: crime risk + your level) sets the length, speed and density.
  - Crime path busts go through `copsSawYou`: a chase if one is due (`CHASE.cooldownGameMinutes` 180), else a straight arrest. `onPathAction` now returns `caught`; `bustNow` does the arrest.
- **Rep goes both ways:** `changeRep` and `repLine` in rep.ts. Event outcomes take `rep`, `fight` and `chase`.
- **Weird NYC** (`sim/events-nyc.ts`): 24 choice events (pigeon bagel heist, Pizza Rat, the cowboy, mugging, film shoot, street chess, bodega cat on the chips…).
  - The director serves at least one most days you're out (`stats.weirdDay`, `WEIRD_WHERE`).
- **Tests:** brawl (4) and events-nyc (every choice of every event runs). QA: `scripts/qa-batch2.mjs` has a bot that plays the fight, plus chase, cops cooldown and a weird event.
- **Not yet:** gang brawls (`gang-events.ts`) and job-perk fights are still dice rolls; candidates to make playable.

## Batch 1 of Peter's "make it fun" list (2026-10-15)

- **📍 Centre on me** on both maps: `map3d` `onCenter` slides the camera; the flat map uses `flyTo` at the current zoom.
- **Travel** (`TRAVEL_SECONDS` in core/constants.ts):
  - Train: a 6 s ad, then the 4 s train car, then you arrive at the place's door, not the station.
  - Long walk (over 15 s on foot): an 11 s ad (`walkFast`), then you start ~30 m out and walk to the door. Shorter walks are walked live.
  - Rideshare: a 5 s ad.
  - Rideshare Black: +3 🔥 street rep, at most every 2 game hours (`BLACK_CAR_REP`, `stats.lastBlackCar`).
  - The ad's progress bar takes `seconds` (`FadeAd.seconds`, CSS `--ad-s`).
- **🏙️ Places** dock button (outside): every place in the area, by kind, nearest first. Search covers name, kind, venue and blurb. Tap one for the travel sheet.
- **Quit job:** on the Go to work sheet, and on the "can't work now" card, after a "you sure?" (`confirmQuitJob`).
- **Cars:** buying asks to confirm and shows the cash/bank split. Charges were already exact; the top bar only shows cash, so a bank-paid car looked cheap.
- **🏠 Homes** phone app plus `sim/moving.ts`:
  - Moving costs movers ($150) + the first week. You need 4 weeks of rent in cash + bank.
  - It uses listing names (no "Your …"). The place card's Move in uses the same rules.
- **Dates/hangouts:** `HANGOUT_MINUTES` 15 → 4. "Call it a day" still ends one any time.
- **Dock:** on phones, the icon sits over the label so four buttons fit ("Go outside" used to be cut off).
- **QA:** `scripts/qa-batch1.mjs` covers all of the above. qa-smoke now expects the train to drop you at the door, and clears pop-ups before the street tap.

## The game loads in pieces (2026-10-15)

- **Build:** `vite.config.ts` no longer inlines everything into one 1.8 MB index.html.
  - The page is a 2.6 KB shell that paints the NY loading screen by itself.
  - three.js (`assets/three-*.js`, ~204 KB gzip) and the game (`assets/index-*.js`, ~357 KB gzip) are separate hashed files, so an update only re-downloads what changed.
- **Device copy:** `sw.js` is generated at build time with the list of this build's files.
  - It keeps a copy of the game on the device, and an unchanged model carries over between builds (`?v=` content hash).
  - The page itself is fetched network-first with `cache: 'no-cache'` (4 s timeout), so a refresh shows a new deploy straight away. No cache clearing needed, and GitHub Pages' 10-minute HTML cache is skipped too.
  - It keeps the current cache plus the previous one. The game starts offline after one visit.
  - It is registered in `main.ts`, production builds only.
- **Start-up work cut:**
  - The nav grid's land test is now one scanline pass (`landMask`), which made the city build ~4× faster.
  - Big coastline outlines get an edge index in `pointInRing`.
  - Corridor lookups use numeric cell keys plus a bounding-box early-out.
  - Module start-up went from 1.4 s to 0.7 s.
  - Shader error checks are off in production. `engine.warmUp()` compiles shaders before the first frame.
  - Fonts load without blocking.
  - Home furniture loads after the city is up, and each toy piece is built on first use.
- **Proof:**
  - `tests/land-mask.test.ts` checks the fast land tests against the old ones.
  - `tests/toy-furniture.test.ts` checks that every piece builds.
  - A layout fingerprint (plots, blocks, places, nav grid) is identical to the previous build.
- **QA:**
  - `scripts/qa-loadtime.mjs` measures phone-ish start (9 Mbps, 4× slower CPU) and prints `performance.mark`s (`boot:*`, `models:*`, `area:*`, `frame:*`).
  - `scripts/qa-offline.mjs` checks the offline start and that a refresh picks up a new build.

## Sound controls, zoom, whole-map placement check (2026-10-15)

- Zoom: rooms zoom out a little further (`MIN_ZOOM` 0.62). The satellite map stops a little closer (`MAP_SPAN_FRACTION` 0.12, ~606 m; the flat City map shows up to 0.75 of the island) because zooming out too far shimmered.
- Sound: 🔊/🔇 in the top bar mutes everything with one tap. Phone ▸ Settings ▸ Sound has a slider and a mute button for 🎵 Music and for 🔔 Sound effects (`settings.musicVol` / `sfxVol`, `setVolumes` in ui/audio.ts). There's no mixer sheet: Peter asked for just a slider and a mute.
- `src/world/placement-check.ts` checks the whole map at startup:
  - Ads: every ad is tested against an index of every building. Buried ads are pushed out, wall screens with no wall behind them slide along the wall or are dropped, and of two overlapping ads the smaller one is dropped.
  - Times Square: the tower, the red TKTS steps (they search sideways for clear plaza because Broadway cuts it on a diagonal), seating, planters and bus shelters are only placed where `rectClear` says there's no road.
  - Street props: instanced street props are never placed on highway corridors.
  - Output: a `[placement]` console line. `scripts/qa-placement.mjs` prints issues plus an ON ROAD sweep and fails if there are any issues. The sweep skips waterfront meshes and road meshes. About 10 corner props near the riverside are known to be fine; they were checked in screenshots.
- Queued (not started): ads you buy with real money (Stripe, founding price ~1/10) and with game money; transfers ($3k a game-day, plus wire transfers that need review); a server-side backend; loading the game in pieces.

## Four starter homes (2026-10-13)
- The class is **rolled at random** after character creation and revealed ("…you were born"): Broke 55%, Middle 35%, Rich 9%, Billionaire 1% (`sim/state.ts` → `CLASS_ODDS`, `rollClass`). `?class=` forces one.
- Homes (`data/homes.ts`):

  | Class | Place | Layout | Furniture | Conditions |
  |---|---|---|---|---|
  | Broke | sharedApt | harlemWalkup | cheap toy pieces | 2 roommates (Danny, Keisha) who wander and chat; shared bathroom (20%: +5 s wait) |
  | Middle | hkStudio | studio | basic | street noise: 10% chance a full sleep leaves a small bad mood |
  | Rich | uesApt | uesTwoBed (14×10) | nice | doorman (signs for deliveries) |
  | Billionaire | penthouse | penthouse (18×12) | luxury toy pieces | housekeeper (once-a-day mood), doorman, park-view windows |

- Code: `sim/home-conditions.ts` (rules), `world/roommates.ts` (NPCs), `HomeConditions` and `windows` on `HomeLayout`.
- Big homes (`zoomable: true`: uesTwoBed, penthouse) open whole, then pinch / wheel to zoom (up to 2.8×) and drag to pan, kept inside the room (`world/interior-view.ts`). The camera follows you if you walk off screen. Walk-up and studio keep the fixed view.
- The rolled class is kept in localStorage (`nyc-life.bornClass`) until the life is saved, so refreshing on the reveal can't reroll it.

## Jobs, commuting and workplaces (2026-10-13)
- **8 careers** (`data/careers.ts`): 🏪 Bodega (id `deli`), 🍸 Bartending, 🏋️ Fitness, 💻 Tech, 📈 Finance, 🌙 Night Dancer, 💊 Alley Pharmacist, 🚓 Cop. 6 rungs each; old coffee/pizza/bodega jobs migrate to the Bodega counter.
- **💼 button:** "Find a job" (phone Jobs app) or "Go to work" → walk / subway / rideshare / drive; the shift starts on arrival (`pendingShift`).
- **Commute effects** (`sim/commute.ts`): long walks cost energy and fun; subway spills (stain until you change: closet, new clothes or the precinct lockers; stained at work = −8 performance) and fights (`fightLoseChance`: fitness 0 → 90%, 5 → 65%, 10 → 5%).
- **Raises** (`sim/raise.ts`, `ui/raise-game.ts`): no automatic promotions. Ready after 14 shifts at your level (Peter, 2026-10-14), performance 70+, job skill ≥ raise number. When ready, the boss offers a raise: hold to keep a line in a wandering green zone. 5 raises, each harder.
- **Job twists** (`sim/job-perks.ts`): bar late tips, dancer fights (dust cloud) and tip intimidation, pharmacist heat and busts, cop envelopes and Internal Affairs.
- **Workplace rooms** (`data/venues.ts` → `WORKPLACE_LAYOUTS`, pieces in `world/furniture-work.ts`): each job has its own room, own pieces and actions, and 6 worker spots (`workers`). NPC coworkers (`world/coworkers.ts`) fill spots; `sim/workroom.ts` is the slot model for multiplayer (a player replaces an NPC; a 7th player gets a new copy of the room).
- QA: `qa-commute.mjs` (HOW=walk|subway|ride), `qa-raise.mjs`, `qa-workplaces.mjs`.
- **Big, lively rooms** (2026-10-13): workplace rooms are 16×12 to 22×16 and zoomable, built for up to 30 people (6 workers + 24 visitors; `sim/workroom.ts` → `ROOM_CAPACITY`, `assignVisitor`, `npcVisitors`). `world/venue-life.ts`: NPC visitors use the room's pieces (dance, eat, drink, train, browse), emoji pops, club lights + disco ball, steam, music notes, a flickering alley lamp. Fewer NPCs on low-tier phones.
- **What visitors come for:** 🥪 eat (bodega window counter), 💼 invest (Business app) and 📈 trade (Stocks app) at the trading floor's client desks, 🍸🌙 party, 💘 date (booths, VIP, high-tops → Contacts), 📝 report someone (precinct window), 📱 fix or replace a phone (Chelsea Works Fix-It Bar). `game.ts → serviceAction`. QA: `qa-services.mjs`, `qa-lively.mjs`.

## Deploy: GitHub Pages (2026-10-14)
- `.github/workflows/deploy-pages.yml`: on every push to `main` (or Actions → Run workflow): `npm ci`, `npm test`, `npm run build`, publish `dist/` to Pages. Tests failing = no deploy.
- Site: https://peterukor.github.io/NYC-life/ (relative `base: './'`, so the subfolder works; checked locally).
- One-time: Settings → Pages → Source: "GitHub Actions".
- `index.html` has `robots: noindex, nofollow` (playtest build: casino, betting, parody brands).
- Pages only serves files: multiplayer will need its own server (Colyseus on a small host) that this client connects to.

## Music, map fixes, no glitter (2026-10-14, night)
- **Music, not noise:** `ui/music.ts` plays 7 original songs made in code (Bodega Bounce, Yellow Cab Funk, Rooftop Sunset, Times Square Rush, Subway Surfin’, Brooklyn Brunch, Empire Anthem): each a recipe (tempo, key, scale, chords, groove, bass, lead) with a seeded melody, ~1½ min, then a random next song, forever. Settings has a 🎵 Music switch (`settings.music`), now-playing and ⏭ Next song. The noise ambience and activity noise loops are gone; footsteps, taps and action sounds stay. 🎆 Every firework burst bangs and crackles (club bottle shows, trading-floor wins: `world/celebration.ts`).
- **Satellite map:** back to the tilt; opens fully zoomed out at about 0.3 of Manhattan (`MAP_SPAN_FRACTION`); no glide after you let go (the glide was "the map follows my mouse"). Header stays above labels. **City (flat) map:** zoomed out shows at most 0.5 of the island; it's the only straight-down view.
- **🚀 Fast travel** button sits top right under the map header and works (it lacked `pointer-events: auto` inside `#ui`; QA now clicks for real).
- **Ponds** stay inside their park block with a lawn edge (`data/parks.ts`); The Pond used to spill onto a cross street.
- **Glitter at full zoom-out:** facades fade to each tile's average colour as windows shrink below a pixel (`world/nycgen/atlas.ts`), and kit textures (cars, trees, people) have mipmaps.

## Sounds, map travel, ad loading screens (2026-10-14, late)
- **Sounds** (all synthesised, nothing to download): `ui/audio.ts` (master mix with sfx / ambience / loops buses, noise helpers, ~35 effects) and `ui/soundscape.ts` (ambience per scene — city traffic with honks, sirens and buses; room tone; club and gym four-on-the-floor; bar jukebox; casino slots; arcade bleeps; park birds or crickets; precinct radio — plus footsteps and a loop for what you're doing: shower water, sizzling pan, TV, typing, guitar, piano). `game.ts updateSound()` feeds it every frame. Every button clicks (`installUiClicks`).
- **🚀 Fast travel button** on both maps opens a scrollable list (same as "Where to?") and closes again (`showMapStrip`). Ad spaces and places tapped on a map open their sheet over the map; you stay on the map.
- **Travel loading screens are ads** (`fade(…, ad)` in ui/dom.ts; rotation in `ui/travel-ad.ts`, `setTravelAds()` is the seam for paid ads; count views when those exist).
- **Pins:** hover (mouse) or press and hold (touch) shows a card: name, blurb, open now. The pin layer hides the moment you go inside (it used to linger over rooms: the "bulb" at home).
- **Zoom:** the satellite map is straight down, north up, no tilt or spin; it opens fully zoomed out showing about ¾ of Manhattan (`MAP_SPAN_FRACTION` 0.75 → `MAP_MAX_DISTANCE` ≈ 3787) and players zoom in from there; ad spaces always labelled. Street max zoom-out 190 (start 100). Rooms out to 0.7, open at 0.92. A drag whose mouse release was lost is ended as soon as the mouse moves with no button (render/engine.ts), so the map no longer follows the mouse. Scrolling over map labels or pins now zooms the map. Rooms no longer follow the mouse after a release off the canvas.
- QA: `scripts/qa-maps.mjs`, `scripts/qa-batch.mjs`.

## Playtest fixes (2026-10-14, evening)
- **Starting screen:** a live 3D preview of your character (`ui/avatar-preview.ts`, its own small canvas, disposed on the next step) updates and hops as you pick body, skin, top, bottoms and hair.
- **Learning the shift games:** the first played shift at each job shows "how it works" with a real example; the first 2 shifts light up what each order needs (`.want`) and spell it out ("Needs: …"). A 📖 button in every shift shows what goes in each order and pauses the clock. Count kept in `state.shiftsPlayed[careerId]`.
- **Shifts are 3 minutes** (`SHIFT_PLAY_SECONDS` 180); tips retuned (`DESIGN_ROOM` 12,500) so a good shift still reaches the max.
- **Cameras:** zoom works in every room; city and outside start higher and more top-down (`CAMERA.startDistance` 100, `minPolarAngle` 0.2) so billboards show; the satellite map starts higher and zooms out to `MAP_MAX_DISTANCE` 950.
- **Map button → "Where to?"**: home, work, accepted plans, recent places and 4 nearby open places, with 🛰️ Satellite map (default) and 🗺️ City map. Tapping a place on either map opens the travel sheet over the map; the map closes only when you go. Tapping where you already are says "You're already here" and stays put (this was the home "bulb" bug).
- **Side panel** was under its own backdrop (a later `.backdrop` z-index rule); fixed with more specific rules.
- **Blank blue city (player report):** phones can drop the WebGL context. `render/engine.ts` asks for it back; if it doesn't return in 4 s (or after coming back from the background), the game saves and shows "The city needs a quick reload". QA: `scripts/qa-gl-lost.mjs`, `scripts/qa-batch.mjs`.

## Friends and relationships (2026-10-14)
- `sim/friends.ts`: vibes (main + second: night owl, gym rat, touch-grass type, arcade kid, homebody, foodie) → taste per outing (−1…2); history log (last 8, `Memory.log`); friendship progress to the next level; `addBond` with a daily cap (18); shared activities per outing (`SHARED`), bond never scales with cost; `treat` helps once a day.
- `sim/invites.ts`: Party (npc | player), Invite (pending/accepted/declined/countered/expired/done/cancelled/flaked), `npcAnswer` (grudge, busy/grumpy, avoids → counter with their favourite, wrong hour → counter time, too many invites today), plans with a 15-min wait window, flakes, stood-up penalty, hangouts (15 min), incoming invites from friends (≥ Friend, ~every 40 real min, grace period at start).
- `sim/guests.ts`: `mayEnter(policy, visitor, owner, check)` (inviteOnly / friends / open, capacity, blocked) — sections use it; homes/players next.
- Sections (`sim/section.ts`): guests record contact vs crew, ~35% of crew are bottle-only (revealed by talking, leave 4 min after the last bottle); `talkToGuest` builds friendship; crew swap numbers on the 2nd talk. Inviting barely moves likes.
- UI: 🤙 Link Up app (`ui/linkup.ts`: plans, friends, invite composer with typed replies), hangout sheet (`ui/hangout.ts`), Contacts → Invite, hangout chip, friend avatar (`world/buddy.ts`), arcade head-to-head (`playArcade(..., versus)`).
- QA: `scripts/qa-friends.mjs` (PART=club for sections), `scripts/qa-playtest.mjs` (touch, throttled; fps numbers are meaningless on the software renderer). Tests: `tests/friends.test.ts`.
- NEXT (Peter): a small multiplayer test (2–4 players, one room, invites between real players through the same Invite/Party/mayEnter) before more content.

## Entertainment (2026-10-14)
- 🛋️ Club sections (`sim/section.ts`, `game.ts → openSectionSheet`, `world/section-crew.ts`): $1,000 for 10 real minutes, 2 friends, +1 seat per $900 spent (bottles, extra time), 12 max at $10k. Contacts first (busy ones say no), then "the crew". Timer chip in the HUD. Velvet Room (new `sectionSofa` piece) and Warehouse 9 (now uses the club room).
- 🎰 Empire Casino (`empireCasino`, `sim/casino.ts`, `ui/casino.ts`): slots (94% payback), blackjack (6 decks, S17, 3:2, double), European roulette, 🚀 Rocket (crash, 3% edge). Cash only, $5–$5,000. `fun.casinoNet` tracks up/down.
- 🕹️ Pixel Palace (`pixelPalace`, `sim/arcade.ts`, `ui/arcade.ts`): Subway Snake, Hoop Shot, Pigeon Pop, Beat Street, Claw Machine; $2 a play, tickets, best scores, prize counter. QA: `?arcadesec=N`.
- 🏟️ Sportsbook at Yankee Stadium and Atlantic Arena (`sim/sports.ts`, `ui/sportsbook.ts`): win/lose bets, draw = refund. `SimFeed` (made-up teams, a game every 5 min, 12 min long, seeded) behind a `SportsFeed` seam: implement it and call `setSportsFeed()` for real games.
- 🌳 Central Park is now a walkable park (`park` layout): benches, lawn, duck pond (ducks swim), fountain (splashes), ice cream cart, chess. New actions: chill, lie on the grass, feed ducks, ice cream, frisbee, make a wish.
- 💪 Gym: "Train hard" (`sim/workout.ts`, `ui/workout.ts`) on the bench, dumbbells and heavy bag: 12-rep timing game, up to +1.4 fitness.
- QA: `scripts/qa-fun.mjs` (ONLY=casino,arcade,sports,club,park,gym). Tests: `tests/fun.test.ts`.

## Shifts: auto or play, every job hands-on (2026-10-14)
- 6 shifts per game day (`MAX_SHIFTS_PER_DAY`). Pay per job in `data/careers.ts → shift` ({auto, max, rep}); `careerBand()` scales by the ladder. Auto = 30 s progress bar (`game.ts → autoShift`, `?autosec=N` in QA), stop or leave = unpaid. Tips/overtime scale with the job's room (`tipScale`). Only played shifts (5+ orders) count toward a raise (`shiftsAtLevel`) and add skill (`SHIFT_SKILL_GAIN` × accuracy, `completeShift({ played, quality })`). Played shifts add rep (`Payslip.rep`). `rep.ts → respect()` = street rep + fitness.
- Every career uses the counter game (`ui/deli-shift.ts`): menus for bodega and bar in `sim/shift.ts`, the other six in `data/shift-menus.ts`. Played shifts last `SHIFT_PLAY_SECONDS` (180, 3 minutes; Peter 2026-10-14); customers get less patient (16 s → 10 s); 3 choices at ¼, ½, ¾; "Clock out early". QA shortens with `?qa=1&shiftsec=N`.
- Job twists (fight, bust, bribe) run after the shift via `game.ts → resolveTwist()` and multiply the payslip.
- 🍸 The bar: orders come from tables; a waiter (UI line + a 3D NPC in `world/venue-life.ts`, `life.runner`) carries drinks over.
- Staff bottle discount: `sim/celebrate.ts → BOTTLE_DISCOUNT` (bartender 20%, dancer 25%).
- Old 20-second `data/minigames.ts` removed. QA: `qa-bar-shift` (run with HOUR=22 for the club check), `qa-job-shifts`.

## Stock market and rep (2026-10-14)
- `data/stocks.ts`: 15 companies + 2 funds, each with a `risk` (fund, blue, growth, penny, meme).
- `sim/market.ts`: prices tick every game hour, seeded so everyone sees the same prices. `eventFor()` adds squeezes (meme/penny), rug pulls (meme), monthly earnings (blue/growth) and rare scandals. After a squeeze, most of the gain fades over 3 days.
- `sim/rep.ts`: 🔥 street rep (bottles, more for bigger ones) and 💼 corporate rep (profitable sales, bonus for 10×+). 7 ranks with titles. `repRank()` is the hook for later gating (robbery/spill/pickpocket odds, properties, entry to places); nothing uses it yet.
- UI: Stocks app has risk tags and event badges; Me app shows both reps; toasts on gains. Tests: `tests/market-rep.test.ts`; QA: `scripts/qa-market-rep.mjs`.

## Job perks and the bar counter (2026-10-14)
- **🍸 Bartending is hands-on** like the bodega: `sim/shift.ts` → `COUNTER_MENUS` (deli + bar). Each menu: ingredients, dishes, a side order, who orders, mid-shift choices with data-driven effects (`ChoiceFx`: needs, perf, risk, money, tipsAfter, moodlet). Late-night bar tips ×1.5. `PLAYABLE_SHIFTS` lists counter jobs. QA: `qa-bar-shift.mjs`.
- **📈 Finance perks:** cheaper trades (`tradeFee(cents, s)`: half the rate, less each raise, no flat fee from Director), and daily desk chatter in the Stocks app (`deskTip`, right ~3 in 4).
- **💻 Tech perks:** freelance pays 30%+ more (+5% per raise); work from home once a day from the 💼 Go to work sheet (`job.remoteDay`).

## Groceries and cooking (2026-10-13)
- **InstaDash** phone app (`ui/instadash.ts`), not a place: 8 ingredients in packs (`data/groceries.ts`), $2.99 delivery, the bag reaches your fridge about 40 s later (doorman variant in rich homes).
- **Fridge** (`ui/kitchen.ts`): leftovers (eat one), ingredients, order shortcut, the free snack (always there).
- **Stove**: 4 meals (sandwich, eggs and toast, pasta ×2 portions, roast chicken and veggies ×2 at Cooking 2). Each card shows time on this stove, ingredients (have/need), portions, hunger. When done: eat one now, or keep.
- Rules (`sim/kitchen.ts`, `sim/home-activity.ts`): cooking takes ingredients at the start and gives them back if stopped; finishing puts every portion in the fridge; eating takes one portion at the start. Nice/luxury stoves cook faster and burn half as often. All in the save, including cooking in progress.
- Starter fridges differ by class (`STARTER_PANTRY`). Spoilage: later.
- QA: `qa-kitchen.mjs` (CLASS=…), `qa-zoom.mjs`, `qa-born-keep.mjs`.

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
  - Furniture: `scripts/build-interior-assets.mjs` builds `public/models/interior.glb` (Quaternius house interior + Kenney furniture kit, with colour slots); the pieces are listed in `data/furniture.ts` and `data/furniture-catalog.ts`.
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
- **Event rarity tiers:** common to legendary (`RARITY` in `sim/events.ts`). Legendary events: a true inheritance and "the worst day" (hospital plus a big bill; players never die).
- **Auto mode** (`sim/auto.ts`, `ui/auto-mode.ts`): the routine runs while you're away, it can't fill every bar, and staying on auto mode for 6 days puts you in a rut that 2 varied game days cure.
- **Investing:** shared seeded market (`sim/market.ts`, `data/stocks.ts`), Phone → Stocks, `netWorth()`. `marketMood()` is the recession seam.
- **Spawn classes:** pick poor, middle, upper or wealthy at the start (`CLASSES` in `sim/state.ts`).

- **Life paths** (`data/paths.ts`, `sim/paths.ts`, Phone → Life Path): Crime Boss, CEO, Celebrity. Rep, seeded checklists, betrayal gates, the Celebrity streak, risky actions that can get you busted.
- **Clothing stores** (4 shops, by tier, `ui/store.ts`).
- **NPCs go home:** they walk to a residential block and vanish inside for a while.
- **Mini-games** (`data/minigames.ts`): "Play the shift" (Order Rush for every job) or skip.
- **Businesses** (`data/businesses.ts`, `sim/business.ts`, Phone → Business): buy, hire and fire staff, 32% daily tax, creative accounting with audits.

## Done 2026-10-11 (afternoon): Peter's "do 1–4" list
- **Cars:**
  - The boxy toy cars are gone. `world/car-shapes.ts` lofts smooth, curvy bodies with carved wheel arches, a glass cabin with a painted roof and pillars, round wheels and fitted lights.
  - 17 cars for sale: 8 common, 4 premium, 3 exclusive, 2 very rare. Service vehicles (taxi, police, bus, ambulance, fire engine, delivery van) are built the same way.
  - Two detail levels: parked cars and low-end phones use the cheap one.
- **Players never die:**
  - The legendary crash means hospital plus a bill.
  - Whatever you can't pay goes to debt collectors (`sim/debt.ts`).
  - Bank → File for bankruptcy wipes the debt and everything you own, and restarts you at Hope House Shelter with $20. There's a 30-day cooldown.
- **Jail** (`sim/jail.ts`, `ui/jail.ts`):
  - Busts on life paths, crew jobs gone wrong and driving on a suspended licence all lead to arrest.
  - You can post bail or call a lawyer once.
  - Jail activities are rate-limited.
  - Repeat offenders get longer sentences.
- **Your own car** (`sim/garage.ts`, Phone → Cars):
  - Buy and sell (60% back).
  - You drive in the street at 3.2× walking speed.
  - "Drive there" and "Floor it" on every place. Floor it risks tickets, licence points and suspension, plus crashes in the wet.
  - Cool meter: car, outfit and fame. Cool boosts Celebrity rep.
- **Crews** (`sim/gangs.ts`, `sim/gang-events.ts`, Phone → Crews, Map → 🧢):
  - Five fictional crews, each with turf.
  - Respect is remembered.
  - You can join a crew and rise through its ranks.
  - Street events: getting caught lacking (hand it over, run, fight, call your crew, talk your way out), friendly nods, favours, turf wars.
- **Map:** an illustrated look (`ui/map-art.ts`) with coast, waves, piers, boats, little shaded buildings, parks with trees and paths, neighbourhood names, a compass, and the gang view.
- **Phone apps are plug-ins** (`ui/phone-apps.ts`).

## Done 2026-10-11 (morning, part 2)
- **People** (`sim/people.ts`, `sim/social.ts`, `ui/people-ui.ts`):
  - Every NPC has an identity rolled from their id; all are 21+.
  - Memories persist: likes, grudge, relationship, learned quirks, phone number, address and key.
  - You can tap anyone to talk. Repeating yourself stops working, then annoys people.
  - Mean or hot-headed NPCs fight back, and grudge-holders come looking for you.
- **Dates** (`sim/dates.ts`): pick a spot, play 3 topic rounds, and it can lead to Dating, then Partner with a spare key.
  - Invite home is fade-to-black only.
  - Light-fingered partners may steal from you.
- **Phone → Contacts:** text people, and ask them out by text.
- **Speak loud (💬):** bubbles appear over your head, nearby NPCs react, and rude shouts can start trouble (`sim/speech.ts`, `ui/bubbles.ts`).
- **Map is now the 3D city from the sky** (Lagos Life style, `ui/map3d.ts`):
  - You see the real buildings, billboards and landmarks.
  - Place labels show, with billboard chips that thin out as you zoom out.
  - Tap a place to travel, or a billboard to rent it.
  - "Whole city" opens the flat map.
- **Borough shapes** (`world/coast.ts`):
  - Manhattan is a tapering island between two rivers, and Brooklyn has its north and west shores.
  - Cheap filler buildings stand in for the rest of each borough.
  - The flat map uses the same outline.

## Done 2026-10-11 (late morning): the real New York
- **Real shapes.** All five boroughs are drawn from real city boundaries (`world/geo-proj.ts`, `data/geo/`).
  - Projection: Times Square is the origin, the map is turned 29°, and distances are compressed 5×.
- **Playable grids sit on the real streets.**
  - Manhattan covers 110th St down to the Battery, with Central Park running 59th → 110th. Shore blocks the river cuts are trimmed (`trimToLand`), not dropped.
  - Below 14th St the east side (East Village, Lower East Side) is grass lots for sale (`forSaleBlock`).
  - Roads off the grid live in `src/world/corridors.ts`: Broadway, the ring highway (West Side Hwy · FDR) and the Brooklyn Bridge approach. Buildings, traffic, nav, shore and the map all read them.
  - Giant billboards (XL ad slots) stand beside the ring highway and on roofs, and are visible from the sky map.
  - Brooklyn covers DUMBO, Downtown and Fort Greene.
  - The rest of each borough is expandable land for sale.
- **Places use real lat/lon** and are snapped to doors automatically.
- **Maps:**
  - The flat map shows the whole city, then one borough at a time.
  - The 3D sky map shows neighbourhood names and has a gang view.
- **Crews:**
  - Manhattan is a safe zone; the five crews are in Brooklyn.
  - Players can take blocks, but a crew's base can never be taken.
  - NPC bosses demote idle members.
  - Street-rep perks: getaway, weapons, missions.
- **Next:**
  - Lot buying (a land registry on the server).
  - Open Queens, the Bronx and Staten Island the same way: add a district over their outline in `layout.ts`.

## Balance notes (2026-10-11)
- **Rent cycle.** One game day is 3 h 23 min, so "weekly" rent (7 game days) comes due about once per REAL day. Rents were therefore set as "what one day of play should cover": shared $180, studio $350, loft $900. Old saves are migrated to the new rents.
- **Pay.** Shifts are capped at 4 per GAME day, so a player who checks in 2–3 times a day can work about 8–12 shifts.
  - Entry-level pay is about $90 a shift, so about $700–1,000 per real day.
  - Top-of-ladder pay is $400–950 a shift.
- **Cars** are now goals you can reach:
  - common $4k–14k (about 1–2 weeks of entry-level play);
  - premium $28k–48k;
  - exclusive $90k–220k;
  - very rare $650k and $1.4M.
- **Hospital bills:** $300 (bruises), $900–1,500 (lost a fight), $2,500 (the legendary crash).

## Next steps, in order
- **Queued by Peter (2026-10-14), in order:**
  1. **Shared apartment for the poor start:** 3 bedrooms; 2 AI roommates who get replaced by real players as people join. A roommate offline 3 days is swapped for AI or a new player. Message: "You got a new roommate".
  2. **Share location** with roommates and friends (opt-in), shown on the map.
  3. **Invite AI to clubs** (exists for NPCs) and **🪙 chip-ins:** someone starts a chip-in on the phone for a bottle or section; friends contribute. The holder can steal it and run: everyone in it gets "X stole the chip-in and ran", can report it, police chase; escape = keep it; caught = arrested, fine, bad rep, lose money.
  4. **🚓 Police record** for every player and NPC: tap someone (or a contact) to see arrests and why.
  5. **Clean up the whole map** carefully: billboards and ad blocks, the Times Square red stage (Peter loves it, it looks off), overlapping landmark labels in midtown at full zoom-out.
  Also queued before these: **load the game in pieces** (dynamic imports + loading card) and **ad pricing** (1 week $99.99; weekly subscription $89.99; 4 weeks $69.99/week; location and size scale it; ads very visible everywhere).
  Human roommates/chip-ins need the multiplayer server; build with NPCs first behind the same interfaces (`sim/guests.ts`, `sim/invites.ts` style).
0. **Ideas and implementation plans** for sharing your number, speaking loud, dates, NPC memory, NPCs that fight back, and fun for 1–2 players: see **`docs/IDEAS.md`**. Suggested order is in its section 4.
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

### Casino table games + pool (2026-10-28)
- `ui/casino-games.ts` (+ `sim/casino-games.ts`): Hold'em vs NPC regulars, craps, baccarat, Big Six, scratchers, keno, Plinko, Jacks or Better video poker. Wired in game.ts (`playPoker`…`playVideoPoker`).
- `ui/pool.ts` (+ `sim/pool.ts`): 8-ball / 9-ball vs AI. Bars = friendly rack vs Sal; casinos (Navy Yard, Lucky Star) = staked vs Hustler Vinnie.
- `scripts/qa-games.mjs` opens every new game and screenshots it (test-results/game-*.png).
- To tune later: poker regulars' strength, pool ball size on phones, AI think-pause on slow phones.

### Gyms + Central Park (2026-10-28)
- Parks cut to Central Park only (data/active-rooms.ts `park`, 36×26): Lake + Bow Bridge (ducks and 🚣 sprites in venue-life), boat dock, angel fountain, castle, bandshell, carousel, dog run, picnics, playground, ball field, carts, carriage. New park actions in data/actions.ts.
- Three gyms: ironGym → `gym`, flexFulton (Brooklyn, 24/7) → `gym2`, pulseLic (LIC, pool + sauna) → `gym3`. Uptown Boxing removed. Models: world/furniture-active.ts.
- Gym mini-games: ui/gym-games.ts (frame) + ui/gym-runs.ts (games) + sim/gym-games.ts. Equipment actions playBench/Treadmill/Bag/Rope/Spin/Row/Yoga; old `trainHard` opens bench.
- Bright-mood venues now show the time-of-day sky behind them (home-interior.ts).
- `GAMES=place:action,… PLAY=ms node scripts/qa-games.mjs` opens games and screenshots them.

### Moved into Manhattan (2026-10-28)
Peter: one more club, arcade, casino and gym in Manhattan, renamed after real places. Ids unchanged (saves keep working):
- `basement212` → Ludlow Basement (Lower East Side; the tier-1 club, so the whole ladder is in Manhattan)
- `hubArcade` → Canal Street Arcade (Chinatown)
- `navyYardClub` → Bowery Card Club (the Bowery)
- `pulseLic` → Pulse Tribeca (Hudson St)
Only Manhattan is open (`OPEN_AREAS` in sim/types.ts); the other 8 rebuilt venues wait in Brooklyn/Queens/Bronx.

### Arcade classics rebuilt (2026-10-28)
- All 7 originals rebuilt: ui/arcade/{snake,stack,dash,hoops,claw,pigeons,beats}.ts + sim/arcade-<id>.ts, registered in ui/arcade-classics.ts. ui/arcade-games.ts is now just the Run contract and helpers. Frame (ui/arcade.ts): 3-2-1 count-in (except games with their own start), versus scores from typicalScore(). New score scales: pigeons/beats ~10×; caps in server/src/config.ts.

### Food, cafés, shops, workplaces, nights out (2026-10-28)
- Food cut to 5: El Barrio Deli & Grill (kept: it's the deli job, near the starter walk-up; Kings Deli cut and its cat/lotto/owner moved here), Slice of Ninth, Miss Dee's, new Mulberry Street Trattoria (mid), new The Gramercy Room (fine dining). Cafés: Bean Machine, Panadería Doña Rosa.
- Rooms in data/town-rooms.ts (deli2, slice, soulKitchen, trattoria, gramercy, beanCafe, panaderia, chessHouse2, thrift, storage, lab, homeStore, office2, startup2, alley2, precinct2, lanes, cinema, golf); pieces in world/furniture-town.ts. Generators: /tmp/claude-0/plans/{food,shops,work,fun2,decor}.py (not in repo).
- New places: hkLanes 🎳, unionSqCinema 🎬 (ui/cinema.ts + data/movies.ts: YouTube embeds, paste-a-link), seaportGolf ⛳. Axe lanes 🪓 in Pixel Palace and Canal Street Arcade (ui/arcade/axe.ts).
- Thrift is a walk-in store now (`browseClothes` on racks opens the clothes store). Other menu-only shops left as they were.
