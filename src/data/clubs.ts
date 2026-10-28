// =====================================================================
// clubs.ts — Manhattan's nightclubs, from a basement anyone can get into
// to a members-only room most people never see (Peter, 2026-10-15:
// "add multiple night clubs, some higher level than others, and
// depending on your level you are allowed in… make the bigger clubs more
// fun than the smaller one… you can meet richer people there or get
// better connections the higher the club").
//
// THE DOOR (sim/clubs.ts → doorCheck): you're in if your 🔥 street rep
// rank OR your 😎 Cool is high enough, or a promoter you met vouches for
// you (one level up). Turned away? Try to slip the bouncer something.
//
// BIGGER = MORE FUN: a bigger room and crowd (data/venues.ts club1–4),
// bigger bottle shows (`show`), more street rep per bottle (`rep`), the
// DJ drops more often (`dropEvery`), and richer connections to meet.
//
// TO ADD A CLUB: a place in data/places.ts (interior: 'club'), a row
// here, and a layout in VENUE_LAYOUT_FOR (data/venues.ts).
// =====================================================================

export interface ClubDef {
  placeId: string;
  /** Open round the clock (the after-hours clubs): anyone gets in, no ladder. */
  allDay?: boolean;
  tier: 1 | 2 | 3 | 4;
  /** What kind of night it is, in a few words. */
  label: string;
  /** Street rep rank (0–6) OR Cool (0–100) that gets you in. */
  door: { rank: number; cool: number };
  /** Cover charge at the door (cents). */
  cover: number;
  /** Bottle show size (fireworks, spotlight) and street rep per bottle, × this. */
  show: number;
  rep: number;
  /** The DJ drops the beat every this many seconds (the room goes off). */
  dropEvery: number;
  /** DJs who play here. */
  djs: string[];
  /** Chance per "Mingle" of meeting someone who matters. */
  connectChance: number;
  /** Screen colour (the LED wall). */
  screen: string;
  /** Names on tonight's top-spenders board (fictional regulars) and how big they spend. */
  regulars: string[];
  regularSpend: [number, number];
}

export const CLUBS: ClubDef[] = [
  // ---- The ladder (Peter, 2026-10-27: 3 night clubs, easy door → VIP), across the boroughs.
  {
    placeId: 'basement212', tier: 1, label: 'Lower East Side basement · no list, no dress code',
    door: { rank: 0, cool: 0 }, cover: 1_500, show: 1, rep: 1, dropEvery: 150,
    djs: ['DJ Delancey', 'DJ Ludlow', 'DJ Bodega Cat'],
    connectChance: 0.1, screen: '#e63946',
    regulars: ['Marco from the deli', 'Tiff', 'Big Steve', 'Jaz'], regularSpend: [5_000, 40_000],
  },
  {
    placeId: 'velvetRoom', tier: 2, label: 'Midtown club · bottle service',
    door: { rank: 1, cool: 15 }, cover: 2_500, show: 1.4, rep: 1.4, dropEvery: 110,
    djs: ['DJ Velvet', 'DJ Purple Rain', 'DJ Midnight Express'],
    connectChance: 0.3, screen: '#9b5de5',
    regulars: ['Rico V.', 'Natalia', 'The Twins', 'Coach K', 'Lola'], regularSpend: [70_000, 500_000],
  },
  {
    placeId: 'aurumClub', tier: 4, label: 'Members only · you’re either on the list or you’re not',
    door: { rank: 4, cool: 60 }, cover: 15_000, show: 2, rep: 2.2, dropEvery: 60,
    djs: ['DJ Aurum', 'A Grammy winner (no phones)', 'DJ Billionaire’s Row'],
    connectChance: 0.6, screen: '#ffd700',
    regulars: ['Sloane V.', 'The Prince', 'A Tech Founder', 'Mrs. Astor-Kline', 'Mr. 57th St'], regularSpend: [2_500_000, 10_000_000],
  },
  // ---- Open 24/7: after-hours, everyone's welcome.
  {
    placeId: 'skyeRooftop', tier: 1, allDay: true, label: 'Rooftop · never closes · day party, night party',
    door: { rank: 0, cool: 0 }, cover: 3_000, show: 1.5, rep: 1.3, dropEvery: 90,
    djs: ['DJ Skyline', 'DJ Golden Hour', 'DJ Seven Train'],
    connectChance: 0.3, screen: '#ff8fab',
    regulars: ['Preston W.', 'Sasha M.', 'A Knicks player', 'Valentina', 'Mr. Hudson'], regularSpend: [200_000, 1_500_000],
  },
  {
    placeId: 'warehouseRave', tier: 1, allDay: true, label: 'Warehouse · techno round the clock',
    door: { rank: 0, cool: 0 }, cover: 2_000, show: 1.3, rep: 1.2, dropEvery: 75,
    djs: ['DJ Gowanus', 'DJ No Setlist', 'DJ Sunrise Again'],
    connectChance: 0.2, screen: '#3dff6e',
    regulars: ['Kai', 'Ruby from Bushwick', 'The Raver Twins', 'Mo'], regularSpend: [20_000, 200_000],
  },
];
export const CLUB_BY_PLACE: Record<string, ClubDef> = Object.fromEntries(CLUBS.map((c) => [c.placeId, c]));

/** People worth knowing. Each has a real perk once you've met them. */
export interface ConnectionDef {
  id: string;
  name: string;
  emoji: string;
  /** Lowest club tier you can meet them at. */
  minTier: number;
  /** What knowing them does for you. */
  perk: string;
  /** What they say when you meet. */
  hello: string;
}

export const CONNECTIONS: ConnectionDef[] = [
  { id: 'promoter', name: 'Dre the Promoter', emoji: '🎟️', minTier: 1, perk: 'Gets you past any door one level above your rep', hello: '“You good people. Next time, text me and I’ll put you on the list. Any list.”' },
  { id: 'stylist', name: 'Mira, celebrity stylist', emoji: '👗', minTier: 2, perk: '+10 Cool: she fixes your fit before you walk in', hello: '“Those shoes… we’re going to fix those shoes.”' },
  { id: 'realtor', name: 'Bianca, luxury realtor', emoji: '🔑', minTier: 3, perk: 'Movers are on her when you move house', hello: '“If you ever want a view, call me. Seriously. I know every doorman.”' },
  { id: 'producer', name: 'Kai, music producer', emoji: '🎧', minTier: 3, perk: 'Music skill grows 25% faster', hello: '“You’ve got an ear. Come by the studio sometime.”' },
  { id: 'hedgeFund', name: 'Preston, hedge fund guy', emoji: '📈', minTier: 3, perk: 'A stock tip when you see him (+💼 corporate rep)', hello: '“Don’t tell anyone I told you this, but…” He tells everyone.' },
  { id: 'heir', name: 'Sloane, billionaire heir', emoji: '🛥️', minTier: 4, perk: 'Bottles 10% off anywhere (she knows the owners)', hello: '“You’re fun. Fun is rare up here.”' },
];
export const CONNECTION_BY_ID: Record<string, ConnectionDef> = Object.fromEntries(CONNECTIONS.map((c) => [c.id, c]));
