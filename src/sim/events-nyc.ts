// =====================================================================
// events-nyc.ts — the weird stuff that happens to New Yorkers almost
// every day (Peter, 2026-10-15: "make the random things that happen more
// interactive where their choices have outcomes that can be either good
// or bad… add weird things that happen to NYers almost every day").
//
// Every event here is `weird: true`: the director makes sure you get at
// least one most days you go outside (sim/events.ts → directorPick).
// Choices can swing either way: skills tilt the odds, and some choices
// start a fight or a police chase you play (ui/minigames.ts).
//
// Voice: plain, one light touch per event. Nobody gets punched down at.
// Add new ones to the list; nothing else changes.
// =====================================================================

import type { EventContext, RandomEventDef } from './events.ts';

const chance = (p: number) => Math.random() < p;
const outside = (c: EventContext) => c.where === 'street' || c.where === 'plaza' || c.where === 'park';
const night = (c: EventContext) => c.part === 'night' || c.part === 'lateNight' || c.part === 'evening';

export const WEIRD_EVENTS: RandomEventDef[] = [
  {
    id: 'pigeonBagel', title: 'Bagel heist', emoji: '🐦', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'street' || c.where === 'park' || c.where === 'plaza' ? 1.4 : 0),
    text: () => 'A pigeon lands on your arm, makes eye contact, and takes half your everything bagel. Three more are circling.',
    choices: [
      { label: 'Chase it down', emoji: '🏃', hint: 'fitness helps', run: (c) => (chance(0.3 + c.skill('fitness') * 0.06)
        ? { text: 'You get the bagel back. The pigeon respects you now. A kid applauds.', tone: 'good', needs: { fun: 10, hunger: 8 }, rep: { street: 2 } }
        : { text: 'You trip over a Citi Bike dock. The pigeon eats in front of you, slowly.', tone: 'bad', needs: { hygiene: -8, fun: -6 } }) },
      { label: 'Let it go', emoji: '🫡', run: () => ({ text: 'It earned it. Rent is high for everyone.', tone: 'info', needs: { fun: 3 } }) },
      { label: 'Feed the whole crew', emoji: '🥯', run: () => ({ text: 'Twenty pigeons follow you for a block. You are the Pigeon King. Nobody wants to stand near you.', tone: 'info', needs: { fun: 12, social: -4 }, moodlet: { id: 'pigeonKing', label: 'Pigeon King', emoji: '👑', value: 8, minutes: 120 } }) },
    ],
  },
  {
    id: 'cowboyPhoto', title: 'The Times Square cowboy', emoji: '🤠', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'plaza' && !night(c) ? 1.6 : 0),
    text: () => 'A guy in a cowboy hat, boots and very little else strums at you. “Photo? Tips appreciated.”',
    choices: [
      { label: 'Photo for $5', emoji: '📸', run: () => ({ text: 'Your mom is going to ask a lot of questions about this picture.', tone: 'good', money: -500, needs: { fun: 12, social: 6 } }) },
      { label: 'Challenge him to a guitar-off', emoji: '🎸', hint: 'music helps', run: (c) => (chance(0.2 + c.skill('music') * 0.08)
        ? { text: 'You shred. The crowd goes wild. He hands you his tip jar out of respect.', tone: 'good', money: 2_400, needs: { fun: 20, social: 10 }, rep: { street: 6 } }
        : { text: 'You know three chords and one of them is wrong. A tourist films it. It’s doing numbers.', tone: 'bad', needs: { fun: -4 }, rep: { street: -3 } }) },
      { label: 'Keep walking', emoji: '🚶', run: () => ({ text: 'He yodels at your back. Respect.', tone: 'info' }) },
    ],
  },
  {
    id: 'pizzaRat', title: 'Pizza Rat', emoji: '🐀', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'subway' ? 1.3 : c.where === 'street' && night(c) ? 0.6 : 0),
    text: () => 'A rat is dragging a whole slice of pizza up the subway stairs. It looks determined. It looks like you, on a Monday.',
    choices: [
      { label: 'Film it', emoji: '📱', show: (c) => c.s.phone.ok, run: () => (chance(0.25)
        ? { text: 'It goes viral. 2 million views. Brands are in your DMs.', tone: 'good', needs: { fun: 15, social: 12 }, rep: { street: 4 }, news: { scope: 'city', emoji: '🐀', headline: 'Pizza Rat is back, and it brought a crust' } }
        : { text: '41 views. Your aunt liked it.', tone: 'info', needs: { fun: 6 } }) },
      { label: 'Step aside respectfully', emoji: '🙇', run: () => ({ text: 'You make way. It nods. Probably. New York is a team sport.', tone: 'good', needs: { fun: 8 } }) },
      { label: 'Try to take the slice', emoji: '🍕', run: () => ({ text: 'The rat wins. It wasn’t close.', tone: 'bad', needs: { hygiene: -12, fun: -8 }, rep: { street: -2 } }) },
    ],
  },
  {
    id: 'trainPreacher', title: 'Testify!', emoji: '📣', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'subway' ? 1.1 : 0),
    text: () => 'A man with a megaphone points at you. “YOU. Tell this car what you’re grateful for.” Everyone turns.',
    choices: [
      { label: 'Go big', emoji: '🎤', hint: 'charisma helps', run: (c) => (chance(0.3 + c.skill('charisma') * 0.08)
        ? { text: 'You thank your mom, the MTA and dollar slices. The whole car claps. A stranger gives you a granola bar.', tone: 'good', needs: { social: 15, fun: 12 }, rep: { street: 3 } }
        : { text: 'You say “uh… bagels?” The silence lasts four stops.', tone: 'bad', needs: { social: -6, fun: -6 } }) },
      { label: 'Pretend to be asleep', emoji: '😴', run: () => ({ text: 'Classic. He moves on to a man in a suit.', tone: 'info', needs: { energy: 2 } }) },
      { label: 'Give him a dollar', emoji: '💵', run: () => ({ text: 'He blesses your whole family tree.', tone: 'good', money: -100, needs: { fun: 4 } }) },
    ],
  },
  {
    id: 'bodegaCatChips', title: 'The cat is on the chips', emoji: '🐈', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'food' ? 1.2 : 0),
    text: () => 'The bodega cat is asleep on the exact bag of chips you came for. The guy at the counter shrugs: “He’s the manager.”',
    choices: [
      { label: 'Wait for him to move', emoji: '⏳', run: () => ({ text: 'Twenty minutes later he stretches, looks at you, and goes back to sleep. Peaceful, honestly.', tone: 'info', needs: { fun: 6, energy: 3 } }) },
      { label: 'Gently slide the bag out', emoji: '🤏', run: () => (chance(0.5)
        ? { text: 'Clean extraction. The cat doesn’t even blink. You are a surgeon.', tone: 'good', needs: { hunger: 10, fun: 6 } }
        : { text: 'The manager wakes up. You have a scratch and a new respect for authority.', tone: 'bad', needs: { fun: -5 }, moodlet: { id: 'catScratch', label: 'Scratched by the manager', emoji: '🐈', value: -6, minutes: 90 } }) },
      { label: 'Pet him instead', emoji: '🫶', run: () => ({ text: 'He purrs. You forget why you came in. Best part of your day.', tone: 'good', needs: { fun: 10, social: 5 }, moodlet: { id: 'catPets', label: 'Pet the bodega cat', emoji: '🐈', value: 10, minutes: 120 } }) },
    ],
  },
  {
    id: 'halalCut', title: 'Line cutter at the halal cart', emoji: '🥙', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'street' && (night(c) || c.part === 'midday') ? 1.2 : 0),
    text: () => 'Someone walks straight past ten people and orders chicken over rice. White sauce, hot sauce, no shame.',
    choices: [
      { label: 'Call him out', emoji: '🗣️', run: () => (chance(0.55)
        ? { text: 'The whole line backs you up. He walks to the back, muttering. The cart guy gives you extra sauce.', tone: 'good', needs: { hunger: 15, social: 6 }, rep: { street: 4 } }
        : { text: '“You got a problem?” He squares up.', tone: 'info', fight: { foe: 'Line Cutter', emoji: '😤', power: 4 } }) },
      { label: 'Let it slide', emoji: '🤷', run: () => ({ text: 'Not worth it. The food is still incredible.', tone: 'info', needs: { hunger: 12 } }) },
      { label: 'Cut in front of HIM', emoji: '😈', run: () => (chance(0.5)
        ? { text: 'Poetic justice. The line erupts in applause. The cart guy is laughing too hard to charge you.', tone: 'good', needs: { hunger: 15, fun: 12 }, rep: { street: 5 } }
        : { text: 'Now two people hate you. The cart guy serves everyone else first.', tone: 'bad', needs: { fun: -5 }, rep: { street: -2 } }) },
    ],
  },
  {
    id: 'mugging', title: '“Run your pockets”', emoji: '🔪', kind: 'bad', rarity: 'uncommon', weird: true,
    weight: (c) => (c.where === 'street' && (c.part === 'night' || c.part === 'lateNight') ? 1 : 0),
    text: (c) => `A guy steps out of a doorway. “Phone and cash. Now.” You have ${c.s.money > 10_000 ? 'way too much' : 'a little'} cash on you.`,
    redFlags: ['Late night, empty block, phone out', 'Keep most of your money in the bank: Phone → Bank'],
    choices: [
      { label: 'Hand it over', emoji: '🙌', run: () => ({ text: 'He takes the cash and runs. You’re okay. That’s what matters.', tone: 'bad', loseMoneyPercent: 60, moodlet: { id: 'mugged', label: 'Got mugged', emoji: '😰', value: -18, minutes: 60 * 8 }, lesson: 'Real life: hand it over, get somewhere safe, call 911. Things can be replaced.' }) },
      { label: 'Fight back', emoji: '🥊', hint: 'risky', run: () => ({ text: 'You put your hands up. Wrong kind of hands up.', tone: 'info', fight: { foe: 'Mugger', emoji: '🥷', power: 6 } }) },
      { label: 'Talk your way out', emoji: '🧠', hint: 'street smarts', run: (c) => (chance(0.2 + c.skill('streetSmarts') * 0.08)
        ? { text: '“Bro, I’m broke, look at these shoes.” He looks. He leaves. He looked sad for you.', tone: 'good', skill: { key: 'streetSmarts', gain: 0.5 }, rep: { street: 3 } }
        : { text: 'He doesn’t buy it.', tone: 'bad', loseMoneyPercent: 80, moodlet: { id: 'mugged', label: 'Got mugged', emoji: '😰', value: -20, minutes: 60 * 8 } }) },
    ],
  },
  {
    id: 'squirrelEarbud', title: 'Squirrel took your earbud', emoji: '🐿️', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'park' ? 1.5 : 0),
    text: () => 'You set your earbud down on a bench for one second. A squirrel grabs it and runs up a tree. It’s listening to your podcast.',
    choices: [
      { label: 'Climb the tree', emoji: '🧗', hint: 'fitness helps', run: (c) => (chance(0.25 + c.skill('fitness') * 0.06)
        ? { text: 'You get it back. A park ranger watched the whole thing and is not sure what to write down.', tone: 'good', needs: { fun: 14 }, rep: { street: 2 } }
        : { text: 'You get stuck. A five-year-old talks you down.', tone: 'bad', needs: { fun: -6, energy: -10 }, rep: { street: -2 } }) },
      { label: 'Bribe it with peanuts', emoji: '🥜', run: () => (chance(0.6)
        ? { text: 'A fair trade. The squirrel drops the earbud. Business is business.', tone: 'good', money: -200, needs: { fun: 10 } }
        : { text: 'It takes the peanuts AND keeps the earbud. Wall Street could learn from this squirrel.', tone: 'bad', money: -3_200, needs: { fun: -4 } }) },
      { label: 'Let it keep it', emoji: '🫠', run: () => ({ text: 'New earbud: $30. The squirrel is getting into true crime.', tone: 'bad', money: -3_000 }) },
    ],
  },
  {
    id: 'filmShoot', title: 'Film shoot on your block', emoji: '🎬', kind: 'good', weird: true,
    weight: (c) => (outside(c) && !night(c) ? 0.9 : 0),
    text: () => 'A production assistant blocks the sidewalk. “Hold please! We’re rolling!” There are trailers, lights and a guy who looks a lot like a famous actor.',
    choices: [
      { label: 'Ask to be an extra', emoji: '🙋', hint: 'charisma helps', run: (c) => (chance(0.3 + c.skill('charisma') * 0.08)
        ? { text: 'You play “Person Walking Past, Slightly Surprised”. Nailed it. Cash and a sandwich from craft services.', tone: 'good', money: 15_000, needs: { fun: 15, hunger: 10 }, rep: { street: 3 } }
        : { text: '“We’re all set on extras.” The sandwich table is guarded.', tone: 'info' }) },
      { label: 'Walk through the shot', emoji: '🚶', run: () => (chance(0.3)
        ? { text: 'The director yells CUT, then “wait… that was great, keep it.” You’re in the movie now.', tone: 'good', money: 8_000, needs: { fun: 20 }, rep: { street: 5 } }
        : { text: 'Fifty people sigh at you at once. A record.', tone: 'bad', needs: { social: -8 }, rep: { street: -2 } }) },
      { label: 'Wait like a New Yorker', emoji: '⏳', run: () => ({ text: 'You wait. You scroll. You learn the lead actor is shorter than he looks.', tone: 'info', needs: { fun: 4 } }) },
    ],
  },
  {
    id: 'breakdancers', title: '“We need a volunteer!”', emoji: '🕺', kind: 'good', weird: true,
    weight: (c) => (c.where === 'plaza' || c.where === 'park' || c.where === 'subway' ? 1 : 0),
    text: () => 'A breakdance crew is drawing a crowd. “You! Yeah you! Stand right here and DON’T move.” Someone is about to flip over you.',
    choices: [
      { label: 'Stand very still', emoji: '🧍', run: () => (chance(0.85)
        ? { text: 'He flips clean over your head. The crowd screams. You did nothing and it was the best thing you’ve ever done.', tone: 'good', needs: { fun: 18, social: 10 }, rep: { street: 2 } }
        : { text: 'You flinched. He adjusted. Nobody got hurt, but your hat is now in Brooklyn.', tone: 'info', needs: { fun: 8 } }) },
      { label: 'Show them a move', emoji: '💃', hint: 'fitness + music', run: (c) => (chance(0.15 + (c.skill('fitness') + c.skill('music')) * 0.04)
        ? { text: 'A windmill?! The crew adopts you. They split the hat with you.', tone: 'good', money: 3_000, needs: { fun: 22, social: 12 }, rep: { street: 6 } }
        : { text: 'You do the worm. Half of it. The crowd is supportive in a worried way.', tone: 'bad', needs: { fun: 4, energy: -8 } }) },
      { label: 'Tip and go', emoji: '💵', run: () => ({ text: 'Five bucks in the hat. Showtime is a public service.', tone: 'good', money: -500, needs: { fun: 6 } }) },
    ],
  },
  {
    id: 'wrongUber', title: '“You’re my Uber, right?”', emoji: '🚕', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'street' ? 0.9 : 0),
    text: (c) => `A man with a suitcase opens ${c.s.garage.driving ? 'your car door' : 'your imaginary car door'} and gets in. “JFK, please. I’m running late.”`,
    choices: [
      { label: 'Drive him (you have a car)', emoji: '🚗', show: (c) => !!c.s.garage.driving, run: () => ({ text: 'Forty minutes of his life story. Five stars. He tips like an investment banker, because he is one.', tone: 'good', money: 6_500, needs: { energy: -10, social: 8 }, rep: { corporate: 4 } }) },
      { label: 'Play along', emoji: '😏', run: () => ({ text: 'You say “buckle up” and walk away. He sits there for a full minute. Somewhere, a real Uber driver sighs.', tone: 'info', needs: { fun: 14 } }) },
      { label: 'Point him to his car', emoji: '👉', run: () => ({ text: 'His driver was right behind you. He thanks you and gives you a hotel mint.', tone: 'good', needs: { fun: 3, social: 3 } }) },
    ],
  },
  {
    id: 'fakeRolex', title: '“Rolex, forty dollars”', emoji: '⌚', kind: 'scam', weird: true,
    weight: (c) => (c.where === 'street' || c.where === 'plaza' ? 0.9 : 0),
    text: () => 'A man opens his coat. Twelve gold watches. “Rolex. Real. Forty dollars. For you, thirty-five.”',
    redFlags: ['A $10,000 watch for $40 from a coat', 'He changed the price before you asked', 'No receipt, no box, no name'],
    choices: [
      { label: 'Buy one', emoji: '💸', run: () => ({ text: 'By Thursday your wrist is green. The “Rolex” now says ROLAX.', tone: 'bad', money: -3_500, scam: 'fell', needs: { fun: 4 } }) },
      { label: 'Haggle him to $10 for a laugh', emoji: '🤝', hint: 'hustle', run: (c) => (chance(0.3 + c.skill('hustle') * 0.07)
        ? { text: 'Ten bucks. It’s fake and you know it. You wear it ironically and people genuinely compliment it.', tone: 'good', money: -1_000, needs: { fun: 12 }, skill: { key: 'hustle', gain: 0.4 } }
        : { text: '“Thirty, final.” You walk. He yells “twenty!” You keep walking. Strong.', tone: 'info', scam: 'spotted', skill: { key: 'streetSmarts', gain: 0.3 } }) },
      { label: 'Walk on', emoji: '🚶', run: () => ({ text: 'Smart. A real Rolex doesn’t live in a coat.', tone: 'good', scam: 'spotted', skill: { key: 'streetSmarts', gain: 0.4 } }) },
    ],
  },
  {
    id: 'proposal', title: 'Can you film this?', emoji: '💍', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'park' || c.where === 'plaza' ? 0.8 : 0),
    text: () => 'A nervous guy hands you his phone. “I’m proposing. Please film. Please don’t mess it up.” He’s sweating through his blazer.',
    choices: [
      { label: 'Film it like a pro', emoji: '🎥', run: () => (chance(0.8)
        ? { text: 'She says YES. You got every angle. They invite you to the wedding. You might actually go.', tone: 'good', needs: { fun: 15, social: 12 }, moodlet: { id: 'romance', label: 'Love is real', emoji: '💍', value: 12, minutes: 180 } }
        : { text: 'She says… “can we talk about this at home?” You stop recording very quietly.', tone: 'info', needs: { fun: -2, social: 4 } }) },
      { label: 'Photobomb a little', emoji: '😜', run: () => ({ text: 'You’re in the background of their wedding announcement forever. They don’t know who you are. Neither do you, really.', tone: 'info', needs: { fun: 14 } }) },
    ],
  },
  {
    id: 'looseDog', title: 'A dog chose you', emoji: '🐕', kind: 'good', weird: true,
    weight: (c) => (c.where === 'street' || c.where === 'park' ? 0.9 : 0),
    text: () => 'A fluffy dog with a leash and no human attached trots up and sits on your feet. Somewhere a block away, someone is yelling “BISCUIT!”',
    choices: [
      { label: 'Walk Biscuit back', emoji: '🦮', run: () => (chance(0.5)
        ? { text: 'The owner hugs you, then the dog, then you again. She runs a restaurant. Dinner’s on her.', tone: 'good', needs: { social: 12, fun: 10, hunger: 20 }, moodlet: { id: 'dogHero', label: 'Reunited Biscuit', emoji: '🐕', value: 15, minutes: 240 } }
        : { text: 'He hands you $50 and a business card that just says “Biscuit’s Dad”.', tone: 'good', money: 5_000, needs: { social: 8 } }) },
      { label: 'Wait right here', emoji: '🧍', run: () => ({ text: 'She finds you in two minutes. Biscuit licks your whole face. Worth it.', tone: 'good', needs: { fun: 10, hygiene: -3 } }) },
    ],
  },
  {
    id: 'steamGrate', title: 'Steam grate surprise', emoji: '💨', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'street' && c.weather !== 'heatwave' ? 0.8 : 0),
    text: () => 'You step on a subway grate as a train goes under. A huge blast of warm air. Your whole outfit goes up.',
    choices: [
      { label: 'Strike a pose', emoji: '💃', run: () => (chance(0.6)
        ? { text: 'Iconic. Someone gets the shot. It’s on a postcard by Friday.', tone: 'good', needs: { fun: 15, social: 8 }, rep: { street: 3 } }
        : { text: 'Your receipt from 2019 flies out of your pocket and into a tourist’s mouth. Long story.', tone: 'info', needs: { fun: 10 } }) },
      { label: 'Hold everything down', emoji: '😳', run: () => ({ text: 'Dignity intact. Mostly. Your hair is a new shape now.', tone: 'info', needs: { hygiene: -4 } }) },
    ],
  },
  {
    id: 'busDoors', title: 'The bus is leaving', emoji: '🚌', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'street' && c.rush ? 1.2 : 0),
    text: () => 'Your bus. Ten feet away. The doors are closing. The driver sees you. You see the driver. Time slows down.',
    choices: [
      { label: 'Sprint and bang on the door', emoji: '🏃', hint: 'fitness', run: (c) => (chance(0.35 + c.skill('fitness') * 0.06)
        ? { text: 'He opens up. The whole bus cheers like you scored in overtime.', tone: 'good', needs: { energy: -6, fun: 12, social: 6 }, rep: { street: 2 } }
        : { text: 'The bus pulls off with your reflection in every window. The next one is in 22 minutes.', tone: 'bad', needs: { energy: -8, fun: -8 } }) },
      { label: 'Act like you meant to miss it', emoji: '😎', run: () => ({ text: 'You check your phone like you got an important message. Nobody believes you. You believe you.', tone: 'info', needs: { fun: 2 } }) },
    ],
  },
  {
    id: 'graffitiLookout', title: 'Be the lookout?', emoji: '🎨', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'street' && (c.part === 'night' || c.part === 'lateNight') ? 0.8 : 0),
    text: () => 'An artist with a backpack full of spray cans is about to paint a giant mural on a roll-down gate. “Watch the corner for me? I’ll put your name in it.”',
    choices: [
      { label: 'Keep watch', emoji: '👀', run: () => (chance(0.65)
        ? { text: 'Twenty minutes later there’s a beautiful mural with your name hidden in it. The block loves it.', tone: 'good', needs: { fun: 18 }, rep: { street: 6 } }
        : { text: 'Flashlights. “HEY!” The artist is already gone. You are not.', tone: 'bad', chase: { heat: 1, reason: 'lookout for graffiti', hours: 3, bail: 15_000 } }) },
      { label: 'Ask to paint too', emoji: '🖌️', run: () => ({ text: 'You add a pigeon in the corner. It’s… a pigeon. The artist says it’s “raw”.', tone: 'good', needs: { fun: 16 }, rep: { street: 3 } }) },
      { label: 'Not tonight', emoji: '🙅', run: () => ({ text: 'You walk on. Tomorrow there’s a mural. It’s great. You wish you’d stayed.', tone: 'info' }) },
    ],
  },
  {
    id: 'pigeonLuck', title: 'Good luck from above', emoji: '🕊️', kind: 'mixed', weird: true,
    weight: (c) => (outside(c) ? 0.7 : 0),
    text: () => 'Something lands on your shoulder. It was a pigeon. It was from a pigeon. An old lady nearby says, “That’s good luck, baby.”',
    choices: [
      { label: 'Believe her', emoji: '🍀', run: () => ({ text: 'You buy a scratch-off on the way home. You win $20. You decide not to think about it too hard.', tone: 'good', money: 2_000, needs: { hygiene: -10 }, moodlet: { id: 'lucky', label: 'Lucky (supposedly)', emoji: '🍀', value: 8, minutes: 180 } }) },
      { label: 'Find a bathroom NOW', emoji: '🚻', run: () => ({ text: 'The bodega guy hands you napkins without a word. He’s seen this before.', tone: 'info', needs: { hygiene: -3 } }) },
    ],
  },
  {
    id: 'bikeLane', title: 'Bike lane rage', emoji: '🚲', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'street' ? 1 : 0),
    text: () => 'You step off the curb into the bike lane. A delivery biker screams something in three languages and swerves around you. His bag of dumplings is swinging.',
    choices: [
      { label: 'Apologize', emoji: '🙏', run: () => ({ text: 'He waves it off. New York runs on dumplings and forgiveness.', tone: 'good', needs: { social: 3 } }) },
      { label: 'Yell back', emoji: '🗣️', run: () => (chance(0.5)
        ? { text: 'He turns around. Hard stop. Gets off the bike.', tone: 'info', fight: { foe: 'Delivery Guy', emoji: '🚴', power: 3 } }
        : { text: 'He’s already two blocks away. You yelled at the air. A man on a stoop nods at you supportively.', tone: 'info', needs: { fun: 3 } }) },
      { label: 'Catch his falling dumplings', emoji: '🥟', hint: 'fitness', run: (c) => (chance(0.3 + c.skill('fitness') * 0.05)
        ? { text: 'You catch the bag mid-air. He stops, stunned, and hands you one dumpling as payment. A legend is born.', tone: 'good', needs: { hunger: 6, fun: 14 }, rep: { street: 4 } }
        : { text: 'Dumplings everywhere. Pigeons arrive. You both just stand there.', tone: 'bad', needs: { fun: -4 } }) },
    ],
  },
  {
    id: 'celebSighting', title: 'Is that… them?', emoji: '🌟', kind: 'good', rarity: 'uncommon', weird: true,
    weight: (c) => (c.where === 'cafe' || c.where === 'food' || c.where === 'nightlife' ? 0.9 : c.where === 'street' ? 0.3 : 0),
    text: () => 'A famous rapper is in a hoodie and sunglasses, trying to buy oat milk in peace. Nobody else has noticed. Yet.',
    choices: [
      { label: 'Ask for a selfie', emoji: '🤳', hint: 'charisma', run: (c) => (chance(0.3 + c.skill('charisma') * 0.07)
        ? { text: 'They laugh and say yes. They even follow you back. Your phone does not stop buzzing for a day.', tone: 'good', needs: { fun: 20, social: 15 }, rep: { street: 8 } }
        : { text: '“Not today, fam.” Fair. You saw them buy oat milk. That’s your story now.', tone: 'info', needs: { fun: 6 } }) },
      { label: 'Play it cool', emoji: '😎', run: () => ({ text: 'You nod. They nod. A respect-only exchange. They hold the door for you on the way out.', tone: 'good', needs: { fun: 10 }, rep: { street: 5 } }) },
      { label: 'Tell everyone', emoji: '📢', run: () => ({ text: 'A crowd forms in seconds. They escape through the kitchen. The cashier is not happy with you.', tone: 'bad', needs: { fun: 6, social: -4 }, rep: { street: -3 } }) },
    ],
  },
  {
    id: 'chessHustler', title: 'Street chess, $20 a game', emoji: '♟️', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'park' || c.where === 'plaza' ? 1 : 0),
    text: () => 'A man at a folding table taps a chess clock. “Twenty dollars. Five minutes. I’ll even let you be white.” He has not lost since 2009.',
    choices: [
      { label: 'Play him', emoji: '♟️', hint: 'coding + street smarts', run: (c) => (chance(0.15 + (c.skill('coding') + c.skill('streetSmarts')) * 0.035)
        ? { text: 'Checkmate. He stares at the board for a long time, then shakes your hand. “Come back tomorrow.”', tone: 'good', money: 2_000, needs: { fun: 18 }, rep: { street: 5 }, skill: { key: 'streetSmarts', gain: 0.4 } }
        : { text: 'He beats you in eleven moves while eating a sandwich. Educational, though.', tone: 'bad', money: -2_000, needs: { fun: 6 }, skill: { key: 'streetSmarts', gain: 0.2 } }) },
      { label: 'Just watch', emoji: '👀', run: () => ({ text: 'You watch him destroy a finance bro. Free entertainment.', tone: 'good', needs: { fun: 8 } }) },
    ],
  },
  {
    id: 'deliveryCrash', title: 'Dinner on the sidewalk', emoji: '🛵', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'street' && (night(c) || c.part === 'midday') ? 0.8 : 0),
    text: () => 'A delivery e-bike clips a trash can and an entire family-size order of pad thai lands next to you, still in the bag.',
    choices: [
      { label: 'Help him pick it up', emoji: '🤝', run: () => ({ text: 'The bag survived. He gives you his number: “anything you need from that restaurant, I got you.”', tone: 'good', needs: { social: 8, fun: 5 }, rep: { street: 2 } }) },
      { label: 'Ask if he’s okay', emoji: '❤️', run: () => ({ text: 'He’s fine, just embarrassed. You both laugh. The customer will never know.', tone: 'good', needs: { social: 6 } }) },
      { label: 'Grab the bag and run', emoji: '🏃', run: () => (chance(0.5)
        ? { text: 'Free pad thai. You feel bad about it the whole time you eat it, which is not long.', tone: 'info', needs: { hunger: 25 }, rep: { street: -2 } }
        : { text: 'He yells. A traffic cop turns around.', tone: 'bad', chase: { heat: 1, reason: 'stealing a delivery order', hours: 3, bail: 10_000 } }) },
    ],
  },
  {
    id: 'freeTrivia', title: 'Free slice if you know this', emoji: '🍕', kind: 'good', weird: true,
    weight: (c) => (c.where === 'food' ? 0.9 : 0),
    text: () => 'The pizza guy points a spatula at you. “Free slice if you can tell me what borough the Yankees play in.”',
    choices: [
      { label: '“The Bronx”', emoji: '⚾', run: () => ({ text: '“CORRECT!” Free slice. The guy behind you is a Mets fan and is quietly furious.', tone: 'good', needs: { hunger: 20, fun: 8 } }) },
      { label: '“Brooklyn?”', emoji: '😬', run: () => ({ text: 'He shakes his head slowly. “Two-fifty.” A woman behind you says “tourist” under her breath.', tone: 'bad', money: -250, needs: { hunger: 18 } }) },
    ],
  },
  {
    id: 'loudPhone', title: 'Speakerphone guy', emoji: '📢', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'subway' || c.where === 'cafe' ? 1 : 0),
    text: () => 'A man is on a full-volume speakerphone call about his cousin’s divorce. The whole car now knows his cousin’s business. The cousin’s name is Ray.',
    choices: [
      { label: 'Ask him to turn it down', emoji: '🙋', run: () => (chance(0.6)
        ? { text: 'He apologizes and switches to earbuds. The car gives you a silent standing ovation.', tone: 'good', needs: { fun: 6 }, rep: { street: 3 } }
        : { text: '“Ray, hold on. Somebody here got a PROBLEM.” He stands up.', tone: 'info', fight: { foe: 'Speakerphone Guy', emoji: '📱', power: 3 } }) },
      { label: 'Take Ray’s side out loud', emoji: '🍿', run: () => ({ text: 'Now you’re on the call. Ray says thanks. The car is invested. Best ride ever.', tone: 'good', needs: { fun: 16, social: 8 } }) },
      { label: 'Suffer in silence', emoji: '😑', run: () => ({ text: 'You learn more about Ray than you know about your own family.', tone: 'info', needs: { fun: -3 } }) },
    ],
  },
  {
    id: 'parkingTicketDance', title: 'Alternate side parking', emoji: '🅿️', kind: 'mixed', weird: true,
    weight: (c) => (c.where === 'street' && c.s.garage.cars.length > 0 && (c.part === 'morning' || c.part === 'rushAM') ? 1.4 : 0),
    text: () => 'Street cleaning day. Every car on the block has to move. A traffic agent is writing tickets from the other end.',
    choices: [
      { label: 'Double-park and wait in the car', emoji: '🚗', run: () => ({ text: 'The ancient New York ritual. You sit with ten neighbors in idling cars, nodding at each other. Solidarity.', tone: 'good', needs: { social: 6, fun: 2 } }) },
      { label: 'Risk it', emoji: '🎲', run: () => (chance(0.45)
        ? { text: 'The agent skips your car. You don’t know why. You don’t ask.', tone: 'good', needs: { fun: 6 } }
        : { text: '$65 ticket under the wiper. The agent didn’t even look up.', tone: 'bad', money: -6_500 }) },
    ],
  },
];
