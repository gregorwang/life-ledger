-- Links a 日常 post to the book, record, place or game it talks about, so the
-- post can show that item and the item can list every post about it.

CREATE TABLE entry_links (
  entry_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('shelf', 'place', 'game')),
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, target_kind, target_id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX ix_entry_links_target
ON entry_links(user_id, target_kind, target_id);
