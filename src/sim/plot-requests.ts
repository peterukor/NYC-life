// =====================================================================
// plot-requests.ts — rent requests for real-money plots (data/plots.ts),
// kept on this device until payments and the server exist. Each request
// is what the player picked (units + weeks, house + months, or an island
// with a message for the admin team) and the price shown at the time.
//
// Later: the server takes these, takes payment, and decides who holds
// what. Nothing here grants anything.
// =====================================================================

import type { BoroughId } from '../world/geo-proj.ts';

export interface PlotRequest {
  plotId: string;
  kind: 'ad' | 'home' | 'island';
  borough: BoroughId;
  units?: number[];
  weeks?: number;
  house?: string;
  months?: number;
  message?: string;
  /** Has the player attached an ad picture? (the picture itself is uploaded with payment) */
  hasImage?: boolean;
  totalUsd: number;
  at: number;
}

const KEY = 'nyc-life-plot-requests';

export function loadRequests(): PlotRequest[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as PlotRequest[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRequest(r: PlotRequest): void {
  try {
    const list = loadRequests().filter((x) => !(x.plotId === r.plotId && x.kind === r.kind && x.kind !== 'ad'));
    list.push(r);
    localStorage.setItem(KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* storage off: nothing to keep */
  }
}

/** Homes this player has asked for in a borough (the cap is HOMES_PER_BOROUGH). */
export function homeRequestsIn(borough: BoroughId): number {
  return loadRequests().filter((r) => r.kind === 'home' && r.borough === borough).length;
}
