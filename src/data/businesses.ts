// =====================================================================
// businesses.ts — businesses you can buy and run.
//
// Each type has a price, how much it makes on an average game day, its
// daily costs, and how many staff it needs. Staff quality matters a lot:
// smart hires cost more and run things better (sim/business.ts).
//
// TO ADD A BUSINESS TYPE: add an entry. Money is in cents.
// =====================================================================

import { Registry } from '../core/registry.ts';

export interface BusinessType {
  id: string;
  name: string;
  emoji: string;
  /** Purchase price. */
  price: number;
  /** Revenue on an average day with decent staff. */
  revenue: number;
  /** Daily rent, stock and bills (before wages). */
  upkeep: number;
  /** Staff it needs to run properly. */
  staff: number;
  blurb: string;
}

export const BUSINESS_TYPES = new Registry<BusinessType>('business type');
// Sales are 1.5× the first numbers (Peter, 2026-10-16: "increase the money people
// make from buying a business by ×1.5").
BUSINESS_TYPES.add(
  { id: 'cart', name: 'Halal Cart', emoji: '🍛', price: 800_000, revenue: 90_000, upkeep: 15_000, staff: 1, blurb: 'Chicken over rice on a busy corner. Cheap to start, steady money.' },
  { id: 'bodega', name: 'Corner Bodega', emoji: '🏪', price: 6_000_000, revenue: 480_000, upkeep: 110_000, staff: 2, blurb: 'Sandwiches, snacks, scratch-offs and a cat. Open 24/7.' },
  { id: 'cafe', name: 'Coffee Shop', emoji: '☕', price: 15_000_000, revenue: 1_050_000, upkeep: 260_000, staff: 3, blurb: 'Oat lattes and laptops. Location is everything.' },
  { id: 'bar', name: 'Cocktail Bar', emoji: '🍸', price: 30_000_000, revenue: 2_250_000, upkeep: 600_000, staff: 4, blurb: 'Big nights, big margins, big headaches.' },
  { id: 'startup', name: 'Tech Startup', emoji: '🚀', price: 80_000_000, revenue: 6_300_000, upkeep: 2_000_000, staff: 6, blurb: 'Swings wildly. Great people make it fly; weak ones sink it.' },
);
