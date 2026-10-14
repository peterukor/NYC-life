# NYC Life — game design spec (from the owner, 2026-10-10)

The owner's own wording, organised. Treat this as the source of truth for gameplay. Every feature is its own plug-in system (see HANDOFF.md, "plug-in systems"), so it can be tuned or removed without breaking the rest. All numbers live in config so they can be balanced later.

## Feel
- Very cartoony (Sims/Township), fun whatever you're born as.
- Random events are **messages, not cutscenes**, for example: "Someone spilled coffee on you on the train", "Your car won't start", "Road works — you arrived 10 minutes late".
- Events change mood and emotions. They must not be too frequent or repetitive: use cooldowns per event, plus a memory of recent events.
- **Rarity tiers for random events:** common, uncommon, rare, very rare, legendary.
  - **Legendary good:** a billionaire wants you to inherit their wealth.
  - **Legendary bad:** you die in a car crash.
  - Both are possible, but extremely rare.
  - Train delays happen about once a day.
  - Accidents, fights, coffee spills: uncommon.
  - A rich person wants to date you: rare.

## Time
- One in-game day = 3 h 23 min real time (a single constant).
- **Work (Peter, 2026-10-14, revised):** up to 6 shifts per game day, two ways to work each. ⏩ **Auto**: 30 real seconds and you must stay in the game (leaving or stopping pays nothing); pays the job's lowest wage (about $30) and never raises performance or rep. 🎮 **Play**: a 6-minute hands-on counter game for every job; pays up to about $90 and raises performance and rep. Pay differs by job: tip jobs (bartender, dancer) start lower with more upside; skilled jobs (tech, finance) start higher. Played shifts add 🔥 street rep (bodega, bar, gym, club, alley) or 💼 corporate rep (tech, finance, precinct). 💪 Respect = street rep + fitness (hook for robbery/pickpocket odds later).
- **Bartenders work the bar only (Peter, 2026-10-14):** people order from their tables, the bartender makes the drink, and an NPC waiter carries it over. Bartenders and night dancers can still party at the club off the clock.
- **Staff bottle discount (Peter, 2026-10-14):** 🍸 bartenders 20% off, 🌙 night dancers 25% off.

## Cars
- Cartoony cars with **rarity levels:** common, uncommon, rare, epic, legendary. Use a `VEHICLES` registry.
- Speeding raises your **Cool meter** but risks tickets. Too many tickets and you lose your licence.

## Money (works like real life)
- **Net worth** = cash + bank + investments + business valuations + assets − debts.
- Businesses must be run by you or by staff you hire. Smart hires cost more and run things better.
- **Heavy tax.** Tax fraud is possible: your reported net worth can show $30k while $3M sits in the bank. An audit means you're "cooked" (seizure, fines, possibly jail).
- Investing, recessions, and the 30% reset vote are covered in HANDOFF.md.

## Spawn classes
- Poor, middle, upper, wealthy, plus a rare billionaire tier (at most 15 citywide).
- Clothing tiers by class are listed in HANDOFF.md.

## Career ladders (7 levels each)
Shared difficulty curve:

| Levels | Difficulty |
|---|---|
| 1–2 | Easy |
| 2–3 | Okay |
| 3–4 | Kinda hard |
| 4–5 | Very hard |
| 5–6 | About 2 weeks of steady play at 2–3 h a day |
| 6–7 | Hard, but not impossible |

- Use randomised, varied action requirements so bots can't farm progress.
- **Rep** builds fast early and very, very slowly later. Higher rep makes you a bigger target.

### Crime boss (gang)
- At most **5 gangs** in the whole city. NPC gangs and dealers exist too.
- **Gang view:** a map overlay showing the territory colours each gang controls. Going deeper into an opp zone is more dangerous.
- **Getting caught lacking** gets you "switched down" (attacked or robbed).
- Send spies to find rival members; if caught, it's jail.
- **Drug dealing:**
  - Your crew works for you.
  - The more wanted you are, the less freely you can move: travel low-key or get busted.
  - You'll have beefs with other dealers.
- **Bank robbery:** about $50k per job, then a one-in-game-week cooldown. Bust risk rises if you skip it.
- Higher levels bring more NPC "boys" and bodyguards, but also more heat from cops and opps.
- **Betrayal gates:**
  - 5→6 requires betraying people who trusted you.
  - 6→7 requires betraying many.

### CEO
- 7 levels, harder than crime boss because it's legal.
- Optional illegal shortcuts ease the climb, at the risk of getting caught:
  - **5–6:** dumping company waste in the river (people get sick) and bribing police not to investigate properly. The bribe can be refused.
  - **6–7:** worse schemes, still optional.

### Celebrity
- Tops out at level 6. Level 5 is a normal celebrity and very hard to reach.
- **Reaching level 5:** requires "bad stuff" (shown only as text messages; the game is 21+).
- **Reaching level 6, either way:**
  - Join the cult, which is extremely hard to get into.
  - Or have a whole borough love you: keep it entertained every day for 3 real weeks straight. Repeating the same act bores people.

## Jobs
Each job has a temptation or downside. These are opt-in choices with consequences, not something that happens automatically.

**Update (Peter, 2026-10-13): depression is the baseline, good habits keep it away.**
- Each job slowly pushes you toward depression unless you do something good to balance it. The temptation is just one way out, never the required one.
- Example, nurse/doctor: read, or hang out with your partner, to stay well. If you don't, you can cheat as a way to avoid getting depressed.
- Depression affects how you interact with other people, and how much and how fast furniture replenishes your needs.
- Not built yet. The starter deli job comes first; this layers on top of it.

