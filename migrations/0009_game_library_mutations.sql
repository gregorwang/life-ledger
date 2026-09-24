-- Add optimistic concurrency and recoverable deletion to the dedicated game library.
ALTER TABLE game_library_items
ADD COLUMN status TEXT NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'deleted'));

ALTER TABLE game_library_items
ADD COLUMN version_no INTEGER NOT NULL DEFAULT 1
CHECK (version_no >= 1);

ALTER TABLE game_library_items
ADD COLUMN deleted_at TEXT;

CREATE INDEX ix_game_library_status
ON game_library_items(user_id, status, updated_at DESC, title);

