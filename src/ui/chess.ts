// =====================================================================
// chess.ts (ui) — ♟️ the Chess House and the park chess tables (Peter,
// 2026-10-15: "add a chess house"; 2026-10-28: "can you fix… chess…").
//
// openChessHouse(host, title) opens one modal with three screens:
//   1. the room: who's playing today (house regulars, park hustlers);
//   2. the table: clock (untimed / rapid 10+0 / blitz 3+2), colour, bet;
//   3. the game: a wooden board with drawn pieces (SVG), tap-to-move and
//      drag-to-move, legal-move dots, last-move and check highlights,
//      a promotion picker, captured pieces, clocks, the move list in
//      algebraic notation, undo (untimed friendly games only), draw
//      offers, resigning, and an opponent who talks a little.
//
// The opponent thinks in a Web Worker (ui/chess-worker.ts) so nothing
// freezes. Rules and the engine: sim/chess.ts. Bets, rating and news:
// sim/chess-club.ts (win doubles your bet, a draw hands it back). In-game
// money only.
// =====================================================================

import './chess.css';
import { esc, money } from '../core/format.ts';
import { Board, bookMove, CLOCKS, ChessGame, levelFor, OPPONENTS, PIECE_VALUE, START_FEN, think, type ClockId, type EndWhy, type Level, type Opponent, type PlayedMove, type Thought } from '../sim/chess.ts';
import { chessOf, settleChess, stakeUp } from '../sim/chess-club.ts';
import type { GameState } from '../sim/types.ts';
import type { EngineReply, EngineRequest } from './chess-worker.ts';
import { sfx } from './audio.ts';
import { openModal, toast } from './dom.ts';
import { burstAt, buzz, popAt, shakeEl } from './juice.ts';

export interface ChessHost {
  state: GameState;
  saved: () => void;
  /** A game finished (🏆 leaderboard: your rating). */
  onRating?: (rating: number) => void;
  /** A game finished: how it went, against whom (season points, challenges). */
  onChess?: (outcome: 'win' | 'loss' | 'draw', opponentId: string) => void;
}

type Side = 'w' | 'b';
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

