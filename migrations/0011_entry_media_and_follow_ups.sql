-- Photos and videos attached to timeline entries, plus follow-up notes (补充).

CREATE TABLE entry_media (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_id TEXT,
  position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (
    mime_type IN (
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/quicktime', 'video/webm'
    )
  ),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  width INTEGER CHECK (width IS NULL OR (width > 0 AND width <= 16384)),
  height INTEGER CHECK (height IS NULL OR (height > 0 AND height <= 16384)),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TEXT NOT NULL,
  attached_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);

CREATE INDEX ix_entry_media_entry
ON entry_media(entry_id, position);

CREATE INDEX ix_entry_media_unattached
ON entry_media(user_id, created_at)
WHERE entry_id IS NULL;

CREATE TABLE entry_follow_ups (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  body_raw TEXT NOT NULL CHECK (length(body_raw) BETWEEN 1 AND 50000),
  source_channel TEXT NOT NULL CHECK (
    source_channel IN ('wechat', 'web', 'import', 'mcp')
  ),
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);

CREATE INDEX ix_entry_follow_ups_entry
ON entry_follow_ups(entry_id, created_at);
