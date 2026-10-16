// =====================================================================
// hints.ts (ui) — the 💡 tip card (sim/hints.ts says which and when).
// A small card under the top bar: the tip, "Got it", and "Fewer tips" /
// "No tips" so it's one tap to quieten them. Goes by itself after a while.
// =====================================================================

import { esc } from '../core/format.ts';
import type { HintDef, HintLevel } from '../sim/hints.ts';
import { html, root } from './dom.ts';

let current: HTMLElement | null = null;

export function showHint(h: HintDef, level: HintLevel, setLevel: (l: HintLevel) => void): void {
  current?.remove();
  const el = html(`
    <div class="hint-tip" role="status" aria-live="polite">
      <span class="hint-emoji" aria-hidden="true">${h.emoji}</span>
      <div class="grow"><b>💡 Tip</b><p>${esc(h.text)}</p>
        <div class="row hint-btns"><button class="btn primary" data-h="ok">Got it</button>${level === 'all' ? '<button class="btn ghost" data-h="few">Fewer tips</button>' : ''}<button class="btn ghost" data-h="off">No tips</button></div>
      </div>
    </div>`);
  root().appendChild(el);
  current = el;
  const close = () => {
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 250);
    if (current === el) current = null;
  };
  const timer = window.setTimeout(close, 14_000);
  el.querySelectorAll<HTMLButtonElement>('[data-h]').forEach((b) =>
    b.addEventListener('click', () => {
      window.clearTimeout(timer);
      const a = b.dataset.h;
      if (a === 'few' || a === 'off') setLevel(a);
      close();
    }),
  );
}
