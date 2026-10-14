// =====================================================================
// linkup.ts — 🤙 Link Up, the phone app for friends and plans (Peter,
// 2026-10-14).
//
// PLANS: invites from friends (accept / pass), your invites and their
//        answers (take a counter-offer, cancel a plan), what's coming up.
// FRIENDS: everyone with your number: their vibe, how close you are (and
//        how close to the next level), what they love or avoid (once you
//        find out), and the last few things you did together. Tap Invite,
//        pick an outing and a time, and watch them type back.
// Rules: sim/friends.ts and sim/invites.ts.
// =====================================================================

import { clockLabel, nowMs, nycTime } from '../core/clock.ts';
import { esc } from '../core/format.ts';
import { friendCard, knowsTaste, OUTING_IDS, OUTINGS, tasteFor, type OutingId } from '../sim/friends.ts';
import { acceptCounter, answerIncoming, cancelInvite, otherOf, sendInvite, socialOf, WHEN_LABEL, type Invite, type When } from '../sim/invites.ts';
import { RELATION } from '../sim/people.ts';
import { onContactInvite, PHONE_APPS } from './phone-apps.ts';
import { toast } from './dom.ts';

let composer: { id: string; outing: OutingId; when: When } | null = null;
let lastSent: string | null = null;

/** Open Link Up with the invite composer ready for someone (Contacts → Invite). */
export function composeFor(personId: string): void {
  composer = { id: personId, outing: 'park', when: 'now' };
  lastSent = null;
}

const first = (n: string) => n.split(' ')[0];
const when = (ms: number) => {
  const mins = Math.round((ms - nowMs()) / 60_000);
  if (mins <= 1) return 'now';
  return `${clockLabel(nycTime(ms))}${mins < 90 ? ` (in ${mins} min)` : ''}`;
};

function planCard(inv: Invite): string {
  const who = otherOf(inv);
  const o = OUTINGS[inv.outing];
  const incoming = inv.from.id !== 'me';
  const fresh = inv.id === lastSent;
  const reply = inv.reply ? `<div class="sms${fresh ? ' typing' : ''}"><i class="dots" aria-hidden="true"><b></b><b></b><b></b></i><span>${esc(inv.reply)}</span></div>` : '';
  let actions = '';
  let status = '';
  if (incoming && inv.status === 'pending') actions = `<button class="btn primary" data-act="linkup.yes:${inv.id}">Accept</button><button class="btn" data-act="linkup.no:${inv.id}">Pass</button>`;
  else if (inv.status === 'countered' && inv.counter) {
    status = `<div class="sms${fresh ? ' typing late' : ''}"><span>${esc(inv.counter.reply)}</span></div>`;
    actions = `<button class="btn primary" data-act="linkup.take:${inv.id}">Sounds good</button><button class="btn" data-act="linkup.drop:${inv.id}">Nah</button>`;
  } else if (inv.status === 'accepted') actions = `<button class="btn ghost" data-act="linkup.cancel:${inv.id}">Cancel</button>`;
  const tag = { pending: incoming ? '📲 Invite' : '⏳', accepted: '✅ On', declined: '❌ No', countered: '🤔 Maybe', expired: '💀 Missed', done: '💛 Done', cancelled: 'Cancelled', flaked: '🫠 Flaked' }[inv.status];
  return `<div class="card plan ${inv.status}"><div class="plan-top"><b>${o.emoji} ${esc(first(who.name))} · ${esc(o.label)}</b><span class="tag">${tag}</span></div>
    <p class="sub">${esc(o.place === 'your place' ? 'Your place' : o.place)} · ${when(inv.at)}</p>${reply}${status}
    ${actions ? `<div class="row" style="gap:6px;margin-top:8px">${actions}</div>` : ''}</div>`;
}

onContactInvite(composeFor);

