// =====================================================================
// gang-events.ts — street events that come from the crews (sim/gangs.ts).
//
// These plug into the normal random-event list (sim/events.ts), so the
// event director decides when they fire, keeps good and bad balanced
// and respects cooldowns. Delete the import of this file (in game.ts)
// and gangs never bother you.
//
// The crews REMEMBER you (respect), so you can't farm them: fight a crew
// and its members get meaner; help one and its rivals notice.
// =====================================================================

import { money } from '../core/format.ts';
import { EVENTS, type EventContext, type Outcome } from './events.ts';
import { coolScore } from './garage.ts';
import { changeRespect, CREWS, fight, lackingRisk, markActive, RANKS, repPerks, standing, turfAt, type CrewDef } from './gangs.ts';
import { arrest } from './jail.ts';
import { changeMoney } from './economy.ts';

const here = (c: EventContext): CrewDef | null => (c.where === 'street' ? turfAt(c.s, c.area, c.s.location.x, c.s.location.z) : null);

/** Something about you that caught their eye (for flavour). */
function flex(c: EventContext): string {
  const cool = coolScore(c.s);
  if (cool.car >= 30) return 'Nice ride.';
  if (cool.outfit >= 15) return 'Nice fit.';
  if (c.s.money > 50_000) return 'Saw you flash that cash.';
  return 'Wrong block, friend.';
}

function lose(c: EventContext, share: number): number {
  const amt = Math.floor((c.s.money * share) / 100) * 100;
  if (amt > 0) changeMoney(c.s, -amt, 'Robbed on the street');
  return amt;
}

