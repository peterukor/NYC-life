// =====================================================================
// online-app.ts — the 🌐 Online phone app (net/online.ts does the work).
//
// Signed out: Sign up (username, email, password) · Sign in (username or
// email) · Forgot password. A reset link from email opens "New password".
// Signed in: who you are (and "confirm your email"), ☁️ cloud save,
// 🏆 the real players' board, 💸 money waiting for you, send money,
// account settings (password, sign out, delete).
// Also the 💬 chat sheet for the street (wave, emotes, say something).
// =====================================================================

import { esc, money } from '../core/format.ts';
import { EMOTES, type Online } from '../net/online.ts';
import { onAct, openSheet } from './dom.ts';
import { PHONE_APPS, type PhoneAppCtx } from './phone-apps.ts';

let online: Online | null = null;
let tab: 'signin' | 'signup' | 'forgot' = 'signin';
let ctxRef: PhoneAppCtx | null = null;
let lastLoad = 0;

export function setOnline(o: Online): void {
  online = o;
  o.onChange = () => ctxRef?.rerender('online');
}

const val = (name: string) => document.querySelector<HTMLInputElement>(`.phone [name="${name}"]`)?.value ?? '';
const note = () => (online?.note ? `<div class="card net-note ${online.note.tone}" role="status">${esc(online.note.text)}</div>` : '');
const input = (name: string, label: string, type = 'text', extra = '') =>
  `<label class="net-field"><span>${label}</span><input class="input" name="${name}" type="${type}" ${extra}></label>`;

function signedOut(o: Online): string {
  if (o.resetToken)
    return `<div class="card"><h3>🔑 Pick a new password</h3>
      ${input('pw', 'New password (8+ characters)', 'password', 'autocomplete="new-password" minlength="8"')}
      <button class="btn primary block" data-act="online.reset" ${o.busy ? 'disabled' : ''}>Save new password</button></div>`;
  const tabs = `<div class="seg" role="tablist">${(['signin', 'signup'] as const).map((t) => `<button role="tab" data-act="online.tab:${t}" class="${tab === t ? 'on' : ''}">${t === 'signin' ? 'Sign in' : 'Create account'}</button>`).join('')}</div>`;
  if (tab === 'forgot')
    return `<div class="card"><h3>Forgot your password?</h3><p class="sub">Type your email. If it has an account, we’ll send a link to pick a new password.</p>
      ${input('email', 'Email', 'email', 'autocomplete="email" inputmode="email"')}
      <button class="btn primary block" data-act="online.forgot" ${o.busy ? 'disabled' : ''}>Send the link</button>
      <button class="btn ghost block" data-act="online.tab:signin">Back to sign in</button></div>`;
  if (tab === 'signup')
    return `${tabs}<div class="card"><p class="sub">Play with real people: see them in the city, send money, climb the real leaderboard, and keep your game in the cloud.</p>
      ${input('user', 'Username (3–20 letters, numbers, _)', 'text', 'autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20"')}
      ${input('email', 'Email (for password resets)', 'email', 'autocomplete="email" inputmode="email"')}
      ${input('pw', 'Password (8+ characters)', 'password', 'autocomplete="new-password" minlength="8"')}
      <button class="btn primary block" data-act="online.signup" ${o.busy ? 'disabled' : ''}>${o.busy ? 'Creating…' : 'Create account'}</button>
      <p class="fine">Game money only. Your game on this phone comes with you.</p></div>`;
  return `${tabs}<div class="card">
      ${input('login', 'Username or email', 'text', 'autocomplete="username" autocapitalize="off" spellcheck="false"')}
      ${input('pw', 'Password', 'password', 'autocomplete="current-password"')}
      <button class="btn primary block" data-act="online.signin" ${o.busy ? 'disabled' : ''}>${o.busy ? 'Signing in…' : 'Sign in'}</button>
      <button class="btn ghost block" data-act="online.tab:forgot">Forgot password?</button></div>`;
}

