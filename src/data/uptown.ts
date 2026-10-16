// =====================================================================
// uptown.ts — more places in Midtown and up the island, and darkly funny
// things to do there (Peter, 2026-10-16: "add more locations around the
// center and north… humorous stuff… like dark comedy").
//
// Each ODD activity is a normal timed action (data/actions.ts picks them
// up) with a handful of outcomes ("twists"), one rolled when it's done
// (sim/oddities.ts): a line to read, and maybe money, needs, a mood or a
// little 🔥 street rep. The joke is on the city, on bad luck and on you,
// never on anybody vulnerable.
// =====================================================================

import type { NeedKey } from '../sim/types.ts';
import type { ActionDef } from './actions.ts';
import type { RawPlace } from './places.ts';

export interface Twist {
  /** How likely (relative). */
  w: number;
  text: string;
  money?: number;
  needs?: Partial<Record<NeedKey, number>>;
  mood?: { label: string; emoji: string; value: number };
  rep?: number;
}

export interface OddActivity {
  action: ActionDef;
  twists: Twist[];
}

const odd = (action: Omit<ActionDef, 'tags'> & { tags?: string[] }, twists: Twist[]): OddActivity => ({ action: { ...action, tags: ['fun', 'odd', ...(action.tags ?? [])] }, twists });

