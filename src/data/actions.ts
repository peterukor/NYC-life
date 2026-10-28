// =====================================================================
// actions.ts — every activity a player can do, in one list.
//
// An action takes a few REAL seconds (like Lagos Life), costs some money
// (or pays some), and changes needs, skills and mood. Places and home
// objects list which action ids they offer.
//
// Fields:
//   seconds  how long it takes in real time
//   cost     price in cents (paid when you start)
//   pay      money earned in cents, or a function of your skills
//   needs    need changes applied when it finishes
//   skill    which skill it trains and how fast (points per use)
//   requires minimum skill level to unlock it
//   moodlet  optional temporary mood effect
//   tags     used by goals, missions and events (e.g. 'eat', 'nightlife')
// =====================================================================

import type { GameState, NeedKey, SkillKey } from '../sim/types.ts';
import { mealActions } from './groceries.ts';
import { ODD_ACTIVITIES } from './uptown.ts';
import { NORTH_ACTIONS } from './north.ts';

export interface ActionDef {
  id: string;
  label: string;
  emoji: string;
  seconds: number;
  cost?: number;
  pay?: number | ((s: GameState) => number);
  needs?: Partial<Record<NeedKey, number>>;
  skill?: { key: SkillKey; gain: number };
  requires?: { skill: SkillKey; level: number };
  moodlet?: { id: string; label: string; emoji: string; value: number; minutes: number };
  /** Only available between these New York hours (e.g. [22, 4] wraps past midnight). */
  hours?: [number, number];
  /** Only for players on this life path (data/paths.ts), from this level. */
  path?: { id: string; minLevel: number };
  /** Chance (0–1) this goes wrong and you get caught (sim/paths.ts handles it). */
  risk?: number;
  tags: string[];
}

const lvl = (s: GameState, k: SkillKey) => Math.floor(s.skills[k]);

