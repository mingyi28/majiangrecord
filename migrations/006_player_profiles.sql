ALTER TABLE players ADD COLUMN IF NOT EXISTS profile_id TEXT;

CREATE INDEX IF NOT EXISTS players_profile_idx ON players(profile_id);
