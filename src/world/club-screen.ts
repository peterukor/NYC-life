// =====================================================================
// club-screen.ts — the LED wall behind the DJ (Peter, 2026-10-15: "make
// the club write your name on screen when you buy a bottle or section").
//
// Idle: the club's name, who's on the decks, and TONIGHT'S TOP SPENDERS
// (sim/clubs.ts topSpenders: the regulars and you). Buy a bottle or a
// section and your name takes over the whole wall for a few seconds,
// flashing in the club's colour. The DJ dropping the beat gets a moment
// on the screen too.
//
// One canvas texture on one plane; it only redraws when the text changes
// or while flashing (cheap on phones).
// =====================================================================

import * as THREE from 'three';
import type { ClubDef } from '../data/clubs.ts';

const money = (c: number) => `$${Math.round(c / 100).toLocaleString('en-US')}`;

export class ClubScreen {
  readonly mesh: THREE.Mesh;
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private shout: { lines: string[]; until: number } | null = null;
  private board: { name: string; spent: number; you: boolean }[] = [];
  private dj: string;
  private t = 0;
  private lastDraw = -1;

  constructor(private club: ClubDef, private name: string, roomWidth: number, roomDepth: number) {
    this.canvas.width = 1024;
    this.canvas.height = 384;
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const w = Math.min(9, roomWidth * 0.42);
    const h = (w * this.canvas.height) / this.canvas.width;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    // High on the back wall, above the stage, facing the room.
    this.mesh.position.set(0, 2.6 + h / 2, -roomDepth / 2 + 0.06);
    this.mesh.name = 'club-screen';
    this.dj = club.djs[Math.floor(Math.random() * club.djs.length)];
    this.draw();
  }

  /** Tonight's top spenders (biggest first). */
  setBoard(board: { name: string; spent: number; you: boolean }[]): void {
    this.board = board;
    this.lastDraw = -1;
  }

  /** Take over the wall for `seconds` (your name when you buy a bottle, the DJ drop…). */
  announce(lines: string[], seconds = 7): void {
    this.shout = { lines, until: performance.now() / 1000 + seconds };
    this.lastDraw = -1;
  }

  /** What's on the wall right now (QA). */
  get showing(): string[] {
    return this.shout ? this.shout.lines : [this.name, ...this.board.map((r) => r.name)];
  }

  get djName(): string {
    return this.dj;
  }

  update(_dt: number): void {
    // Real time, not frames: a slow phone shows your name for the same few seconds.
    this.t = performance.now() / 1000;
    if (this.shout && this.t > this.shout.until) {
      this.shout = null;
      this.lastDraw = -1;
    }
    // Flashing: redraw ~8×/s while shouting; otherwise only when something changed.
    const frame = this.shout ? Math.floor(this.t * 8) : 0;
    if (frame !== this.lastDraw) {
      this.lastDraw = frame;
      this.draw();
    }
  }

  private draw(): void {
    const g = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const c = this.club.screen;
    g.fillStyle = '#05050a';
    g.fillRect(0, 0, W, H);
    // LED dots texture.
    g.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 4; y < H; y += 8) for (let x = 4; x < W; x += 8) g.fillRect(x, y, 2, 2);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (this.shout) {
      const on = Math.floor(this.t * 8) % 2 === 0;
      g.fillStyle = on ? c : '#ffffff';
      g.shadowColor = c;
      g.shadowBlur = 30;
      const [big, ...rest] = this.shout.lines;
      g.font = fit(g, big, W - 80, 120, (n) => `900 ${n}px "Lilita One", "Arial Black", sans-serif`);
      g.fillText(big, W / 2, rest.length ? H * 0.42 : H / 2);
      g.shadowBlur = 0;
      g.fillStyle = '#ffffff';
      rest.forEach((line, i) => {
        g.font = fit(g, line, W - 80, 52, (n) => `800 ${n}px Nunito, Arial, sans-serif`);
        g.fillText(line, W / 2, H * 0.72 + i * 54);
      });
    } else {
      g.fillStyle = c;
      g.shadowColor = c;
      g.shadowBlur = 18;
      g.font = `900 64px "Lilita One", "Arial Black", sans-serif`;
      g.fillText(this.name.toUpperCase(), W / 2, 56);
      g.shadowBlur = 0;
      g.fillStyle = '#ffffff';
      g.font = '800 30px Nunito, Arial, sans-serif';
      g.fillText(`🎧 ${this.dj}`, W / 2, 110);
      g.fillStyle = c;
      g.font = '900 30px Nunito, Arial, sans-serif';
      g.fillText("TONIGHT'S TOP SPENDERS", W / 2, 160);
      this.board.slice(0, 4).forEach((r, i) => {
        const y = 210 + i * 44;
        g.fillStyle = r.you ? c : '#ffffff';
        g.font = `${r.you ? 900 : 700} 32px Nunito, Arial, sans-serif`;
        g.textAlign = 'left';
        g.fillText(`${i + 1}. ${r.name}${r.you ? ' 👑' : ''}`, 210, y);
        g.textAlign = 'right';
        g.fillText(money(r.spent), W - 210, y);
        g.textAlign = 'center';
      });
      if (!this.board.length) {
        g.fillStyle = '#9aa0b5';
        g.font = '700 30px Nunito, Arial, sans-serif';
        g.fillText('Nobody yet. Be the first. 🍾', W / 2, 240);
      }
    }
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.tex.dispose();
  }
}

/** The biggest font (from `start` down) that fits the text in `maxW`. */
function fit(g: CanvasRenderingContext2D, text: string, maxW: number, start: number, font: (px: number) => string): string {
  let size = start;
  g.font = font(size);
  while (size > 18 && g.measureText(text).width > maxW) {
    size -= 4;
    g.font = font(size);
  }
  return font(size);
}
