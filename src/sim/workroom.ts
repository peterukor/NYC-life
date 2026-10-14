// =====================================================================
// workroom.ts — who's in a workplace room (Peter, 2026-10-13).
//
// A room holds up to ROOM_CAPACITY (30) people: up to ROOM_SIZE (6)
// workers, the rest visitors (players who came to eat, invest, trade,
// party, report someone, fix a phone or go on a date). NPC visitors keep
// the place lively and step aside for players: there are never more
// than ROOM_CAPACITY people in one copy of a room.
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
/** Everyone in one copy of a room: workers plus visitors. */
export const ROOM_CAPACITY = 30;
export const VISITOR_SPOTS = ROOM_CAPACITY - ROOM_SIZE;

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
  /** Players visiting (not working here). */
  visitors: { id: string; name: string }[];
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
  return { placeId, instance, slots: Array.from({ length: ROOM_SIZE }, (_, i) => ({ kind: 'npc' as const, npc: npcWorker(placeId, instance * ROOM_SIZE + i) })), visitors: [] };
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

/** A player visiting (not working): joins a copy of the room with space. */
export function assignVisitor(rooms: WorkRoom[], placeId: string, id: string, name: string): WorkRoom {
  const here = rooms.filter((r) => r.placeId === placeId);
  const already = here.find((r) => r.visitors.some((v) => v.id === id));
  if (already) return already;
  let room = here.find((r) => r.visitors.length < VISITOR_SPOTS);
  if (!room) rooms.push((room = openRoom(placeId, here.length)));
  room.visitors.push({ id, name });
  return room;
}

export function leaveAsVisitor(room: WorkRoom, id: string): void {
  room.visitors = room.visitors.filter((v) => v.id !== id);
}

/** How many NPC visitors to show: lively, but players come first and the room never overfills. */
export function npcVisitors(room: WorkRoom, wanted: number): number {
  return Math.max(0, Math.min(wanted, VISITOR_SPOTS - room.visitors.length));
}

/** Everyone in the room right now (players and NPCs). */
export const headcount = (room: WorkRoom, npcVisitorCount: number) => room.slots.length + room.visitors.length + npcVisitorCount;
