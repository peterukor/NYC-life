// =====================================================================
// bus.ts — a tiny event bus so game systems can talk without importing
// each other. One system "emits" a named event; any number of others
// "listen" for it.
//
// Example:
//   bus.on('money:changed', (e) => updateHud(e.balance));
//   bus.emit('money:changed', { balance: 1200, delta: 100, reason: 'tip' });
//
// Every event and the shape of its data is listed in `GameEvents`
// below, so TypeScript catches typos and wrong data.
// =====================================================================

import type { NeedKey } from '../sim/types.ts';

/** All events in the game and the data each one carries. */
export interface GameEvents {
  'money:changed': { balance: number; delta: number; reason: string };
  'needs:changed': { needs: Record<NeedKey, number> };
  'toast': { text: string; icon?: string; tone?: 'good' | 'bad' | 'info' };
  'place:entered': { placeId: string };
  'place:left': { placeId: string };
  'travel:start': { mode: string; to: string };
  'travel:end': { to: string };
  'area:changed': { area: string };
  'action:started': { actionId: string; seconds: number };
  'action:finished': { actionId: string };
  'event:fired': { eventId: string };
  'news:posted': { id: string };
  'pin:tap': { placeId: string };
  'view:mode': { mode: 'city' | 'interior' | 'transit' };
  'job:changed': { careerId: string | null };
  'shift:finished': { pay: number };
  'save:loaded': Record<string, never>;
  'ui:refresh': Record<string, never>;
}

type Handler<T> = (data: T) => void;

class Bus {
  private handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  /** Start listening. Returns a function that stops listening. */
  on<K extends keyof GameEvents>(name: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as Handler<unknown>);
    return () => set!.delete(fn as Handler<unknown>);
  }

  /** Tell every listener that something happened. */
  emit<K extends keyof GameEvents>(name: K, data: GameEvents[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    // Copy first so a listener that unsubscribes itself doesn't break the loop.
    for (const fn of [...set]) {
      try {
        fn(data);
      } catch (err) {
        // One broken listener must never crash the whole game.
        console.error(`[bus] listener for "${name}" failed`, err);
      }
    }
  }

  /** Remove every listener (used by tests and full restarts). */
  clear(): void {
    this.handlers.clear();
  }
}

export const bus = new Bus();
