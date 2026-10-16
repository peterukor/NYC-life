// =====================================================================
// north.ts — Harlem, Hamilton Heights, Sugar Hill, Washington Heights
// and Inwood (Peter, 2026-10-16: "north still looks kinda empty, can you
// add some things north too").
//
// Real landmarks (with their official sites) plus fictional local spots
// in the spirit of the neighbourhoods: soul food, Dominican bakeries and
// chimi trucks, jazz rooms, dominoes tables, streetball, the bridges and
// the river. Darkly funny "odd" activities roll a twist when they finish
// (sim/oddities.ts), like the uptown ones in data/uptown.ts.
// =====================================================================

import type { ActionDef } from './actions.ts';
import type { RawPlace } from './places.ts';
import type { OddActivity, Twist } from './uptown.ts';

const odd = (action: Omit<ActionDef, 'tags'> & { tags?: string[] }, twists: Twist[]): OddActivity => ({ action: { ...action, tags: ['fun', 'odd', ...(action.tags ?? [])] }, twists });

/** Plain activities (food and drink): no twist, just good. */
export const NORTH_ACTIONS: ActionDef[] = [
  { id: 'soulPlate', label: 'Fried chicken plate, mac & yams', emoji: '🍗', seconds: 9, cost: 1_800, needs: { hunger: 75, fun: 12 }, tags: ['eat'] },
  { id: 'chickenWaffles', label: 'Chicken & waffles', emoji: '🧇', seconds: 8, cost: 1_600, needs: { hunger: 65, fun: 10 }, tags: ['eat'] },
  { id: 'peachCobbler', label: 'Peach cobbler', emoji: '🍑', seconds: 5, cost: 700, needs: { hunger: 20, fun: 10 }, tags: ['eat'] },
  { id: 'chimiBurger', label: 'Chimi burger with everything', emoji: '🍔', seconds: 6, cost: 800, needs: { hunger: 55, fun: 8 }, tags: ['eat'] },
  { id: 'chimiBatida', label: 'Morir soñando (OJ + milk, trust)', emoji: '🥤', seconds: 4, cost: 450, needs: { hunger: 10, fun: 8, energy: 6 }, tags: ['eat', 'drink'] },
  { id: 'pastelito', label: 'Pastelito and a cafecito', emoji: '🥟', seconds: 5, cost: 400, needs: { hunger: 25, energy: 12 }, tags: ['eat'] },
  { id: 'tresLeches', label: 'Slice of tres leches', emoji: '🍰', seconds: 5, cost: 550, needs: { hunger: 22, fun: 10 }, tags: ['eat'] },
  { id: 'mofongo', label: 'Mofongo with shrimp', emoji: '🍤', seconds: 9, cost: 1_700, needs: { hunger: 70, fun: 10 }, tags: ['eat'] },
  { id: 'jazzSet', label: 'Catch the late jazz set', emoji: '🎷', seconds: 12, cost: 1_500, needs: { fun: 30, social: 12, energy: -6 }, hours: [20, 3], tags: ['fun', 'nightlife'] },
  { id: 'hookahSesh', label: 'Hookah and bachata', emoji: '💨', seconds: 10, cost: 2_500, needs: { fun: 25, social: 20, energy: -6 }, hours: [19, 4], tags: ['nightlife', 'social'] },
  { id: 'boxingClass', label: 'Boxing class', emoji: '🥊', seconds: 12, cost: 2_000, needs: { energy: -16, hygiene: -14, fun: 12 }, skill: { key: 'fitness', gain: 0.8 }, tags: ['fitness'] },
  { id: 'bridgeView', label: 'Watch the sunset off the bridge', emoji: '🌅', seconds: 8, needs: { fun: 18, energy: 4 }, tags: ['fun'] },
];

