# NYC Life: ideas and how to build them

These are Peter's requests (2026-10-11) plus ideas for making the game fun for 1–2 players with NPCs. Every feature plugs in through a registry or a system (`docs/ADDING-CONTENT.md`).

## 1. Peter's social requests: how to build each

### Share your in-game number
- Each player gets a 212/718 number from a seeded hash of the player id: `sim/phone.ts → phoneNumber(id)`.
- **Phone → Contacts** is a new plug-in app (`PHONE_APPS`).
- **Share number** is a social action you use on a player or NPC standing next to you. It adds you to their contacts.
- **NPCs:** they reply to texts through templates chosen by personality and mood ("wyd", "come to the Stoop at 9").
  - A text can turn into an invite, which shows up as a pin plus an event at that place and time.
- **Players:** the same messages go over the server (Colyseus room `city`, message `dm`). Offline players get the message on their next login.

### Speak loud (a chat bubble over your head)
- A `speech` system draws a sprite bubble over the avatar.
  - Rendering: one canvas texture per message, which fades after 6 s. Only the 3 nearest bubbles are shown, so the screen never gets crowded.
- Typed text goes through the moderation filter (21+ but no slurs), with a rate limit of one message every 4 s.
- **Online:** the server relays the message to players within 40 m.
- **NPCs within 15 m react** according to personality:
  - laugh, ignore you or answer back;
  - a "rude" NPC takes offence at an insult (see 2).

### Dates
- **Flow:** Ask out (chance depends on charisma, Cool, mood, and their personality and memory of you) → pick a venue → the date itself.
  - The date is a short 3-round "vibe" mini-game in the `MINIGAMES` registry: pick topics, read their reactions.
  - Outcome: a relationship level of 0–5 (acquaintance, friend, crush, dating, partner).
- **Higher levels unlock** following them home, the spare key, moving in, and a breakup event.
- **21+ content** is text or fade-to-black only, as agreed.
- **Theft:** NPCs flagged `light-fingered` can steal from you while you sleep at their place or yours.
  - It's a furniture item or cash, chosen by the weighted pick that already exists.
  - They remember it, and you can confront them.

### Follow home, shared address, spare key
- NPCs already walk home and disappear into their block.
- **Home location:** store `npcHome[npcId] = {area, block, slot}`. Visiting uses the existing home layouts with their own furniture seed.
- **Access rules:** a shared address lets you enter only when they're home; a spare key lets you in any time.
- **Players:** the same rules apply, enforced by the server.

## 2. NPCs that aren't predictable or exploitable

- **Memory.** Each NPC you meet gets a small record: `{likes, fear, grudge, lastSeen, facts[]}`, capped at the 60 most recent NPCs (about 3 KB in the save).
  - What you do changes it. Insulting them builds a grudge; helping them builds likes.
  - The crews already work this way (`respect`).
- **Personalities with teeth.** Each NPC is kind, neutral or mean, with a temper from cool to hot.
  - Mean NPCs can start trouble (a shove, a scam, theft).
  - A hot-tempered NPC fights back when you push or rob them, using the same `fight()` as the crews.
  - Losing sends you to hospital; it never kills you.
- **No farming:**
  - Repeating the same action on the same NPC has diminishing returns, and turns annoying after the third time.
  - Robbing an NPC raises local police heat and crew interest.
  - NPCs talk to each other: your reputation spreads around a block.
- **Variety:**
  - Daily "moods" seeded per NPC per game day.
  - Each NPC has 2–3 random quirks drawn from a large pool (collects sneakers, hates pigeons, aspiring rapper), which change what they say and what they want.
  - Rare "story NPCs" carry a short chain of 3 events (a busker who becomes famous if you help them).

## 3. Fun for 1–2 players with no crowd

- **Daily city events** (sales, parades, a celebrity sighting, a blackout, a heat wave hydrant party) on the pins.
  - Everyone sees the same seeded schedule, so two friends can meet there.
- **Side hustles that are mini-games:** a street food cart, a dog-walking route, a delivery bike with traffic dodging, busking (a rhythm tap game).
- **Collections:** subway-line stamps, landmark selfies, rare cars spotted (a Very rare sighting pays out), crew tags.
- **Rivals:** an NPC "rival" with your own career who competes for promotions and dates. Beat them, or befriend them.
- **Co-op (2 players):** shared business, double-date, pull a heist together (the crime path), race your cars (Floor it vs Floor it).
- **Weekly goals** with small rewards. Streaks come with a "grace day" so missing one doesn't feel punishing.

## 4. Suggested build order (cheap → expensive)

Status 2026-10-11: items 1–5 are DONE (NPC memory and fights, Speak loud, dates, Contacts and texting, daily city events). Next is 6, the server.

1. NPC memory + mean/kind + fight back.
2. Speak loud (local only).
3. Dates (NPCs).
4. Contacts and texts (NPCs).
5. Daily city events.
6. Server: players, DMs, speak loud relay, visiting, billionaire cap.
