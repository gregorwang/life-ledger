-- Content-addressed R2 image metadata and MCP upload idempotency records.

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (
    mime_type IN ('image/webp', 'image/jpeg', 'image/png')
  ),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 1048576),
  width INTEGER NOT NULL CHECK (width > 0 AND width <= 8192),
  height INTEGER NOT NULL CHECK (height > 0 AND height <= 8192),
  etag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, sha256),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE media_upload_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (
    purpose IN ('media_cover', 'entry_image', 'other')
  ),
  media_work_id TEXT,
  source_channel TEXT NOT NULL DEFAULT 'mcp' CHECK (
    source_channel IN ('mcp')
  ),
  created_at TEXT NOT NULL,
  UNIQUE(user_id, idempotency_key),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (asset_id) REFERENCES media_assets(id),
  FOREIGN KEY (media_work_id) REFERENCES media_works(id) ON DELETE SET NULL
);

CREATE INDEX ix_media_assets_hash
ON media_assets(user_id, sha256);

CREATE INDEX ix_media_upload_requests_asset
ON media_upload_requests(asset_id, created_at DESC);

CREATE INDEX ix_media_upload_requests_work
ON media_upload_requests(media_work_id, created_at DESC);
