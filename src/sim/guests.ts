// =====================================================================
// guests.ts — who may join you (Peter, 2026-10-14). One rule for your
// club section and your home, for NPCs now and players later.
//
//   inviteOnly  only people you invited
//   friends     people you invited, plus anyone at Friend level or closer
//   open        anyone, while there's room
//
// A full room says no to everyone. Owners always get in.
// =====================================================================

import type { Party } from './invites.ts';

export type GuestPolicy = 'inviteOnly' | 'friends' | 'open';
export const POLICY_LABEL: Record<GuestPolicy, string> = { inviteOnly: 'Invite only', friends: 'Friends can drop in', open: 'Open to anyone' };

export interface EntryCheck {
  /** You sent them an invite (or they're on your list). */
  invited: boolean;
  /** Their relationship level with the owner (people.ts RELATION index). */
  level: number;
  /** Seats taken and seats available. */
  taken: number;
  capacity: number;
  /** Banned from your place (players later: blocklist). */
  blocked?: boolean;
}

/** Null if they may come in, else why not. */
export function mayEnter(policy: GuestPolicy, visitor: Party, owner: Party, c: EntryCheck): string | null {
  if (visitor.id === owner.id) return null;
  if (c.blocked) return 'Not on the list';
  if (c.taken >= c.capacity) return 'Full';
  if (policy === 'open') return null;
  if (c.invited) return null;
  if (policy === 'friends' && c.level >= 2) return null;
  return 'Invite only';
}