const LIST: ActionDef[] = [
  // ---------- Home objects ----------
  { id: 'sleep', label: 'Sleep it off', emoji: '😴', seconds: 18, needs: { energy: 70, hunger: -6, bladder: -10 }, tags: ['rest'] },
  { id: 'nap', label: 'Power nap', emoji: '💤', seconds: 8, needs: { energy: 25 }, tags: ['rest'] },
  { id: 'snack', label: 'Grab a snack', emoji: '🥪', seconds: 4, needs: { hunger: 22 }, tags: ['eat'] },
  { id: 'cookPasta', label: 'Cook pasta', emoji: '🍝', seconds: 12, needs: { hunger: 55, fun: 4 }, skill: { key: 'cooking', gain: 0.6 }, tags: ['eat', 'cook'] },
  { id: 'cookFancy', label: 'Cook a date-night dinner', emoji: '🥘', seconds: 16, needs: { hunger: 70, fun: 10 }, skill: { key: 'cooking', gain: 0.9 }, requires: { skill: 'cooking', level: 2 }, tags: ['eat', 'cook'] },
  { id: 'shower', label: 'Take a shower', emoji: '🚿', seconds: 7, needs: { hygiene: 75, energy: 4 }, tags: ['bathe'] },
  { id: 'toilet', label: 'Use the toilet', emoji: '🚽', seconds: 4, needs: { bladder: 100 }, tags: ['toilet'] },
  { id: 'watchTv', label: 'Watch TV', emoji: '📺', seconds: 10, needs: { fun: 22, energy: -2 }, tags: ['fun', 'tv'] },
  { id: 'gameConsole', label: 'Play video games', emoji: '🎮', seconds: 12, needs: { fun: 30, social: 4, energy: -4 }, tags: ['fun'] },
  { id: 'codePractice', label: 'Practice coding', emoji: '💻', seconds: 14, needs: { fun: -6, energy: -4 }, skill: { key: 'coding', gain: 0.8 }, tags: ['skill'] },
  { id: 'freelance', label: 'Freelance gig', emoji: '💸', seconds: 20, needs: { energy: -8, fun: -4 }, pay: (s) => Math.round(((4_500 + 2_200 * lvl(s, 'coding')) * (s.job?.careerId === 'tech' ? 1.3 + 0.05 * s.job.level : 1)) / 25) * 25, requires: { skill: 'coding', level: 2 }, skill: { key: 'coding', gain: 0.3 }, tags: ['earn', 'gig'] },
  { id: 'sellOnline', label: 'Flip sneakers online', emoji: '👟', seconds: 12, needs: { fun: 6 }, pay: (s) => 1_200 + 900 * lvl(s, 'hustle'), skill: { key: 'hustle', gain: 0.5 }, tags: ['earn', 'gig'] },
  { id: 'doomscroll', label: 'Scroll NYC Twitter', emoji: '📱', seconds: 6, needs: { fun: 10, social: 6, energy: -2 }, tags: ['online'] },
  { id: 'callMom', label: 'Call your mom', emoji: '📞', seconds: 8, needs: { social: 30, fun: 4 }, moodlet: { id: 'momCall', label: 'Mom says she’s proud', emoji: '🥹', value: 10, minutes: 90 }, tags: ['social'] },
  { id: 'guitar', label: 'Play guitar', emoji: '🎸', seconds: 12, needs: { fun: 18 }, skill: { key: 'music', gain: 0.7 }, tags: ['skill'] },
  // Home living conditions (2026-10-13): roommates, a washer, a chef, a tub, a piano.
  { id: 'chatRoommate', label: 'Chat for a bit', emoji: '💬', seconds: 6, needs: { social: 22, fun: 6 }, tags: ['social'] },
  { id: 'laundry', label: 'Do laundry', emoji: '🧺', seconds: 8, needs: { hygiene: 15, fun: -2 }, tags: ['chore'] },
  { id: 'chefMeal', label: 'Chef’s tasting menu', emoji: '🍽️', seconds: 10, needs: { hunger: 80, fun: 12 }, tags: ['eat'] },
  { id: 'soak', label: 'Long soak in the tub', emoji: '🛁', seconds: 10, needs: { hygiene: 85, energy: 8, fun: 8 }, tags: ['bathe'] },
  { id: 'playPiano', label: 'Play the piano', emoji: '🎹', seconds: 12, needs: { fun: 20 }, skill: { key: 'music', gain: 0.8 }, tags: ['skill'] },
  { id: 'workout', label: 'Home workout', emoji: '🏋️', seconds: 12, needs: { energy: -14, hygiene: -14, fun: 4 }, skill: { key: 'fitness', gain: 0.7 }, tags: ['fitness'] },

  // ---------- Workplaces (2026-10-13): things to do at each job's own room ----------
  { id: 'jukeboxSong', label: 'Pick a song on the jukebox', emoji: '🎵', seconds: 4, cost: 100, needs: { fun: 12 }, tags: ['fun'] },
  { id: 'poolGame', label: 'Shoot some pool', emoji: '🎱', seconds: 10, needs: { fun: 18, social: 8 }, tags: ['fun', 'social'] },
  { id: 'treadmill', label: 'Run on the treadmill', emoji: '🏃', seconds: 10, needs: { energy: -10, hygiene: -8, fun: 4 }, skill: { key: 'fitness', gain: 0.6 }, tags: ['fitness'] },
  { id: 'benchPress', label: 'Bench press', emoji: '🏋️', seconds: 10, needs: { energy: -12, hygiene: -6 }, skill: { key: 'fitness', gain: 0.7 }, tags: ['fitness'] },
  { id: 'punchBag', label: 'Hit the heavy bag', emoji: '🥊', seconds: 8, needs: { energy: -8, fun: 10 }, skill: { key: 'fitness', gain: 0.5 }, tags: ['fitness'] },
  { id: 'yoga', label: 'Stretch on a mat', emoji: '🧘', seconds: 8, needs: { fun: 8, energy: 4 }, skill: { key: 'fitness', gain: 0.25 }, tags: ['fitness'] },
  { id: 'pingPong', label: 'Play ping-pong', emoji: '🏓', seconds: 8, needs: { fun: 18, social: 10 }, tags: ['fun', 'social'] },
  { id: 'officeSnack', label: 'Grab a free snack', emoji: '🍫', seconds: 3, needs: { hunger: 22 }, tags: ['eat'] },
  { id: 'beanbagNap', label: 'Nap on a beanbag', emoji: '😴', seconds: 8, needs: { energy: 14 }, tags: ['rest'] },
  { id: 'espresso', label: 'Pull an espresso', emoji: '☕', seconds: 3, needs: { energy: 18 }, tags: ['drink'] },
  { id: 'rubBull', label: 'Rub the bull for luck', emoji: '🐂', seconds: 3, needs: { fun: 4 }, moodlet: { id: 'bullLuck', label: 'Rubbed the bull', emoji: '🐂', value: 5, minutes: 120 }, tags: ['fun'] },
  { id: 'djRequest', label: 'Request a song', emoji: '🎧', seconds: 4, needs: { fun: 10 }, tags: ['fun'] },
  { id: 'vipBottle', label: 'Order bottle service', emoji: '🍾', seconds: 10, cost: 30_000, needs: { fun: 35, social: 25 }, moodlet: { id: 'vip', label: 'VIP section', emoji: '🍾', value: 10, minutes: 120 }, tags: ['nightlife', 'social'] },
  { id: 'precinctCoffee', label: 'Drink the precinct coffee', emoji: '☕', seconds: 3, needs: { energy: 10, fun: -3 }, tags: ['drink'] },
  { id: 'lockerChange', label: 'Change at your locker', emoji: '👕', seconds: 4, needs: { hygiene: 6 }, tags: ['chore'] },
  // Visitor services: the game opens a screen for these (game.ts → SERVICE_ACTIONS).
  { id: 'fixPhone', label: 'Fix or replace your phone', emoji: '📱', seconds: 6, tags: ['service'] },
  { id: 'investNow', label: 'Invest with an advisor', emoji: '💼', seconds: 2, tags: ['service'] },
  { id: 'tradeStocks', label: 'Trade stocks', emoji: '📈', seconds: 2, tags: ['service'] },
  { id: 'reportCrime', label: 'Report someone', emoji: '📝', seconds: 6, tags: ['service'] },
  { id: 'bottleService', label: 'Bottle service', emoji: '🍾', seconds: 2, tags: ['service'] },
  { id: 'dateHere', label: 'Invite someone on a date here', emoji: '💘', seconds: 2, tags: ['service'] },
  // Entertainment (Peter, 2026-10-14): each opens its own game or screen.
  { id: 'getSection', label: 'Your VIP section', emoji: '🛋️', seconds: 2, tags: ['service'] },
  { id: 'mingle', label: 'Mingle', emoji: '🍸', seconds: 2, tags: ['service', 'social'] },
  // Milestones from the playable stuff (fights, art, chess…): never buttons,
  // they only count for life paths (data/paths.ts → Fighter, Artist, Game Shark).
  { id: 'fightWon', label: 'Won a fight', emoji: '🥊', seconds: 0, tags: ['milestone'] },
  { id: 'chaseEscaped', label: 'Outran the cops', emoji: '💨', seconds: 0, tags: ['milestone'] },
  { id: 'paintHung', label: 'Hung a painting', emoji: '🎨', seconds: 0, tags: ['milestone'] },
  { id: 'artMilestone', label: 'A painting hit a like milestone', emoji: '❤️', seconds: 0, tags: ['milestone'] },
  { id: 'artSold', label: 'Sold a painting', emoji: '💰', seconds: 0, tags: ['milestone'] },
  { id: 'chessWin', label: 'Won at chess', emoji: '♟️', seconds: 0, tags: ['milestone'] },
  { id: 'arcadeGame', label: 'Played a game', emoji: '🕹️', seconds: 0, tags: ['milestone'] },
  { id: 'raceWin', label: 'Won the bike loop', emoji: '🚴', seconds: 0, tags: ['milestone'] },
  { id: 'fishLanded', label: 'Landed a fish', emoji: '🎣', seconds: 0, tags: ['milestone'] },
  { id: 'derbyWin', label: 'Won the fishing derby', emoji: '🏆', seconds: 0, tags: ['milestone'] },
  { id: 'playChess', label: 'Play chess (pick an opponent and a bet)', emoji: '♟️', seconds: 2, tags: ['service', 'fun'] },
  { id: 'paintArt', label: 'Paint something', emoji: '🖌️', seconds: 2, tags: ['service', 'fun'] },
  { id: 'viewGallery', label: 'The gallery wall', emoji: '🖼️', seconds: 2, tags: ['service', 'fun'] },
  { id: 'goFishing', label: 'Go fishing', emoji: '🎣', seconds: 2, tags: ['service', 'fun'] },
  { id: 'fishDerby', label: 'The morning derby', emoji: '🏆', seconds: 2, tags: ['service', 'fun'] },
  { id: 'bikeRace', label: 'Race the loop ($5 bike)', emoji: '🚴', seconds: 2, tags: ['service', 'fun', 'fitness'] },
  { id: 'playSlots', label: 'Play the slots', emoji: '🎰', seconds: 2, tags: ['service'] },
  { id: 'playBlackjack', label: 'Play blackjack', emoji: '🃏', seconds: 2, tags: ['service'] },
  { id: 'playRoulette', label: 'Play roulette', emoji: '🎡', seconds: 2, tags: ['service'] },
  { id: 'playRocket', label: 'Ride the Rocket', emoji: '🚀', seconds: 2, tags: ['service'] },
  { id: 'casinoCashier', label: 'Cashier: how am I doing?', emoji: '💵', seconds: 2, tags: ['service'] },
  { id: 'playSnake', label: 'Play Subway Snake', emoji: '🐍', seconds: 2, tags: ['service'] },
  { id: 'playHoops', label: 'Play Hoop Shot', emoji: '🏀', seconds: 2, tags: ['service'] },
  { id: 'playPigeons', label: 'Play Pigeon Pop', emoji: '🐦', seconds: 2, tags: ['service'] },
  { id: 'playBeats', label: 'Play Beat Street', emoji: '🎵', seconds: 2, tags: ['service'] },
  { id: 'playStack', label: 'Play Bodega Stack', emoji: '🥪', seconds: 2, tags: ['service'] },
  { id: 'playDash', label: 'Play Delivery Dash', emoji: '🛵', seconds: 2, tags: ['service'] },
  { id: 'playClaw', label: 'Try the claw machine', emoji: '🧸', seconds: 2, tags: ['service'] },
  // More cabinets and tables (2026-10-27).
  { id: 'playPinball', label: 'Play Liberty Pinball', emoji: '🗽', seconds: 2, tags: ['service'] },
  { id: 'playSkeeball', label: 'Play Coney Skee-Ball', emoji: '🎳', seconds: 2, tags: ['service'] },
  { id: 'playBreakout', label: 'Play Brooklyn Breakout', emoji: '🧱', seconds: 2, tags: ['service'] },
  { id: 'playRooftop', label: 'Play Rooftop Jump', emoji: '🏙️', seconds: 2, tags: ['service'] },
  { id: 'playAirhockey', label: 'Play air hockey', emoji: '🏒', seconds: 2, tags: ['service'] },
  { id: 'playAxe', label: 'Axe throwing', emoji: '🪓', seconds: 2, tags: ['service'] },
  { id: 'playPoker', label: 'Sit down at poker', emoji: '♠️', seconds: 2, tags: ['service'] },
  { id: 'playCraps', label: 'Roll at the craps table', emoji: '🎲', seconds: 2, tags: ['service'] },
  { id: 'playBaccarat', label: 'Play baccarat', emoji: '🂡', seconds: 2, tags: ['service'] },
  { id: 'playBigSix', label: 'Spin the Big Six wheel', emoji: '🎡', seconds: 2, tags: ['service'] },
  { id: 'playPlinko', label: 'Drop a Plinko ball', emoji: '🔻', seconds: 2, tags: ['service'] },
  { id: 'playScratch', label: 'Buy a scratch card', emoji: '🎫', seconds: 2, tags: ['service'] },
  { id: 'playKeno', label: 'Play keno', emoji: '🔢', seconds: 2, tags: ['service'] },
  { id: 'playVideoPoker', label: 'Play video poker', emoji: '🃏', seconds: 2, tags: ['service'] },
  { id: 'playPool', label: 'Play pool (8-ball or 9-ball)', emoji: '🎱', seconds: 2, tags: ['service'] },
  { id: 'prizeCounter', label: 'Prize counter', emoji: '🎟️', seconds: 2, tags: ['service'] },
  { id: 'sportsbook', label: 'Bet on a game', emoji: '🏟️', seconds: 2, tags: ['service'] },
  { id: 'trainHard', label: 'Train hard (mini-game)', emoji: '💪', seconds: 2, tags: ['service'] },

  // ---------- Park and arcade (2026-10-14) ----------
  { id: 'chillBench', label: 'Chill on a bench', emoji: '🪑', seconds: 10, needs: { energy: 8, fun: 12 }, moodlet: { id: 'chill', label: 'Took it easy', emoji: '😌', value: 5, minutes: 90 }, tags: ['relax'] },
  { id: 'lieOnGrass', label: 'Lie on the grass', emoji: '🌤️', seconds: 12, needs: { energy: 12, fun: 8, hygiene: -3 }, tags: ['relax'] },
  { id: 'feedDucks', label: 'Feed the ducks', emoji: '🦆', seconds: 8, cost: 100, needs: { fun: 15, social: 4 }, moodlet: { id: 'ducks', label: 'The ducks love you', emoji: '🦆', value: 4, minutes: 90 }, tags: ['fun'] },
  { id: 'iceCream', label: 'Ice cream cone', emoji: '🍦', seconds: 6, cost: 450, needs: { hunger: 12, fun: 10 }, tags: ['eat'] },
  { id: 'frisbee', label: 'Toss a frisbee', emoji: '🥏', seconds: 10, needs: { fun: 18, social: 8, energy: -6 }, skill: { key: 'fitness', gain: 0.3 }, tags: ['fun', 'fitness'] },
  { id: 'fountainWish', label: 'Toss a coin and make a wish', emoji: '🪙', seconds: 4, cost: 25, moodlet: { id: 'wish', label: 'Made a wish', emoji: '🌠', value: 3, minutes: 120 }, tags: ['fun'] },
  { id: 'airHockey', label: 'Air hockey with a stranger', emoji: '🏒', seconds: 8, cost: 200, needs: { fun: 16, social: 6 }, tags: ['fun'] },

  // ---------- Bodega ----------
  { id: 'baconEggCheese', label: 'Bacon, egg & cheese', emoji: '🥯', seconds: 6, cost: 650, needs: { hunger: 45, fun: 6 }, tags: ['eat'] },
  { id: 'choppedCheese', label: 'Chopped cheese', emoji: '🥪', seconds: 7, cost: 900, needs: { hunger: 55, fun: 6 }, tags: ['eat'] },
  { id: 'bodegaCoffee', label: 'Bodega coffee', emoji: '☕', seconds: 3, cost: 175, needs: { energy: 12 }, tags: ['drink'] },
  { id: 'petBodegaCat', label: 'Pet the bodega cat', emoji: '🐈', seconds: 5, needs: { fun: 14, social: 4 }, moodlet: { id: 'bodegaCat', label: 'Bodega cat approved', emoji: '🐈', value: 8, minutes: 60 }, tags: ['fun'] },
  { id: 'lottoTicket', label: 'Scratch-off ticket', emoji: '🎟️', seconds: 4, cost: 200, needs: { fun: 6 }, pay: () => (Math.random() < 0.08 ? 2_000 : Math.random() < 0.004 ? 50_000 : 0), tags: ['luck'] },
  { id: 'gistWithOwner', label: 'Chat with the owner', emoji: '🗣️', seconds: 6, needs: { social: 18 }, skill: { key: 'charisma', gain: 0.25 }, tags: ['social'] },

  // ---------- Pizza ----------
  { id: 'dollarSlice', label: 'Grab a dollar slice', emoji: '🍕', seconds: 4, cost: 150, needs: { hunger: 28 }, tags: ['eat'] },
  { id: 'fullPie', label: 'Whole pie with friends', emoji: '🍕', seconds: 12, cost: 2_400, needs: { hunger: 70, social: 25, fun: 15 }, tags: ['eat', 'social'] },
  { id: 'foldDebate', label: 'Debate: fold or no fold', emoji: '🤌', seconds: 6, needs: { social: 16, fun: 8 }, skill: { key: 'charisma', gain: 0.3 }, tags: ['social'] },

  // ---------- Café ----------
  { id: 'latte', label: 'Oat milk latte', emoji: '☕', seconds: 5, cost: 650, needs: { energy: 20, fun: 4 }, tags: ['drink'] },
  { id: 'laptopCafe', label: 'Work from the café', emoji: '💻', seconds: 14, cost: 450, needs: { fun: 2, social: 6 }, skill: { key: 'coding', gain: 0.6 }, tags: ['skill'] },
  { id: 'bagelSchmear', label: 'Bagel with schmear', emoji: '🥯', seconds: 5, cost: 525, needs: { hunger: 35 }, tags: ['eat'] },

  // ---------- Bars, clubs, comedy (nightlife) ----------
  { id: 'happyHour', label: 'Happy hour drinks', emoji: '🍹', seconds: 10, cost: 1_800, needs: { fun: 30, social: 30, bladder: -20, energy: -6 }, tags: ['nightlife', 'social'] },
  { id: 'karaoke', label: 'Karaoke night', emoji: '🎤', seconds: 12, cost: 1_000, needs: { fun: 38, social: 20 }, skill: { key: 'music', gain: 0.5 }, moodlet: { id: 'karaokeStar', label: 'Crowd sang along', emoji: '🎤', value: 12, minutes: 120 }, hours: [18, 3], tags: ['nightlife'] },
  { id: 'dancefloor', label: 'Hit the dance floor', emoji: '🪩', seconds: 14, cost: 2_500, needs: { fun: 45, social: 30, energy: -18, hygiene: -10 }, moodlet: { id: 'bigNight', label: 'Big night out', emoji: '🪩', value: 18, minutes: 180 }, hours: [21, 4], tags: ['nightlife'] },
  { id: 'openMic', label: 'Do 5 minutes at open mic', emoji: '😂', seconds: 14, needs: { fun: 20, social: 15, energy: -6 }, skill: { key: 'charisma', gain: 0.8 }, tags: ['nightlife', 'skill'] },
  { id: 'watchComedy', label: 'Watch a comedy show', emoji: '🎭', seconds: 12, cost: 2_000, needs: { fun: 40, social: 10 }, tags: ['nightlife', 'fun'] },

  // ---------- Gym ----------
  { id: 'gymSession', label: 'Lift weights', emoji: '🏋️', seconds: 14, cost: 1_500, needs: { energy: -16, hygiene: -20, fun: 8 }, skill: { key: 'fitness', gain: 1.1 }, tags: ['fitness'] },
  { id: 'spinClass', label: 'Spin class', emoji: '🚴', seconds: 14, cost: 3_200, needs: { energy: -20, hygiene: -20, fun: 14, social: 10 }, skill: { key: 'fitness', gain: 1.3 }, tags: ['fitness', 'social'] },
  // 🍝 Eating out, 🎳 bowling, 🎬 the movies, ⛳ mini golf (2026-10-28).
  { id: 'pastaDinner', label: 'Pasta dinner', emoji: '🍝', seconds: 12, cost: 2_800, needs: { hunger: 65, fun: 12, social: 10 }, tags: ['eat', 'social'] },
  { id: 'chickenParm', label: 'Chicken parm hero', emoji: '🍗', seconds: 8, cost: 1_900, needs: { hunger: 55, fun: 6 }, tags: ['eat'] },
  { id: 'cannoli', label: 'Cannoli and an espresso', emoji: '🥮', seconds: 5, cost: 900, needs: { hunger: 15, fun: 8, energy: 6 }, tags: ['eat'] },
  { id: 'tastingMenu', label: 'Twelve-course tasting menu', emoji: '🍽️', seconds: 16, cost: 24_000, needs: { hunger: 70, fun: 30, social: 15 }, moodlet: { id: 'fineDining', label: 'Ate like a critic', emoji: '🍽️', value: 12, minutes: 300 }, tags: ['eat', 'social'] },
  { id: 'wineFlight', label: 'Wine flight', emoji: '🍷', seconds: 8, cost: 6_500, needs: { fun: 18, social: 10 }, tags: ['social'] },
  { id: 'chefsTable', label: 'Chef’s table', emoji: '👨‍🍳', seconds: 18, cost: 50_000, needs: { hunger: 80, fun: 40, social: 25 }, moodlet: { id: 'chefsTable', label: 'The chef knows my name', emoji: '👨‍🍳', value: 18, minutes: 480 }, tags: ['eat', 'social'] },
  { id: 'playBowling', label: 'Bowl a game (mini-game)', emoji: '🎳', seconds: 2, tags: ['service'] },
  { id: 'playMinigolf', label: 'Play 9 holes (mini-game)', emoji: '⛳', seconds: 2, tags: ['service'] },
  { id: 'watchMovie', label: 'Watch a movie', emoji: '🎬', seconds: 2, tags: ['service'] },
  { id: 'browseClothes', label: 'Browse the racks', emoji: '🛍️', seconds: 2, tags: ['service'] },
  { id: 'popcorn', label: 'Popcorn and a soda', emoji: '🍿', seconds: 4, cost: 1_100, needs: { hunger: 18, fun: 6 }, tags: ['eat'] },
  // 🏋️ Gym mini-games (ui/gym-games.ts) and the new park things (2026-10-28).
  { id: 'playBench', label: 'Bench press (mini-game)', emoji: '🏋️', seconds: 2, tags: ['service'] },
  { id: 'playTreadmill', label: 'Treadmill sprint (mini-game)', emoji: '🏃', seconds: 2, tags: ['service'] },
  { id: 'playBag', label: 'Heavy bag combos (mini-game)', emoji: '🥊', seconds: 2, tags: ['service'] },
  { id: 'playRope', label: 'Jump rope (mini-game)', emoji: '🪢', seconds: 2, tags: ['service'] },
  { id: 'playSpin', label: 'Spin class (mini-game)', emoji: '🚴', seconds: 2, tags: ['service'] },
  { id: 'playRow', label: 'Rowing machine (mini-game)', emoji: '🚣', seconds: 2, tags: ['service'] },
  { id: 'playYoga', label: 'Yoga flow (mini-game)', emoji: '🧘', seconds: 2, tags: ['service'] },
  { id: 'smoothie', label: 'Protein smoothie', emoji: '🥤', seconds: 5, cost: 900, needs: { hunger: 22, energy: 8 }, tags: ['eat'] },
  { id: 'massageChair', label: 'Massage chair', emoji: '💆', seconds: 8, cost: 200, needs: { energy: 10, fun: 8 }, moodlet: { id: 'massage', label: 'Kneaded and needed', emoji: '💆', value: 5, minutes: 120 }, tags: ['relax'] },
  { id: 'rideCarousel', label: 'Ride the carousel', emoji: '🎠', seconds: 8, cost: 400, needs: { fun: 22 }, moodlet: { id: 'carousel', label: 'Round and round', emoji: '🎠', value: 5, minutes: 120 }, tags: ['fun'] },
  { id: 'swingSet', label: 'Go on the swings', emoji: '🛝', seconds: 6, needs: { fun: 14 }, tags: ['fun'] },
  { id: 'carriageRide', label: 'Horse carriage ride', emoji: '🐴', seconds: 12, cost: 6_000, needs: { fun: 30, social: 10 }, moodlet: { id: 'carriage', label: 'Main character moment', emoji: '🐴', value: 10, minutes: 180 }, tags: ['fun', 'landmark'] },
  { id: 'petDogs', label: 'Say hi to the dogs', emoji: '🐕', seconds: 6, needs: { fun: 14, social: 6 }, moodlet: { id: 'dogs', label: 'Pet a good dog', emoji: '🐕', value: 6, minutes: 120 }, tags: ['fun'] },
  { id: 'castleView', label: 'Take in the view from the castle', emoji: '🏰', seconds: 8, needs: { fun: 12, energy: -2 }, moodlet: { id: 'castle', label: 'King of the park', emoji: '🏰', value: 4, minutes: 120 }, tags: ['fun', 'landmark'] },
  { id: 'bandshell', label: 'Catch the band at the shell', emoji: '🎺', seconds: 12, needs: { fun: 20, social: 8 }, tags: ['fun', 'social'] },
  { id: 'softball', label: 'Join a softball game', emoji: '🥎', seconds: 12, needs: { fun: 20, social: 12, energy: -12, hygiene: -8 }, skill: { key: 'fitness', gain: 0.4 }, tags: ['fun', 'fitness', 'social'] },
  { id: 'climbRocks', label: 'Sit up on the rocks', emoji: '🪨', seconds: 8, needs: { fun: 10, energy: 4 }, tags: ['relax'] },
  { id: 'lapSwim', label: 'Swim laps', emoji: '🏊', seconds: 12, needs: { energy: -14, hygiene: 20, fun: 12 }, skill: { key: 'fitness', gain: 1.0 }, moodlet: { id: 'swim', label: 'Pool brain, no thoughts', emoji: '🏊', value: 6, minutes: 120 }, tags: ['fitness'] },
  { id: 'sauna', label: 'Sit in the sauna', emoji: '🧖', seconds: 8, needs: { energy: 10, fun: 10, hygiene: 10 }, moodlet: { id: 'sauna', label: 'Steamed and serene', emoji: '🧖', value: 8, minutes: 150 }, tags: ['relax'] },
  { id: 'gymShower', label: 'Locker room shower', emoji: '🚿', seconds: 6, needs: { hygiene: 70 }, tags: ['bathe'] },

  // ---------- Parks and plazas ----------
  { id: 'peopleWatch', label: 'People-watch', emoji: '👀', seconds: 8, needs: { fun: 16, social: 6 }, skill: { key: 'streetSmarts', gain: 0.4 }, tags: ['relax'] },
  { id: 'picnic', label: 'Picnic on the lawn', emoji: '🧺', seconds: 10, cost: 1_200, needs: { hunger: 35, fun: 18, social: 10 }, tags: ['eat', 'relax'] },
  { id: 'chess', label: 'Speed chess with a regular', emoji: '♟️', seconds: 10, needs: { fun: 18, social: 12 }, skill: { key: 'streetSmarts', gain: 0.5 }, tags: ['fun'] },
  { id: 'jog', label: 'Go for a run', emoji: '🏃', seconds: 10, needs: { energy: -12, hygiene: -15, fun: 10 }, skill: { key: 'fitness', gain: 0.8 }, tags: ['fitness'] },
  { id: 'busk', label: 'Busk for tips', emoji: '🎸', seconds: 14, needs: { fun: 10, energy: -6 }, pay: (s) => 600 + 900 * lvl(s, 'music'), skill: { key: 'music', gain: 0.5 }, requires: { skill: 'music', level: 1 }, tags: ['earn', 'gig'] },
  { id: 'photoSelfie', label: 'Take a selfie', emoji: '🤳', seconds: 4, needs: { fun: 10, social: 4 }, moodlet: { id: 'selfie', label: 'Main character energy', emoji: '🤳', value: 6, minutes: 60 }, tags: ['fun', 'photo'] },
  { id: 'publicRestroom', label: 'Find a public restroom', emoji: '🚻', seconds: 8, needs: { bladder: 100, hygiene: -4 }, tags: ['toilet'] },
  { id: 'hotDogCart', label: 'Hot dog from the cart', emoji: '🌭', seconds: 4, cost: 400, needs: { hunger: 26 }, tags: ['eat'] },
  { id: 'halalCart', label: 'Chicken over rice (halal cart)', emoji: '🍛', seconds: 6, cost: 1_000, needs: { hunger: 60, fun: 6 }, tags: ['eat'] },

  // ---------- Landmarks ----------
  { id: 'observationDeck', label: 'Go up to the observation deck', emoji: '🏙️', seconds: 12, cost: 4_400, needs: { fun: 40, energy: -4 }, moodlet: { id: 'topOfCity', label: 'On top of the city', emoji: '🏙️', value: 15, minutes: 180 }, tags: ['landmark', 'fun'] },
  { id: 'walkBridge', label: 'Walk the bridge at sunset', emoji: '🌉', seconds: 12, needs: { fun: 30, energy: -8 }, moodlet: { id: 'bridgeWalk', label: 'Skyline views', emoji: '🌉', value: 12, minutes: 120 }, tags: ['landmark', 'fitness'] },
  { id: 'rowboat', label: 'Rent a rowboat on the lake', emoji: '🚣', seconds: 12, cost: 2_000, needs: { fun: 35, social: 10, energy: -6 }, moodlet: { id: 'rowboat', label: 'Lake day', emoji: '🚣', value: 10, minutes: 120 }, tags: ['landmark', 'fun'] },
  { id: 'windowShop', label: 'Window shop', emoji: '🛍️', seconds: 8, needs: { fun: 18, energy: -3 }, tags: ['fun', 'shopping'] },
  { id: 'foodHall', label: 'Eat at the food hall', emoji: '🍜', seconds: 9, cost: 1_800, needs: { hunger: 60, fun: 10, social: 6 }, tags: ['eat'] },
  { id: 'ferrisWheel', label: 'Ride the Ferris wheel', emoji: '🎡', seconds: 10, cost: 1_200, needs: { fun: 35, social: 8 }, moodlet: { id: 'ferris', label: 'On top of the wheel', emoji: '🎡', value: 10, minutes: 120 }, tags: ['fun', 'landmark'] },
  { id: 'rollerCoaster', label: 'Ride the roller coaster', emoji: '🎢', seconds: 8, cost: 1_500, needs: { fun: 50, energy: -6, bladder: -10 }, moodlet: { id: 'coaster', label: 'Adrenaline!', emoji: '🎢', value: 14, minutes: 90 }, tags: ['fun', 'landmark'] },
  { id: 'carnivalGames', label: 'Play carnival games', emoji: '🎯', seconds: 9, cost: 800, needs: { fun: 28 }, skill: { key: 'streetSmarts', gain: 0.2 }, tags: ['fun'] },
  { id: 'funnelCake', label: 'Funnel cake', emoji: '🍰', seconds: 5, cost: 900, needs: { hunger: 30, fun: 10 }, tags: ['eat'] },
  { id: 'catchGame', label: 'Catch a game', emoji: '🏀', seconds: 14, cost: 6_500, needs: { fun: 50, social: 25, hunger: -8 }, tags: ['landmark', 'fun', 'nightlife'] },

  // ---------- Life paths (data/paths.ts) ----------
  // Crime: kept vague on purpose (it's a cartoon, 21+). Risky ones can get you busted.
  { id: 'streetDeal', label: 'Move a package for the crew', emoji: '📦', seconds: 10, needs: { energy: -6, fun: 4 }, pay: (s) => 3_000 + 1_500 * lvl(s, 'streetSmarts'), skill: { key: 'streetSmarts', gain: 0.4 }, path: { id: 'crime', minLevel: 1 }, risk: 0.04, tags: ['crime', 'earn'] },
  { id: 'collectDebt', label: 'Collect what you’re owed', emoji: '💰', seconds: 12, needs: { energy: -8, social: -4 }, pay: (s) => 6_000 + 2_500 * lvl(s, 'hustle'), skill: { key: 'hustle', gain: 0.4 }, path: { id: 'crime', minLevel: 2 }, risk: 0.06, tags: ['crime', 'earn'] },
  { id: 'betrayCrew', label: 'Sell out someone who trusted you', emoji: '🐍', seconds: 8, needs: { social: -30, fun: -10 }, moodlet: { id: 'betrayer', label: 'Watching your back', emoji: '🐍', value: -18, minutes: 60 * 12 }, path: { id: 'crime', minLevel: 5 }, risk: 0.15, tags: ['crime', 'betrayal'] },
  // CEO
  { id: 'pitchInvestors', label: 'Pitch investors', emoji: '📊', seconds: 14, needs: { energy: -10, social: 8 }, skill: { key: 'charisma', gain: 0.5 }, path: { id: 'ceo', minLevel: 1 }, tags: ['ceo', 'skill'] },
  { id: 'dumpWaste', label: 'Quietly dump waste in the river', emoji: '🛢️', seconds: 8, needs: { fun: -10 }, pay: 40_000, moodlet: { id: 'guilt', label: 'People are getting sick', emoji: '😷', value: -15, minutes: 60 * 12 }, path: { id: 'ceo', minLevel: 5 }, risk: 0.2, tags: ['ceo', 'illegal'] },
  { id: 'bribeCops', label: 'Pay off an investigator', emoji: '🤫', seconds: 6, cost: 30_000, path: { id: 'ceo', minLevel: 5 }, risk: 0.25, tags: ['ceo', 'illegal'] },
  // Celebrity
  { id: 'postContent', label: 'Post content', emoji: '📸', seconds: 8, needs: { fun: 8, social: 6, energy: -3 }, skill: { key: 'charisma', gain: 0.2 }, path: { id: 'celebrity', minLevel: 1 }, tags: ['celebrity', 'online'] },

  // ---------- Transit ----------
  { id: 'subwayShowtime', label: 'Watch the Showtime dancers', emoji: '🕺', seconds: 6, needs: { fun: 16 }, tags: ['fun'] },
  { id: 'tipPerformer', label: 'Tip the performer $5', emoji: '💵', seconds: 2, cost: 500, needs: { fun: 6, social: 6 }, moodlet: { id: 'goodDeed', label: 'Supported local art', emoji: '💛', value: 6, minutes: 60 }, tags: ['social'] },
];