// ------------------------------------------------------------------ voices
// Light, never mean. One set per opponent; any missing moment stays quiet.
type Moment = 'hello' | 'think' | 'took' | 'lost' | 'checked' | 'check' | 'winning' | 'losing' | 'drawYes' | 'drawNo' | 'resign' | 'win' | 'lose' | 'draw' | 'undo';
const VOICE: Record<string, Partial<Record<Moment, string[]>>> = {
  kid: {
    hello: ['I’ve been practising on my tablet. A lot.', 'Do you know what en passant is? I do.', 'My mom says I’m gifted.'],
    think: ['Wait, can the horse do that?', 'Hmm hmm hmm.', 'I’m telling everyone at school about this.'],
    took: ['YOINK!', 'Mine now!', 'I’m putting that on my shelf.'],
    lost: ['HEY. That was my favourite one.', 'I let you have that.', 'Okay, that was a trap. For me.'],
    checked: ['That’s not fair!', 'Is that allowed?!', 'Rude. Allowed, but rude.'],
    check: ['CHECK! Did I say it right?', 'Check! I always wanted to say that.'],
    winning: ['I’m gonna win and get a hot dog.', 'This is easier than Minecraft.'],
    losing: ['I’m just warming up.', 'Can this one be practice?'],
    drawYes: ['Okay, but I was totally winning.'],
    drawNo: ['No way. I’m about to do a combo.'],
    win: ['GG! I’m telling my mom.', 'Good game! You were pretty good for a grown-up.'],
    lose: ['Best two out of three?', 'GG. I’m gonna practise so hard.'],
    draw: ['A draw is like a tie in soccer. Boring but okay.'],
    undo: ['Take-backs? Okay, but just this once.'],
  },
  lou: {
    hello: ['Blitz, my friend. Blink and it’s over.', 'I play fast so I can play more of you.', 'Clock’s running. Well, it will be.'],
    think: ['Hold up, hold up.', 'Okay, that one I gotta think about. One second.', 'Tick tock.'],
    took: ['Snatched!', 'Too slow, my friend.', 'Ka-ching.'],
    lost: ['Oops. Fat fingers.', 'Meant to do that. Mostly.', 'That piece was overrated anyway.'],
    checked: ['Whoa, easy!', 'Okay, okay, I see you.'],
    check: ['Check! Keep up.', 'Check. Hands moving yet?'],
    winning: ['You’re playing bullet in slow motion.', 'This is going great. For me.'],
    losing: ['Hold on, I had a plan for this.', 'Speed-running a comeback.'],
    drawYes: ['Deal. I got another game waiting.'],
    drawNo: ['Nah. Too much clock left. For me.'],
    win: ['GG! Rematch? I got all day. Well, three minutes.', 'Fast hands win again.'],
    lose: ['Respect. You got me fair.', 'Okay, you’re quick. I’ll allow it.'],
    draw: ['Even. Run it back?'],
    undo: ['Take-backs? In the park? Fine, you’re new.'],
  },
  professor: {
    hello: ['Ah, a new student. Sit, sit.', 'Take your time. I have all day.', 'In 1974 I played this exact position. I think.'],
    think: ['Hmm. Interesting choice.', 'One moment. I’m calculating. Slowly.', 'Let me consult my notes. Mentally.'],
    took: ['As the books predicted.', 'Elementary.', 'That one was loose, I’m afraid.'],
    lost: ['Ah. I underestimated you.', 'A fair trade. Mostly.', 'Noted.'],
    checked: ['Ah. Check. Very good.', 'A sharp move.'],
    check: ['Check, I believe.', 'Mind your king.'],
    winning: ['The position speaks for itself.', 'Patience is a piece too.'],
    losing: ['Hm. A teachable moment. For me.', 'I may need to revise my lecture.'],
    drawYes: ['A fair result. I accept.'],
    drawNo: ['Not yet. There is still a lesson here.'],
    resign: ['I resign. Well played. Truly.'],
    win: ['A good game. Come back, you’re improving.', 'Class dismissed.'],
    lose: ['Excellent. I’ll tell my old students about you.', 'Well played. My notes were wrong.'],
    draw: ['A draw. Respectable.'],
    undo: ['Of course. Learning is allowed here.'],
  },
  pops: {
    hello: ['Pull up a stool. No rush.', 'Thirty-some years at this table. Still love it.', 'Want a coffee? No? Okay, let’s play.'],
    think: ['Mm-hm.', 'Slow and steady.', 'The pigeons are watching. Don’t embarrass us.'],
    took: ['I’ll hold onto that.', 'Thank you kindly.', 'Free pawns are the best pawns.'],
    lost: ['Ah, you saw that.', 'Good eye.', 'Hm. Didn’t see it coming.'],
    checked: ['Oh, look at you.', 'Ha! Okay.'],
    check: ['Check, friend.', 'Watch the king.'],
    winning: ['Steady wins the park.', 'Nice day for it, huh?'],
    losing: ['You’re playing real chess now.', 'Hm. Okay, okay.'],
    drawYes: ['Sure. Shake on it.'],
    drawNo: ['Let’s play it out. Nowhere to be.'],
    win: ['Good game. Come back tomorrow, I’ll be here.', 'You’ll get me next time.'],
    lose: ['Well, I’ll be. Good game.', 'Thirty years and you still surprised me.'],
    draw: ['A draw on a nice day. Can’t complain.'],
    undo: ['Go ahead, take it back. Nobody’s keeping score. Except me.'],
  },
  eddie: {
    hello: ['Twenty bucks, five minutes, no crying.', 'Tick tock, tourist.', 'I’ll even let you think. Briefly.'],
    think: ['Huh. Okay.', 'You’re making me work for my lunch.', 'That’s twenty bucks walking away from you.'],
    took: ['Thank you for your donation.', 'Ka-ching.', 'Rookie mistake. I love rookies.'],
    lost: ['Lucky. Pure luck.', 'Okay, okay, the tourist bites.', 'I was testing you.'],
    checked: ['Whoa, whoa. Relax.', 'Calm down, Bobby Fischer.'],
    check: ['Check. Keep your hands where I can see them.', 'Check, champ.'],
    winning: ['This is my office, friend.', 'Washington Square thanks you.'],
    losing: ['Who taught you this?', 'Alright. Now I’m awake.'],
    drawYes: ['Fine, fine. Split it.'],
    drawNo: ['Draw? Never heard of her.'],
    win: ['Pleasure doing business.', 'Come back anytime. Bring friends.'],
    lose: ['Okay. Respect. Don’t tell anyone.', 'You’re not a tourist, are you.'],
    draw: ['A draw. We never speak of this.'],
    undo: ['Take-backs cost extra. Kidding. Go.'],
  },
  tanya: {
    hello: ['I like sharp positions. Hope you do too.', 'Let’s make this messy.', 'Fair warning: I sacrifice things.'],
    think: ['There’s a sac here somewhere…', 'Calculating. Ignore the muttering.'],
    took: ['Thank you.', 'That one was loose.', 'Tactics, baby.'],
    lost: ['Fine. It’s a sacrifice now.', 'All part of the plan. Probably.', 'Ooh, nice shot.'],
    checked: ['Okay! A fight.', 'Ha. I like it.'],
    check: ['Check.', 'Your king looks chilly.'],
    winning: ['The attack plays itself.', 'Feel that breeze? That’s your king.'],
    losing: ['Okay, you’re good.', 'I may have over-sacrificed.'],
    drawYes: ['Fair. Good fight.'],
    drawNo: ['No way, it’s just getting fun.'],
    resign: ['I resign. That was a real game.'],
    win: ['Good fight! Come back sharper.', 'Thanks for the game. That was fun.'],
    lose: ['You beat me fair and square. Respect.', 'Brilliant. Rematch soon?'],
    draw: ['A draw, but a spicy one.'],
    undo: ['Sure. Find the better move this time.'],
  },
  gloria: {
    hello: ['Mm. Sit.', '(she fills in 4-down)', 'Seven letters, “a quiet victory”…'],
    think: ['…', '(taps her pen)', 'Hm.'],
    took: ['Mm.', 'Thank you, dear.', '(doesn’t even look up)'],
    lost: ['Hm.', '…well played.', '(she sips her tea, louder)'],
    checked: ['Oh my.', '(puts the crossword down)'],
    check: ['Check, dear.', '(slides the queen without a sound)'],
    winning: ['Not bad. Not good either.', '(back to the crossword)'],
    losing: ['(the crossword is face down now)', 'Interesting. Very interesting.'],
    drawYes: ['A draw. Agreed.'],
    drawNo: ['No, thank you.'],
    resign: ['(she tips her king) Lovely game.'],
    win: ['Thank you for the game, dear.', 'Good game. You made me put the pen down.'],
    lose: ['Well. The house will talk about this one.', 'Beautifully played. I mean it.'],
    draw: ['A draw with me is not nothing.'],
    undo: ['(she pretends not to see)'],
  },
};
const say = (opp: Opponent, k: Moment): string | null => {
  const a = VOICE[opp.id]?.[k];
  return a?.length ? pick(a) : null;
};

