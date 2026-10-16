// =====================================================================
// online.ts (net) — the game's side of online play.
//
//  👤 Account     sign up / sign in / out, forgot & reset password, verify
//                 email (links in emails open the game with ?reset= or
//                 ?verify=).
//  ☁️ Cloud save  pushed every minute while signed in; on sign-in, if the
//                 cloud and this phone differ, you choose which to keep.
//  🏆 Season      your points also go to the real players' board; the
//                 real board's top 3 claim the prize.
//  💸 Money       send to another player by username; collect what's
//                 sent to you (and refunds of wires that were turned down).
//  🖼️ Gallery     paintings you hang go up for everyone; like others'.
//  🚶 City        other signed-in players walk around your area (names
//                 over their heads), wave, and chat.
//
// Everything here is optional: with no server set (net/api.ts), nothing
// connects and the game plays exactly as before.
// =====================================================================

import * as THREE from 'three';
import { nowMs } from '../core/clock.ts';
import { SAVE_KEY } from '../core/constants.ts';
import { changeMoney, chargeBill } from '../sim/economy.ts';
import { onPoints, seasonId, useRealBoard } from '../sim/season.ts';
import type { AreaId, GameState } from '../sim/types.ts';
import { makeAvatar, type Avatar } from '../world/avatar.ts';
import { api, apiBase, ApiFail, getToken, onlineAvailable, setToken } from './api.ts';

export interface PublicUser {
  username: string;
  email: string;
  emailVerified: boolean;
  created: number;
  admin: boolean;
}

export interface BoardRow {
  username: string;
  points: number;
}

export interface Inbox {
  incoming: { id: number; amount: number; note: string; created: number; from_name: string }[];
  refunds: { id: number; amount: number; status: string; to_name: string }[];
  pending: { id: number; amount: number; created: number; to_name: string }[];
  leftToday: number;
}

export interface WallArt {
  id: number;
  title: string;
  img: string;
  likes: number;
  artist: string;
  liked: boolean;
  mine: boolean;
}

export interface OnlineHost {
  state: () => GameState;
  /** The city scene while you're on the street (null indoors / in transit). */
  cityScene: () => THREE.Scene | null;
  /** Where you are right now. */
  me: () => { area: AreaId; x: number; z: number; ry: number; moving: boolean; placeId: string | null };
  /** Save locally and refresh the HUD (after money changes). */
  saved: () => void;
  toast: (text: string, opts?: { icon?: string; tone?: 'good' | 'bad' | 'info'; ms?: number }) => void;
  /** Ask the player to pick (cloud vs this phone). Resolves with the chosen option id. */
  choose: (title: string, text: string, options: { id: string; label: string }[]) => Promise<string>;
}

const REV_KEY = 'nyclife.cloudrev';
const EMOTE_ICON: Record<string, string> = { wave: '👋', dance: '💃', laugh: '😂', cheer: '🎉', point: '👉', shrug: '🤷', heart: '❤️', fire: '🔥', '🥂': '🥂', '💸': '💸' };
export const EMOTES = Object.keys(EMOTE_ICON);

interface Remote {
  avatar: Avatar;
  label: THREE.Sprite;
  bubble: THREE.Sprite | null;
  bubbleUntil: number;
  target: { x: number; z: number; ry: number };
  moving: boolean;
  name: string;
  lastEmoteAt: number;
}