// Home cooking: a cook_ and an eat_ action per meal (data/groceries.ts).
export const ACTIONS: Record<string, ActionDef> = Object.fromEntries([...LIST, ...ODD_ACTIVITIES.map((o) => o.action), ...NORTH_ACTIONS, ...mealActions()].map((a) => [a.id, a]));

/** Is this action available right now (time window and skill)? Returns a reason if not. */
export function actionLock(a: ActionDef, s: GameState, hour: number): string | null {
  if (a.requires && Math.floor(s.skills[a.requires.skill]) < a.requires.level) {
    return `Needs ${a.requires.skill} ${a.requires.level}`;
  }
  if (a.hours) {
    const [from, to] = a.hours;
    const open = from <= to ? hour >= from && hour < to : hour >= from || hour < to;
    if (!open) return `From ${fmtHour(from)}`;
  }
  if (a.path) {
    const p = s.paths.active === a.path.id ? s.paths.levels[a.path.id] ?? 1 : 0;
    if (p < a.path.minLevel) return p ? `${a.path.id === 'ceo' ? 'CEO' : a.path.id} level ${a.path.minLevel}` : 'Join this path first';
  }
  if (a.cost && s.money < a.cost) return 'Not enough cash';
  return null;
}

export function fmtHour(h: number): string {
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${h < 12 ? 'AM' : 'PM'}`;
}
