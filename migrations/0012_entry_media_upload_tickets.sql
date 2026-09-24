-- One-time upload URLs so MCP agents can PUT large photos/videos straight to
-- the web worker instead of pushing base64 through a tool call.

CREATE TABLE entry_media_upload_tickets (
  media_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  mime_type TEXT NOT NULL CHECK (
    mime_type IN (
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'video/mp4', 'video/quicktime', 'video/webm'
    )
  ),
  max_bytes INTEGER NOT NULL CHECK (max_bytes > 0),
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX ix_entry_media_upload_tickets_expiry
ON entry_media_upload_tickets(user_id, expires_at);
