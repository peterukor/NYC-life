// =====================================================================
// registry.ts — the "plug-in board" for game content.
//
// Every kind of content (clothes, vehicles, places, events, careers…)
// lives in a Registry: a named list where each item has a unique id.
// New content is added by calling `.add(...)` with more items — usually
// in its own data file — and the rest of the game finds it by id or by
// listing everything. Nothing else has to change.
//
// The registry also catches the classic mistake of two items sharing an
// id: it throws straight away with a clear message instead of one item
// silently replacing the other.
//
// Example:
//   export const VEHICLES = new Registry<VehicleDef>('vehicle');
//   VEHICLES.add({ id: 'yellowCab', … }, { id: 'citiBike', … });
//   VEHICLES.get('yellowCab');    // → the cab, or undefined
//   VEHICLES.all();               // → every vehicle, in the order added
// =====================================================================

export class Registry<T extends { id: string }> {
  private items = new Map<string, T>();

  /** `kind` is only used in error messages ("duplicate vehicle id …"). */
  constructor(readonly kind: string) {}

  /** Add one or more items. Throws if an id is already taken. */
  add(...list: T[]): this {
    for (const item of list) {
      if (!item.id) throw new Error(`${this.kind}: an item is missing its id`);
      if (this.items.has(item.id)) throw new Error(`${this.kind}: duplicate id "${item.id}"`);
      this.items.set(item.id, item);
    }
    return this;
  }

  /** The item with this id, or undefined if there isn't one. */
  get(id: string | undefined): T | undefined {
    return id === undefined ? undefined : this.items.get(id);
  }

  /** The item with this id; throws if missing (use for ids that must exist). */
  require(id: string): T {
    const it = this.items.get(id);
    if (!it) throw new Error(`${this.kind}: no item with id "${id}"`);
    return it;
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  /** Every item, in the order they were added. */
  all(): T[] {
    return [...this.items.values()];
  }

  /** Items matching a test, e.g. `CLOTHES.where((c) => c.slot === 'hat')`. */
  where(test: (item: T) => boolean): T[] {
    return this.all().filter(test);
  }

  get size(): number {
    return this.items.size;
  }
}
