// =====================================================================
// onboarding.ts — making your New Yorker.
//
// Asks for: birth year (21+ only, matching the Terms), a name, a look,
// a starting story (Trust Fund Kid or Hustler) and two traits.
// In multiplayer this becomes the sign-up screen with an account.
// =====================================================================

import { MIN_AGE } from '../core/constants.ts';
import { esc } from '../core/format.ts';
import { CLASSES, TRAITS, type NewLifeOptions } from '../sim/state.ts';
import type { SpawnClass } from '../data/wardrobe.ts';
import type { Look } from '../sim/types.ts';
import { HAIR_COLORS, OUTFIT_COLORS, SKIN_TONES } from '../world/avatar.ts';
import { html, root } from './dom.ts';

export function runOnboarding(onLook: (look: Look) => void): Promise<NewLifeOptions> {
  return new Promise((resolve) => {
    const thisYear = new Date().getFullYear();
    const years = Array.from({ length: 80 }, (_, i) => thisYear - 16 - i);
    const look: Look = { body: 'f', skin: SKIN_TONES[3], top: OUTFIT_COLORS[1], bottom: OUTFIT_COLORS[5], hair: HAIR_COLORS[0] };
    let spawnClass: SpawnClass = 'middle';
    const traits = new Set<string>(['streetwise', 'foodie']);

    const swatches = (key: keyof Look, list: string[]) =>
      `<div class="swatches" role="radiogroup">${list
        .map((c) => `<button class="swatch${look[key] === c ? ' on' : ''}" style="background:${c}" data-key="${key}" data-val="${c}" aria-label="${key} ${c}" role="radio" aria-checked="${look[key] === c}"></button>`)
        .join('')}</div>`;

    const el = html(`
      <div class="onboard">
        <div class="onboard-inner">
          <div class="logo"><div class="mark">NY</div><h1>NYC Life</h1></div>
          <p class="tagline">Ride the train. Chase the bag. Eat the slice. Make it in the city.</p>

          <div class="field">
            <label for="ob-year">Year you were born</label>
            <select id="ob-year"><option value="">Choose…</option>${years.map((y) => `<option value="${y}">${y}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label for="ob-name">Your name in the city</label>
            <input id="ob-name" maxlength="20" autocomplete="nickname" placeholder="e.g. Jack" />
          </div>
          <div class="field"><span class="label">Body</span>
            <div class="seg" role="radiogroup"><button data-body="f" class="on">Femme</button><button data-body="m">Masc</button></div>
          </div>
          <div class="field"><span class="label">Skin</span>${swatches('skin', SKIN_TONES)}</div>
          <div class="field"><span class="label">Top</span>${swatches('top', OUTFIT_COLORS)}</div>
          <div class="field"><span class="label">Bottoms</span>${swatches('bottom', OUTFIT_COLORS)}</div>
          <div class="field"><span class="label">Hair</span>${swatches('hair', HAIR_COLORS)}</div>

          <div class="field"><span class="label">Born into…</span>
            <div class="origins">${(Object.keys(CLASSES) as SpawnClass[])
              .map((o) => {
                const d = CLASSES[o];
                return `<button class="origin${o === spawnClass ? ' on' : ''}" data-origin="${o}"><h3>${d.emoji} ${d.title}</h3><div class="sub">${esc(d.tagline)}</div><ul>${d.perks.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></button>`;
              })
              .join('')}</div>
          </div>

          <div class="field"><span class="label">Pick two traits</span>
            <div class="traits">${Object.entries(TRAITS)
              .map(([id, t]) => `<button class="trait${traits.has(id) ? ' on' : ''}" data-trait="${id}"><b>${t.emoji} ${t.label}</b><span>${esc(t.desc)}</span></button>`)
              .join('')}</div>
          </div>

          <div class="err" id="ob-err" role="alert"></div>
          <button class="btn primary block" id="ob-go">Move to New York</button>
          <p class="fine">NYC Life is for players ${MIN_AGE} and over. It’s a work of fiction: places are inspired by real New York, and brands you see are made up unless marked “Sponsored”. This preview saves your game on this device only.</p>
        </div>
      </div>`);
    root().appendChild(el);

    const refreshLook = () => onLook({ ...look });
    refreshLook();

    el.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const sw = t.closest<HTMLElement>('.swatch');
      if (sw) {
        const key = sw.dataset.key as keyof Look;
        (look as unknown as Record<string, string>)[key] = sw.dataset.val!;
        sw.parentElement!.querySelectorAll('.swatch').forEach((s) => {
          s.classList.toggle('on', s === sw);
          s.setAttribute('aria-checked', String(s === sw));
        });
        refreshLook();
        return;
      }
      const body = t.closest<HTMLElement>('[data-body]');
      if (body) {
        look.body = body.dataset.body as 'm' | 'f';
        body.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === body));
        refreshLook();
        return;
      }
      const o = t.closest<HTMLElement>('[data-origin]');
      if (o) {
        spawnClass = o.dataset.origin as SpawnClass;
        el.querySelectorAll('.origin').forEach((x) => x.classList.toggle('on', x === o));
        return;
      }
      const tr = t.closest<HTMLElement>('[data-trait]');
      if (tr) {
        const id = tr.dataset.trait!;
        if (traits.has(id)) traits.delete(id);
        else {
          if (traits.size >= 2) traits.delete([...traits][0]);
          traits.add(id);
        }
        el.querySelectorAll<HTMLElement>('.trait').forEach((x) => x.classList.toggle('on', traits.has(x.dataset.trait!)));
      }
    });

    el.querySelector('#ob-go')!.addEventListener('click', () => {
      const err = el.querySelector<HTMLElement>('#ob-err')!;
      const year = Number(el.querySelector<HTMLSelectElement>('#ob-year')!.value);
      const name = el.querySelector<HTMLInputElement>('#ob-name')!.value.trim().replace(/\s+/g, ' ');
      if (!year) return void (err.textContent = 'Choose the year you were born.');
      // Conservative check: with only a birth year, assume the birthday hasn't
      // happened yet this year, so someone born in (thisYear - 21) is treated as 20.
      if (thisYear - year - 1 < MIN_AGE) return void (err.textContent = `Sorry — NYC Life is for players ${MIN_AGE} and over.`);
      if (name.length < 2) return void (err.textContent = 'Pick a name with at least 2 letters.');
      if (traits.size !== 2) return void (err.textContent = 'Pick two traits.');
      el.remove();
      resolve({ name, origin: CLASSES[spawnClass].origin, spawnClass, look: { ...look }, birthYear: year, traits: [...traits] });
    });
  });
}