export const NORTH_ODD: OddActivity[] = [
  odd({ id: 'amateurNight', label: 'Perform at Amateur Night', emoji: '🎤', seconds: 14, cost: 1_000, needs: { social: 20, fun: 20, energy: -8 }, hours: [19, 24], skill: { key: 'music', gain: 0.5 } }, [
    { w: 2, text: 'You KILL. The crowd stands up. A lady in the front row yells “SANG IT, BABY!” You win the $250 prize.', money: 25_000, rep: 3, mood: { label: 'Won Amateur Night', emoji: '🏆', value: 14 } },
    { w: 3, text: 'You get through one verse before the boos start. A man in a sequin suit tap-dances you off the stage with a broom. Legendary, honestly.', needs: { fun: 10 }, mood: { label: 'Swept off stage', emoji: '🧹', value: -2 } },
    { w: 2, text: 'Half the room boos, half cheers. You’re a “divisive talent” now. Two people ask for your Instagram.', rep: 1, needs: { social: 10 } },
    { w: 1, text: 'Your mic cuts out. You sing louder. The mic comes back during the high note. Windows rattle. Standing ovation.', money: 10_000, rep: 2 },
  ]),
  odd({ id: 'pickupGame', label: 'Run a pickup game', emoji: '🏀', seconds: 12, needs: { fun: 22, social: 15, energy: -14, hygiene: -10 }, skill: { key: 'fitness', gain: 0.4 } }, [
    { w: 2, text: 'You get crossed so badly your ankles file a police report. It’s on someone’s phone. It’s on everyone’s phone.', mood: { label: 'Got crossed (viral)', emoji: '🫠', value: -3 }, needs: { social: 10 } },
    { w: 2, text: 'You hit a game-winner from the logo. Nobody saw it because they were arguing about a foul. You know. That’s enough.', mood: { label: 'Silent game-winner', emoji: '🏀', value: 8 } },
    { w: 1, text: 'You dunk on a guy named Big Ray. Big Ray respects it. The whole court respects it. Your name means something on 155th now.', rep: 4, mood: { label: 'Dunked on Big Ray', emoji: '🔥', value: 12 } },
    { w: 2, text: '“Next!” — you, losing, then waiting 40 minutes for next. Classic uptown afternoon.', needs: { energy: 6 } },
  ]),
  odd({ id: 'dominoes', label: 'Slap down at the dominoes table', emoji: '🁫', seconds: 10, cost: 500, needs: { social: 22, fun: 16 }, skill: { key: 'streetSmarts', gain: 0.3 } }, [
    { w: 2, text: 'You slam the last bone so hard the table jumps. “CAPICÚ!” The old men look at each other. You win $30 and a nod. The nod is worth more.', money: 3_000, rep: 2 },
    { w: 2, text: 'Don Rafa counts the pips in his head faster than your phone could. You lose $5 and a lot of confidence.', money: -500, needs: { fun: -4 } },
    { w: 2, text: 'Nobody explains the rules. You play anyway. You somehow win. Nobody explains why. You leave before they work it out.', money: 1_500 },
    { w: 1, text: 'A three-hour argument breaks out about a game from 1998. You’re now a witness. You weren’t born.', needs: { social: 14 } },
  ]),
  odd({ id: 'jazzSitIn', label: 'Ask to sit in with the band', emoji: '🎺', seconds: 10, needs: { fun: 18 }, hours: [20, 3], requires: { skill: 'music', level: 2 }, skill: { key: 'music', gain: 0.6 } }, [
    { w: 2, text: 'You take a solo. The drummer smiles. That never happens. That NEVER happens. Someone buys you a drink.', rep: 2, mood: { label: 'The drummer smiled', emoji: '🥁', value: 12 } },
    { w: 2, text: 'You come in two bars early. The bandleader just… looks at you. You will feel that look for the rest of your life.', mood: { label: 'The Look', emoji: '😶', value: -3 } },
    { w: 1, text: 'The band leaves you alone on stage “for a minute”. It is nine minutes. You invent a new genre out of fear.', needs: { fun: 10, social: 10 } },
  ]),
  odd({ id: 'grantsTombQuiz', label: 'Answer “Who’s buried in Grant’s Tomb?”', emoji: '🏛️', seconds: 6, needs: { fun: 10 } }, [
    { w: 2, text: 'You say “Grant.” The ranger says “Technically, nobody: they’re entombed above ground.” You’ve been had by a 100-year-old joke.', needs: { fun: 8 } },
    { w: 1, text: 'You say “Grant AND his wife Julia.” The ranger, moved, gives you a souvenir pencil. You will treasure it.', mood: { label: 'Won a pencil', emoji: '✏️', value: 6 } },
    { w: 1, text: 'You say “Ulysses S. Grant’s tomb is in… Ohio?” A tour group gasps. The ranger needs a minute.', needs: { social: 6 } },
  ]),
  odd({ id: 'sneakIntoLecture', label: 'Sneak into a grad lecture', emoji: '🎓', seconds: 12, needs: { fun: 12, energy: -4 }, skill: { key: 'coding', gain: 0.2 } }, [
    { w: 2, text: 'Three hours on “post-structuralist readings of the 6 train”. You understood one word. It was “train”. Still: free education.', needs: { fun: -2 }, mood: { label: 'Basically has a degree', emoji: '🎓', value: 5 } },
    { w: 1, text: 'The professor calls on you. You say “the system.” She says “Exactly.” The class writes it down. You are now cited.', rep: 1, mood: { label: 'Got cited', emoji: '📚', value: 8 } },
    { w: 1, text: 'You fall asleep. You wake up and it’s a different class. Organic chemistry. You’re in too deep. You stay.', needs: { energy: 20 } },
  ]),
  odd({ id: 'laundromatDrama', label: 'Do laundry and watch the drama', emoji: '🧺', seconds: 10, cost: 600, needs: { hygiene: 25, fun: 10 } }, [
    { w: 2, text: 'Someone took your clothes out of the dryer and folded them. Better than you would’ve. You feel attacked and loved.', mood: { label: 'Folded by a stranger', emoji: '🧺', value: 5 } },
    { w: 2, text: 'The TV is playing a telenovela. Nobody here speaks during the twist. You don’t speak Spanish. You gasp anyway.', needs: { fun: 12, social: 6 } },
    { w: 1, text: 'One sock is missing. It’s always one sock. There’s a box by the door labelled “Socks of 2019”. You find yours. It’s 2026.', needs: { fun: 8 } },
    { w: 1, text: 'You find $10 in a dryer. Finders keepers is technically a law in laundromats. Probably.', money: 1_000 },
  ]),
  odd({ id: 'muralWalk', label: 'Walk the murals of El Barrio', emoji: '🎨', seconds: 10, needs: { fun: 18, energy: -4 }, skill: { key: 'charisma', gain: 0.2 } }, [
    { w: 2, text: 'An artist on a ladder asks you to hold the paint. Two hours later you’ve painted a pigeon. It’s on the wall forever now.', mood: { label: 'My pigeon is on a wall', emoji: '🐦', value: 10 } },
    { w: 2, text: 'A grandma gives you the full history of the block, including who owes who money since 1983. You’re in the loop now.', needs: { social: 16 } },
    { w: 1, text: 'You take one photo. It goes semi-viral with a caption you didn’t write. You get 400 likes and one marriage proposal.', rep: 1, needs: { social: 8 } },
  ]),
  odd({ id: 'kayakRiver', label: 'Paddle where the rivers meet', emoji: '🛶', seconds: 14, cost: 1_500, needs: { fun: 22, energy: -14 }, skill: { key: 'fitness', gain: 0.5 } }, [
    { w: 2, text: 'The current at Spuyten Duyvil (Dutch for “spitting devil”, which is a warning) spins you three times. You arrive somewhere. Possibly the Bronx.', needs: { fun: 10 } },
    { w: 2, text: 'A heron lands on your kayak and stares at you. You stay very still for ten minutes. You have never been more at peace.', mood: { label: 'Approved by a heron', emoji: '🪶', value: 10 } },
    { w: 1, text: 'You flip over. The water is “refreshing”. The instructor says “everyone does it once.” Everyone was not filming.', needs: { hygiene: -10, fun: 8 } },
  ]),
  odd({ id: 'blowout', label: 'Get a blowout (and the gossip)', emoji: '💇', seconds: 14, cost: 3_500, needs: { hygiene: 20, social: 22, fun: 10 } }, [
    { w: 2, text: 'Three hours, one blowout, and you now know who’s dating who on every block from 160th to Dyckman. The hair looks amazing too.', mood: { label: 'Fresh blowout', emoji: '💇', value: 12 }, needs: { social: 10 } },
    { w: 2, text: '“We’re running a little behind.” It’s been two hours. You’ve watched a whole novela season. You’re invested now.', needs: { energy: -6, fun: 8 } },
    { w: 1, text: 'Your stylist reads your entire life from your split ends. She’s right about all of it. You tip 40%.', money: -1_000, mood: { label: 'Seen by a stylist', emoji: '🔮', value: 8 } },
  ]),
  odd({ id: 'bridgeWalk', label: 'Walk across the GW Bridge', emoji: '🌉', seconds: 14, needs: { fun: 16, energy: -10 }, skill: { key: 'fitness', gain: 0.3 } }, [
    { w: 2, text: 'Halfway, the wind takes your hat to New Jersey. It’s living its best life now. You walk back hatless and free.', needs: { fun: 8 } },
    { w: 2, text: 'A cyclist yells “ON YOUR LEFT” from so far away you don’t know which left he means. You both survive. Barely.', needs: { energy: -4 } },
    { w: 1, text: 'You reach New Jersey. You look around. You turn straight back. Nobody blames you.', mood: { label: 'Touched New Jersey', emoji: '🗺️', value: 4 } },
  ]),
  odd({ id: 'marketHaggle', label: 'Haggle at La Marqueta', emoji: '🛒', seconds: 8, cost: 800, needs: { hunger: 20, social: 14 } }, [
    { w: 2, text: 'You haggle the mango guy from $3 to $2.50. He gives you a second mango “for the effort”. You’ve never felt so respected.', money: 300, mood: { label: 'Won a haggle', emoji: '🥭', value: 6 } },
    { w: 2, text: 'You try to haggle. The lady laughs, kindly, for a long time. You pay full price. You also get a free sample of her empanada.', needs: { hunger: 12 } },
    { w: 1, text: 'You walk out with plantains, a hand-carved spoon, a saint candle and no memory of agreeing to any of it.', money: -500, needs: { fun: 10 } },
  ]),
];

