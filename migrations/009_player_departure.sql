ALTER TABLE players ADD COLUMN IF NOT EXISTS left_at TEXT;

CREATE INDEX IF NOT EXISTS players_active_profile_idx
ON players(profile_id)
WHERE left_at IS NULL;