function signedIn(o: Online): string {
  const u = o.user!;
  const b = o.board;
  const box = o.inbox;
  const waiting = [...(box?.incoming ?? []).map((t) => ({ id: t.id, amount: t.amount, text: `From ${t.from_name}${t.note ? `: “${t.note}”` : ''}` })), ...(box?.refunds ?? []).map((t) => ({ id: t.id, amount: t.amount, text: `Refund: wire to ${t.to_name} ${t.status === 'returned' ? '(their account is gone)' : 'was turned down'}` }))];
  return `<div class="card"><h3>🌐 ${esc(u.username)}${u.admin ? ' · 🛠️ admin' : ''}</h3><p class="sub">${esc(u.email)} · ${u.emailVerified ? '✅ confirmed' : '⚠️ not confirmed yet'}</p>
      ${u.emailVerified ? '' : `<button class="btn block" data-act="online.verify" ${o.busy ? 'disabled' : ''}>📧 Send the confirm link again</button>`}
      <p class="sub" style="margin-top:6px">🚶 ${o.here} other player${o.here === 1 ? '' : 's'} in your area right now${o.nearby.length ? `: ${esc(o.nearby.slice(0, 6).join(', '))}` : ''}.</p></div>
    ${waiting.length ? `<div class="card" style="border:3px solid var(--good)"><h3>💸 Money waiting for you</h3>${waiting.map((w) => `<div class="list-item"><div class="grow"><div class="title">${money(w.amount)}</div><div class="sub">${esc(w.text)}</div></div><button class="btn primary" data-act="online.collect:${w.id}" ${o.busy ? 'disabled' : ''}>Collect</button></div>`).join('')}</div>` : ''}
    <h3 style="margin:12px 0 6px">🏆 Real players · this season</h3>
    ${b ? `<div class="travel">${b.top.slice(0, 10).map((r, i) => `<div class="opt" style="${r.username === u.username ? 'border-color:var(--ink);background:#fff3c4' : ''}"><span style="font-size:20px;min-width:30px">${['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span><span class="grow"><b>${esc(r.username)}</b></span><span class="cost">${r.points}</span></div>`).join('') || '<p class="sub">Nobody yet. Go earn some points!</p>'}</div>
      <p class="sub">${b.you ? `You’re #${b.you.place} with ${b.you.points} points.` : 'You’re not on the board yet.'} Top 3 win ${b.prizes.map((p) => money(p)).join(' / ')} when the season ends.</p>` : '<p class="sub">Loading…</p>'}
    <h3 style="margin:12px 0 6px">💸 Send money</h3>
    <div class="card">${input('to', 'To (username)', 'text', 'autocapitalize="off" spellcheck="false" list="net-players"')}<datalist id="net-players"></datalist>
      ${input('amt', 'Amount ($)', 'text', 'inputmode="decimal" placeholder="0.00"')}
      ${input('memo', 'Note (optional)', 'text', 'maxlength="80"')}
      <button class="btn primary block" data-act="online.send" ${o.busy || !u.emailVerified ? 'disabled' : ''}>Send</button>
      <p class="sub">${u.emailVerified ? `Up to ${money(box?.leftToday ?? 300_000)} more today goes straight through. More than that is a wire: held for review.` : 'Confirm your email first.'}${box?.pending.length ? ` ${box.pending.length} wire${box.pending.length === 1 ? '' : 's'} waiting for review.` : ''}</p></div>
    <h3 style="margin:12px 0 6px">☁️ Cloud save</h3>
    <div class="row" style="gap:8px"><button class="btn block" data-act="online.save" ${o.busy ? 'disabled' : ''}>☁️ Save now</button><button class="btn block" data-act="online.load" ${o.busy ? 'disabled' : ''}>📥 Load cloud save</button></div>
    <p class="sub">Your game saves to the cloud every minute while you’re signed in.</p>
    <details class="card" style="margin-top:12px"><summary><b>⚙️ Account</b></summary>
      ${input('old', 'Current password', 'password', 'autocomplete="current-password"')}
      ${input('npw', 'New password', 'password', 'autocomplete="new-password"')}
      <button class="btn block" data-act="online.password" ${o.busy ? 'disabled' : ''}>Change password</button>
      <button class="btn block" style="margin-top:8px" data-act="online.signout">Sign out</button>
      <hr style="margin:12px 0;border:0;border-top:2px dashed var(--line-color, #ccc)">
      ${input('delpw', 'Password, to delete your online account', 'password', 'autocomplete="current-password"')}
      <button class="btn block" style="color:var(--bad)" data-act="online.delete" ${o.busy ? 'disabled' : ''}>Delete online account</button>
      <p class="fine">Deleting removes your account, cloud save and paintings from the server. Your game on this phone stays.</p></details>`;
}