export const ODD_ACTIVITIES: OddActivity[] = [
  // ⚰️ Eternal Rest Showroom (Murray Hill)
  odd({ id: 'coffinNap', label: 'Test-lie in a coffin', emoji: '⚰️', seconds: 8, needs: { energy: 20 } }, [
    { w: 3, text: 'Best nap you’ve had in years. Satin lining. Total silence. You’re a little worried about how much you liked it.', needs: { energy: 15 }, mood: { label: 'Rested like the dead', emoji: '⚰️', value: 6 } },
    { w: 2, text: 'The salesman closes the lid “to show you the acoustics”. Four minutes. You heard every word of his pitch.', needs: { fun: -6 } },
    { w: 2, text: 'A family on a tour thinks you’re part of the display and pays their respects. You get a $20 sympathy card.', money: 2_000 },
    { w: 1, text: 'You fall asleep. You wake up to “…and that concludes our open house.” Twelve people clap.', needs: { social: 10 } },
  ]),
  odd({ id: 'planFuneral', label: 'Pre-plan your funeral', emoji: '🕯️', seconds: 10, cost: 2_000, needs: { fun: 12 } }, [
    { w: 3, text: 'You book a DJ, a taco truck and a slideshow of your best fits. The planner says it’s “a lot”. You say it’s branding.', mood: { label: 'Legacy secured', emoji: '🌮', value: 8 } },
    { w: 2, text: 'Open bar is extra. Being dead is apparently not an excuse for a cash bar. You upgrade.', money: -2_000, mood: { label: 'Open bar (eventually)', emoji: '🍸', value: 6 } },
    { w: 2, text: 'You leave everything to the bodega cat. The planner asks for the cat’s legal name. It’s “Papi”.', needs: { fun: 8 } },
    { w: 1, text: 'They offer a two-for-one if you bring a friend who’s also “planning ahead”. You text the group chat. Nobody replies.', needs: { social: -4, fun: 6 } },
  ]),
  // 💥 The Rage Room (Penn Station)
  odd({ id: 'smashPrinter', label: 'Smash an office printer', emoji: '🖨️', seconds: 8, cost: 4_000, needs: { fun: 25, energy: -8 } }, [
    { w: 3, text: 'Fourteen swings. PC LOAD LETTER is finally gone. You feel lighter. Taller, even.', mood: { label: 'Printer avenged', emoji: '💥', value: 10 } },
    { w: 2, text: 'Mid-swing, it prints one page. It says “PAPER JAM”. You get angrier. Somehow this helps.', needs: { fun: 10 } },
    { w: 1, text: 'You recognise it. It’s the actual printer from your old job. Serial number and all. Closure.', mood: { label: 'Closure', emoji: '🖨️', value: 12 }, rep: 1 },
    { w: 1, text: 'You pull a muscle on the backswing. The printer wins again. As it always has.', needs: { energy: -10 } },
  ]),
  odd({ id: 'smashWedding', label: 'Smash the “ex’s wedding china” set', emoji: '🍽️', seconds: 6, cost: 2_500, needs: { fun: 18 } }, [
    { w: 3, text: 'Every plate a memory. Every memory a plate. Every plate gone. You tip the cleanup guy.', mood: { label: 'Moved on (loudly)', emoji: '🍽️', value: 8 } },
    { w: 1, text: 'One plate won’t break. You take it as a sign. Then you break it with the other plate.', needs: { fun: 6 } },
  ]),
  // 🧩 Escape the Open-Plan Office (Midtown East)
  odd({ id: 'escapeOffice', label: 'Escape the open-plan office', emoji: '🧩', seconds: 12, cost: 3_500, needs: { fun: 20, social: 8 } }, [
    { w: 2, text: 'You escape in 58 minutes by pretending to take a call and walking straight out. Record time. Prize: $60.', money: 6_000, mood: { label: 'Escaped the office', emoji: '🚪', value: 8 } },
    { w: 2, text: 'There was a “quick sync” in the last room. It lasted the whole hour. You did not escape. Nobody ever does.', needs: { fun: -8, energy: -6 } },
    { w: 2, text: 'You find the exit. It opens into a second, larger open-plan office. The staff call it “the reveal”.', needs: { fun: 6 } },
    { w: 1, text: 'You solve it by replying-all “unsubscribe”. The door unlocks out of shame.', money: 3_000, rep: 1 },
  ]),
  // 🎤 Heartbreak Karaoke (Koreatown)
  odd({ id: 'sadKaraoke', label: 'Sing a breakup ballad', emoji: '🎤', seconds: 10, cost: 1_000, needs: { social: 15, fun: 15 }, skill: { key: 'music', gain: 0.3 } }, [
    { w: 3, text: 'You hit the key change. A man at the bar texts his ex “I miss u”. You did that. Power.', mood: { label: 'Destroyed the room', emoji: '🎤', value: 10 } },
    { w: 2, text: 'Halfway through, the room joins in. By the bridge it’s a support group. Someone hands you tissues and a mozz stick.', needs: { social: 15, hunger: 8 } },
    { w: 1, text: 'You picked a song that’s 9 minutes long. The second half is just violins. You commit. Respect earned.', rep: 2 },
    { w: 1, text: 'Your ex walks in mid-chorus. You keep singing. Right at them. Iconic. Deeply uncomfortable.', mood: { label: 'Main character', emoji: '😤', value: 6 }, rep: 1 },
  ]),
  // 🔮 Madame Doom (Upper East Side)
  odd({ id: 'doomFortune', label: 'Get a pessimistic fortune', emoji: '🔮', seconds: 8, cost: 2_000, needs: { fun: 12 } }, [
    { w: 2, text: '“You will die.” Long pause. “Eventually. Probably not Tuesday.” That’ll be $20. You feel weirdly fine.', mood: { label: 'Probably not Tuesday', emoji: '🔮', value: 4 } },
    { w: 2, text: '“I see… your rent. Going up.” She’s right. She’s always right. That’s the worst part.', needs: { fun: -4 } },
    { w: 2, text: '“Great fortune comes to you.” She seems annoyed about it. On the way out you find $50 in a coat you forgot you had.', money: 5_000, mood: { label: 'Doom says: lucky', emoji: '🍀', value: 8 } },
    { w: 1, text: '“Love is coming.” She checks again. “Oh no. It’s the guy from the 6 train.”', needs: { social: 6, fun: 8 } },
  ]),
  // 🧪 Paid clinical study (East Harlem)
  odd({ id: 'clinicalTrial', label: 'Join a paid study', emoji: '🧪', seconds: 16, pay: 15_000, needs: { energy: -10, fun: -4 }, tags: ['earn', 'gig'] }, [
    { w: 3, text: 'Placebo group. You feel amazing anyway. Science has notes about you. +$150.', mood: { label: 'Powerful placebo', emoji: '💊', value: 6 } },
    { w: 2, text: 'Side effect: everything tastes like a penny for an hour. Including the free juice. +$150.', needs: { hunger: -6 } },
    { w: 1, text: 'Side effect: your hair is slightly more confident. You can’t prove it. You don’t need to. +$150.', mood: { label: 'Confident hair', emoji: '💇', value: 6 } },
    { w: 1, text: 'They study your sleep. You sleep so well they pay a bonus and ask if you “do this professionally”. +$190.', money: 4_000, needs: { energy: 30 } },
  ]),
  // 🏛️ Museum of Bad Decisions (Upper West Side)
  odd({ id: 'badDecisionsTour', label: 'Tour the Museum of Bad Decisions', emoji: '🏛️', seconds: 12, cost: 2_500, needs: { fun: 22 } }, [
    { w: 2, text: 'Highlight: “Texting your ex at 2 AM”, an interactive exhibit. You set a personal best. The guard hides your phone.', needs: { fun: 6 } },
    { w: 2, text: 'There’s a whole wing for “Apartments you almost signed for”. You find yours. The plaque says “mold, but charming”.', needs: { fun: 4 } },
    { w: 1, text: 'The gift shop sells the bad decisions. You buy one. Of course you buy one. −$15.', money: -1_500, mood: { label: 'Bought the merch', emoji: '🛍️', value: 5 } },
    { w: 1, text: 'You spot a photo of yourself in the “Haircuts” hall. You don’t remember consenting. You don’t remember the haircut.', needs: { fun: 8, social: 4 } },
  ]),
  // 🐀 The Rat Tour (Upper West Side)
  odd({ id: 'ratTour', label: 'Take the night rat tour', emoji: '🐀', seconds: 10, cost: 1_500, needs: { fun: 18, social: 6 }, hours: [19, 3] }, [
    { w: 3, text: 'You see a rat carrying a whole everything bagel down the stairs. The group goes silent. Someone weeps.', mood: { label: 'Saw Bagel Rat', emoji: '🥯', value: 8 } },
    { w: 2, text: 'The guide names every rat. They’re all named Kevin. “It’s easier,” he says, “and they don’t mind.”', needs: { fun: 6 } },
    { w: 1, text: 'A rat follows you for three blocks. At the corner it looks back at you, nods once, and leaves. You’ve been accepted.', rep: 2 },
    { w: 1, text: 'The guide gets bitten. The tour continues. “Part of the experience,” he says, bleeding a little, smiling a lot.', needs: { fun: 10 } },
  ]),
  // 💈 Barbershop Debate Club (Harlem)
  odd({ id: 'goatDebate', label: 'Argue about who’s the GOAT', emoji: '🐐', seconds: 10, needs: { social: 22, fun: 14 }, skill: { key: 'charisma', gain: 0.4 } }, [
    { w: 2, text: 'You win the room. An old head in chair 2 says “the kid’s right” and the whole shop goes quiet. Legend status.', rep: 3, mood: { label: 'Won the barbershop', emoji: '🐐', value: 10 } },
    { w: 2, text: 'You lose so badly they give you a free line-up out of pity. You look great, though.', needs: { hygiene: 10 }, mood: { label: 'Fresh line-up', emoji: '💈', value: 6 } },
    { w: 2, text: 'It turns into a three-hour thing about the best chopped cheese. Nobody gets a haircut. Nobody wants one.', needs: { energy: -8, social: 10 } },
    { w: 1, text: 'You bring up a stat. Someone brings up a better stat. A man you’ve never seen produces a laminated chart. You concede.', needs: { fun: 6 } },
  ]),
  // 👻 Haunted brownstone open house (Harlem)
  odd({ id: 'hauntedOpenHouse', label: 'Tour the haunted apartment', emoji: '👻', seconds: 10, needs: { fun: 18 } }, [
    { w: 2, text: 'The realtor admits it’s haunted. “But the ghost pays half the rent.” Honestly? Best deal you’ve seen all year.', needs: { fun: 8 } },
    { w: 2, text: 'The ghost is the last tenant. He’s still waiting for his security deposit back. Since 1987. You relate deeply.', mood: { label: 'Bonded with a ghost', emoji: '👻', value: 6 } },
    { w: 1, text: 'Every door slams at once. The realtor doesn’t flinch. “Pre-war,” she says. “Lots of character.”', needs: { fun: 10 } },
    { w: 1, text: 'You find $40 under a floorboard and a note: “For whoever outlasts the landlord.” You take it. Respectfully.', money: 4_000 },
  ]),
  // 📦 Mystery storage auction (Washington Heights)
  odd({ id: 'storageAuction', label: 'Bid on a mystery storage unit', emoji: '📦', seconds: 12, cost: 10_000, needs: { fun: 16 } }, [
    { w: 3, text: 'Inside: 400 AOL free-trial CDs and a treadmill used as a coat rack. You sell the treadmill for $60.', money: 6_000 },
    { w: 2, text: 'A full drum kit, a cymbal signed “Sorry, neighbours”. Sold to a teenager for $280.', money: 28_000, mood: { label: 'Storage flip', emoji: '🥁', value: 8 } },
    { w: 2, text: 'A taxidermy raccoon in a tiny tuxedo. You can’t sell it. You can’t leave it. He lives with you now. His name is Gerald.', mood: { label: 'Gerald', emoji: '🦝', value: 6 } },
    { w: 1, text: 'A deed to a parking spot in Staten Island. A real one. You sell it in ten minutes for $650 to a man who cried.', money: 65_000, rep: 2 },
    { w: 1, text: 'It’s empty except a sticky note: “ha”. You’ve been had. The auctioneer won’t meet your eyes.', needs: { fun: -10 } },
  ]),
  // 🪤 Medieval torture museum (Inwood)
  odd({ id: 'stocksSelfie', label: 'Get locked in the stocks (photo op)', emoji: '🪵', seconds: 8, cost: 1_000, needs: { fun: 16 } }, [
    { w: 2, text: 'A tourist throws a soft pretzel at you, “for authenticity”. You eat it. Also for authenticity.', needs: { hunger: 12 } },
    { w: 2, text: 'The photo goes viral: “POV: your landlord after the rent strike.” People start following you.', rep: 2, mood: { label: 'Went viral (in the stocks)', emoji: '📸', value: 8 } },
    { w: 1, text: 'The key’s lost. You spend 20 minutes in there. A school group learns more from you than the exhibits.', needs: { energy: -8, social: 12 } },
  ]),
  // 🌲 Haunted hike (Inwood Hill)
  odd({ id: 'hauntedHike', label: 'Night hike in the old forest', emoji: '🌲', seconds: 14, needs: { fun: 18, energy: -10 }, hours: [18, 2], skill: { key: 'fitness', gain: 0.3 } }, [
    { w: 2, text: 'A Dutch ghost appears, still furious about selling the whole island for “some beads”. He asks if you’re a lawyer.', mood: { label: 'Met a very old ghost', emoji: '👻', value: 6 } },
    { w: 2, text: 'An owl screams. You scream. The owl screams again, louder, to win. You let it win.', needs: { fun: 8 } },
    { w: 1, text: 'You get lost, find one bar of signal on a rock, and a hundred-year-old tree that has better wifi than your apartment.', needs: { fun: 10 } },
    { w: 1, text: 'You find a $20 bill pinned to a tree with a note: “for the brave.” Brave, or just the first to look up.', money: 2_000 },
  ]),
  // 🚡 Scream therapy on the tram (59th St)
  odd({ id: 'tramScream', label: 'Scream therapy over the East River', emoji: '🚡', seconds: 6, cost: 300, needs: { fun: 16, energy: 4 } }, [
    { w: 3, text: 'You scream over the river. The whole cabin joins in. A man in a suit screams “QUARTERLY TARGETS”. Healing.', mood: { label: 'Screamed it out', emoji: '😱', value: 10 } },
    { w: 1, text: 'You scream. Nobody joins. The tram stops mid-river for six minutes. Eye contact everywhere.', needs: { social: -6, fun: 6 } },
    { w: 1, text: 'A tourist films it and asks if this is “a local custom”. You say yes. It is now.', rep: 1 },
  ]),
  // 🧾 Lost & Found clearance (Grand Central)
  odd({ id: 'lostFoundBox', label: 'Buy a box of unclaimed lost property', emoji: '🧳', seconds: 8, cost: 2_000, needs: { fun: 14 } }, [
    { w: 3, text: 'Eleven left gloves. One right glove. You’ve never felt so seen.', needs: { fun: 4 } },
    { w: 2, text: 'A trumpet, a wedding ring (returned: +karma, +$40 reward) and a sandwich you choose not to investigate.', money: 4_000, mood: { label: 'Did a good thing', emoji: '💍', value: 8 } },
    { w: 1, text: 'A briefcase. Inside: a single tie and a note that says “I quit”. You keep the tie. You understand the note.', needs: { fun: 8 } },
  ]),
];

