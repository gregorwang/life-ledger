-- Add screen media, movie/TV classification, and first-class seasons.
--
-- D1 keeps foreign keys enabled. The two child tables are therefore copied
-- into constraint-free migration backups before either parent is rebuilt.
-- This avoids DROP TABLE invoking ON DELETE CASCADE on historical rows.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE entries_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
    type IN (
      'thought', 'idea', 'mood', 'anime', 'screen',
      'game', 'music', 'photo', 'note'
    )
  ),
  title TEXT,
  body_raw TEXT NOT NULL,
  body_plain TEXT NOT NULL,
  body_summary TEXT,
  occurred_at TEXT NOT NULL,
  occurred_timezone TEXT NOT NULL,
  temporal_uncertain INTEGER NOT NULL DEFAULT 0 CHECK (
    temporal_uncertain IN (0, 1)
  ),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (
    visibility IN ('private', 'publish_pending', 'public')
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'deleted')
  ),
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

INSERT INTO entries_v2 (
  id,
  user_id,
  type,
  title,
  body_raw,
  body_plain,
  body_summary,
  occurred_at,
  occurred_timezone,
  temporal_uncertain,
  visibility,
  status,
  version_no,
  source_channel,
  source_message_id,
  source_conversation_id,
  request_hash,
  tags_json,
  public_snapshot_json,
  published_at,
  deleted_at,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  type,
  title,
  body_raw,
  body_plain,
  body_summary,
  occurred_at,
  occurred_timezone,
  temporal_uncertain,
  visibility,
  status,
  version_no,
  source_channel,
  source_message_id,
  source_conversation_id,
  request_hash,
  tags_json,
  public_snapshot_json,
  published_at,
  deleted_at,
  created_at,
  updated_at
FROM entries;

CREATE TABLE media_works_v2 (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (
    media_type IN ('anime', 'screen', 'game', 'music')
  ),
  media_kind TEXT CHECK (
    media_kind IS NULL OR
    (media_type = 'screen' AND media_kind IN ('movie', 'tv'))
  ),
  canonical_title TEXT NOT NULL,
  normalized_title TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  cover_url TEXT,
  status TEXT,
  progress_state TEXT,
  watch_status TEXT CHECK (
    watch_status IS NULL OR
    watch_status IN (
      'planned', 'watching', 'completed', 'watched', 'paused', 'dropped'
    )
  ),
  overall_score_100 INTEGER CHECK (
    overall_score_100 IS NULL OR overall_score_100 BETWEEN 0 AND 100
  ),
  external_refs_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, media_type, normalized_title),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO media_works_v2 (
  id,
  user_id,
  media_type,
  media_kind,
  canonical_title,
  normalized_title,
  aliases_json,
  cover_url,
  status,
  progress_state,
  watch_status,
  overall_score_100,
  external_refs_json,
  created_at,
  updated_at
)
SELECT
  id,
  user_id,
  media_type,
  NULL,
  canonical_title,
  normalized_title,
  aliases_json,
  cover_url,
  status,
  progress_state,
  CASE lower(coalesce(progress_state, status, ''))
    WHEN 'planned' THEN 'planned'
    WHEN 'watching' THEN 'watching'
    WHEN 'completed' THEN 'completed'
    WHEN 'watched' THEN 'watched'
    WHEN 'paused' THEN 'paused'
    WHEN 'dropped' THEN 'dropped'
    ELSE NULL
  END,
  overall_score_100,
  external_refs_json,
  created_at,
  updated_at
FROM media_works;

CREATE TABLE migration_0005_media_logs (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  media_work_id TEXT NOT NULL,
  rating_scope TEXT,
  season_label TEXT,
  episode_label TEXT,
  progress_state TEXT,
  score_100 INTEGER,
  completed_at TEXT,
  extra_json TEXT NOT NULL
);

INSERT INTO migration_0005_media_logs
SELECT
  id,
  entry_id,
  media_work_id,
  rating_scope,
  season_label,
  episode_label,
  progress_state,
  score_100,
  completed_at,
  extra_json
FROM media_logs;

CREATE TABLE migration_0005_entry_revisions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO migration_0005_entry_revisions
SELECT
  id,
  entry_id,
  version_no,
  snapshot_json,
  actor_type,
  actor_id,
  reason,
  created_at
FROM entry_revisions;

DROP TRIGGER trg_pending_action_target_insert;
DROP TABLE media_logs;
DROP TABLE entry_revisions;
DROP TABLE entries;
DROP TABLE media_works;

ALTER TABLE entries_v2 RENAME TO entries;
ALTER TABLE media_works_v2 RENAME TO media_works;

CREATE TABLE media_seasons (
  id TEXT PRIMARY KEY,
  media_work_id TEXT NOT NULL,
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  season_number INTEGER CHECK (season_number IS NULL OR season_number > 0),
  title TEXT,
  score_100 INTEGER CHECK (
    score_100 IS NULL OR score_100 BETWEEN 0 AND 100
  ),
  watch_status TEXT CHECK (
    watch_status IS NULL OR
    watch_status IN (
      'planned', 'watching', 'completed', 'watched', 'paused', 'dropped'
    )
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(media_work_id, normalized_label),
  FOREIGN KEY (media_work_id) REFERENCES media_works(id) ON DELETE CASCADE
);

CREATE TABLE media_logs (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL UNIQUE,
  media_work_id TEXT NOT NULL,
  season_id TEXT,
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
  FOREIGN KEY (media_work_id) REFERENCES media_works(id),
  FOREIGN KEY (season_id) REFERENCES media_seasons(id) ON DELETE SET NULL
);

CREATE TRIGGER trg_media_logs_season_work_insert
BEFORE INSERT ON media_logs
WHEN
  NEW.season_id IS NOT NULL AND
  NOT EXISTS (
    SELECT 1
    FROM media_seasons
    WHERE
      id = NEW.season_id AND
      media_work_id = NEW.media_work_id
  )
BEGIN
  SELECT RAISE(ABORT, 'media log season does not belong to media work');
END;

CREATE TRIGGER trg_media_logs_season_work_update
BEFORE UPDATE OF media_work_id, season_id ON media_logs
WHEN
  NEW.season_id IS NOT NULL AND
  NOT EXISTS (
    SELECT 1
    FROM media_seasons
    WHERE
      id = NEW.season_id AND
      media_work_id = NEW.media_work_id
  )
BEGIN
  SELECT RAISE(ABORT, 'media log season does not belong to media work');
END;

INSERT INTO media_logs (
  id,
  entry_id,
  media_work_id,
  season_id,
  rating_scope,
  season_label,
  episode_label,
  progress_state,
  score_100,
  completed_at,
  extra_json
)
SELECT
  id,
  entry_id,
  media_work_id,
  NULL,
  rating_scope,
  season_label,
  episode_label,
  progress_state,
  score_100,
  completed_at,
  extra_json
FROM migration_0005_media_logs;

CREATE TABLE entry_revisions (
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

INSERT INTO entry_revisions
SELECT
  id,
  entry_id,
  version_no,
  snapshot_json,
  actor_type,
  actor_id,
  reason,
  created_at
FROM migration_0005_entry_revisions;

DROP TABLE migration_0005_media_logs;
DROP TABLE migration_0005_entry_revisions;

CREATE UNIQUE INDEX ux_entries_source_message
ON entries(user_id, source_channel, source_message_id)
WHERE source_message_id IS NOT NULL;

CREATE INDEX ix_entries_timeline
ON entries(user_id, status, occurred_at DESC);

CREATE INDEX ix_entries_public
ON entries(user_id, visibility, status, updated_at DESC);

CREATE INDEX ix_entries_type
ON entries(user_id, type, status, occurred_at DESC);

CREATE INDEX ix_media_works_catalog
ON media_works(user_id, media_type, watch_status, updated_at DESC);

CREATE INDEX ix_media_logs_work
ON media_logs(media_work_id, completed_at DESC);

CREATE INDEX ix_media_logs_season
ON media_logs(season_id, completed_at DESC);

CREATE INDEX ix_media_seasons_work
ON media_seasons(media_work_id, season_number, normalized_label);

CREATE TRIGGER trg_entries_privacy_insert
BEFORE INSERT ON entries
WHEN
  (NEW.status = 'deleted' AND NEW.visibility <> 'private') OR
  (
    NEW.visibility = 'public' AND
    (
      NEW.status <> 'active' OR
      NEW.public_snapshot_json IS NULL OR
      NEW.published_at IS NULL
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'entry privacy invariant failed');
END;

CREATE TRIGGER trg_entries_privacy_update
BEFORE UPDATE OF status, visibility, public_snapshot_json, published_at
ON entries
WHEN
  (NEW.status = 'deleted' AND NEW.visibility <> 'private') OR
  (
    NEW.visibility = 'public' AND
    (
      NEW.status <> 'active' OR
      NEW.public_snapshot_json IS NULL OR
      NEW.published_at IS NULL
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'entry privacy invariant failed');
END;

CREATE TRIGGER trg_pending_action_target_insert
BEFORE INSERT ON pending_actions
WHEN
  NEW.target_type = 'entry' AND
  NOT EXISTS (
    SELECT 1 FROM entries
    WHERE id = NEW.target_id AND user_id = NEW.user_id
  )
BEGIN
  SELECT RAISE(ABORT, 'pending action target does not exist');
END;

PRAGMA foreign_key_check;
PRAGMA defer_foreign_keys = OFF;