- **Healthcare (nurse/doctor):** temptation to cheat; skipping it raises your chance of getting sick.
- **Construction:** long hours; womaniser or pick-me drama; work quality drops if you don't stray.
- **Office worker:** boring life. Spreads false rumours, which travel far (a rumour system that spreads through NPC networks).
- **Chef:** sends wrong orders on purpose, or loses money and goes broke.
- **Store owner:** shoplifters. Chase them or go broke.
- **Gangbanger:** steal to eat, sell drugs, rob banks (see crime boss).
- **Stripper:** high pay and frequent fights.
  - The owner wants the fights to be specifically with men.
  - Flag this for the lawyer and for app-store review.
  - A neutral alternative is "fights with rowdy customers."
- **Police:**
  - The city is run under a superintendent.
  - **Good cop:** catch about 3 criminals a week. Catching higher-level criminals gives more rep, but don't make levelling too easy.
  - **Bad cop:** take bribes or frame innocent people. Your partner-in-crime sometimes snitches, and drops hints before doing so. Getting caught means you're cooked.
- **Final career list (Peter, 2026-10-13):** 🏪 Bodega (the playable deli job, renamed; the old bodega job is removed), 🍸 Bartending, 🏋️ Fitness, 💻 Tech, 📈 Finance, 🌙 Night Dancer, 💊 Alley Pharmacist (five fictional products; sales raise your wanted level), 🚓 Cop (honest or corrupt; corruption pays more but risks exposure). Coffee and Pizza leave as careers (the places stay). Side effects are drafts; Peter will edit them later.
- **🌙 Night Dancer fights (Peter, 2026-10-13):** some shifts a rowdy customer starts a fight. You win or get beaten up, depending on fitness.
  - Chance of losing = 90% − 0.5 × fitness% (clamped 10–90%): fitness 0% → lose 90%, **50% → lose 65%** (Peter's number), 100% → lose 40%.
  - Losing: hurt (health/energy down, maybe a hospital bill), mood down, and that show's tips are smaller. Winning: a small rep and mood boost.
  - Too strong scares customers: above 80% fitness, tips shrink (×0.7 at 100%). The sweet spot is strong enough to win often, not so strong nobody tips.
  - Fights stay non-graphic (a short scene and a result line), with "rowdy customers" as the opponents.
- **Players first, then computers (Peter, 2026-10-14):** wherever a person is needed (a customer at your bar, a coworker, a visitor, someone who comes over after a bottle), a real player fills it when one is there; otherwise an NPC does. E.g. a player orders a margarita at your bar: it lands in your queue with their name, you make it, they pay and choose the tip.
- **Bottle service (Peter, 2026-10-14):** 7 bottles, $700 to $100,000 (parody names: Mowêt Impérial, Veuve Kliko, Dom Perinyon, Don Julyo 1942, Ace of Shades, Cristalle Rosé, Gold Goliath Jeroboam). Fireworks in the bottle's colours, bigger and longer with the price (even the smallest is a proper burst); a spotlight from the 3rd bottle, longer each step; 2, 2, 3, 4, 5, 6, 7 people come over (men and women, 21+), who can be taken home (fade to black). The whole room cheers. 📈 Trade wins at the trading floor get the same show: 10× → 2 people, 30× → 3, 50× → 4, 80× → 5, 100× → 7. Data: `data/bottles.ts`.
- **Extra jobs (owner said 1–2 more; my suggestions):**
  - **Rideshare/taxi driver:** ties into cars, speeding and tickets. Temptation: overcharging tourists.
  - **Content creator:** feeds the celebrity ladder. Temptation: fake drama for views.

## Security (must hold before going online)
- **The server decides everything.** The client only sends intents ("do action X"). Money, rep, levels, jail, rarity rolls and random events are all rolled and stored on the server, so nobody can edit their way to a billion.
- Rate-limit actions and add bot checks (randomised requirements, plus timing analysis).
- **Tools available in this environment:**
  - Semgrep and CodeQL security scans.
  - A dependency supply-chain audit.
  - The `colyseus-multiplayer` skill, for a server-authoritative real-time server with anti-cheat validation.
  - The "sharp-edges" API review.
- Run them before launch.

## Added 2026-10-11 (from Peter)

### Map pins (teardrop style, NOT the 📍 emoji)
- Classic teardrop map pins floating over the 3D city and on the 2D map.
- Used for: mini events (store sale, breaking news spot), landmarks, friends in game,
  quick news, "where something is".
- MUST NOT BE OVERWHELMING: hard cap on pins on screen at once (e.g. 3–5 nearest/most
  important), fade by distance, merge nearby pins into one with a count, small and quiet
  by default, and only one "loud" (animated) pin at a time.
- Later: a button to see the full list of events.

### Hamburger menu + side panel (later)
- Hamburger button opens a side panel. HAPPENING NOW! / BREAKING NEWS! lives there,
  plus other buttons (Claude proposes the set, Peter reviews).

### Homes without a house for everyone
- Map stays big but not annoying to navigate; not every player needs a modelled house.
- A player/NPC going home walks to a block and disappears there (their home is "on" that
  block).
- Visiting: ask to follow them home / ask them to follow you home / they SHARE their
  address (you can go anytime, but they must be home to enter) / they give you a SPARE
  KEY (you can enter even when they're offline).
- NPCs can follow you home, have relationships or one-night stands (21+, fade-to-black,
  nothing explicit). Some NPCs steal while you sleep (a furniture item or cash) — show it
  as a morning message; tie to the event rarity system.

### Roads and traffic
- Roads are two lanes (one each way) with parking lanes: done 2026-10-11.
- More cars on the road: car count raised; the full car overhaul (models, rarity,
  per-model speed) comes with the plug-in vehicle system.
