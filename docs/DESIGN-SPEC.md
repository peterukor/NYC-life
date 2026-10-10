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
- **Work:** a "Skip to end of shift" (travel to the future) button for now. A shift reads as about 4 in-game hours. Mini-games come later through the mini-game plug-in interface.

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