// --------------------------------------------------------------- piece art
// Drawn for this game in a 45×45 box: ivory and ebony, with a soft shadow.
const ART: Record<string, string> = {
  p: '<rect class="f" x="10" y="34" width="25" height="5.5" rx="2.2"/><path class="f" d="M17.6 22.5C17.2 27.5 15.2 31.2 12.4 34.2H32.6C29.8 31.2 27.8 27.5 27.4 22.5Z"/><rect class="f" x="15.2" y="19.6" width="14.6" height="3.8" rx="1.9"/><circle class="f" cx="22.5" cy="13.6" r="5.6"/>',
  r: '<rect class="f" x="9" y="35" width="27" height="5" rx="2"/><rect class="f" x="11.5" y="31.2" width="22" height="4" rx="1"/><path class="f" d="M14.6 31.2L15.6 17.6H29.4L30.4 31.2Z"/><rect class="f" x="12" y="13.8" width="21" height="3.8" rx="1"/><path class="f" d="M12 13.8V7.6H16.2V10.2H20.4V7.6H24.6V10.2H28.8V7.6H33V13.8Z"/><path class="d" d="M15.4 20.5H29.6M15.1 28.4H29.9"/>',
  n: '<rect class="f" x="9.5" y="35" width="26" height="5" rx="2"/><path class="f" d="M13.5 35C13.2 30 14.6 26.6 18.8 23.6C20.6 22.3 21 20.6 20.6 19.2C18.6 21 15.6 22.2 12.8 22.6C11 23.4 9.6 22.8 9.2 21.4C8.6 19.6 9.6 18.4 11.2 17.2L17.4 11.4L17.8 7.2L20.8 10.2C26.2 9.4 31.6 12.6 33.4 19.4C35 25.6 33.8 30.6 32.6 35Z"/><path class="d" d="M24.2 12.4C28.6 14.2 30.8 19.2 30.6 24.8M10.4 20.6L11.6 20.2"/><circle class="e" cx="17.4" cy="15.2" r="1.25"/>',
  b: '<rect class="f" x="9" y="35" width="27" height="5" rx="2.2"/><path class="f" d="M14.2 35C16.2 33.6 17.4 32.4 17.6 30.4H27.4C27.6 32.4 28.8 33.6 30.8 35Z"/><rect class="f" x="15.6" y="27.6" width="13.8" height="3.4" rx="1.6"/><path class="f" d="M22.5 8.6C17.6 11.8 14.6 17 15.4 22.4C15.9 25.4 17.4 27.2 17.8 27.6H27.2C27.6 27.2 29.1 25.4 29.6 22.4C30.4 17 27.4 11.8 22.5 8.6Z"/><circle class="f" cx="22.5" cy="6.4" r="2.5"/><path class="d" d="M25.8 13.6L21.4 19.4M20.2 17.2H24.8"/>',
  q: '<rect class="f" x="9.5" y="35" width="26" height="5" rx="2.2"/><path class="f" d="M12.2 35L9.8 16.2L15.6 26.4L16.4 12L20.8 25.2L22.5 10.4L24.2 25.2L28.6 12L29.4 26.4L35.2 16.2L32.8 35Z"/><path class="d" d="M12.8 30.6C19 28.8 26 28.8 32.2 30.6"/><circle class="f" cx="9.6" cy="14.6" r="2.4"/><circle class="f" cx="16.3" cy="10.2" r="2.4"/><circle class="f" cx="22.5" cy="8.4" r="2.4"/><circle class="f" cx="28.7" cy="10.2" r="2.4"/><circle class="f" cx="35.4" cy="14.6" r="2.4"/>',
  k: '<rect class="f" x="9.5" y="35" width="26" height="5" rx="2.2"/><path class="f" d="M12.6 35C10.4 29.6 9.4 25 11.6 21.8C14.4 17.8 19.6 18.8 22.5 23.4C25.4 18.8 30.6 17.8 33.4 21.8C35.6 25 34.6 29.6 32.4 35Z"/><path class="f" d="M18.8 23.4C18.4 18.6 20.2 15.6 22.5 15.6C24.8 15.6 26.6 18.6 26.2 23.4L22.5 26Z"/><path class="f" d="M21.3 4.2H23.7V7.2H26.6V9.6H23.7V15.6H21.3V9.6H18.4V7.2H21.3Z"/><path class="d" d="M13 30.4C19 28.6 26 28.6 32 30.4"/>',
};
const DEFS = `<svg class="chx-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="chx-gw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf6"/><stop offset="1" stop-color="#e0cfad"/></linearGradient>
  <linearGradient id="chx-gb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5a4b3f"/><stop offset="1" stop-color="#191310"/></linearGradient>
  ${Object.entries(ART).map(([t, body]) => `<symbol id="chx-${t}" viewBox="0 0 45 45">${body}</symbol>`).join('')}
</defs></svg>`;
const NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
/** One piece as SVG (letter: upper = White). */
function pieceSvg(p: string, cls = ''): string {
  const w = p === p.toUpperCase();
  return `<svg class="chx-art ${w ? 'w' : 'b'} ${cls}" viewBox="0 0 45 45" aria-hidden="true"><use href="#chx-${p.toLowerCase()}"/></svg>`;
}

// ------------------------------------------------------------- the engine
let worker: Worker | null = null;
let workerBroken = false;
let reqSeq = 0;
const waiting = new Map<number, (t: Thought) => void>();

function engineWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./chess-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<EngineReply>) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      done?.(e.data.thought);
    };
    worker.onerror = () => {
      // Can't load the worker here: think on the main thread (shorter) instead.
      workerBroken = true;
      worker?.terminate();
      worker = null;
      for (const [, done] of waiting) done({ move: 0, uci: '', score: 0, depth: 0, nodes: 0, ms: 0, slipped: false });
      waiting.clear();
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** Ask the engine for a move. Falls back to a short think on the main thread. */
function askEngine(game: ChessGame, level: Level, fresh: boolean): Promise<Thought> {
  const moves = game.moves.map((m) => m.uci);
  const w = engineWorker();
  if (w) {
    const id = ++reqSeq;
    const req: EngineRequest = { id, fen: game.startFen, moves, level, fresh };
    return new Promise((resolve) => {
      waiting.set(id, (t) => (t.move ? resolve(t) : resolve(fallbackThink(game, level))));
      w.postMessage(req);
    });
  }
  return new Promise((resolve) => window.setTimeout(() => resolve(fallbackThink(game, level)), 30));
}
function fallbackThink(game: ChessGame, level: Level): Thought {
  const b = Board.fromFen(game.startFen);
  for (const m of game.moves) b.make(b.parseUci(m.uci));
  return think(b, { ...level, timeMs: Math.min(level.timeMs, 250) });
}

// ------------------------------------------------------------------ helpers
const fmtClock = (ms: number) => {
  const t = Math.max(0, ms);
  if (t < 10_000) return `0:${(t / 1000).toFixed(1).padStart(4, '0')}`;
  const s = Math.ceil(t / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const WHY: Record<EndWhy, string> = {
  checkmate: 'checkmate',
  stalemate: 'stalemate',
  fifty: 'fifty moves without a capture or pawn move',
  material: 'not enough pieces left to mate',
  threefold: 'same position three times',
  resign: 'resigned',
  time: 'out of time',
  agreed: 'draw agreed',
};
const strengthWord = (o: Opponent) => (o.rating >= 2000 ? 'Master' : o.rating >= 1700 ? 'Expert' : o.rating >= 1400 ? 'Strong' : o.rating >= 1100 ? 'Club' : 'Casual');

let lastClock: ClockId | null = null;
let lastColor: 'w' | 'r' | 'b' = 'w';

// ====================================================================== room

/** The Chess House (or a park chess table): pick who to play. */
export function openChessHouse(host: ChessHost, where = 'The Chess House'): void {
  const s = host.state;
  const park = /park/i.test(where);
  const m = openModal(`<div class="chx" data-chx>
    ${DEFS}
    <div class="chx-head"><span class="chx-head-ico" aria-hidden="true">♟️</span><h2>${esc(where)}</h2><span class="chx-cash" data-cash>${money(s.money)}</span><button class="chx-x" data-leave aria-label="Leave">✕</button></div>
    <div class="chx-body" data-body></div>
  </div>`);
  m.el.classList.add('chx-modal');
  m.el.parentElement?.classList.add('chx-wrap');
  const body = m.el.querySelector<HTMLElement>('[data-body]')!;
  const xBtn = m.el.querySelector<HTMLElement>('[data-leave]')!;
  const cash = () => (m.el.querySelector<HTMLElement>('[data-cash]')!.textContent = money(s.money));
  let leaveHook: (() => boolean) | null = null;
  let cleanup: (() => void) | null = null;
  const close = () => {
    cleanup?.();
    cleanup = null;
    host.saved();
    sfx.close();
    m.close();
  };
  xBtn.addEventListener('click', () => {
    if (leaveHook && !leaveHook()) return;
    close();
  });

  const room = () => {
    leaveHook = null;
    cleanup?.();
    cleanup = null;
    const rec = chessOf(s);
    const wins = Object.values(rec.wins).reduce((a, b) => a + b, 0);
    const losses = Object.values(rec.losses).reduce((a, b) => a + b, 0);
    const card = (o: Opponent) => {
      const w = rec.wins[o.id] ?? 0, l = rec.losses[o.id] ?? 0;
      return `<button class="chx-opp" data-opp="${o.id}">
        <span class="chx-ava" aria-hidden="true">${o.emoji}</span>
        <span class="chx-opp-main"><b>${esc(o.name)}</b><small>${esc(o.tag)} · ${strengthWord(o)} ${o.rating}</small><em>${esc(o.blurb)}</em></span>
        <span class="chx-opp-rec">${w || l ? `<i class="w">${w}W</i><i class="l">${l}L</i>` : '<i class="new">New</i>'}<span class="chx-go" aria-hidden="true">›</span></span>
      </button>`;
    };
    const house = OPPONENTS.filter((o) => o.where === 'house'), hustlers = OPPONENTS.filter((o) => o.where === 'park');
    const groups: [string, Opponent[]][] = park
      ? [['🌳 Park hustlers', hustlers], ['♟️ Chess House regulars (they come by)', house]]
      : [['♟️ House regulars', house], ['🌳 Park hustlers (in for the day)', hustlers]];
    body.innerHTML = `<div class="chx-room">
      <div class="chx-me"><span class="chx-rating"><small>Your rating</small><b>${rec.rating}</b></span><span class="chx-tally">${wins} won · ${losses} lost · ${rec.draws} drawn${rec.bestWin ? ` · best pot ${money(rec.bestWin * 2)}` : ''}</span></div>
      ${groups.map(([title, list]) => `<h3 class="chx-group">${title}</h3><div class="chx-opps">${list.map(card).join('')}</div>`).join('')}
    </div>`;
    body.scrollTop = 0;
    body.querySelectorAll<HTMLElement>('[data-opp]').forEach((b) =>
      b.addEventListener('click', () => {
        const o = OPPONENTS.find((x) => x.id === b.dataset.opp);
        if (o) (sfx.tap(), table(o));
      }),
    );
  };

  const table = (o: Opponent) => {
    leaveHook = null;
    let clock: ClockId = lastClock ?? o.clock;
    let color = lastColor;
    const affordable = o.stakes.filter((st) => st <= s.money);
    let stake = o.stakes.includes(0) ? 0 : (affordable[0] ?? o.stakes[0]);
    const seg = (name: string, opts: [string, string][], cur: string) => `<div class="chx-seg" role="radiogroup" aria-label="${name}">${opts.map(([v, l]) => `<button role="radio" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}" data-${name}="${v}">${l}</button>`).join('')}</div>`;
    const render = () => {
      const undoOk = clock === 'untimed' && stake === 0;
      body.innerHTML = `<div class="chx-table">
        <button class="chx-back" data-back>‹ Everyone</button>
        <div class="chx-hero"><span class="chx-ava lg" aria-hidden="true">${o.emoji}</span><div><b>${esc(o.name)}</b><small>${esc(o.tag)} · ${o.rating}</small></div></div>
        <p class="chx-quote">“${esc(say(o, 'hello') ?? 'Good luck.')}”</p>
        <label class="chx-lbl">Clock</label>
        ${seg('clock', (Object.keys(CLOCKS) as ClockId[]).map((k) => [k, `${CLOCKS[k].emoji} ${CLOCKS[k].label}`]), clock)}
        <label class="chx-lbl">You play</label>
        ${seg('color', [['w', '♔ White'], ['r', '🎲 Random'], ['b', '♚ Black']], color)}
        <label class="chx-lbl">Bet</label>
        <div class="chx-stakes" role="radiogroup" aria-label="Bet">${o.stakes.map((st) => `<button role="radio" aria-checked="${st === stake}" class="chx-stake${st === stake ? ' on' : ''}" data-stake="${st}" ${st > s.money ? 'disabled' : ''}>${st ? money(st).replace('.00', '') : '🤝 Friendly'}</button>`).join('')}</div>
        <p class="chx-help">${stake ? `They match your ${money(stake)}: win and you take ${money(stake * 2)}. A draw hands your bet back.` : 'Just for fun (your rating still moves).'} ${undoOk ? 'Take-backs allowed.' : 'No take-backs.'}</p>
        <button class="btn primary block chx-play" data-play ${stake > s.money ? 'disabled' : ''}>♟️ Sit down and play</button>
      </div>`;
    };
    render();
    body.scrollTop = 0;
    body.onclick = (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!t || t.hasAttribute('disabled')) return;
      if (t.dataset.back !== undefined) return (sfx.tap(), (body.onclick = null), room());
      if (t.dataset.clock) (clock = lastClock = t.dataset.clock as ClockId, sfx.tick(), render());
      else if (t.dataset.color) (color = lastColor = t.dataset.color as 'w' | 'r' | 'b', sfx.tick(), render());
      else if (t.dataset.stake !== undefined) (stake = Number(t.dataset.stake), sfx.tick(), render());
      else if (t.dataset.play !== undefined) {
        const why = stakeUp(s, stake);
        if (why) return toast(why, { icon: '♟️', tone: 'bad' });
        if (stake) sfx.coin();
        host.saved();
        cash();
        body.onclick = null;
        const me: Side = color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
        game(o, stake, clock, me);
      }
    };
  };

  // ==================================================================== game
  const game = (opp: Opponent, stake: number, clockId: ClockId, me: Side) => {
    const them: Side = me === 'w' ? 'b' : 'w';
    const g = new ChessGame();
    const clockDef = CLOCKS[clockId];
    const timed = clockDef.base > 0;
    const undoOk = !timed && stake === 0;
    const clocks: Record<Side, number> = { w: clockDef.base, b: clockDef.base };
    let tickAt = performance.now();
    let finished = false;
    let thinking = false;
    let gen = 0; // bumps on undo / end, so stale engine replies are ignored
    let selected = -1;
    let targets: { from: number; to: number; promo: string; code: number }[] = [];
    let last: PlayedMove | null = null;
    let lastSay = -9;
    let theirEval = 0;
    let hopeless = 0;
    let drawCooldown = -99;
    let saidWinning = false, saidLosing = false;
    let resignArmed = 0;
    let leaveArmed = 0;
    let lastBeep = -1;
    const flip = me === 'b';

    body.onclick = null;
    body.innerHTML = `<div class="chx-game">
      <div class="chx-player them" data-bar="${them}">
        <span class="chx-ava" data-ava aria-hidden="true">${opp.emoji}</span>
        <span class="chx-pname"><b>${esc(opp.name)}</b><span class="chx-tray" data-tray="${them}"></span></span>
        <span class="chx-clock${timed ? '' : ' off'}" data-clock="${them}">${timed ? fmtClock(clocks[them]) : '♾️'}</span>
      </div>
      <div class="chx-say" data-say aria-live="polite"><span>“${esc(say(opp, 'hello') ?? 'Good luck.')}”</span></div>
      <div class="chx-board-wrap">
        <div class="chx-board${flip ? ' flip' : ''}" data-board role="application" aria-label="Chess board. You play ${me === 'w' ? 'White' : 'Black'}.">
          <div class="chx-squares" data-squares></div>
          <div class="chx-pieces" data-pieces></div>
        </div>
        <div class="chx-overlay" data-overlay hidden></div>
      </div>
      <div class="chx-player me" data-bar="${me}">
        <span class="chx-ava you" aria-hidden="true">🙂</span>
        <span class="chx-pname"><b>You</b><span class="chx-tray" data-tray="${me}"></span></span>
        <span class="chx-clock${timed ? '' : ' off'}" data-clock="${me}">${timed ? fmtClock(clocks[me]) : '♾️'}</span>
      </div>
      <div class="chx-status" data-status aria-live="polite"></div>
      <ol class="chx-moves" data-moves aria-label="Moves"></ol>
      <div class="chx-actions">
        ${undoOk ? '<button class="btn chx-act" data-act="undo" disabled>↩️ Undo</button>' : ''}
        <button class="btn chx-act" data-act="draw">🤝 Draw</button>
        <button class="btn chx-act" data-act="resign">🏳️ Resign</button>
      </div>
    </div>`;
    body.scrollTop = 0;
    const $ = <T extends HTMLElement = HTMLElement>(q: string) => body.querySelector<T>(q)!;
    const boardEl = $('[data-board]');
    const squaresEl = $('[data-squares]');
    const piecesEl = $('[data-pieces]');
    const overlay = $('[data-overlay]');
    const statusEl = $('[data-status]');
    const sayEl = $('[data-say]');
    const movesEl = $('[data-moves]');
    const avaEl = $('[data-ava]');
    const undoBtn = body.querySelector<HTMLButtonElement>('[data-act="undo"]');
    const drawBtn = $<HTMLButtonElement>('[data-act="draw"]');
    const resignBtn = $<HTMLButtonElement>('[data-act="resign"]');

    // Squares (fixed) and pieces (moved around).
    const sqEls: HTMLElement[] = [];
    for (let i = 0; i < 64; i++) {
      const r = Math.floor(i / 8), f = i % 8;
      const el = document.createElement('div');
      el.className = `chx-sq ${(r + f) % 2 ? 'd' : 'l'}`;
      const vr = flip ? 7 - r : r, vf = flip ? 7 - f : f;
      el.style.gridArea = `${vr + 1} / ${vf + 1}`;
      // Coordinates on the edge squares (from your side).
      if (vf === 0) el.insertAdjacentHTML('beforeend', `<i class="chx-rank">${8 - r}</i>`);
      if (vr === 7) el.insertAdjacentHTML('beforeend', `<i class="chx-file">${'abcdefgh'[f]}</i>`);
      squaresEl.appendChild(el);
      sqEls.push(el);
    }
    let pcEls: (HTMLElement | null)[] = new Array(64).fill(null);
    const place = (el: HTMLElement, i: number) => {
      const r = Math.floor(i / 8), f = i % 8;
      const vr = flip ? 7 - r : r, vf = flip ? 7 - f : f;
      el.style.transform = `translate(${vf * 100}%, ${vr * 100}%)`;
    };
    const makePiece = (p: string, i: number) => {
      const el = document.createElement('div');
      el.className = 'chx-pc';
      el.dataset.p = p;
      el.innerHTML = pieceSvg(p);
      place(el, i);
      piecesEl.appendChild(el);
      return el;
    };
    const rebuild = () => {
      piecesEl.innerHTML = '';
      pcEls = new Array(64).fill(null);
      for (let i = 0; i < 64; i++) {
        const p = g.at(i);
        if (p) pcEls[i] = makePiece(p, i);
      }
    };
    /** Slide the pieces for one move (captures fade, castling moves the rook, promotion swaps). */
    const animate = (m: PlayedMove, slide: boolean) => {
      const el = pcEls[m.from];
      if (!el) return rebuild();
      const capSq = m.ep ? m.to + (m.color === 'w' ? 8 : -8) : m.to;
      const victim = pcEls[capSq];
      if (victim && victim !== el) {
        victim.classList.add('gone');
        window.setTimeout(() => victim.remove(), 260);
      }
      pcEls[capSq] = null;
      pcEls[m.from] = null;
      pcEls[m.to] = el;
      el.classList.toggle('slide', slide && !REDUCED);
      place(el, m.to);
      if (m.promo) {
        const p = m.color === 'w' ? m.promo : m.promo.toLowerCase();
        window.setTimeout(() => ((el.dataset.p = p), (el.innerHTML = pieceSvg(p, 'pop'))), slide ? 160 : 0);
      }
      if (m.castle) {
        const rf = m.castle === 'K' ? m.to + 1 : m.to - 2, rt = m.castle === 'K' ? m.to - 1 : m.to + 1;
        const rook = pcEls[rf];
        if (rook) {
          pcEls[rf] = null;
          pcEls[rt] = rook;
          rook.classList.add('slide');
          place(rook, rt);
        }
      }
      // Lift the moved piece above the others while it slides.
      el.classList.add('top');
      window.setTimeout(() => el.classList.remove('top', 'slide'), 220);
    };

    const marks = () => {
      const check = g.inCheck() ? g.kingSquare() : -1;
      for (let i = 0; i < 64; i++) {
        const el = sqEls[i];
        const tgt = targets.find((t) => t.to === i);
        el.classList.toggle('last', !!last && (i === last.from || i === last.to));
        el.classList.toggle('sel', i === selected);
        el.classList.toggle('mv', !!tgt && !g.at(i) && !(tgt && isEpTarget(tgt)));
        el.classList.toggle('cap', !!tgt && (!!g.at(i) || isEpTarget(tgt)));
        el.classList.toggle('check', i === check);
      }
    };
    const isEpTarget = (t: { from: number; to: number }) => g.at(t.from).toLowerCase() === 'p' && t.from % 8 !== t.to % 8 && !g.at(t.to);

    const trays = () => {
      const cap = g.captured();
      const score = (list: string[]) => list.reduce((a, p) => a + PIECE_VALUE[p.toLowerCase()], 0);
      // A side's tray shows what it has taken (the other colour's pieces).
      const lostW = cap.w, lostB = cap.b;
      const diff = score(lostB) - score(lostW); // + = White ahead
      const sorted = (l: string[]) => l.slice().sort((a, b) => PIECE_VALUE[a.toLowerCase()] - PIECE_VALUE[b.toLowerCase()]);
      for (const side of ['w', 'b'] as Side[]) {
        const took = side === 'w' ? lostB : lostW;
        const ahead = side === 'w' ? diff : -diff;
        $(`[data-tray="${side}"]`).innerHTML = sorted(took).map((p) => pieceSvg(p, 'mini')).join('') + (ahead > 0 ? `<em>+${ahead}</em>` : '');
      }
    };

    const moveList = () => {
      const out: string[] = [];
      const ms = g.moves;
      // If Black moved first (never here, but harmless), pad.
      for (let i = 0; i < ms.length; i += 2) {
        const n = i / 2 + 1;
        const cur = (k: number) => (k === ms.length - 1 ? ' class="cur"' : '');
        out.push(`<li><span class="n">${n}.</span><span${cur(i)}>${esc(ms[i].san)}</span>${ms[i + 1] ? `<span${cur(i + 1)}>${esc(ms[i + 1].san)}</span>` : ''}</li>`);
      }
      movesEl.innerHTML = out.join('') || '<li class="empty">Moves show up here.</li>';
      movesEl.scrollLeft = movesEl.scrollWidth;
    };

    const status = (text: string, tone = '') => {
      statusEl.className = `chx-status ${tone}`;
      statusEl.innerHTML = text;
    };
    const speak = (text: string | null, force = false) => {
      if (!text) return;
      if (!force && g.moves.length - lastSay < 2) return;
      lastSay = g.moves.length;
      sayEl.innerHTML = `<span>“${esc(text)}”</span>`;
      sayEl.classList.remove('pop');
      void sayEl.offsetWidth;
      sayEl.classList.add('pop');
    };
    const buttons = () => {
      if (undoBtn) undoBtn.disabled = finished || !g.moves.some((m) => m.color === me);
      drawBtn.disabled = finished || g.moves.length < 2;
      resignBtn.disabled = finished;
    };
    const refresh = () => {
      marks();
      trays();
      moveList();
      buttons();
      showClocks();
    };

    // ------------------------------------------------------------- clocks
    const showClocks = () => {
      for (const side of ['w', 'b'] as Side[]) {
        const el = $(`[data-clock="${side}"]`);
        const running = !finished && g.turn === side && g.moves.length >= 2;
        el.classList.toggle('run', running || (!finished && g.turn === side));
        if (!timed) continue;
        el.textContent = fmtClock(clocks[side]);
        el.classList.toggle('low', clocks[side] < 20_000);
      }
      $(`[data-bar="${me}"]`).classList.toggle('turn', !finished && g.turn === me);
      $(`[data-bar="${them}"]`).classList.toggle('turn', !finished && g.turn === them);
    };
    const tick = () => {
      const t = performance.now();
      const dt = t - tickAt;
      tickAt = t;
      if (finished || !timed) return;
      // Each side's clock starts after its first move (like the online sites).
      if (g.moves.length < 2) return showClocks();
      const side = g.turn;
      clocks[side] -= dt;
      if (side === me && clocks[me] < 10_000) {
        const sec = Math.ceil(clocks[me] / 1000);
        if (sec !== lastBeep) (lastBeep = sec, sfx.tick());
      }
      if (clocks[side] <= 0) {
        clocks[side] = 0;
        showClocks();
        // Out of time: a loss, unless the other side can't possibly mate.
        const other: Side = side === 'w' ? 'b' : 'w';
        if (!g.canMate(other)) return end('draw', 'time', 'out of time, but nobody can mate');
        return side === me ? end('loss', 'time') : end('win', 'time');
      }
      showClocks();
    };
    const timer = window.setInterval(tick, 100);
    cleanup = () => {
      window.clearInterval(timer);
      gen++;
    };
    const punch = (side: Side) => {
      if (timed && g.moves.length > 2) clocks[side] += clockDef.inc;
    };

    // ------------------------------------------------------------ the end
    const end = (outcome: 'win' | 'loss' | 'draw', why: EndWhy, note?: string) => {
      if (finished) return;
      finished = true;
      thinking = false;
      gen++;
      selected = -1;
      targets = [];
      avaEl.classList.remove('thinking');
      const r = settleChess(s, opp, stake, outcome);
      host.saved();
      cash();
      host.onRating?.(chessOf(s).rating);
      host.onChess?.(outcome, opp.id);
      refresh();
      speak(say(opp, outcome === 'win' ? 'lose' : outcome === 'loss' ? 'win' : 'draw'), true);
      const title = outcome === 'win' ? '🏆 You win!' : outcome === 'loss' ? `${opp.emoji} ${esc(opp.name)} wins` : '🤝 Draw';
      const how = note ?? (why === 'resign' ? (outcome === 'win' ? `${opp.name} resigned` : 'you resigned') : why === 'time' ? (outcome === 'win' ? `${opp.name} ran out of time` : 'your flag fell') : WHY[why]);
      status(`<b>${title}</b> · ${esc(how)}`, outcome === 'win' ? 'good' : outcome === 'loss' ? 'bad' : '');
      overlay.hidden = false;
      overlay.className = `chx-overlay end ${outcome}`;
      overlay.innerHTML = `<div class="chx-end">
        <b>${title}</b>
        <small>${esc(how[0].toUpperCase() + how.slice(1))}</small>
        <p>${esc(r.text)} <span class="chx-delta ${r.ratingDelta >= 0 ? 'up' : 'down'}">${r.ratingDelta > 0 ? '▲ ' : r.ratingDelta < 0 ? '▼ ' : '±'}${Math.abs(r.ratingDelta)}</span></p>
        <div class="chx-end-btns"><button class="btn" data-end="look">👀 Board</button><button class="btn" data-end="again">🔁 Rematch</button><button class="btn primary" data-end="done">Done</button></div>
      </div>`;
      $<HTMLElement>('.chx-actions').innerHTML = '<button class="btn chx-act" data-end="again">🔁 Rematch</button><button class="btn chx-act" data-end="room">👥 Others</button><button class="btn primary chx-act" data-end="done">Done</button>';
      if (outcome === 'win') {
        sfx.cheer();
        sfx.win();
        burstAt(boardEl, ['♛', '🏆', '✨', '🎉'], REDUCED ? 6 : 18);
        shakeEl(boardEl, true);
        if (stake) rain(m.el, '💵');
      } else if (outcome === 'loss') {
        sfx.bad();
        if (why === 'checkmate') shakeEl(boardEl, true);
      } else sfx.chime();
      leaveHook = null;
    };
    const rain = (el: HTMLElement, e: string) => burstAt(el, e, 12);
    const checkEnd = (): boolean => {
      const r = g.result();
      if (!r.over) return false;
      if (r.why === 'checkmate') {
        const winner = r.winner === me ? 'win' : 'loss';
        popAt(boardEl, 'CHECKMATE', { color: winner === 'win' ? '#ffd23f' : '#ff6b6b', size: 34 });
        end(winner, 'checkmate');
      } else end('draw', r.why);
      return true;
    };

    // ------------------------------------------------------------- moving
    /** Play a move (either side) with all the feedback. */
    const commit = (code: number, slide: boolean) => {
      const mover = g.turn;
      const rec = g.play(code);
      if (!rec) return;
      last = rec;
      selected = -1;
      targets = [];
      animate(rec, slide);
      punch(mover);
      const checkNow = g.inCheck();
      const target = sqEls[rec.to];
      if (rec.captured) {
        sfx.punch();
        buzz(14);
        window.setTimeout(() => popAt(target, mover === me ? '+' + (PIECE_VALUE[rec.captured.toLowerCase()] || '') : '−' + (PIECE_VALUE[rec.captured.toLowerCase()] || ''), { color: mover === me ? '#ffd23f' : '#ff8a8a', size: 20 }), 120);
      } else mover === me ? sfx.tap() : sfx.card();
      if (rec.promo) (sfx.good(), window.setTimeout(() => burstAt(target, ['✨', '⭐'], 6), 160));
      if (checkNow) {
        sfx.notify();
        if (!g.result().over) popAt(boardEl, 'CHECK', { color: mover === me ? '#ffd23f' : '#ff6b6b', size: 28 });
      }
      // What the opponent says about it.
      if (mover === me) {
        if (checkNow) speak(say(opp, 'checked'));
        else if (rec.captured) speak(say(opp, 'lost'));
      } else {
        if (checkNow) speak(say(opp, 'check'));
        else if (rec.captured && Math.random() < 0.6) speak(say(opp, 'took'));
      }
      refresh();
      if (checkEnd()) return;
      if (g.turn === them) theirTurn();
      else status(checkNow ? '<b>Check!</b> Your move.' : 'Your move.', checkNow ? 'bad' : '');
    };

    // ---------------------------------------------------------- their turn
    const theirTurn = () => {
      thinking = true;
      const myGen = gen;
      const t0 = performance.now();
      avaEl.classList.add('thinking');
      status(`<span class="chx-dots">${esc(opp.name)} is thinking</span>`);
      const level = levelFor(opp, timed ? clocks[them] : 0, clockDef.inc);
      const minDelay = timed ? Math.min(opp.minDelay, clocks[them] / 40) : opp.minDelay;
      // The opening book only knows games from the usual start.
      const bookUci = opp.book && g.moves.length < 14 && g.startFen === START_FEN ? bookMove(g.moves.map((x) => x.uci)) : '';
      const book = bookUci ? g.board.parseUci(bookUci) : 0;
      const pending: Promise<Thought | null> = book ? Promise.resolve(null) : askEngine(g, level, g.moves.length <= 1);
      if (!book && level.timeMs > 900 && Math.random() < 0.35) window.setTimeout(() => myGen === gen && speak(say(opp, 'think')), 700);
      void pending.then((t) => {
        const wait = Math.max(0, minDelay - (performance.now() - t0));
        window.setTimeout(() => {
          if (myGen !== gen || finished) return;
          thinking = false;
          avaEl.classList.remove('thinking');
          if (t) {
            theirEval = t.score;
            // A hopeless position two moves running: the serious players resign.
            if (opp.resignAt && t.score <= opp.resignAt && g.moves.length > 30) hopeless++;
            else hopeless = 0;
            if (hopeless >= 2) {
              speak(say(opp, 'resign'), true);
              return end('win', 'resign');
            }
            if (!saidWinning && t.score > 350 && t.score < 20_000) (saidWinning = true, speak(say(opp, 'winning')));
            else if (!saidLosing && t.score < -250) (saidLosing = true, speak(say(opp, 'losing')));
          }
          const code = t?.move || book;
          if (!code) return void checkEnd();
          commit(code, true);
        }, wait);
      });
    };

    // ---------------------------------------------------------- your input
    const select = (i: number) => {
      selected = i;
      targets = g.legal().filter((m) => m.from === i);
      if (!targets.length) {
        status(`That ${NAMES[g.at(i).toLowerCase()]} can’t move right now.`);
        shakeEl(sqEls[i]);
      }
      marks();
    };
    const deselect = () => {
      selected = -1;
      targets = [];
      marks();
    };
    const myPiece = (i: number) => {
      const p = g.at(i);
      return !!p && (p === p.toUpperCase() ? 'w' : 'b') === me;
    };
    const canAct = () => !finished && !thinking && g.turn === me && overlay.hidden;

    /** Try to move the selected piece to `to`. Promotion asks which piece. */
    const tryMove = async (to: number, slide: boolean): Promise<boolean> => {
      const opts = targets.filter((t) => t.to === to);
      if (!opts.length) return false;
      let chosen = opts[0];
      if (opts.length > 1) {
        const p = await promoPicker(to);
        if (!p) {
          deselect();
          rebuild();
          return true;
        }
        chosen = opts.find((o) => o.promo === p) ?? opts[0];
      }
      commit(chosen.code, slide);
      return true;
    };

    const promoPicker = (to: number): Promise<string | null> =>
      new Promise((resolve) => {
        const f = to % 8;
        const vf = flip ? 7 - f : f;
        overlay.hidden = false;
        overlay.className = 'chx-overlay promo';
        const color = me === 'w' ? (x: string) => x.toUpperCase() : (x: string) => x;
        overlay.innerHTML = `<div class="chx-promo" style="--col:${vf}" role="dialog" aria-label="Promote to">
          ${['q', 'n', 'r', 'b'].map((p) => `<button data-promo="${p}" aria-label="${NAMES[p]}">${pieceSvg(color(p))}</button>`).join('')}
          <button class="chx-promo-x" data-promo="" aria-label="Cancel">✕</button>
        </div>`;
        sfx.open();
        // The tap that opened the picker can land on it: ignore clicks for a moment.
        const openedAt = performance.now();
        overlay.onclick = (e) => {
          if (performance.now() - openedAt < 350) return;
          const b = (e.target as HTMLElement).closest<HTMLElement>('[data-promo]');
          if (!b && e.target !== overlay) return;
          overlay.hidden = true;
          overlay.onclick = null;
          overlay.innerHTML = '';
          resolve(b?.dataset.promo || null);
        };
      });

    // Pointer handling: tap a piece then a square, or drag it there.
    const squareAt = (x: number, y: number): number => {
      const r = boardEl.getBoundingClientRect();
      const vf = Math.floor(((x - r.left) / r.width) * 8), vr = Math.floor(((y - r.top) / r.height) * 8);
      if (vf < 0 || vf > 7 || vr < 0 || vr > 7) return -1;
      const rr = flip ? 7 - vr : vr, ff = flip ? 7 - vf : vf;
      return rr * 8 + ff;
    };
    let drag: { from: number; el: HTMLElement; x0: number; y0: number; moving: boolean; id: number; wasSelected: boolean; hover: number } | null = null;
    boardEl.addEventListener('pointerdown', (e) => {
      if (!canAct() || drag) return;
      const i = squareAt(e.clientX, e.clientY);
      if (i < 0) return;
      e.preventDefault();
      if (selected >= 0 && i !== selected && targets.some((t) => t.to === i)) {
        void tryMove(i, true);
        return;
      }
      if (myPiece(i)) {
        const wasSelected = selected === i;
        if (!wasSelected) (sfx.tick(), select(i));
        const el = pcEls[i];
        if (el) {
          drag = { from: i, el, x0: e.clientX, y0: e.clientY, moving: false, id: e.pointerId, wasSelected, hover: -1 };
          boardEl.setPointerCapture(e.pointerId);
        }
        return;
      }
      if (selected >= 0) deselect();
    });
    boardEl.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moving && Math.hypot(dx, dy) < 6) return;
      const r = boardEl.getBoundingClientRect();
      const size = r.width / 8;
      if (!drag.moving) {
        drag.moving = true;
        drag.el.classList.add('drag');
      }
      drag.el.style.transform = `translate(${e.clientX - r.left - size / 2}px, ${e.clientY - r.top - size * 0.62}px) scale(1.18)`;
      const over = squareAt(e.clientX, e.clientY);
      if (over !== drag.hover) {
        if (drag.hover >= 0) sqEls[drag.hover].classList.remove('hover');
        drag.hover = over;
        if (over >= 0 && targets.some((t) => t.to === over)) sqEls[over].classList.add('hover');
      }
    });
    const endDrag = (e: PointerEvent, cancel: boolean) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (d.hover >= 0) sqEls[d.hover].classList.remove('hover');
      d.el.classList.remove('drag');
      if (!d.moving) {
        // A plain tap on the piece that was already selected: let go of it.
        if (d.wasSelected && !cancel) deselect();
        return;
      }
      const to = cancel ? -1 : squareAt(e.clientX, e.clientY);
      if (to >= 0 && to !== d.from && targets.some((t) => t.to === to)) {
        place(d.el, d.from); // tryMove places it at the target without a slide
        void tryMove(to, false).then((ok) => !ok && place(d.el, d.from));
      } else {
        d.el.classList.add('slide');
        place(d.el, d.from);
        window.setTimeout(() => d.el.classList.remove('slide'), 200);
      }
    };
    boardEl.addEventListener('pointerup', (e) => endDrag(e, false));
    boardEl.addEventListener('pointercancel', (e) => endDrag(e, true));
    boardEl.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---------------------------------------------------------- the buttons
    body.onclick = (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!t || (t as HTMLButtonElement).disabled) return;
      const act = t.dataset.act, endAct = t.dataset.end;
      if (endAct === 'look') return (sfx.tap(), (overlay.hidden = true));
      if (endAct === 'again') return (sfx.tap(), (body.onclick = null), cleanup?.(), table(opp));
      if (endAct === 'room') return (sfx.tap(), (body.onclick = null), room());
      if (endAct === 'done') return close();
      if (act === 'undo' && undoOk && !finished) {
        gen++;
        thinking = false;
        avaEl.classList.remove('thinking');
        // Take back to your last move (theirs too, if they answered).
        while (g.moves.length && g.moves[g.moves.length - 1].color !== me) g.undo();
        if (g.moves.length) g.undo();
        last = g.moves[g.moves.length - 1] ?? null;
        selected = -1;
        targets = [];
        rebuild();
        refresh();
        sfx.close();
        speak(say(opp, 'undo'), true);
        if (g.turn === them) theirTurn();
        else status('Taken back. Your move.');
        return;
      }
      if (act === 'draw' && !finished) {
        if (g.moves.length - drawCooldown < 10) return toast(`${opp.name} already said no. Give it a few moves.`, { icon: '🤝' });
        drawCooldown = g.moves.length;
        // They look at the position as they last saw it (their view).
        const yes = g.moves.length >= 16 && theirEval <= opp.drawAt;
        speak(say(opp, yes ? 'drawYes' : 'drawNo'), true);
        if (yes) return end('draw', 'agreed');
        return status(`${esc(opp.name)} declines the draw.`);
      }
      if (act === 'resign' && !finished) {
        if (performance.now() - resignArmed > 3000) {
          resignArmed = performance.now();
          t.textContent = '🏳️ Sure?';
          t.classList.add('armed');
          window.setTimeout(() => !finished && ((t.textContent = '🏳️ Resign'), t.classList.remove('armed')), 3000);
          return;
        }
        return end('loss', 'resign');
      }
    };
    leaveHook = () => {
      if (finished || g.moves.length < 1) return true;
      if (performance.now() - leaveArmed < 3500) {
        if (stake) end('loss', 'resign');
        return true;
      }
      leaveArmed = performance.now();
      toast(stake ? `Leaving now forfeits your ${money(stake)} bet. Tap ✕ again to go.` : 'Leave the game? Tap ✕ again.', { icon: '♟️', tone: stake ? 'bad' : 'info' });
      return false;
    };

    rebuild();
    refresh();
    sfx.card();
    if (g.turn === them) theirTurn();
    else status(`You’re ${me === 'w' ? 'White' : 'Black'}. Tap or drag a piece.`);
  };

  room();
}