PHONE_APPS.add({
  id: 'linkup',
  label: 'Link Up',
  icon: '🤙',
  bg: '#ff6b35',
  needsPhone: true,
  order: 8,
  render: ({ s }) => {
    const soc = socialOf(s);
    const now = nowMs();
    const plans = soc.invites.filter((i) => ['pending', 'countered', 'accepted'].includes(i.status) && i.until > now).slice(0, 6);
    const recent = soc.invites.filter((i) => !plans.includes(i)).slice(0, 3);
    const friends = Object.entries(s.people)
      .filter(([, m]) => m.hasNumber)
      .sort((a, b) => b[1].level - a[1].level || b[1].likes - a[1].likes);
    const hang = soc.hangout;
    const friendHtml = friends
      .map(([id, m]) => {
        const c = friendCard(id, m);
        const pct = Math.round(c.progress.fraction * 100);
        const open = composer?.id === id;
        const comp = open
          ? `<div class="compose"><div class="out-row">${OUTING_IDS.map((o) => {
              const t = knowsTaste(m, o) ? tasteFor(id, o) : null;
              return `<button class="out${composer!.outing === o ? ' on' : ''}" data-act="linkup.pick:${o}"><span>${OUTINGS[o].emoji}</span>${esc(OUTINGS[o].label)}${t === null ? '' : t >= 2 ? ' <i>❤️</i>' : t < 0 ? ' <i>👎</i>' : ''}</button>`;
            }).join('')}</div>
            <div class="when-row">${(Object.keys(WHEN_LABEL) as When[]).map((w) => `<button class="chip-w${composer!.when === w ? ' on' : ''}" data-act="linkup.when:${w}">${WHEN_LABEL[w]}</button>`).join('')}</div>
            <button class="btn primary block" data-act="linkup.send">Send invite</button></div>`
          : '';
        return `<div class="card friend"><div class="friend-top"><b>${esc(c.person.name)}</b><span class="sub">${RELATION[m.level]}</span></div>
          <p class="vibes"><span>${c.main.emoji} ${c.main.label}</span><span>${c.second.emoji} ${c.second.label}</span></p>
          ${c.progress.next !== null ? `<div class="fbar" aria-label="Friendship progress"><i style="width:${pct}%"></i></div><p class="sub">${pct}% to ${RELATION[c.progress.next]}</p>` : '<p class="sub">💛 As close as friends get</p>'}
          ${c.loves.length || c.avoids.length ? `<p class="sub">${c.loves.length ? `Loves ${c.loves.map((o) => OUTINGS[o].emoji).join(' ')}` : ''}${c.loves.length && c.avoids.length ? ' · ' : ''}${c.avoids.length ? `Avoids ${c.avoids.map((o) => OUTINGS[o].emoji).join(' ')}` : ''}</p>` : ''}
          ${c.history.length ? `<ul class="hist">${c.history.slice(0, 3).map((h) => `<li>${h.emoji} ${esc(h.text)}</li>`).join('')}</ul>` : ''}
          ${open ? comp : `<button class="btn" data-act="linkup.compose:${id}">🤙 Invite</button>`}</div>`;
      })
      .join('');
    return {
      title: 'Link Up',
      body: `${hang ? `<div class="card plan accepted"><b>🤙 Hanging out with ${esc(first(friendCard(hang.personId, s.people[hang.personId]).person.name))}</b><p class="sub">${esc(OUTINGS[hang.outing].label)} · +${hang.bond} 💛 so far</p></div>` : ''}
        <h3 class="lu-h">📬 Plans</h3>
        ${plans.length ? plans.map(planCard).join('') : '<p class="blurb">No plans yet. Invite someone below.</p>'}
        ${recent.length ? `<details class="lu-old"><summary>Earlier</summary>${recent.map(planCard).join('')}</details>` : ''}
        <h3 class="lu-h">👥 Friends</h3>
        ${friends.length ? friendHtml : '<p class="blurb">Nobody yet. Talk to people around the city and swap numbers, or meet friends of friends in a club section.</p>'}`,
    };
  },
  act: (act, { s }) => {
    const [what, arg] = act.split(':');
    if (what === 'compose') composeFor(arg);
    else if (what === 'pick' && composer) composer.outing = arg as OutingId;
    else if (what === 'when' && composer) composer.when = arg as When;
    else if (what === 'send' && composer) {
      const inv = sendInvite(s, composer.id, composer.outing, composer.when);
      lastSent = inv.id;
      composer = null;
      if (inv.status === 'accepted') toast(`Plan made: ${OUTINGS[inv.outing].label} with ${first(inv.to.name)}`, { icon: OUTINGS[inv.outing].emoji, tone: 'good' });
    } else if (what === 'yes' || what === 'no') {
      const inv = answerIncoming(s, arg, what === 'yes');
      if (inv && what === 'yes') toast(`See you at ${OUTINGS[inv.outing].place}.`, { icon: OUTINGS[inv.outing].emoji, tone: 'good' });
    } else if (what === 'take') {
      const inv = acceptCounter(s, arg);
      if (inv) toast(`Plan made: ${OUTINGS[inv.outing].label}, ${when(inv.at)}`, { icon: OUTINGS[inv.outing].emoji, tone: 'good' });
    } else if (what === 'drop') {
      const inv = socialOf(s).invites.find((i) => i.id === arg);
      if (inv) inv.status = 'declined';
    } else if (what === 'cancel') cancelInvite(s, arg);
  },
});
