-- Bootstrap the single production owner without inserting demo ledger content.
INSERT OR IGNORE INTO users (
  id,
  display_name,
  timezone,
  settings_json,
  created_at,
  updated_at
) VALUES (
  'user_primary',
  '汪家俊',
  'Asia/Tokyo',
  '{"timezone":"Asia/Tokyo","captureMode":"safe","publicPreview":true,"sensitiveWarning":true,"weeklyReview":false,"retentionDaily":30,"retentionWeekly":12}',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
