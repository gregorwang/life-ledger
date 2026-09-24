PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN ('thought', 'idea', 'mood', 'anime', 'game', 'music', 'photo', 'note')
  ),
  title TEXT,
  body_raw TEXT NOT NULL,
  body_plain TEXT NOT NULL,
  body_summary TEXT,
  occurred_at TEXT NOT NULL,
  occurred_timezone TEXT NOT NULL,
  temporal_uncertain INTEGER NOT NULL DEFAULT 0 CHECK (temporal_uncertain IN (0, 1)),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (
    visibility IN ('private', 'publish_pending', 'public')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  version_no INTEGER NOT NULL DEFAULT 1 CHECK (version_no >= 1),
  source_channel TEXT NOT NULL CHECK (
    source_channel IN ('wechat', 'web', 'import', 'mcp')
  ),
  source_message_id TEXT,
  source_conversation_id TEXT,
  request_hash TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  public_snapshot_json TEXT,
  published_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_entries_source_message
ON entries(user_id, source_channel, source_message_id)
WHERE source_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_entries_timeline
ON entries(user_id, status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_entries_public
ON entries(user_id, visibility, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ix_entries_type
ON entries(user_id, type, status, occurred_at DESC);

CREATE TABLE IF NOT EXISTS media_works (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('anime', 'game', 'music')),
  canonical_title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  cover_url TEXT,
  status TEXT,
  progress_state TEXT,
  overall_score_100 INTEGER CHECK (
    overall_score_100 IS NULL OR overall_score_100 BETWEEN 0 AND 100
  ),
  external_refs_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, media_type, normalized_title),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS media_logs (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL UNIQUE,
  media_work_id TEXT NOT NULL,
  rating_scope TEXT CHECK (
    rating_scope IS NULL OR rating_scope IN ('episode', 'season', 'work')
  ),
  season_label TEXT,
  episode_label TEXT,
  progress_state TEXT,
  score_100 INTEGER CHECK (score_100 IS NULL OR score_100 BETWEEN 0 AND 100),
  completed_at TEXT,
  extra_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (media_work_id) REFERENCES media_works(id)
);

CREATE INDEX IF NOT EXISTS ix_media_logs_work
ON media_logs(media_work_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS entry_revisions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(entry_id, version_no),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('publish', 'purge')),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ix_pending_actions_target
ON pending_actions(user_id, target_id, consumed_at, expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_audit_target
ON audit_events(target_type, target_id, created_at DESC);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('jsonl', 'sql', 'archive')),
  scope TEXT NOT NULL CHECK (scope IN ('incremental', 'full')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  r2_key TEXT,
  size_bytes INTEGER,
  row_count INTEGER,
  checksum TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO app_meta(key, value, updated_at)
VALUES ('public_revision', 'pub_initial', '2026-07-26T00:00:00.000Z');
