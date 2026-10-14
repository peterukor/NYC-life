// =====================================================================
// shop.ts — buying furniture.
//
// Buying takes the price from your cash (never more than you have) and
// delivers the piece to Storage (state.storage), where you place it with
// the usual move tools (or swap it for the old one). One call buys one
// piece; the shop's button locks while it runs so a double-tap can't buy
// two by accident.
// =====================================================================

import { ACTIONS } from '../data/actions.ts';
import { FURNITURE, FURNITURE_QUALITY, SHOP_ITEMS, type FurnitureDef } from '../data/furniture.ts';
import { layoutForPlace } from '../data/homes.ts';
import { changeMoney } from './economy.ts';
import type { GameState, NeedKey } from './types.ts';

export function buyFurniture(s: GameState, item: string): { ok: true; def: FurnitureDef } | { ok: false; why: string } {
  const def = FURNITURE.get(item);
  if (!def || !SHOP_ITEMS.includes(item)) return { ok: false, why: 'Not sold here' };
  if (s.money < def.price) return { ok: false, why: `You need ${Math.ceil((def.price - s.money) / 100)} more dollars` };
  const r = changeMoney(s, -def.price, `Bought ${def.name}`);
  if (!r.ok) return { ok: false, why: r.why };
  (s.storage ??= []).push(item);
  return { ok: true, def };
}

/** What a piece is for: its main action and the need it fills. */
export function mainUse(def: FurnitureDef): { label: string; need: NeedKey; amount: number; seconds: number } | null {
  const a = def.actions.map((id) => ACTIONS[id]).find(Boolean);
  if (!a || !a.needs) return null;
  const [need, base] = (Object.entries(a.needs) as [NeedKey, number][]).sort((x, y) => y[1] - x[1])[0];
  if (base <= 0) return null;
  const q = FURNITURE_QUALITY[def.quality ?? 'basic'];
  return { label: a.label, need, amount: Math.round(base * q.gain), seconds: Math.round((a.seconds / q.speed) * 10) / 10 };
}

/** The pieces of each kind you have now (placed at home or in storage). */
export function ownedOfKind(s: GameState, kind: FurnitureDef['kind']): FurnitureDef[] {
  const placed = s.homes[s.home.placeId] ?? layoutForPlace(s.home.placeId).furniture;
  const ids = [...placed.map((i) => i.item), ...(s.storage ?? [])];
  return ids.map((id) => FURNITURE.get(id)).filter((d): d is FurnitureDef => !!d && d.kind === kind);
}

/** The best you already have of a kind (most of its need, fastest). */
export function bestOwned(s: GameState, kind: FurnitureDef['kind']): FurnitureDef | null {
  const rank = (d: FurnitureDef) => mainUse(d)?.amount ?? FURNITURE_QUALITY[d.quality ?? 'basic'].gain;
  return ownedOfKind(s, kind).sort((a, b) => rank(b) - rank(a))[0] ?? null;
}