PHONE_APPS.add({
  id: 'online',
  label: 'Online',
  icon: '🌐',
  bg: '#3a86ff',
  needsPhone: false,
  order: 5,
  render: (ctx) => {
    ctxRef = ctx;
    const o = online;
    if (!o || !o.available)
      return { title: 'Online', body: '<div class="card"><h3>🌐 Online play is coming soon</h3><p>Real players in the city, sending money to friends, the real leaderboard and cloud saves. Hang tight.</p></div>' };
    return { title: 'Online', body: note() + (o.signedIn ? signedIn(o) : signedOut(o)) };
  },
  opened: (ctx, el) => {
    ctxRef = ctx;
    const o = online;
    if (!o?.signedIn) return;
    // Fresh numbers each time the app opens (at most every few seconds).
    const now = Date.now();
    if (now - lastLoad > 4000) {
      lastLoad = now;
      void o.flushNow().then(() => o.loadBoard());
      void o.loadInbox();
    }
    // Username suggestions for "To".
    const to = el.querySelector<HTMLInputElement>('[name="to"]');
    to?.addEventListener('input', async () => {
      const list = await o.findPlayers(to.value);
      const dl = el.querySelector('#net-players');
      if (dl) dl.innerHTML = list.map((n) => `<option value="${esc(n)}">`).join('');
    });
  },
  act: (act) => {
    const o = online;
    if (!o) return;
    o.note = null;
    if (act.startsWith('tab:')) tab = act.slice(4) as typeof tab;
    else if (act === 'signin') void o.login(val('login').trim(), val('pw'));
    else if (act === 'signup') void o.register(val('user').trim(), val('email').trim(), val('pw'));
    else if (act === 'forgot') void o.forgot(val('email').trim()).then(() => (tab = 'signin'));
    else if (act === 'reset') void o.resetPassword(val('pw'));
    else if (act === 'verify') void o.resendVerify();
    else if (act === 'save') void o.saveNow();
    else if (act === 'load') void o.loadCloud();
    else if (act.startsWith('collect:')) void o.collect(Number(act.slice(8)));
    else if (act === 'send') void o.send(val('to').trim(), Number(val('amt').replace(/[$,\s]/g, '')), val('memo'));
    else if (act === 'password') void o.changePassword(val('old'), val('npw'));
    else if (act === 'signout') void o.logout();
    else if (act === 'delete') void o.deleteAccount(val('delpw'));
  },
});

/** 💬 On the street: who's around, emotes, say something. */
export function openChat(o: Online): void {
  const body = () => `<p class="sub">🚶 ${o.here} other player${o.here === 1 ? '' : 's'} nearby${o.nearby.length ? `: ${esc(o.nearby.slice(0, 8).join(', '))}` : ''}.</p>
    <div class="net-emotes">${EMOTES.map((e) => `<button class="btn" data-act="emote:${e}">${{ wave: '👋', dance: '💃', laugh: '😂', cheer: '🎉', point: '👉', shrug: '🤷', heart: '❤️', fire: '🔥' }[e] ?? e}</button>`).join('')}</div>
    <div class="net-chatlog">${o.chat.slice(-8).map((c) => `<p><b>${esc(c.name)}</b> ${esc(c.text)}</p>`).join('') || '<p class="sub">Say hi. Be nice: people can report chat.</p>'}</div>
    <div class="row" style="gap:8px"><input class="input" name="say" maxlength="80" placeholder="Say something…" style="flex:1" enterkeyhint="send"><button class="btn primary" data-act="say">Send</button></div>`;
  const sheet = openSheet({ emoji: '💬', title: 'Online nearby', body: body() });
  const send = () => {
    const i = sheet.body.querySelector<HTMLInputElement>('[name="say"]');
    if (!i?.value.trim()) return;
    o.say(i.value);
    i.value = '';
  };
  onAct(sheet.body, (act) => {
    if (act.startsWith('emote:')) {
      o.emote(act.slice(6));
      sheet.close();
    }
    if (act === 'say') send();
  });
  sheet.body.querySelector<HTMLInputElement>('[name="say"]')?.addEventListener('keydown', (e) => e.key === 'Enter' && send());
}
