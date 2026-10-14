// =====================================================================
// workroom.ts — who's working in a workplace room (Peter, 2026-10-13).
//
// Every workplace room holds up to ROOM_SIZE (6) workers. A room starts
// full of NPC coworkers; when a player with that job walks in, they take
// an NPC's spot (the NPC goes home), and when they leave, an NPC comes
// back. If every spot in a room is a player, the next player gets a
// fresh copy of the room. Single-player uses one room with you in it;
// the multiplayer server will keep these rooms and sync the slots.
// =====================================================================

import { Rng } from '../core/rng.ts';

export const ROOM_SIZE = 6;

export interface NpcWorker {
  name: string;
  body: 'm' | 'f';
  skin: string;
  top: string;
  bottom: string;
  hair: string;
}

export type WorkerSlot = { kind: 'npc'; npc: NpcWorker } | { kind: 'player'; id: string; name: string };

export interface WorkRoom {
  placeId: string;
  /** Which copy of the room (0 for the first). */
  instance: number;
  slots: WorkerSlot[];
}

const NAMES_M = ['Luis', 'Marcus', 'Danny', 'Kwame', 'Tony', 'Hector', 'Jay', 'Andre', 'Sal', 'Mike'];
const NAMES_F = ['Keisha', 'Rosa', 'Priya', 'Tasha', 'Mei', 'Nia', 'Gabby', 'Dana', 'Lupe', 'Kim'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffdbac', '#a46b44', '#3b2414'];
const COLORS = ['#1d3557', '#e63946', '#2a9d8f', '#f4a261', '#264653', '#111111', '#6d597a', '#b5838d', '#e9c46a', '#3a86ff'];
const HAIR = ['#111111', '#2b1b10', '#5a3825', '#a0522d', '#d4a017'];

/** An NPC coworker (the same every time for a room and spot). */
export function npcWorker(placeId: string, index: number): NpcWorker {
  const r = new Rng(`${placeId}-worker-${index}`);
  const body = r.next() < 0.5 ? 'm' : 'f';
  const pick = <T>(xs: T[]) => xs[Math.floor(r.next() * xs.length)];
  return { name: pick(body === 'm' ? NAMES_M : NAMES_F), body, skin: pick(SKINS), top: pick(COLORS), bottom: pick(COLORS), hair: pick(HAIR) };
}

export function openRoom(placeId: string, instance = 0): WorkRoom {
  return { placeId, instance, slots: Array.from({ length: ROOM_SIZE }, (_, i) => ({ kind: 'npc' as const, npc: npcWorker(placeId, instance * ROOM_SIZE + i) })) };
}

/** A player walks in: they take the first NPC's spot. Returns the spot, or -1 if the room is all players. */
export function joinRoom(room: WorkRoom, id: string, name: string): number {
  const mine = room.slots.findIndex((s) => s.kind === 'player' && s.id === id);
  if (mine >= 0) return mine;
  const i = room.slots.findIndex((s) => s.kind === 'npc');
  if (i < 0) return -1;
  room.slots[i] = { kind: 'player', id, name };
  return i;
}

/** A player leaves: an NPC takes the spot again. */
export function leaveRoom(room: WorkRoom, id: string): void {
  const i = room.slots.findIndex((s) => s.kind === 'player' && s.id === id);
  if (i >= 0) room.slots[i] = { kind: 'npc', npc: npcWorker(room.placeId, room.instance * ROOM_SIZE + i) };
}

/** Find a room at this workplace with space (or open another copy) and join it. */
export function assignRoom(rooms: WorkRoom[], placeId: string, id: string, name: string): { room: WorkRoom; slot: number } {
  for (const room of rooms.filter((r) => r.placeId === placeId)) {
    const slot = joinRoom(room, id, name);
    if (slot >= 0) return { room, slot };
  }
  const room = openRoom(placeId, rooms.filter((r) => r.placeId === placeId).length);
  rooms.push(room);
  return { room, slot: joinRoom(room, id, name) };
}

export const playersIn = (room: WorkRoom) => room.slots.filter((s) => s.kind === 'player').length;
