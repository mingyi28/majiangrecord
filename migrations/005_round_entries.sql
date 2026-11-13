ALTER TABLE rounds ADD COLUMN IF NOT EXISTS edited_at TEXT;

CREATE TABLE IF NOT EXISTS round_entries (
  round_id TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (round_id, actor_id)
);

CREATE TABLE IF NOT EXISTS round_entry_deltas (
  round_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  delta INTEGER NOT NULL,
  PRIMARY KEY (round_id, actor_id, player_id),
  FOREIGN KEY (round_id, actor_id) REFERENCES round_entries(round_id, actor_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS round_entries_round_idx ON round_entries(round_id);
CREATE INDEX IF NOT EXISTS round_entry_deltas_round_idx ON round_entry_deltas(round_id);

INSERT INTO round_entries (round_id, actor_id, created_at, updated_at)
SELECT id, created_by, created_at, created_at
FROM rounds
ON CONFLICT (round_id, actor_id) DO NOTHING;

INSERT INTO round_entry_deltas (round_id, actor_id, player_id, delta)
SELECT d.round_id, r.created_by, d.player_id, d.delta
FROM round_deltas d
JOIN rounds r ON r.id = d.round_id
ON CONFLICT (round_id, actor_id, player_id) DO NOTHING;
