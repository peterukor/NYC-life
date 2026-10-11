// =====================================================================
// jail.ts (UI) — the cell screen you see while locked up.
//
// It opens by itself whenever the state says you're in jail (game.ts
// checks inJail() a few times a second) and closes when you're free.
// While it's open you can't walk around, work or travel: you can post
// bail, call a lawyer once, or pass the time with jail activities.
// =====================================================================

import { esc, money } from '../core/format.ts';
import { callLawyer, doJailActivity, inJail, JAIL_ACTIVITIES, jailLeftMs, lawyerFee, postBail } from '../sim/jail.ts';
import type { GameState } from '../sim/types.ts';
import { onAct, openModal, toast } from './dom.ts';

let open: { close: () => void } | null = null;

const fmt = (ms: number) => {
  const m = Math.ceil(ms / 60000);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
};

/** Show the cell screen if jailed (safe to call often). */
export function syncJail(s: GameState, onChange: () => void): void {
  const jailed = inJail(s);
  if (!jailed && open) {
    open.close();
    open = null;
    toast('You’re free. The city smells amazing.', { icon: '🗽', tone: 'good', ms: 4000 });
    onChange();
    return;
  }
  if (!jailed || open) return;

  const m = openModal('');
  m.el.classList.add('jail');
  const render = () => {
    if (!s.jail) return;
    const fee = lawyerFee(s);
    m.el.innerHTML = `<div class="big">🔒</div><h2>Locked up</h2>
      <p class="blurb">${esc(s.jail.reason)}.</p>
      <p style="font-size:22px;font-weight:800;margin:8px 0" data-left>${fmt(jailLeftMs(s))} left</p>
      <button class="btn primary block" data-act="bail" ${s.money + s.bank >= s.jail.bail ? '' : 'disabled'}>Post bail · ${money(s.jail.bail)}</button>
      <button class="btn block" style="margin-top:8px" data-act="lawyer" ${s.jail.lawyered || s.money + s.bank < fee ? 'disabled' : ''}>${s.jail.lawyered ? 'Lawyer already called' : `⚖️ Call a lawyer · ${money(fee)}`}</button>
      <p class="sub" style="margin:12px 0 6px">Or pass the time:</p>
      <div class="row" style="flex-wrap:wrap;gap:6px;justify-content:center">${JAIL_ACTIVITIES.map((a) => `<button class="btn" data-act="do:${a.id}">${a.emoji} ${esc(a.label)}</button>`).join('')}</div>`;
  };
  render();
  const timer = window.setInterval(() => {
    const el = m.el.querySelector('[data-left]');
    if (el) el.textContent = `${fmt(jailLeftMs(s))} left`;
  }, 1000);
  open = { close: () => { window.clearInterval(timer); m.close(); } };

  onAct(m.el, (act) => {
    if (act === 'bail') {
      const err = postBail(s);
      if (err) return toast(err, { icon: '🔒', tone: 'bad' });
      syncJail(s, onChange);
      return;
    }
    if (act === 'lawyer') toast(callLawyer(s), { icon: '⚖️', ms: 4000 });
    if (act.startsWith('do:')) toast(doJailActivity(s, act.slice(3)), { icon: JAIL_ACTIVITIES.find((a) => `do:${a.id}` === act)?.emoji });
    onChange();
    render();
  });
}
