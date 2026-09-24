-- 足迹: places visited, optionally grouped into a named trip.

CREATE TABLE places (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  city TEXT CHECK (city IS NULL OR length(city) BETWEEN 1 AND 100),
  country TEXT CHECK (country IS NULL OR length(country) BETWEEN 1 AND 100),
  category TEXT NOT NULL DEFAULT 'other' CHECK (
    category IN ('city', 'sight', 'food', 'stay', 'nature', 'event', 'other')
  ),
  trip TEXT CHECK (trip IS NULL OR length(trip) BETWEEN 1 AND 120),
  visited_on TEXT NOT NULL,
  left_on TEXT,
  rating REAL CHECK (rating IS NULL OR rating BETWEEN 0 AND 10),
  note TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  latitude REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  tags_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  version_no INTEGER NOT NULL DEFAULT 1 CHECK (version_no >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX ix_places_visited
ON places(user_id, status, visited_on DESC);
