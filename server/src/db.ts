// =====================================================================
// db.ts — the database: SQLite built into Node (node:sqlite), so there's
// nothing to install. One file on disk. Tables are created on start-up.
// To move to Postgres later, only this file and the SQL in the feature
// modules change.
// =====================================================================

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass TEXT NOT NULL,
  created INTEGER NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  look TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS tokens (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saves (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rev INTEGER NOT NULL,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS season_points (
  season INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (season, user_id)
);
CREATE TABLE IF NOT EXISTS point_log (
  user_id INTEGER NOT NULL,
  at INTEGER NOT NULL,
  points INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS point_log_user ON point_log(user_id, at);
CREATE TABLE IF NOT EXISTS season_claims (
  season INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  place INTEGER NOT NULL,
  prize INTEGER NOT NULL,
  PRIMARY KEY (season, user_id)
);
CREATE TABLE IF NOT EXISTS art (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  img TEXT NOT NULL,
  created INTEGER NOT NULL,
  game_day TEXT NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS art_created ON art(created);
CREATE TABLE IF NOT EXISTS game_scores (
  game TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  best INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (game, user_id)
);
CREATE INDEX IF NOT EXISTS game_scores_board ON game_scores(game, best DESC);
CREATE TABLE IF NOT EXISTS art_likes (
  art_id INTEGER NOT NULL REFERENCES art(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  PRIMARY KEY (art_id, user_id)
);
CREATE TABLE IF NOT EXISTS transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL REFERENCES users(id),
  to_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  game_day TEXT NOT NULL,
  created INTEGER NOT NULL,
  settled INTEGER
);
CREATE INDEX IF NOT EXISTS transfers_to ON transfers(to_id, status);
CREATE INDEX IF NOT EXISTS transfers_from ON transfers(from_id, game_day);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  created INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);
`;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec(SCHEMA);
  return db;
}

/** Run `fn` in one transaction (all or nothing). */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
