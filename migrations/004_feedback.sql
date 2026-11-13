CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  room_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at DESC);