/** The places (all Manhattan, north of about 110th St). */
export const NORTH_PLACES: RawPlace[] = [
  // ---------- Harlem ----------
  {
    id: 'apollyon', area: 'manhattan', name: 'The Apollyon Theater', emoji: '🎭', type: 'nightlife',
    blurb: 'Famous stage, tougher crowd. Wednesday is Amateur Night: they cheer like church and boo like a stadium.',
    at: [40.8100, -73.9500], hours: [18, 24], interior: 'none', color: '#c1121f',
    actions: ['amateurNight'],
  },
  {
    id: 'sugarSyrup', area: 'manhattan', name: 'Sugar & Syrup', emoji: '🧇', type: 'food',
    blurb: 'Chicken and waffles since your parents were dating. The syrup is hot sauce. The hot sauce is also syrup. Don’t ask.',
    at: [40.8148, -73.9435], hours: [8, 23], interior: 'pizza', color: '#bc6c25',
    actions: ['chickenWaffles', 'peachCobbler'],
  },
  {
    id: 'lenoxLounge', area: 'manhattan', name: 'Lenox Lounge Revival', emoji: '🎷', type: 'nightlife',
    blurb: 'Red booths, low light, a house band that has played every night since forever. Ask nicely and they might let you sit in.',
    at: [40.8083, -73.9440], hours: [18, 4], interior: 'bar', color: '#9d0208',
    actions: ['jazzSet', 'happyHour', 'jazzSitIn'],
  },
  {
    id: 'marcusDrums', area: 'manhattan', name: 'Marcus Garvey Park Drum Circle', emoji: '🥁', type: 'park',
    blurb: 'Every Saturday for fifty years: drums on the hill. You can join in if you keep time. Nobody minds if you don’t, much.',
    at: [40.8044, -73.9445], interior: 'none', color: '#2d6a4f',
    actions: ['busk', 'picnic', 'peopleWatch', 'jog'],
  },
  {
    id: 'unoKicks', area: 'manhattan', name: 'Uptown Kicks on 125th', emoji: '👟', type: 'shop',
    blurb: 'Sneakers, fitted caps and the strongest opinions on 125th Street. The guy behind the counter remembers your shoe size forever.',
    at: [40.8093, -73.9480], hours: [10, 21], interior: 'none', color: '#ff7f11',
    actions: ['windowShop'], sells: ['plain', 'premium'],
  },
  {
    id: 'grantsTomb', area: 'manhattan', name: 'General Grant National Memorial', emoji: '🏛️', type: 'landmark',
    blurb: 'The biggest mausoleum in North America, over the Hudson. Ask the old joke. The rangers have heard it. They love it anyway.',
    at: [40.8133, -73.9631], interior: 'none', color: '#d6d3cb',
    actions: ['grantsTombQuiz', 'peopleWatch'],
    landmark: { description: 'The tomb of President Ulysses S. Grant and his wife Julia, finished in 1897 in Riverside Park, run by the National Park Service.', officialSite: 'https://www.nps.gov/gegr/', siteLabel: 'nps.gov' },
  },
  {
    id: 'gradLibrary', area: 'manhattan', name: 'Morningside Grad Library', emoji: '📚', type: 'fun',
    blurb: 'Big columns, bigger student debt. If you walk in like you belong, nobody checks. Probably.',
    at: [40.8075, -73.9626], hours: [8, 23], interior: 'none', color: '#1d3a8a',
    actions: ['sneakIntoLecture'],
  },
  {
    id: 'spinCity', area: 'manhattan', name: 'Spin City Laundromat', emoji: '🧺', type: 'fun',
    blurb: 'Twenty dryers, one working change machine and the best soap opera on Amsterdam Avenue (on the TV and off it).',
    at: [40.8213, -73.9493], hours: [6, 23], interior: 'none', color: '#3a86ff',
    actions: ['laundromatDrama'],
  },
  {
    id: 'stNicks', area: 'manhattan', name: 'Saint Nicholas Pub', emoji: '🎺', type: 'nightlife',
    blurb: 'A tiny Sugar Hill bar with a jam session on Mondays. The trumpet player is 84 and could still beat you up.',
    at: [40.8240, -73.9441], hours: [16, 3], interior: 'bar', color: '#6a040f',
    actions: ['happyHour', 'karaoke', 'jazzSitIn'],
  },
  {
    id: 'dominoTable', area: 'manhattan', name: 'Sugar Hill Dominoes Table', emoji: '🁫', type: 'fun',
    blurb: 'A folding table, four milk crates and the most serious game on the block. Bring cash. Bring humility.',
    at: [40.8270, -73.9430], hours: [10, 23], interior: 'none', color: '#023047',
    actions: ['dominoes'],
  },
  // ---------- East Harlem ----------
  {
    id: 'muralWalk', area: 'manhattan', name: 'El Barrio Mural Walk', emoji: '🎨', type: 'fun',
    blurb: 'Block after block of murals: heroes, history, a giant coquí. Someone is always painting a new one.',
    at: [40.7952, -73.9418], interior: 'none', color: '#e76f51',
    actions: ['muralWalk'],
  },
  {
    id: 'laMarqueta', area: 'manhattan', name: 'La Marqueta Market', emoji: '🛒', type: 'shop',
    blurb: 'Under the Park Avenue tracks: mangoes, cuchifritos, live music on weekends. Haggling is a sport here.',
    at: [40.7981, -73.9440], hours: [8, 19], interior: 'none', color: '#f4a261',
    actions: ['marketHaggle', 'mofongo'],
  },
  // ---------- Hamilton Heights / Washington Heights ----------
  {
    id: 'ruckerPark', area: 'manhattan', name: 'Rucker Park', emoji: '🏀', type: 'park',
    blurb: 'The most famous outdoor court in the world. Legends played here. Today it’s you, a guy named Big Ray and a lot of opinions.',
    at: [40.8297, -73.9363], hours: [6, 23], interior: 'none', color: '#ff7f11',
    actions: ['pickupGame', 'peopleWatch'],
  },
  {
    id: 'heightsBoxing', area: 'manhattan', name: 'Uptown Boxing Club', emoji: '🥊', type: 'fitness',
    blurb: 'Third floor, no elevator, no air conditioning, three world champions on the wall. The coach yells in two languages.',
    at: [40.8348, -73.9447], hours: [6, 22], interior: 'gym', color: '#c1121f',
    actions: ['boxingClass', 'gymSession', 'gymShower'],
  },
  {
    id: 'panaderia', area: 'manhattan', name: 'Panadería Doña Rosa', emoji: '🥐', type: 'cafe',
    blurb: 'Dominican bakery: pastelitos, tres leches, cafecito strong enough to see through time. Doña Rosa calls you “mi amor”.',
    at: [40.8445, -73.9395], hours: [6, 21], interior: 'cafe', color: '#e9c46a',
    actions: ['pastelito', 'tresLeches', 'latte'],
  },
  {
    id: 'heightsBodega', area: 'manhattan', name: 'Broadway Deli & Grocery (181st)', emoji: '🏪', type: 'food',
    blurb: 'Open 24/7, run by three brothers who never all sleep at once. The cat is named Presidente.',
    at: [40.8505, -73.9370], interior: 'bodega', color: '#2a9d8f',
    actions: ['baconEggCheese', 'choppedCheese', 'bodegaCoffee', 'petBodegaCat', 'lottoTicket', 'gistWithOwner'],
  },
  {
    id: 'blowoutSalon', area: 'manhattan', name: 'Blowout Bar Dominicana', emoji: '💇', type: 'fun',
    blurb: 'The best blowouts in the city and the best information network in the hemisphere. Book ahead. Then wait anyway.',
    at: [40.8478, -73.9352], hours: [8, 20], interior: 'none', color: '#ff4fa3',
    actions: ['blowout'],
  },
  {
    id: 'littleRedLighthouse', area: 'manhattan', name: 'Little Red Lighthouse', emoji: '🗼', type: 'landmark',
    blurb: 'A tiny red lighthouse under the great grey bridge. It has its own children’s book. It’s doing fine.',
    at: [40.8501, -73.9469], interior: 'none', color: '#d00000',
    actions: ['bridgeView', 'peopleWatch'],
    landmark: { description: 'Jeffrey’s Hook Lighthouse (1921), the little red lighthouse under the George Washington Bridge in Fort Washington Park.', officialSite: 'https://www.nycgovparks.org/parks/fort-washington-park', siteLabel: 'nycgovparks.org' },
  },
  {
    id: 'gwBridge', area: 'manhattan', name: 'GW Bridge Walkway', emoji: '🌉', type: 'plaza',
    blurb: 'The world’s busiest bridge, and a walkway with a view of everything. Windy. Very windy. Hold your hat.',
    at: [40.8517, -73.9518], interior: 'none', color: '#6c757d',
    actions: ['bridgeWalk', 'bridgeView'],
  },
  {
    id: 'highBridge', area: 'manhattan', name: 'The High Bridge', emoji: '🌉', type: 'landmark',
    blurb: 'New York’s oldest standing bridge (1848), now just for walking and biking, high over the Harlem River.',
    at: [40.8423, -73.9312], interior: 'none', color: '#8d99ae',
    actions: ['bridgeView', 'jog'],
    landmark: { description: 'Built as part of the Croton Aqueduct, the High Bridge is the oldest standing bridge in New York City, reopened to people in 2015.', officialSite: 'https://www.nycgovparks.org/parks/highbridge-park', siteLabel: 'nycgovparks.org' },
  },
  // ---------- Inwood / Fort Tryon ----------
  {
    id: 'cloisters', area: 'manhattan', name: 'The Met Cloisters', emoji: '🏰', type: 'landmark',
    blurb: 'A medieval monastery, rebuilt stone by stone on a hill in Manhattan. Unicorn tapestries. Very calm. Suspiciously calm.',
    at: [40.8649, -73.9319], hours: [10, 17], interior: 'none', color: '#6b4423',
    actions: ['peopleWatch', 'picnic'],
    landmark: { description: 'The Metropolitan Museum of Art’s branch for medieval art and architecture, in Fort Tryon Park, home of the Unicorn Tapestries.', officialSite: 'https://www.metmuseum.org/plan-your-visit/met-cloisters', siteLabel: 'metmuseum.org' },
  },
  {
    id: 'dyckmanHookah', area: 'manhattan', name: 'Dyckman Nights Hookah Lounge', emoji: '💨', type: 'nightlife',
    blurb: 'Neon, bachata, a DJ who only stops for birthdays (there are six birthdays a night). Dyckman Street on a Friday is a whole festival.',
    at: [40.8656, -73.9262], hours: [19, 4], interior: 'bar', color: '#7209b7',
    actions: ['hookahSesh', 'happyHour', 'karaoke'],
  },
  {
    id: 'canoeClub', area: 'manhattan', name: 'Inwood Canoe Club Dock', emoji: '🛶', type: 'fun',
    blurb: 'The oldest canoe club in the city, at the top of the island where two rivers fight. Free paddles for the brave.',
    at: [40.8700, -73.9195], hours: [8, 19], interior: 'none', color: '#219ebc',
    actions: ['kayakRiver'],
  },
  {
    id: 'mofongoSpot', area: 'manhattan', name: 'Mofongo King', emoji: '🍤', type: 'food',
    blurb: 'Garlic you can smell from the 1 train. Mofongo the size of your head. Merengue loud enough to dance through the wait.',
    at: [40.8680, -73.9215], hours: [11, 2], interior: 'pizza', color: '#e63946',
    actions: ['mofongo', 'chimiBatida'],
  },
];
