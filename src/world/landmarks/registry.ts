// =====================================================================
// landmarks/registry.ts — the list every landmark adds itself to.
// (Separate from index.ts so landmark files can import it without a
// circular import.)
// =====================================================================

import type * as THREE from 'three';
import { Registry } from '../../core/registry.ts';
import type { PlaceDef } from '../../data/places.ts';
import type { DistrictDef, Rect } from '../layout.ts';

export interface LandmarkCtx {
  place: PlaceDef;
  district: DistrictDef;
  /** The whole block the landmark stands on. */
  block: Rect;
  /** The block minus its sidewalk ring. */
  inner: Rect;
  group: THREE.Group;
  /** Register things to free when the area unloads. */
  track: <T extends { dispose(): void }>(x: T) => T;
  /** Run something every frame (e.g. turn a Ferris wheel). */
  animate: (fn: (dt: number) => void) => void;
  /** Graphics tier: trim detail on 'low' phones. */
  tier: 'low' | 'medium' | 'high';
}

export interface LandmarkDef {
  /** Same id as the place in data/places.ts. */
  id: string;
  build: (ctx: LandmarkCtx) => void;
}

export const LANDMARKS = new Registry<LandmarkDef>('landmark');

