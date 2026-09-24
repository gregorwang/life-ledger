INSERT INTO media_works (
  id, user_id, media_type, canonical_title, normalized_title, aliases_json,
  status, progress_state, watch_status, created_at, updated_at
) VALUES
  (
    'browser_haihara', 'user_primary', 'anime', '灰原君的青春二周目',
    '灰原君的青春二周目', '[]', 'completed',
    'completed; followed weekly as aired', 'completed',
    '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
  ),
  (
    'media_seed_anime_hyouka', 'user_primary', 'anime', '冰菓', '冰菓', '[]',
    'completed', 'completed; watched twice', 'completed',
    '2026-07-05T01:00:00.000Z', '2026-07-05T01:00:00.000Z'
  ),
  (
    'browser_seirei', 'user_primary', 'anime', '精灵幻想记 第1季',
    '精灵幻想记第1季', '[]', 'completed', 'completed', 'completed',
    '2026-07-01T01:00:00.000Z', '2026-07-01T01:00:00.000Z'
  ),
  (
    'media_seed_anime_kokoro_connect', 'user_primary', 'anime', '恋爱随意链接',
    '恋爱随意链接', '[]', 'completed', 'completed', 'completed',
    '2026-06-30T01:00:00.000Z', '2026-06-30T01:00:00.000Z'
  ),
  (
    'media_seed_anime_madoka', 'user_primary', 'anime', '魔法少女小圆',
    '魔法少女小圆', '[]', 'completed', 'completed', 'completed',
    '2026-07-27T03:00:00.000Z', '2026-07-27T03:00:00.000Z'
  ),
  (
    'browser_no_date', 'user_primary', 'anime', '未记录观看时间作品',
    '未记录观看时间作品', '[]', 'planned', 'planned', 'planned',
    '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
  ),
  (
    'browser_deleted_only', 'user_primary', 'anime', '只有回收站日志作品',
    '只有回收站日志作品', '[]', 'completed', 'completed', 'completed',
    '2026-07-28T01:00:00.000Z', '2026-07-28T01:00:00.000Z'
  )
ON CONFLICT(id) DO UPDATE SET
  status = excluded.status,
  progress_state = excluded.progress_state,
  watch_status = excluded.watch_status,
  updated_at = excluded.updated_at;

INSERT INTO entries (
  id, user_id, type, title, body_raw, body_plain, body_summary,
  occurred_at, occurred_timezone, temporal_uncertain, date_precision,
  visibility, status, version_no, source_channel, source_message_id,
  tags_json, created_at, updated_at
) VALUES
  (
    'browser_entry_haihara', 'user_primary', 'anime',
    '《灰原君的青春二周目》开始追番', '2026年4月3日开始追番。',
    '2026年4月3日开始追番。', '2026年4月3日开始追番。',
    '2026-04-02T16:28:00.000Z', 'Asia/Tokyo', 0, 'exact',
    'private', 'active', 1, 'import', 'browser-haihara', '["anime"]',
    '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
  ),
  (
    'browser_entry_hyouka', 'user_primary', 'anime', '《冰菓》',
    '2026年7月5日观看《冰菓》。', '2026年7月5日观看《冰菓》。',
    '2026年7月5日观看《冰菓》。', '2026-07-04T15:00:00.000Z',
    'Asia/Tokyo', 0, 'exact', 'private', 'active', 1, 'import',
    'browser-hyouka', '["anime"]', '2026-07-27T00:00:00.000Z',
    '2026-07-27T00:00:00.000Z'
  ),
  (
    'browser_entry_seirei', 'user_primary', 'anime', '《精灵幻想记》第1季',
    '2026年7月1日观看第1季。', '2026年7月1日观看第1季。',
    '2026年7月1日观看第1季。', '2026-06-30T15:00:00.000Z',
    'Asia/Tokyo', 0, 'exact', 'private', 'active', 1, 'import',
    'browser-seirei', '["anime"]', '2026-07-27T00:00:00.000Z',
    '2026-07-27T00:00:00.000Z'
  ),
  (
    'browser_entry_kokoro', 'user_primary', 'anime', '《恋爱随意链接》',
    '2026年6月30日观看。', '2026年6月30日观看。', '2026年6月30日观看。',
    '2026-06-29T15:00:00.000Z', 'Asia/Tokyo', 0, 'exact',
    'private', 'active', 1, 'import', 'browser-kokoro', '["anime"]',
    '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
  ),
  (
    'browser_entry_madoka', 'user_primary', 'anime', '《魔法少女小圆》',
    '约2026年2月看完《魔法少女小圆》。',
    '约2026年2月看完《魔法少女小圆》。',
    '约2026年2月看完《魔法少女小圆》。',
    '2026-02-14T15:00:00.000Z', 'Asia/Tokyo', 1, 'month',
    'private', 'active', 1, 'import', 'browser-madoka', '["anime"]',
    '2026-07-27T00:00:00.000Z', '2026-07-27T00:00:00.000Z'
  ),
  (
    'browser_entry_deleted', 'user_primary', 'anime', '回收站日志',
    '这条日志已经软删除。', '这条日志已经软删除。', '这条日志已经软删除。',
    '2026-07-27T15:00:00.000Z', 'Asia/Tokyo', 0, 'exact',
    'private', 'deleted', 1, 'import', 'browser-deleted', '["anime"]',
    '2026-07-28T01:00:00.000Z', '2026-07-28T01:00:00.000Z'
  )
ON CONFLICT(id) DO UPDATE SET
  body_raw = excluded.body_raw,
  body_plain = excluded.body_plain,
  body_summary = excluded.body_summary,
  occurred_at = excluded.occurred_at,
  temporal_uncertain = excluded.temporal_uncertain,
  date_precision = excluded.date_precision,
  status = excluded.status,
  updated_at = excluded.updated_at;

INSERT INTO media_logs (
  id, entry_id, media_work_id, rating_scope, progress_state, extra_json
) VALUES
  ('browser_log_haihara', 'browser_entry_haihara', 'browser_haihara', 'work', 'completed', '{}'),
  ('browser_log_hyouka', 'browser_entry_hyouka', 'media_seed_anime_hyouka', 'work', 'completed', '{}'),
  ('browser_log_seirei', 'browser_entry_seirei', 'browser_seirei', 'season', 'completed', '{}'),
  ('browser_log_kokoro', 'browser_entry_kokoro', 'media_seed_anime_kokoro_connect', 'work', 'completed', '{}'),
  ('browser_log_madoka', 'browser_entry_madoka', 'media_seed_anime_madoka', 'work', 'completed', '{}'),
  ('browser_log_deleted', 'browser_entry_deleted', 'browser_deleted_only', 'work', 'completed', '{}')
ON CONFLICT(id) DO UPDATE SET
  entry_id = excluded.entry_id,
  media_work_id = excluded.media_work_id,
  rating_scope = excluded.rating_scope,
  progress_state = excluded.progress_state,
  extra_json = excluded.extra_json;
