// =====================================================================
// arcade-games.ts — the cabinet contract and tiny shared helpers.
//
// A Run draws into the 360×480 cabinet canvas, calls hud() every frame
// and done(score) once, and returns a stop function. Every game lives in
// ui/arcade/<id>.ts (rules in sim/arcade-<id>.ts where they're testable):
// the seven classics, rebuilt 2026-10-28 (ui/arcade-classics.ts), and the
// newer cabinets (ui/arcade-games-2.ts). The frame is ui/arcade.ts.
// =====================================================================

export const W = 360, H = 480;
export type Run = (cv: HTMLCanvasElement, g: CanvasRenderingContext2D, done: (score: number) => void, hud: (text: string) => void) => () => void;

/** QA: ?arcadesec=N shortens timed games. */
export function secs(n: number): number {
  const q = new URLSearchParams(location.search);
  const v = Number(q.get('arcadesec'));
  return q.get('qa') === '1' && v > 0 ? v : n;
}

export function emoji(g: CanvasRenderingContext2D, e: string, x: number, y: number, size: number): void {
  g.fillStyle = '#000'; // emoji take the fill's transparency in some browsers
  g.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(e, x, y);
}

/** Canvas coordinates of a pointer event. */
export function at(cv: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
  const r = cv.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
