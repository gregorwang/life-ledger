PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pending_publish_per_target
ON pending_actions(user_id, action_type, target_id)
WHERE action_type = 'publish' AND consumed_at IS NULL;

CREATE TRIGGER IF NOT EXISTS trg_entries_privacy_insert
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

CREATE TRIGGER IF NOT EXISTS trg_entries_privacy_update
BEFORE UPDATE OF status, visibility, public_snapshot_json, published_at ON entries
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

CREATE TRIGGER IF NOT EXISTS trg_pending_action_target_insert
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
