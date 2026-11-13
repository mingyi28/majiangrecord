CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  host_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  seat INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (room_id, seat)
);

CREATE INDEX IF NOT EXISTS players_room_idx ON players(room_id);

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  winner_id TEXT,
  payer_id TEXT,
  points INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (room_id, seq)
);

CREATE INDEX IF NOT EXISTS rounds_room_idx ON rounds(room_id);

CREATE TABLE IF NOT EXISTS round_deltas (
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  delta INTEGER NOT NULL,
  PRIMARY KEY (round_id, player_id)
);