/** The places (all Manhattan, Midtown and north). */
export const UPTOWN_PLACES: RawPlace[] = [
  // ---------- Midtown / central ----------
  {
    id: 'eternalRest', area: 'manhattan', name: 'Eternal Rest Showroom', emoji: '⚰️', type: 'fun',
    blurb: 'Caskets, urns and “pre-need planning”. Free coffee. They really, really want you to lie down in something.',
    at: [40.7479, -73.9790], hours: [10, 19], interior: 'none', color: '#4a4e69',
    actions: ['coffinNap', 'planFuneral'],
  },
  {
    id: 'rageRoom', area: 'manhattan', name: 'The Rage Room on 33rd', emoji: '💥', type: 'fun',
    blurb: 'Goggles, a bat and a pile of things that deserve it. Printers are the bestseller. Nobody asks why.',
    at: [40.7498, -73.9945], hours: [12, 24], interior: 'none', color: '#e63946',
    actions: ['smashPrinter', 'smashWedding'],
  },
  {
    id: 'openOfficeEscape', area: 'manhattan', name: 'Escape the Open Office', emoji: '🧩', type: 'fun',
    blurb: 'An escape room built like a real Midtown office. Rated “too real” by 4,000 people who work in one.',
    at: [40.7547, -73.9752], hours: [11, 23], interior: 'none', color: '#3a86ff',
    actions: ['escapeOffice'],
  },
  {
    id: 'heartbreakKaraoke', area: 'manhattan', name: 'Heartbreak Karaoke', emoji: '🎤', type: 'nightlife',
    blurb: 'Koreatown, third floor, private rooms. Only sad songs after 10. Tissues are free; the soju isn’t.',
    at: [40.7478, -73.9868], hours: [17, 4], interior: 'none', color: '#ff4fa3',
    actions: ['sadKaraoke'],
  },
  {
    id: 'lostFound', area: 'manhattan', name: 'Grand Central Lost & Found Sale', emoji: '🧳', type: 'shop',
    blurb: 'Every umbrella this city ever forgot, plus mystery boxes of things nobody came back for.',
    at: [40.7527, -73.9772], hours: [8, 20], interior: 'none', color: '#b08d2e',
    actions: ['lostFoundBox'],
  },
  {
    id: 'tramScream', area: 'manhattan', name: 'Roosevelt Island Tram', emoji: '🚡', type: 'fun',
    blurb: 'A red cable car over the East River. Locals use it for commuting. And, recently, for screaming.',
    at: [40.7612, -73.9643], hours: [6, 2], interior: 'none', color: '#d62828',
    actions: ['tramScream'],
  },
  {
    id: 'madameDoom', area: 'manhattan', name: 'Madame Doom, Pessimistic Psychic', emoji: '🔮', type: 'fun',
    blurb: 'Lexington Ave, behind a beaded curtain. Never wrong, never cheerful. Cash or Venmo.',
    at: [40.7688, -73.9620], hours: [12, 23], interior: 'none', color: '#6d597a',
    actions: ['doomFortune'],
  },
  // ---------- Upper West Side ----------
  {
    id: 'badDecisions', area: 'manhattan', name: 'Museum of Bad Decisions', emoji: '🏛️', type: 'fun',
    blurb: 'Three floors of things people wish they hadn’t done. Interactive. Very interactive. Gift shop on the way out.',
    at: [40.7826, -73.9740], hours: [10, 18], interior: 'none', color: '#9b2226',
    actions: ['badDecisionsTour'],
  },
  {
    id: 'ratTour', area: 'manhattan', name: 'Upper West Side Rat Tour', emoji: '🐀', type: 'fun',
    blurb: 'A nightly walking tour of the city’s most successful residents. Meets by the subway stairs. Wear closed shoes.',
    at: [40.7870, -73.9770], hours: [19, 3], interior: 'none', color: '#6c757d',
    actions: ['ratTour'],
  },
  {
    id: 'uwsBagels', area: 'manhattan', name: 'Broadway Bagel Bros', emoji: '🥯', type: 'cafe',
    blurb: 'Hand-rolled, hot out the kettle at 6 AM. The line is part of the experience. So is the attitude.',
    at: [40.7905, -73.9745], hours: [6, 16], interior: 'cafe', color: '#e9c46a',
    actions: ['bagelSchmear', 'latte', 'laptopCafe'],
  },
  // ---------- Harlem / East Harlem ----------
  {
    id: 'clinicalTrial', area: 'manhattan', name: 'Uptown Paid Research Center', emoji: '🧪', type: 'work',
    blurb: 'Studies that pay cash for your time (and your blood pressure). Side effects listed in very small print.',
    at: [40.7905, -73.9530], hours: [8, 18], interior: 'none', color: '#2a9d8f',
    actions: ['clinicalTrial'],
  },
  {
    id: 'debateBarber', area: 'manhattan', name: 'Lenox Cuts & Debates', emoji: '💈', type: 'fun',
    blurb: 'Fresh cuts, louder opinions. The wait is two hours, but the arguments are free and the regulars never lose.',
    at: [40.8085, -73.9455], hours: [9, 21], interior: 'none', color: '#d62828',
    actions: ['goatDebate'],
  },
  {
    id: 'hauntedBrownstone', area: 'manhattan', name: 'Strivers’ Row Haunted Open House', emoji: '👻', type: 'fun',
    blurb: 'A gorgeous brownstone floor-through, below market rent. The listing says “quiet neighbours”. They’re dead.',
    at: [40.8180, -73.9440], hours: [11, 22], interior: 'none', color: '#3d405b',
    actions: ['hauntedOpenHouse'],
  },
  {
    id: 'harlemSoul', area: 'manhattan', name: 'Miss Dee’s Soul Kitchen', emoji: '🍗', type: 'food',
    blurb: 'Fried chicken, mac and cheese, candied yams. Miss Dee calls everybody baby and means it.',
    at: [40.8105, -73.9500], hours: [11, 23], interior: 'pizza', color: '#bc6c25',
    actions: ['fullPie', 'dollarSlice'],
  },
  // ---------- Washington Heights / Inwood ----------
  {
    id: 'storageAuction', area: 'manhattan', name: 'Heights Storage Auctions', emoji: '📦', type: 'shop',
    blurb: 'Abandoned units, sold blind, cash only. Most are junk. One had a parking spot in it. People still talk about it.',
    at: [40.8490, -73.9365], hours: [10, 19], interior: 'none', color: '#f4a261',
    actions: ['storageAuction'],
  },
  {
    id: 'chimiTruck', area: 'manhattan', name: 'El Chimi King Truck', emoji: '🍔', type: 'food',
    blurb: 'The Dominican burger, late and loud, with the bachata up. Open till the sky goes light.',
    at: [40.8440, -73.9390], hours: [18, 6], interior: 'bodega', color: '#e63946',
    actions: ['choppedCheese', 'bodegaCoffee', 'baconEggCheese'],
  },
  {
    id: 'tortureMuseum', area: 'manhattan', name: 'Medieval Mistakes Museum', emoji: '🪵', type: 'fun',
    blurb: 'Stocks, a pillory and a “dungeon experience” in a church basement. Run by a very cheerful man named Brian.',
    at: [40.8650, -73.9290], hours: [10, 18], interior: 'none', color: '#6b4423',
    actions: ['stocksSelfie'],
  },
  {
    id: 'inwoodForest', area: 'manhattan', name: 'Inwood Hill Old Forest', emoji: '🌲', type: 'park',
    blurb: 'The last old forest on the island: caves, cliffs, owls. After dark people swear they hear Dutch.',
    at: [40.8710, -73.9260], interior: 'none', color: '#2d6a4f',
    actions: ['hauntedHike'],
  },
];