/** A text sprite (names, chat bubbles). */
function textSprite(text: string, opts: { bg?: string; fg?: string; size?: number; maxW?: number } = {}): THREE.Sprite {
  const size = opts.size ?? 30;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `800 ${size}px Nunito, system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  g.font = font;
  const w = Math.min(opts.maxW ?? 520, Math.ceil(g.measureText(text).width) + size);
  c.width = w;
  c.height = Math.ceil(size * 1.6);
  g.font = font;
  g.fillStyle = opts.bg ?? 'rgba(28,35,64,0.82)';
  const r = c.height / 2;
  g.beginPath();
  g.roundRect(0, 0, c.width, c.height, r);
  g.fill();
  g.fillStyle = opts.fg ?? '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 1, c.width - size * 0.6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const k = 0.0075; // metres per canvas pixel: names ~0.35 m tall
  s.scale.set(c.width * k, c.height * k, 1);
  s.renderOrder = 20;
  return s;
}

const disposeSprite = (s: THREE.Sprite | null) => {
  if (!s) return;
  s.removeFromParent();
  s.material.map?.dispose();
  s.material.dispose();
};

export class Online {
  user: PublicUser | null = null;
  busy = false;
  board: { season: number; ends: number; prizes: number[]; top: BoardRow[]; you: { place: number; points: number } | null } | null = null;
  inbox: Inbox | null = null;
  wall: WallArt[] | null = null;
  /** Other players in your area right now (names). */
  nearby: string[] = [];
  /** Something to tell the player on the Online page (errors, "check your email"). */
  note: { text: string; tone: 'good' | 'bad' | 'info' } | null = null;
  /** A reset link was opened: show the "new password" form. */
  resetToken: string | null = null;
  /** Redraw the 🌐 Online app (set by the phone). */
  onChange: () => void = () => {};
  /** Chat lines (for the chat sheet). */
  chat: { name: string; text: string; at: number }[] = [];

  private host: OnlineHost;
  private pending = 0;
  private pointsTimer = 0;
  private saveTimer = 0;
  private cloudConflict = false;
  // Real-time
  private room: { roomId: string; send: (t: string, m: unknown) => void; leave: (c?: boolean) => Promise<number>; state: { players?: { forEach: (fn: (p: RemoteState, id: string) => void) => void } }; sessionId: string; onMessage: (t: string, fn: (m: never) => void) => void; onLeave: (fn: (code: number) => void) => void } | null = null;
  private roomArea: AreaId | null = null;
  private joining = false;
  private remotes = new Map<string, Remote>();
  private sendT = 0;
  private last = { x: 0, z: 0, ry: 0, moving: false, place: '' as string, sent: 0 };
  private retryAt = 0;

  constructor(host: OnlineHost) {
    this.host = host;
  }

  get available(): boolean {
    return onlineAvailable();
  }
  get signedIn(): boolean {
    return !!this.user;
  }

  private tell(text: string, tone: 'good' | 'bad' | 'info' = 'info'): void {
    this.note = { text, tone };
    this.onChange();
  }

  private async run<T>(fn: () => Promise<T>): Promise<T | null> {
    this.busy = true;
    this.onChange();
    try {
      return await fn();
    } catch (e) {
      this.tell(e instanceof ApiFail ? e.message : 'Something went wrong. Try again.', 'bad');
      return null;
    } finally {
      this.busy = false;
      this.onChange();
    }
  }

  // ------------------------------------------------------------ start-up

  /** Call once the game is running. Handles ?verify= / ?reset= links and a saved sign-in. */
  async boot(search = location.search): Promise<'reset' | null> {
    if (!this.available) return null;
    onPoints((pts) => this.signedIn && (this.pending += pts));
    const q = new URLSearchParams(search);
    let open: 'reset' | null = null;
    if (q.get('verify')) {
      try {
        await api('POST', '/auth/verify', { token: q.get('verify') });
        this.host.toast('✅ Email confirmed. Thanks!', { icon: '🌐', tone: 'good', ms: 4000 });
      } catch (e) {
        this.host.toast(e instanceof ApiFail ? e.message : 'That link didn’t work.', { icon: '🌐', tone: 'bad', ms: 4500 });
      }
    }
    if (q.get('reset')) {
      this.resetToken = q.get('reset');
      open = 'reset';
    }
    if (q.get('verify') || q.get('reset')) {
      // Clean the address so a reload doesn't reuse the link.
      q.delete('verify');
      q.delete('reset');
      history.replaceState(null, '', `${location.pathname}${q.toString() ? `?${q}` : ''}${location.hash}`);
    }
    if (getToken()) {
      try {
        const r = await api<{ user: PublicUser }>('GET', '/auth/me');
        await this.signedInAs(r.user, false);
      } catch {
        // Expired or offline: stay signed out; the Online app offers sign-in.
      }
    }
    return open;
  }

  private async signedInAs(user: PublicUser, fresh: boolean): Promise<void> {
    this.user = user;
    useRealBoard(true);
    this.note = null;
    this.onChange();
    if (fresh) await this.syncOnSignIn();
    void this.claimLastSeason();
    void this.loadInbox(true);
  }

  // ------------------------------------------------------------ account

  async register(username: string, email: string, password: string): Promise<boolean> {
    const r = await this.run(() => api<{ token: string; user: PublicUser }>('POST', '/auth/register', { username, email, password }));
    if (!r) return false;
    setToken(r.token);
    await this.signedInAs(r.user, true);
    this.tell(`Welcome, ${r.user.username}! We sent a link to ${r.user.email}: tap it to confirm your email.`, 'good');
    return true;
  }

  async login(login: string, password: string): Promise<boolean> {
    const r = await this.run(() => api<{ token: string; user: PublicUser }>('POST', '/auth/login', { login, password }));
    if (!r) return false;
    setToken(r.token);
    await this.signedInAs(r.user, true);
    this.tell(`Signed in as ${r.user.username}.`, 'good');
    return true;
  }

  async logout(): Promise<void> {
    await this.pushSave(false).catch(() => {});
    await api('POST', '/auth/logout', {}).catch(() => {});
    setToken(null);
    this.user = null;
    useRealBoard(false);
    this.leaveRoom();
    this.board = this.inbox = this.wall = null;
    this.tell('Signed out. Your game is still saved on this phone.');
  }

  async forgot(email: string): Promise<void> {
    const r = await this.run(() => api('POST', '/auth/forgot', { email }));
    if (r) this.tell(`If ${email} has an account, a reset link is on its way. Check your inbox (and spam).`, 'good');
  }

  async resetPassword(password: string): Promise<void> {
    const token = this.resetToken;
    if (!token) return;
    const r = await this.run(() => api<{ token: string; user: PublicUser }>('POST', '/auth/reset', { token, password }));
    if (!r) return;
    this.resetToken = null;
    setToken(r.token);
    await this.signedInAs(r.user, true);
    this.tell('New password saved. You’re signed in.', 'good');
  }

  async resendVerify(): Promise<void> {
    const r = await this.run(() => api('POST', '/auth/verify/resend', {}));
    if (r) this.tell('Sent! Check your inbox (and spam).', 'good');
  }

  async changePassword(old: string, password: string): Promise<void> {
    const r = await this.run(() => api<{ token: string }>('POST', '/auth/password', { old, password }));
    if (!r) return;
    setToken(r.token);
    this.tell('Password changed. Other devices were signed out.', 'good');
  }

  async deleteAccount(password: string): Promise<void> {
    const r = await this.run(() => api('POST', '/auth/delete', { password }));
    if (!r) return;
    setToken(null);
    this.user = null;
    useRealBoard(false);
    this.leaveRoom();
    this.tell('Your online account is deleted. Your game on this phone is untouched.', 'info');
  }

  // ------------------------------------------------------------ ☁️ cloud save

  private get rev(): number {
    try {
      return Number(localStorage.getItem(REV_KEY) ?? 0);
    } catch {
      return 0;
    }
  }
  private set rev(v: number) {
    try {
      localStorage.setItem(REV_KEY, String(v));
    } catch {
      // Private mode: fine, the next save just asks.
    }
  }

  /** Just signed in: is there a cloud save, and which one do we keep? */
  private async syncOnSignIn(): Promise<void> {
    let cloud: { rev: number; updated: number; save: GameState | null };
    try {
      cloud = await api('GET', '/save');
    } catch {
      return;
    }
    const local = this.host.state();
    if (!cloud.save) {
      this.rev = 0;
      await this.pushSave(false);
      return;
    }
    if (cloud.rev === this.rev) return; // already in step
    const money = (s: GameState) => `$${Math.round((s.money + s.bank) / 100).toLocaleString('en-US')}`;
    const pick = await this.host.choose(
      '☁️ You have a cloud save',
      `Cloud: ${cloud.save.profile?.name ?? 'your character'}, ${money(cloud.save)}, saved ${new Date(cloud.updated).toLocaleString()}.\nThis phone: ${local.profile.name}, ${money(local)}.`,
      [
        { id: 'cloud', label: '☁️ Play the cloud save' },
        { id: 'local', label: '📱 Keep this phone’s (overwrite the cloud)' },
      ],
    );
    if (pick === 'cloud') {
      this.rev = cloud.rev;
      localStorage.setItem(SAVE_KEY, JSON.stringify(cloud.save));
      location.reload();
    } else {
      this.rev = cloud.rev;
      await this.pushSave(true);
    }
  }

  /** Upload this phone's game. */
  async pushSave(force: boolean): Promise<boolean> {
    if (!this.signedIn) return false;
    try {
      const r = await api<{ rev: number }>('PUT', '/save', { rev: this.rev, save: this.host.state(), force });
      this.rev = r.rev;
      this.cloudConflict = false;
      return true;
    } catch (e) {
      if (e instanceof ApiFail && e.status === 409 && !this.cloudConflict) {
        this.cloudConflict = true;
        this.host.toast('☁️ Your cloud save changed on another device. Open 🌐 Online to choose which to keep.', { icon: '☁️', tone: 'bad', ms: 6000 });
      }
      return false;
    }
  }

  async saveNow(): Promise<void> {
    const ok = await this.run(() => this.pushSave(true));
    if (ok) this.tell('☁️ Saved to the cloud.', 'good');
  }

  async loadCloud(): Promise<void> {
    const cloud = await this.run(() => api<{ rev: number; save: GameState | null }>('GET', '/save'));
    if (!cloud) return;
    if (!cloud.save) return this.tell('Nothing in the cloud yet.', 'info');
    this.rev = cloud.rev;
    localStorage.setItem(SAVE_KEY, JSON.stringify(cloud.save));
    location.reload();
  }

  // ------------------------------------------------------------ 🏆 season

  async loadBoard(): Promise<void> {
    try {
      this.board = await api('GET', '/season/board');
      this.onChange();
    } catch {
      // Shown as "couldn't load" by the app.
    }
  }

  private async claimLastSeason(): Promise<void> {
    const prev = seasonId() - 1;
    const s = this.host.state();
    const key = `claimed-${prev}`;
    // The server pays each season once; this just avoids asking again in the same visit.
    if (prev < 0 || sessionStorage.getItem(key)) return;
    try {
      const r = await api<{ place: number; prize: number; already: boolean }>('POST', '/season/claim', { season: prev });
      sessionStorage.setItem(key, '1');
      if (r.prize > 0) {
        changeMoney(s, r.prize, `🏆 Season ${prev}: ${['1st', '2nd', '3rd'][r.place]} place (real players)`);
        this.host.saved();
        this.host.toast(`🏆 You finished ${['1st 🥇', '2nd 🥈', '3rd 🥉'][r.place]} among real players last season: +$${r.prize / 100}!`, { icon: '🏆', tone: 'good', ms: 7000 });
      }
    } catch {
      // Try again next start.
    }
  }

  /** Send any points still waiting (before showing the board). */
  flushNow(): Promise<void> {
    return this.flushPoints();
  }

  private async flushPoints(): Promise<void> {
    if (!this.pending || !this.signedIn) return;
    const pts = this.pending;
    this.pending = 0;
    try {
      await api('POST', '/season/points', { points: pts });
    } catch (e) {
      if (!(e instanceof ApiFail) || e.status >= 500 || e.status === 0) this.pending += pts; // retry later
    }
  }

  // ------------------------------------------------------------ 💸 money

  async loadInbox(quiet = false): Promise<void> {
    try {
      this.inbox = await api('GET', '/transfers/inbox');
      const n = (this.inbox?.incoming.length ?? 0) + (this.inbox?.refunds.length ?? 0);
      if (quiet && n) this.host.toast(`💸 ${n === 1 ? 'Someone sent you money' : `${n} transfers waiting`}: collect in 🌐 Online.`, { icon: '💸', tone: 'good', ms: 5000 });
      this.onChange();
    } catch {
      // Shown in the app.
    }
  }

  async send(to: string, dollars: number, note: string): Promise<void> {
    const s = this.host.state();
    const amount = Math.round(dollars * 100);
    if (!Number.isFinite(amount) || amount < 100) return this.tell('Type an amount: $1 or more.', 'bad');
    if (s.money + s.bank < amount) return this.tell('You don’t have that much (cash + bank).', 'bad');
    const r = await this.run(() => api<{ to: string; amount: number; status: string }>('POST', '/transfers', { to, amount, note }));
    if (!r) return;
    chargeBill(s, amount, `💸 Sent to ${r.to}`);
    this.host.saved();
    void this.pushSave(false);
    this.tell(r.status === 'review' ? `💸 $${amount / 100} to ${r.to} is a wire: it’s held for review (over $3,000 today). If it’s turned down you get it back.` : `💸 Sent $${amount / 100} to ${r.to}.`, 'good');
    void this.loadInbox();
  }

  async collect(id: number): Promise<void> {
    const r = await this.run(() => api<{ amount: number; kind: string }>('POST', `/transfers/${id}/collect`, {}));
    if (!r) return;
    const s = this.host.state();
    changeMoney(s, r.amount, r.kind === 'refund' ? '💸 Wire refunded' : '💸 Transfer received');
    this.host.saved();
    void this.pushSave(false);
    this.tell(`+$${r.amount / 100} ${r.kind === 'refund' ? '(refund)' : ''}`, 'good');
    await this.loadInbox();
  }

  async findPlayers(q: string): Promise<string[]> {
    try {
      return (await api<{ players: string[] }>('GET', `/players?q=${encodeURIComponent(q)}`)).players;
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------ 🖼️ gallery

  async loadWall(): Promise<WallArt[]> {
    try {
      this.wall = (await api<{ art: WallArt[] }>('GET', '/art')).art;
    } catch {
      this.wall = this.wall ?? [];
    }
    return this.wall;
  }

  hangArt(title: string, img: string): void {
    if (!this.signedIn) return;
    api('POST', '/art', { title, img }).catch((e) => e instanceof ApiFail && this.host.toast(e.message, { icon: '🖼️', tone: 'bad' }));
  }

  async like(id: number): Promise<number | null> {
    try {
      return (await api<{ likes: number }>('POST', `/art/${id}/like`, {})).likes;
    } catch (e) {
      if (e instanceof ApiFail) this.host.toast(e.message, { icon: '❤️', tone: 'bad' });
      return null;
    }
  }

  async report(kind: 'player' | 'art' | 'chat', target: string, reason: string): Promise<void> {
    try {
      await api('POST', '/reports', { kind, target, reason });
      this.host.toast('Thanks. We’ll take a look.', { icon: '🚩', ms: 3000 });
    } catch (e) {
      if (e instanceof ApiFail) this.host.toast(e.message, { icon: '🚩', tone: 'bad' });
    }
  }

  // ------------------------------------------------------------ 🚶 the city, live

  private async joinRoom(area: AreaId): Promise<void> {
    if (this.joining || !this.signedIn) return;
    this.joining = true;
    try {
      const { Client } = await import('@colyseus/sdk');
      const me = this.host.me();
      const look = JSON.stringify(this.host.state().profile.look).slice(0, 390);
      const room = (await new Client(apiBase()!).joinOrCreate('city', { area, token: getToken(), x: me.x, z: me.z, look })) as unknown as NonNullable<Online['room']>;
      this.room = room;
      this.roomArea = area;
      this.last = { x: me.x, z: me.z, ry: me.ry, moving: false, place: '', sent: 0 };
      room.onMessage('said', (m: { id: string; name: string; text: string; at: number }) => this.heard(m));
      room.onLeave((code: number) => {
        if (this.room === room) {
          this.room = null;
          this.roomArea = null;
          this.clearRemotes();
          if (code === 4001) this.host.toast('You went online on another device, so this one left the city.', { icon: '🌐', ms: 5000 });
          this.retryAt = performance.now() + 5000;
        }
      });
    } catch {
      this.retryAt = performance.now() + 15_000;
    } finally {
      this.joining = false;
    }
  }

  private leaveRoom(): void {
    const r = this.room;
    this.room = null;
    this.roomArea = null;
    this.clearRemotes();
    void r?.leave(true).catch(() => {});
  }

  private clearRemotes(): void {
    for (const r of this.remotes.values()) this.dropRemote(r);
    this.remotes.clear();
    this.nearby = [];
  }

  private dropRemote(r: Remote): void {
    r.avatar.root.removeFromParent();
    r.avatar.dispose();
    disposeSprite(r.label);
    disposeSprite(r.bubble);
  }

  private heard(m: { id: string; name: string; text: string; at: number }): void {
    this.chat.push({ name: m.name, text: m.text, at: m.at });
    if (this.chat.length > 40) this.chat.shift();
    const r = this.remotes.get(m.id);
    if (r) this.bubble(r, m.text);
    if (m.id !== this.room?.sessionId) this.host.toast(`${m.name}: ${m.text}`, { icon: '💬', ms: 4000 });
    this.onChange();
  }

  private bubble(r: Remote, text: string): void {
    disposeSprite(r.bubble);
    r.bubble = textSprite(text, { bg: '#ffffff', fg: '#1c2340', size: 28, maxW: 700 });
    r.bubble.position.y = 2.7;
    r.avatar.root.add(r.bubble);
    r.bubbleUntil = performance.now() + 5000;
  }

  say(text: string): void {
    const t = text.trim().slice(0, 80);
    if (t && this.room) this.room.send('say', { text: t });
  }

  emote(e: string): void {
    if (this.room && EMOTES.includes(e)) this.room.send('emote', { e });
  }

  /** Every frame. */
  update(dt: number): void {
    if (!this.signedIn) return;
    // Points and the cloud save go up in batches.
    this.pointsTimer += dt;
    if (this.pointsTimer > 15) {
      this.pointsTimer = 0;
      void this.flushPoints();
    }
    this.saveTimer += dt;
    if (this.saveTimer > 60) {
      this.saveTimer = 0;
      if (!this.cloudConflict) void this.pushSave(false);
    }
    // The live city: join the room for your area.
    const me = this.host.me();
    if (!this.room && !this.joining && performance.now() > this.retryAt) void this.joinRoom(me.area);
    if (!this.room) return;
    if (this.roomArea !== me.area) {
      this.leaveRoom();
      return;
    }
    // Send where you are (about 6 times a second; a big jump is "travel").
    this.sendT += dt;
    const place = me.placeId ?? '';
    if (place !== this.last.place) {
      this.room.send('place', { placeId: place });
      this.last.place = place;
    }
    const moved = Math.hypot(me.x - this.last.x, me.z - this.last.z);
    if (this.sendT > 0.16 && (moved > 0.05 || Math.abs(me.ry - this.last.ry) > 0.05 || me.moving !== this.last.moving)) {
      this.sendT = 0;
      this.room.send(moved > 40 ? 'travel' : 'move', { x: me.x, z: me.z, ry: me.ry, moving: me.moving });
      this.last = { ...this.last, x: me.x, z: me.z, ry: me.ry, moving: me.moving };
    }
    this.drawRemotes(dt);
  }

  private drawRemotes(dt: number): void {
    const scene = this.host.cityScene();
    const seen = new Set<string>();
    const names: string[] = [];
    const now = performance.now();
    this.room?.state?.players?.forEach((p, id) => {
      if (id === this.room!.sessionId) return;
      seen.add(id);
      names.push(p.name);
      let r = this.remotes.get(id);
      if (!r) {
        let look = this.host.state().profile.look;
        try {
          look = { ...look, ...(p.look ? JSON.parse(p.look) : {}) };
        } catch {
          // A broken look: default clothes.
        }
        const avatar = makeAvatar(look);
        const label = textSprite(p.name);
        label.position.y = 2.25;
        avatar.root.add(label);
        avatar.root.position.set(p.x, 0, p.z);
        r = { avatar, label, bubble: null, bubbleUntil: 0, target: { x: p.x, z: p.z, ry: p.ry }, moving: p.moving, name: p.name, lastEmoteAt: p.emoteAt };
        this.remotes.set(id, r);
      }
      r.target = { x: p.x, z: p.z, ry: p.ry };
      r.moving = p.moving;
      if (p.emoteAt && p.emoteAt !== r.lastEmoteAt) {
        r.lastEmoteAt = p.emoteAt;
        this.bubble(r, EMOTE_ICON[p.emote] ?? '👋');
      }
      // Inside a place: not on the street.
      const show = !!scene && !p.place;
      if (show && r.avatar.root.parent !== scene) scene!.add(r.avatar.root);
      if (!show) r.avatar.root.removeFromParent();
    });
    for (const [id, r] of this.remotes) {
      if (!seen.has(id)) {
        this.dropRemote(r);
        this.remotes.delete(id);
      }
    }
    this.nearby = names;
    // Glide toward where they are.
    for (const r of this.remotes.values()) {
      const pos = r.avatar.root.position;
      const dx = r.target.x - pos.x, dz = r.target.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 60) pos.set(r.target.x, 0, r.target.z);
      else {
        const k = Math.min(1, dt * 8);
        pos.x += dx * k;
        pos.z += dz * k;
      }
      let diff = r.target.ry - r.avatar.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      r.avatar.root.rotation.y += diff * Math.min(1, dt * 10);
      if (r.avatar.root.parent) r.avatar.animate(r.moving || d > 0.3 ? Math.min(6, d * 8 + 1.4) : 0, dt);
      if (r.bubble && now > r.bubbleUntil) {
        disposeSprite(r.bubble);
        r.bubble = null;
      }
    }
  }

  /** How many other players are in your area. */
  get here(): number {
    return this.remotes.size;
  }

  /** For QA. */
  debug() {
    return { user: this.user?.username ?? null, room: this.room?.roomId ?? null, remotes: [...this.remotes.values()].map((r) => ({ name: r.name, x: +r.avatar.root.position.x.toFixed(1), z: +r.avatar.root.position.z.toFixed(1), shown: !!r.avatar.root.parent })), pending: this.pending, now: nowMs() };
  }
}

interface RemoteState {
  name: string;
  look: string;
  x: number;
  z: number;
  ry: number;
  moving: boolean;
  place: string;
  emote: string;
  emoteAt: number;
}
