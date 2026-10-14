// =====================================================================
// shift-menus.ts — the hands-on shift for the other six jobs (Peter,
// 2026-10-14: "each mini game should last 5–7 mins").
//
// Every job plays like the bodega counter (ui/deli-shift.ts): someone
// asks for something, you tap the right items, then hit the button.
// Only the items, asks and mid-shift choices change. The 💊 products are
// all made up.
// =====================================================================

import type { CounterMenu } from '../sim/shift.ts';

export const TRAINER: CounterMenu = {
  careerId: 'trainer',
  emoji: '🏋️',
  clockIn: 'Coach the floor yourself',
  serve: 'Start the set ✓',
  trayHint: 'Tap exercises to build the workout',
  ask: 'Can you give me',
  tipWord: 'Tips',
  ingredients: [
    { id: 'squat', emoji: '🦵', label: 'Squats' },
    { id: 'deadlift', emoji: '🏋️', label: 'Deadlifts' },
    { id: 'bench', emoji: '💪', label: 'Bench press' },
    { id: 'pullup', emoji: '🧗', label: 'Pull-ups' },
    { id: 'plank', emoji: '🧱', label: 'Plank' },
    { id: 'burpee', emoji: '🤸', label: 'Burpees' },
    { id: 'sprint', emoji: '🏃', label: 'Sprints' },
    { id: 'bike', emoji: '🚴', label: 'Spin bike' },
    { id: 'rower', emoji: '🚣', label: 'Rower' },
    { id: 'pads', emoji: '🥊', label: 'Pad work' },
    { id: 'rope', emoji: '🪢', label: 'Battle ropes' },
    { id: 'stretch', emoji: '🧘', label: 'Stretch' },
    { id: 'water', emoji: '💧', label: 'Water' },
    { id: 'shake', emoji: '🥤', label: 'Protein shake' },
  ],
  dishes: [
    { name: 'a leg day', items: ['squat', 'deadlift', 'stretch'] },
    { name: 'a quick cardio blast', items: ['sprint', 'bike', 'water'], extras: [['with burpees', 'burpee']] },
    { name: 'a chest and back day', items: ['bench', 'pullup'] },
    { name: 'a core session', items: ['plank', 'burpee', 'stretch'] },
    { name: 'a boxing workout', items: ['pads', 'rope', 'water'] },
    { name: 'a full-body circuit', items: ['squat', 'pullup', 'burpee', 'rower'] },
    { name: 'a recovery day', items: ['stretch', 'bike'] },
    { name: 'a wedding-in-two-weeks plan', items: ['sprint', 'rower', 'plank', 'water'] },
  ],
  side: [0.25, ', and a shake after', 'shake'],
  who: ['🧑🏽', '👩🏾', '🧔🏻', '👱🏻‍♀️', '🧑🏿', '👨🏽‍🦲', '👩🏻‍🦰', '🧓🏾'],
  choices: [
    {
      id: 'form', emoji: '🙈', text: 'A client’s squat form is… creative.',
      options: [
        { id: 'fix', label: 'Correct it gently', hint: 'The boss likes it · +social', fx: { perf: 2, needs: { social: 4 } } },
        { id: 'let', label: 'Let it slide', hint: 'Easier · the boss might notice', fx: { risk: { chance: 0.3, perf: -4 } } },
      ],
    },
    {
      id: 'influencer', emoji: '🤳', text: 'An influencer wants a free session “for exposure.”',
      options: [
        { id: 'yes', label: 'Sure, film it', hint: '+fun · a bit tiring', fx: { needs: { fun: 6, energy: -4 }, moodlet: { id: 'viral', label: 'Went a little viral', emoji: '🤳', value: 4, minutes: 120 } } },
        { id: 'no', label: 'Exposure isn’t rent', hint: 'Nothing happens' },
      ],
    },
    {
      id: 'rush', emoji: '🎆', text: 'New Year’s resolution crowd. The gym is packed.',
      options: [
        { id: 'hustle', label: 'Coach everyone', hint: 'Bigger tips for the rest of the shift · more tiring', fx: { tipsAfter: 1.5, needs: { energy: -6 } } },
        { id: 'steady', label: 'Keep your pace', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'dare', emoji: '🏋️', text: 'A regular dares you to max out on the bench.',
      options: [
        { id: 'try', label: 'Load it up', hint: '+fun · tiring · could go badly', fx: { needs: { fun: 8, energy: -6 }, risk: { chance: 0.35, perf: -3 } } },
        { id: 'pass', label: 'Not on the clock', hint: 'Nothing happens' },
      ],
    },
    {
      id: 'late', emoji: '🧽', text: 'The manager asks you to wipe down every machine before you go.',
      options: [
        { id: 'stay', label: 'Stay and clean', hint: '+$12 overtime · more tiring', fx: { money: 1_200, needs: { energy: -5 }, perf: 2 } },
        { id: 'go', label: 'Head out on time', hint: 'Nothing changes' },
      ],
    },
  ],
};

export const TECH: CounterMenu = {
  careerId: 'tech',
  emoji: '💻',
  clockIn: 'Close tickets yourself',
  serve: 'Ship it ✓',
  trayHint: 'Tap the steps that close the ticket',
  ask: 'Ticket:',
  tipWord: 'Bonus',
  ingredients: [
    { id: 'repro', emoji: '🔍', label: 'Reproduce' },
    { id: 'bug', emoji: '🐛', label: 'Find the bug' },
    { id: 'fix', emoji: '🔧', label: 'Patch' },
    { id: 'test', emoji: '✅', label: 'Test' },
    { id: 'review', emoji: '👀', label: 'Code review' },
    { id: 'deploy', emoji: '🚀', label: 'Deploy' },
    { id: 'rollback', emoji: '⏪', label: 'Roll back' },
    { id: 'design', emoji: '🎨', label: 'Design' },
    { id: 'db', emoji: '🗄️', label: 'Database' },
    { id: 'docs', emoji: '📝', label: 'Docs' },
    { id: 'meeting', emoji: '📅', label: 'Meeting' },
    { id: 'coffee', emoji: '☕', label: 'Coffee' },
    { id: 'chat', emoji: '💬', label: 'Update the team' },
    { id: 'restart', emoji: '🔌', label: 'Off and on again' },
  ],
  dishes: [
    { name: 'the login page is down', items: ['repro', 'bug', 'fix', 'deploy'] },
    { name: 'add a dark mode', items: ['design', 'fix', 'test', 'review'] },
    { name: 'the app is slow', items: ['db', 'fix', 'test', 'deploy'] },
    { name: 'the new release broke checkout', items: ['rollback', 'bug', 'fix'] },
    { name: 'the CEO’s laptop “isn’t working”', items: ['restart'], extras: [['and he’s mad', 'coffee']] },
    { name: 'write up how the API works', items: ['docs', 'review'] },
    { name: 'a quick sync about the sync', items: ['meeting', 'coffee'] },
    { name: 'a security patch', items: ['bug', 'fix', 'test', 'review', 'deploy'] },
  ],
  side: [0.2, ', and loop in the team', 'chat'],
  who: ['🧑🏻‍💻', '👩🏾‍💻', '🧑🏽‍💼', '👨🏼‍💻', '👩🏻‍🎨', '🤖'],
  choices: [
    {
      id: 'standup', emoji: '🧍', text: 'Standup is running 40 minutes.',
      options: [
        { id: 'offline', label: '“Let’s take this offline”', hint: 'The boss likes it', fx: { perf: 2 } },
        { id: 'zone', label: 'Zone out', hint: '+fun · the boss might notice', fx: { needs: { fun: 4 }, risk: { chance: 0.3, perf: -3 } } },
      ],
    },
    {
      id: 'friday', emoji: '🚀', text: 'Someone wants to deploy at 5 PM on a Friday.',
      options: [
        { id: 'stop', label: 'Stop them', hint: 'The boss likes it', fx: { perf: 3 } },
        { id: 'yolo', label: 'Let it ride', hint: 'Probably fine…', fx: { risk: { chance: 0.4, perf: -6 }, needs: { fun: 3 } } },
      ],
    },
    {
      id: 'rush', emoji: '🔥', text: 'Launch day. Everything is on fire.',
      options: [
        { id: 'hustle', label: 'Grind through it', hint: 'Bigger bonus for the rest of the shift · more tiring', fx: { tipsAfter: 1.5, needs: { energy: -6 } } },
        { id: 'steady', label: 'Keep your pace', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'donuts', emoji: '🍩', text: 'Someone brought donuts to the office.',
      options: [
        { id: 'eat', label: 'Grab one', hint: '+hunger', fx: { needs: { hunger: 20 } } },
        { id: 'skip', label: 'Skip it', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'oncall', emoji: '📟', text: 'Your lead asks you to cover on-call tonight.',
      options: [
        { id: 'yes', label: 'Take it', hint: '+$15 · more tiring', fx: { money: 1_500, needs: { energy: -6 }, perf: 2 } },
        { id: 'no', label: 'Not tonight', hint: 'Nothing changes' },
      ],
    },
  ],
};

export const FINANCE: CounterMenu = {
  careerId: 'finance',
  emoji: '📈',
  clockIn: 'Work the desk yourself',
  serve: 'Execute ✓',
  trayHint: 'Tap the moves that make the trade',
  ask: 'Client wants',
  tipWord: 'Commission',
  ingredients: [
    { id: 'buy', emoji: '📈', label: 'Buy' },
    { id: 'sell', emoji: '📉', label: 'Sell' },
    { id: 'index', emoji: '🍎', label: 'Index fund' },
    { id: 'bonds', emoji: '🛡️', label: 'Bonds' },
    { id: 'tech', emoji: '💻', label: 'Tech stock' },
    { id: 'gold', emoji: '🪙', label: 'Gold' },
    { id: 'cash', emoji: '💵', label: 'Cash' },
    { id: 'hedge', emoji: '🌂', label: 'Hedge' },
    { id: 'research', emoji: '📊', label: 'Research' },
    { id: 'call', emoji: '📞', label: 'Call the client' },
    { id: 'hold', emoji: '✋', label: 'Talk them into holding' },
    { id: 'sign', emoji: '✍️', label: 'Paperwork' },
    { id: 'lunch', emoji: '🥗', label: 'Client lunch' },
  ],
  dishes: [
    { name: 'a safe retirement plan', items: ['buy', 'index', 'bonds', 'sign'] },
    { name: 'to get out of tech', items: ['sell', 'tech', 'cash'] },
    { name: 'to ride the tech wave', items: ['research', 'buy', 'tech'], extras: [['with a hedge', 'hedge']] },
    { name: 'gold, because “the end is near”', items: ['buy', 'gold'] },
    { name: 'to panic-sell everything', items: ['call', 'hold'] },
    { name: 'a quarterly review', items: ['research', 'call', 'lunch'] },
    { name: 'their cash in bonds', items: ['buy', 'bonds', 'sign'] },
    { name: 'a hedge on their portfolio', items: ['research', 'hedge', 'sign'] },
  ],
  side: [0.2, ', and send the paperwork', 'sign'],
  who: ['🧑🏼‍💼', '👩🏾‍💼', '👴🏻', '👩🏻', '🧔🏽', '🤠'],
  choices: [
    {
      id: 'insider', emoji: '🤫', text: 'A guy at lunch “knows something” about a merger.',
      options: [
        { id: 'walk', label: 'Walk away', hint: 'Clean · the boss likes it', fx: { perf: 2, moodlet: { id: 'cleanTrade', label: 'Kept it clean', emoji: '😇', value: 3, minutes: 90 } } },
        { id: 'listen', label: 'Act on it', hint: '+$20 · compliance might notice', fx: { money: 2_000, risk: { chance: 0.3, perf: -8 } } },
      ],
    },
    {
      id: 'golf', emoji: '⛳', text: 'The boss invites you to golf with a big client.',
      options: [
        { id: 'go', label: 'Grab your clubs', hint: '+social · the boss likes it · tiring', fx: { needs: { social: 10, energy: -5 }, perf: 3 } },
        { id: 'no', label: 'Stay at the desk', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'rush', emoji: '🔔', text: 'Market open. Every phone on the floor is ringing.',
      options: [
        { id: 'hustle', label: 'Work the phones', hint: 'Bigger commission for the rest of the shift · more tiring', fx: { tipsAfter: 1.5, needs: { energy: -6 } } },
        { id: 'steady', label: 'Keep your pace', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'intern', emoji: '☕', text: 'The intern brought you the wrong coffee.',
      options: [
        { id: 'fine', label: '“It’s fine, thanks”', hint: '+mood', fx: { moodlet: { id: 'kindBoss', label: 'Was nice to the intern', emoji: '🙂', value: 3, minutes: 90 } } },
        { id: 'snap', label: 'Make a scene', hint: '−social · people talk', fx: { needs: { social: -4 }, risk: { chance: 0.4, perf: -2 } } },
      ],
    },
    {
      id: 'late', emoji: '🌃', text: 'A deal is closing tonight. Can you stay?',
      options: [
        { id: 'stay', label: 'Stay late', hint: '+$15 · more tiring', fx: { money: 1_500, needs: { energy: -6 }, perf: 2 } },
        { id: 'go', label: 'Head out', hint: 'Nothing changes' },
      ],
    },
  ],
};

export const DANCER: CounterMenu = {
  careerId: 'dancer',
  emoji: '🌙',
  clockIn: 'Take the stage yourself',
  serve: 'Perform ✓',
  trayHint: 'Tap moves to build the routine',
  ask: 'The DJ calls',
  tipWord: 'Tips',
  ingredients: [
    { id: 'spin', emoji: '💃', label: 'Spin' },
    { id: 'roll', emoji: '🕺', label: 'Body roll' },
    { id: 'twirl', emoji: '🌀', label: 'Twirl' },
    { id: 'pose', emoji: '✨', label: 'Pose' },
    { id: 'floor', emoji: '⬇️', label: 'Floor work' },
    { id: 'hair', emoji: '💁', label: 'Hair flip' },
    { id: 'kick', emoji: '🦵', label: 'High kick' },
    { id: 'wave', emoji: '🌊', label: 'Wave' },
    { id: 'split', emoji: '🤸', label: 'Split' },
    { id: 'wink', emoji: '😉', label: 'Wink' },
    { id: 'beat', emoji: '🎶', label: 'Hit the beat' },
    { id: 'finish', emoji: '🔥', label: 'Big finish' },
    { id: 'smile', emoji: '😁', label: 'Smile' },
  ],
  dishes: [
    { name: 'a slow song', items: ['roll', 'wave', 'pose'] },
    { name: 'an uptempo set', items: ['spin', 'kick', 'beat', 'finish'] },
    { name: 'the birthday song', items: ['twirl', 'smile', 'finish'] },
    { name: 'a throwback hit', items: ['roll', 'hair', 'beat'] },
    { name: 'the headliner set', items: ['spin', 'split', 'floor', 'finish'] },
    { name: 'a crowd favorite', items: ['twirl', 'kick', 'wink'] },
    { name: 'a quick encore', items: ['pose', 'finish'] },
  ],
  side: [0.2, ', with a big smile', 'smile'],
  who: ['🎧', '🥂', '🕺🏽', '💃🏻', '🧔🏾', '👩🏼'],
  choices: [
    {
      id: 'vip', emoji: '🥂', text: 'A VIP table asks for a private dance.',
      options: [
        { id: 'yes', label: 'Take the booking', hint: '+$20 · a bit tiring', fx: { money: 2_000, needs: { energy: -5 } } },
        { id: 'no', label: 'Stay on stage', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'heel', emoji: '👠', text: 'Your heel strap snaps mid-set.',
      options: [
        { id: 'tape', label: 'Duct tape it', hint: 'The show goes on', fx: { perf: 1 } },
        { id: 'bare', label: 'Go barefoot', hint: '+fun · could look off', fx: { needs: { fun: 3 }, risk: { chance: 0.3, perf: -2 } } },
      ],
    },
    {
      id: 'rush', emoji: '🎉', text: 'A bachelorette party just walked in.',
      options: [
        { id: 'hustle', label: 'Give them a show', hint: 'Bigger tips for the rest of the shift · more tiring', fx: { tipsAfter: 1.5, needs: { energy: -6 } } },
        { id: 'steady', label: 'Keep your pace', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'drink', emoji: '🍾', text: 'A regular wants to buy you a drink.',
      options: [
        { id: 'take', label: 'Cheers', hint: '+fun · a little sloppier after', fx: { needs: { fun: 8, energy: -3 }, risk: { chance: 0.3, perf: -2 } } },
        { id: 'water', label: 'Just water', hint: 'Nothing happens' },
      ],
    },
    {
      id: 'late', emoji: '🌅', text: 'The manager asks you to do the closing set.',
      options: [
        { id: 'stay', label: 'Close it out', hint: '+$15 · more tiring', fx: { money: 1_500, needs: { energy: -6 }, perf: 2 } },
        { id: 'go', label: 'Head home', hint: 'Nothing changes' },
      ],
    },
  ],
};

/** 💊 Every product here is made up (Peter: five fictional products). */
export const PHARMACIST: CounterMenu = {
  careerId: 'pharmacist',
  emoji: '💊',
  clockIn: 'Work the corner yourself',
  serve: 'Hand it over ✓',
  trayHint: 'Tap the goods, the bag and the change',
  ask: 'Lemme get',
  tipWord: 'Sales',
  ingredients: [
    { id: 'comet', emoji: '🍬', label: 'Sugar Comets' },
    { id: 'mint', emoji: '🌙', label: 'Moon Mints' },
    { id: 'marble', emoji: '🔮', label: 'Purple Marbles' },
    { id: 'zap', emoji: '⚡', label: 'Zap Pops' },
    { id: 'fizz', emoji: '🧪', label: 'Lab Fizz' },
    { id: 'bag', emoji: '🛍️', label: 'Bag' },
    { id: 'change', emoji: '💵', label: 'Change' },
    { id: 'lookout', emoji: '👀', label: 'Look around' },
    { id: 'nod', emoji: '🤝', label: 'Nod' },
  ],
  dishes: [
    { name: 'a Moon Mint', items: ['mint', 'bag'] },
    { name: 'some Purple Marbles', items: ['marble', 'bag', 'change'] },
    { name: 'a Zap Pop and a Lab Fizz', items: ['zap', 'fizz', 'bag'] },
    { name: 'a Lab Fizz', items: ['fizz', 'change'], extras: [['real quick', 'nod']] },
    { name: 'two Sugar Comets', items: ['comet', 'comet', 'bag'] },
    { name: 'the sampler', items: ['comet', 'mint', 'zap', 'bag'] },
  ],
  side: [0.3, ', and watch out, man', 'lookout'],
  who: ['🧥', '🧢', '🕶️', '🧔🏽', '👩🏻‍🎤', '🧑🏾'],
  choices: [
    {
      id: 'cruiser', emoji: '🚓', text: 'A cruiser rolls by. Slowly.',
      options: [
        { id: 'casual', label: 'Act casual', hint: 'Might not work', fx: { risk: { chance: 0.25, perf: -3 } } },
        { id: 'walk', label: 'Walk around the block', hint: 'Safer · a bit tiring', fx: { needs: { energy: -4 }, perf: 1 } },
      ],
    },
    {
      id: 'credit', emoji: '🙏', text: 'A regular asks for credit till Friday.',
      options: [
        { id: 'yes', label: 'Front it', hint: 'He might never pay', fx: { risk: { chance: 0.5, money: -1_500 }, moodlet: { id: 'trust', label: 'Looked out for a regular', emoji: '🤝', value: 2, minutes: 90 } } },
        { id: 'no', label: 'Cash only', hint: 'Nothing happens' },
      ],
    },
    {
      id: 'rush', emoji: '🌃', text: 'Friday night. The line is down the alley.',
      options: [
        { id: 'hustle', label: 'Move fast', hint: 'Bigger sales for the rest of the shift · more tiring', fx: { tipsAfter: 1.5, needs: { energy: -6 } } },
        { id: 'steady', label: 'Keep your pace', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'rival', emoji: '😠', text: 'Someone from another crew is on your corner.',
      options: [
        { id: 'talk', label: 'Talk it out', hint: '+social', fx: { needs: { social: 5 }, perf: 1 } },
        { id: 'share', label: 'Share the corner', hint: 'Smaller sales for the rest of the shift', fx: { tipsAfter: 0.7 } },
      ],
    },
    {
      id: 'cold', emoji: '🥶', text: 'It’s freezing out here.',
      options: [
        { id: 'coffee', label: 'Grab a hot coffee', hint: '−$3 · +fun', fx: { money: -300, needs: { fun: 3 } } },
        { id: 'tough', label: 'Tough it out', hint: 'More tiring', fx: { needs: { energy: -4 } } },
      ],
    },
  ],
};

export const COP: CounterMenu = {
  careerId: 'cop',
  emoji: '🚓',
  clockIn: 'Work your beat yourself',
  serve: 'Handle it ✓',
  trayHint: 'Tap what you do, in any order',
  ask: 'Dispatch:',
  tipWord: 'Bonus',
  ingredients: [
    { id: 'radio', emoji: '📻', label: 'Radio in' },
    { id: 'drive', emoji: '🚓', label: 'Drive over' },
    { id: 'walk', emoji: '🚶', label: 'Walk over' },
    { id: 'talk', emoji: '🗣️', label: 'Talk it down' },
    { id: 'ticket', emoji: '🎫', label: 'Write a ticket' },
    { id: 'cuffs', emoji: '⛓️', label: 'Arrest' },
    { id: 'chase', emoji: '🏃', label: 'Chase' },
    { id: 'ems', emoji: '🚑', label: 'Call EMS' },
    { id: 'cone', emoji: '🚧', label: 'Block the street' },
    { id: 'dog', emoji: '🐕', label: 'Catch the dog' },
    { id: 'report', emoji: '📝', label: 'File a report' },
    { id: 'coffee', emoji: '☕', label: 'Coffee' },
  ],
  dishes: [
    { name: 'a noise complaint on 5th', items: ['walk', 'talk', 'report'] },
    { name: 'a fender bender on Canal', items: ['drive', 'cone', 'report'] },
    { name: 'a shoplifter at the bodega', items: ['chase', 'cuffs', 'report'] },
    { name: 'someone fainted on the subway', items: ['radio', 'ems', 'report'] },
    { name: 'a car blocking a hydrant', items: ['walk', 'ticket'] },
    { name: 'a loose dog in the park', items: ['walk', 'dog'], extras: [['and it’s fast', 'chase']] },
    { name: 'a fight outside a bar', items: ['drive', 'talk', 'cuffs', 'report'] },
    { name: 'speeding on the West Side Highway', items: ['drive', 'chase', 'ticket'] },
  ],
  side: [0.25, ', then grab a coffee', 'coffee'],
  who: ['📻', '🧑🏽', '👵🏻', '👨🏾‍💼', '🧑🏻‍🍳', '👩🏿'],
  choices: [
    {
      id: 'donut', emoji: '🍩', text: 'Your partner wants a donut stop. Again.',
      options: [
        { id: 'stop', label: 'Fine, one donut', hint: '+hunger · Sarge might notice', fx: { needs: { hunger: 15 }, risk: { chance: 0.2, perf: -1 } } },
        { id: 'patrol', label: 'Keep patrolling', hint: 'Sarge likes it', fx: { perf: 1 } },
      ],
    },
    {
      id: 'kid', emoji: '🧒', text: 'A kid wants a photo with the squad car.',
      options: [
        { id: 'yes', label: 'Say cheese', hint: '+social · +mood', fx: { needs: { social: 6 }, moodlet: { id: 'photoKid', label: 'Made a kid’s day', emoji: '📸', value: 4, minutes: 120 } } },
        { id: 'no', label: 'Busy, sorry', hint: 'Nothing happens' },
      ],
    },
    {
      id: 'rush', emoji: '🚨', text: 'Busy night. Calls are stacking up.',
      options: [
        { id: 'hustle', label: 'Take every call', hint: 'Bigger bonus for the rest of the shift · more tiring', fx: { tipsAfter: 1.5, needs: { energy: -6 } } },
        { id: 'steady', label: 'Keep your pace', hint: 'Nothing changes' },
      ],
    },
    {
      id: 'tourist', emoji: '🗺️', text: 'A nervous tourist just ran a red light.',
      options: [
        { id: 'warn', label: 'Let them off with a warning', hint: '+social', fx: { needs: { social: 4 } } },
        { id: 'ticket', label: 'Write the ticket', hint: 'Sarge likes it', fx: { perf: 2 } },
      ],
    },
    {
      id: 'late', emoji: '📝', text: 'Sarge needs your reports filed before you go.',
      options: [
        { id: 'stay', label: 'Stay and file', hint: '+$15 overtime · more tiring', fx: { money: 1_500, needs: { energy: -5 }, perf: 2 } },
        { id: 'go', label: 'File them tomorrow', hint: 'Nothing changes' },
      ],
    },
  ],
};

export const MORE_MENUS: Record<string, CounterMenu> = { trainer: TRAINER, tech: TECH, finance: FINANCE, dancer: DANCER, pharmacist: PHARMACIST, cop: COP };
