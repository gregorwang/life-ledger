-- Lets a 日常 post link to an anime or screen work (work_…) as well, so a
-- mood or thought about a show can carry that show's card.

CREATE TABLE entry_links_v2 (
  entry_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('shelf', 'place', 'game', 'work')),
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (entry_id, target_kind, target_id),
  FOREIGN KEY (entry_id) REFERENCES entries(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

INSERT INTO entry_links_v2 (entry_id, user_id, target_kind, target_id, created_at)
SELECT entry_id, user_id, target_kind, target_id, created_at FROM entry_links;

DROP TABLE entry_links;

ALTER TABLE entry_links_v2 RENAME TO entry_links;

CREATE INDEX ix_entry_links_target
ON entry_links(user_id, target_kind, target_id);
