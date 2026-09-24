-- 书架与音乐: books read and music listened to, kept as a dedicated library
-- like the game library so the entries table does not need a rebuild.

CREATE TABLE shelf_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('book', 'music')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 300),
  creator TEXT CHECK (creator IS NULL OR length(creator) BETWEEN 1 AND 300),
  format TEXT CHECK (
    format IS NULL OR
    (kind = 'book' AND format IN ('paper', 'ebook', 'audiobook')) OR
    (kind = 'music' AND format IN ('album', 'track', 'playlist'))
  ),
  shelf_status TEXT NOT NULL DEFAULT 'done' CHECK (
    shelf_status IN ('planned', 'in_progress', 'done', 'dropped')
  ),
  rating REAL CHECK (rating IS NULL OR rating BETWEEN 0 AND 10),
  progress INTEGER CHECK (progress IS NULL OR progress BETWEEN 0 AND 100),
  review TEXT NOT NULL DEFAULT '',
  excerpts_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  cover_url TEXT,
  source_url TEXT,
  started_on TEXT,
  finished_on TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  version_no INTEGER NOT NULL DEFAULT 1 CHECK (version_no >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX ix_shelf_items_kind
ON shelf_items(user_id, kind, status, updated_at DESC);
