ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE rooms AS room
SET updated_at = GREATEST(
  room.created_at::timestamptz,
  COALESCE(
    (SELECT MAX(player.created_at::timestamptz) FROM players AS player WHERE player.room_id = room.id),
    room.created_at::timestamptz
  ),
  COALESCE(
    (SELECT MAX(COALESCE(round.edited_at, round.created_at)::timestamptz) FROM rounds AS round WHERE round.room_id = room.id),
    room.created_at::timestamptz
  ),
  COALESCE(
    (
      SELECT MAX(entry.updated_at::timestamptz)
      FROM round_entries AS entry
      JOIN rounds AS round ON round.id = entry.round_id
      WHERE round.room_id = room.id
    ),
    room.created_at::timestamptz
  )
)
WHERE updated_at IS NULL;

ALTER TABLE rooms ALTER COLUMN updated_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS rooms_status_updated_idx ON rooms(status, updated_at);