EVENTS.push(
  {
    id: 'caughtLacking',
    title: 'Caught lacking',
    emoji: '😬',
    kind: 'bad',
    weight: (c) => {
      const crew = here(c);
      return crew ? lackingRisk(c.s, crew, c.hour, coolScore(c.s).total) * 8 : 0;
    },
    text: (c) => {
      const crew = here(c)!;
      return `Three ${crew.name} ${crew.emoji} step out and box you in. “${flex(c)} This is ${crew.name} turf. Empty your pockets.”`;
    },
    choices: [
      {
        label: 'Hand it over', emoji: '🙌',
        run: (c) => {
          const crew = here(c);
          const amt = lose(c, 0.6);
          if (crew) changeRespect(c.s, crew.id, 3);
          return { text: `You handed over ${money(amt)}. They laughed and let you go. Humiliating — but you’re in one piece.`, tone: 'bad', moodlet: { id: 'robbed', label: 'Got robbed', emoji: '😤', value: -15, minutes: 60 * 8 } };
        },
      },
      {
        label: 'Run for it', emoji: '🏃',
        hint: 'Fitness helps',
        run: (c) => {
          if (Math.random() < 0.35 + c.skill('fitness') * 0.06 + repPerks(c.s).getaway) return { text: 'You bolted through traffic and lost them two blocks later. Heart pounding.', tone: 'good', needs: { energy: -20, fun: 5 } };
          const amt = lose(c, 0.8);
          return { text: `They caught you at the corner. Took ${money(amt)} and gave you a few bruises to remember them by.`, tone: 'bad', hospitalBill: 30_000, needs: { energy: -30 }, moodlet: { id: 'beatUp', label: 'Bruised', emoji: '🤕', value: -20, minutes: 60 * 24 } };
        },
      },
      {
        label: 'Fight', emoji: '👊',
        hint: 'Fitness + street smarts. They fight back.',
        run: (c) => {
          const crew = here(c)!;
          if (fight(c.s, crew)) {
            changeRespect(c.s, crew.id, -12);
            c.s.paths.rep.crime = (c.s.paths.rep.crime ?? 0) + 8;
            return { text: `You dropped the first one and the others backed off. Word will spread — ${crew.name} won’t forget your face.`, tone: 'good', needs: { energy: -25 }, moodlet: { id: 'heldGround', label: 'Held your ground', emoji: '💪', value: 15, minutes: 60 * 12 } };
          }
          changeRespect(c.s, crew.id, -5);
          const amt = lose(c, 0.5);
          return { text: `Bad idea. You woke up in the ER at Bellevue missing ${money(amt)}. Nothing broken. Mostly your pride.`, tone: 'bad', hospitalBill: 90_000 + Math.floor(Math.random() * 60_000), needs: { energy: -50, fun: -20 }, moodlet: { id: 'beatUp', label: 'Beaten up', emoji: '🤕', value: -30, minutes: 60 * 48 } };
        },
      },
      {
        label: 'Call your crew', emoji: '📣',
        show: (c) => !!c.s.gang.crew && c.s.gang.rank >= 1,
        run: (c) => {
          const crew = here(c)!;
          changeRespect(c.s, crew.id, -15);
          if (c.s.gang.crew) changeRespect(c.s, c.s.gang.crew, 4);
          return { text: `Your people rolled up in under a minute. ${crew.name} scattered. This isn’t over, though.`, tone: 'good', moodlet: { id: 'backup', label: 'They had my back', emoji: '🫂', value: 12, minutes: 60 * 12 } };
        },
      },
      {
        label: 'Talk your way out', emoji: '🗣️',
        show: (c) => c.skill('streetSmarts') >= 3 || c.skill('charisma') >= 4,
        run: (c) => {
          const crew = here(c)!;
          if (Math.random() < 0.3 + c.skill('streetSmarts') * 0.07 + c.skill('charisma') * 0.04) {
            changeRespect(c.s, crew.id, 5);
            return { text: 'You dropped a couple of names and made them laugh. They let you walk. One of them even nodded.', tone: 'good', skill: { key: 'streetSmarts', gain: 0.2 } };
          }
          const amt = lose(c, 0.7);
          return { text: `They didn’t buy it. ${money(amt)} lighter and a shove into the trash bags.`, tone: 'bad', moodlet: { id: 'robbed', label: 'Got robbed', emoji: '😤', value: -15, minutes: 60 * 8 } };
        },
      },
    ],
  },
  {
    id: 'crewNod',
    title: 'Friendly faces',
    emoji: '🤝',
    kind: 'good',
    weight: (c) => {
      const crew = here(c);
      if (!crew) return 0;
      const st = standing(c.s, crew.id);
      return st === 'family' ? 0.8 : st === 'friendly' ? 0.4 : 0;
    },
    text: (c) => {
      const crew = here(c)!;
      return c.s.gang.crew === crew.id
        ? `A ${crew.name} ${crew.emoji} kid spots you: “Yo, ${RANKS[c.s.gang.rank]}! Boss says you’re doing good.” He slips you something.`
        : `A ${crew.name} ${crew.emoji} regular waves you over. “You’re alright. Here — heads up, cops are sweeping the next block.”`;
    },
    choices: [
      {
        label: 'Thanks', emoji: '✊',
        run: (c) => {
          const crew = here(c)!;
          changeRespect(c.s, crew.id, 2);
          const gift = c.s.gang.crew === crew.id ? 2_000 + c.s.gang.rank * 3_000 : 0;
          return { text: gift ? `+${money(gift)} for your trouble.` : 'Good to have friends on this block.', tone: 'good', money: gift || undefined, needs: { social: 10 } };
        },
      },
    ],
  },
  {
    id: 'crewJob',
    title: 'A favour',
    emoji: '🎒',
    kind: 'mixed',
    weight: (c) => {
      const crew = here(c);
      return crew && c.s.gang.crew === crew.id ? 0.7 : 0;
    },
    text: (c) => `Your ${here(c)!.name} contact hands you a backpack. “Take this to the laundromat on the corner. Don’t open it. Don’t get stopped.”`,
    choices: [
      {
        label: 'Do it', emoji: '🎒',
        hint: 'Respect + cash. Small risk of arrest.',
        run: (c): Outcome => {
          const crew = here(c)!;
          if (Math.random() < 0.12) {
            const msg = arrest(c.s, 'carrying a bag full of trouble', 10, 80_000);
            changeRespect(c.s, crew.id, 6); // you didn't snitch
            return { text: `${msg} You kept your mouth shut. ${crew.name} noticed.`, tone: 'bad' };
          }
          changeRespect(c.s, crew.id, 8);
          markActive(c.s);
          return { text: 'Dropped off, no questions. +8 respect.', tone: 'good', money: 15_000 + c.s.gang.rank * 10_000 };
        },
      },
      {
        label: 'Not today', emoji: '🙅',
        run: (c) => {
          changeRespect(c.s, here(c)!.id, -4);
          return { text: '“Hm. Okay.” They’ll remember that.', tone: 'info' };
        },
      },
    ],
  },
  {
    id: 'turfWar',
    title: 'Turf war',
    emoji: '⚔️',
    rarity: 'rare',
    kind: 'mixed',
    weight: (c) => (here(c) ? 1 : 0),
    text: (c) => {
      const crew = here(c)!;
      const rival = CREWS.all().find((x) => x.id !== crew.id && x.area === crew.area) ?? crew;
      return `${crew.name} ${crew.emoji} and ${rival.name} ${rival.emoji} are squaring up in the middle of the street. Phones are out. Sirens in the distance.`;
    },
    choices: [
      {
        label: `Back the home crew`, emoji: '🛡️',
        run: (c) => {
          const crew = here(c)!;
          const rival = CREWS.all().find((x) => x.id !== crew.id && x.area === crew.area);
          changeRespect(c.s, crew.id, 12);
          if (rival) changeRespect(c.s, rival.id, -15);
          if (Math.random() < 0.25) return { text: `${arrest(c.s, 'brawling in the street', 8, 50_000)} At least ${crew.name} saw you stand with them.`, tone: 'bad' };
          return { text: `You stood with ${crew.name}. They won’t forget it. Neither will the others.`, tone: 'good', moodlet: { id: 'loyal', label: 'Ride or die', emoji: '🔥', value: 10, minutes: 60 * 12 } };
        },
      },
      {
        label: 'Film it and walk away', emoji: '📱',
        run: () => ({ text: 'Your video got 40k views. You were nowhere near it. Smart.', tone: 'good', needs: { fun: 10 } }),
      },
    ],
  },
);
