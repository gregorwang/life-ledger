-- Private game library and cyber-collectible catalog.

CREATE TABLE game_library_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  source_id INTEGER,
  title TEXT NOT NULL,
  play_time TEXT NOT NULL,
  progress INTEGER NOT NULL CHECK (progress BETWEEN 0 AND 100),
  trophies_platinum INTEGER NOT NULL DEFAULT 0 CHECK (trophies_platinum >= 0),
  trophies_gold INTEGER NOT NULL DEFAULT 0 CHECK (trophies_gold >= 0),
  trophies_silver INTEGER NOT NULL DEFAULT 0 CHECK (trophies_silver >= 0),
  trophies_bronze INTEGER NOT NULL DEFAULT 0 CHECK (trophies_bronze >= 0),
  achievements_current INTEGER NOT NULL DEFAULT 0 CHECK (achievements_current >= 0),
  achievements_total INTEGER NOT NULL DEFAULT 0 CHECK (achievements_total >= 0),
  rating REAL NOT NULL CHECK (rating BETWEEN 0 AND 10),
  review TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  cover_url TEXT NOT NULL,
  source_cover_url TEXT,
  source_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, platform, source_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE collectible_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('figure', 'merch', 'plush')),
  title TEXT NOT NULL,
  franchise TEXT,
  character_name TEXT,
  manufacturer TEXT,
  status TEXT NOT NULL DEFAULT 'owned' CHECK (
    status IN ('owned', 'planned', 'archived')
  ),
  cover_url TEXT,
  source_image_urls_json TEXT NOT NULL DEFAULT '[]',
  model_kind TEXT NOT NULL CHECK (
    model_kind IN ('procedural-threejs', 'glb')
  ),
  model_key TEXT,
  geometry_confidence REAL NOT NULL DEFAULT 0 CHECK (
    geometry_confidence BETWEEN 0 AND 1
  ),
  hidden_region_confidence REAL NOT NULL DEFAULT 0 CHECK (
    hidden_region_confidence BETWEEN 0 AND 1
  ),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX ix_game_library_progress
ON game_library_items(user_id, platform, progress DESC, rating DESC);

CREATE INDEX ix_collectible_catalog
ON collectible_items(user_id, category, status, updated_at DESC);
