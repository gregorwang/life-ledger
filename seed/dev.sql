-- Development-only demo data. Never apply this file to production.
INSERT OR IGNORE INTO users (
  id, display_name, timezone, settings_json, created_at, updated_at
) VALUES (
  'user_primary',
  '汪家俊',
  'Asia/Tokyo',
  '{"timezone":"Asia/Tokyo","captureMode":"safe","publicPreview":true,"sensitiveWarning":true,"weeklyReview":false,"retentionDaily":30,"retentionWeekly":12}',
  '2026-07-01T00:00:00.000Z',
  '2026-07-26T00:00:00.000Z'
);

INSERT OR IGNORE INTO media_works (
  id, user_id, media_type, canonical_title, normalized_title, aliases_json,
  cover_url, status, progress_state, watch_status, overall_score_100,
  external_refs_json, created_at, updated_at
) VALUES
  (
    'work_rezero', 'user_primary', 'anime', 'Re:Zero', 'rezero',
    '["Re:从零开始的异世界生活","从零开始"]',
    '/assets/anime-cover-purple.jpg', 'watching', '第三季 · 第 4 集', 'watching', 96,
    '{}', '2026-07-01T00:00:00.000Z', '2026-07-26T08:40:00.000Z'
  ),
  (
    'work_bocchi', 'user_primary', 'anime', '孤独摇滚！', '孤独摇滚',
    '["ぼっち・ざ・ろっく！","Bocchi the Rock!","波奇酱"]',
    '/assets/anime-cover-pink.jpg', 'completed', '全 12 集', 'completed', 94,
    '{}', '2026-07-01T00:00:00.000Z', '2026-07-24T13:10:00.000Z'
  ),
  (
    'work_chiramune', 'user_primary', 'anime', '弹珠汽水瓶里的千岁同学', '弹珠汽水瓶里的千岁同学',
    '["千歳くんはラムネ瓶のなか","千岁同学","Chiramune"]',
    '/assets/anime-cover-amber.png', 'watching', '第 7 集', 'watching', 87,
    '{}', '2026-07-01T00:00:00.000Z', '2026-07-23T14:20:00.000Z'
  ),
  (
    'work_frieren', 'user_primary', 'anime', '葬送的芙莉莲', '葬送的芙莉莲',
    '["葬送のフリーレン","Frieren"]',
    '/assets/anime-cover-blue.png', 'paused', '第 18 集', 'paused', 92,
    '{}', '2026-07-01T00:00:00.000Z', '2026-07-19T12:30:00.000Z'
  ),
  (
    'work_euphonium', 'user_primary', 'anime', '吹响！上低音号', '吹响上低音号',
    '["響け！ユーフォニアム","京吹","Sound! Euphonium"]',
    '/assets/anime-cover-green.png', 'completed', '第三季 · 完结', 'completed', 98,
    '{}', '2026-07-01T00:00:00.000Z', '2026-07-12T11:00:00.000Z'
  );

INSERT OR IGNORE INTO entries (
  id, user_id, type, title, body_raw, body_plain, body_summary,
  occurred_at, occurred_timezone, temporal_uncertain,
  visibility, status, version_no, source_channel,
  source_message_id, source_conversation_id, request_hash, tags_json,
  public_snapshot_json, published_at, deleted_at, created_at, updated_at
) VALUES
  (
    'entry_rezero_04', 'user_primary', 'anime', '《Re:Zero》第三季 第 4 集',
    '记一下，今天看了《Re:Zero》第三季第 4 集，8.8 分。艾米莉亚这一段挺自然，但整集节奏稍微有点赶。',
    '记一下 今天看了 Re Zero 第三季第 4 集 8.8 分 艾米莉亚这一段挺自然 但整集节奏稍微有点赶',
    '艾米莉亚的段落自然，整集节奏稍赶。',
    '2026-07-26T08:40:00.000Z', 'Asia/Tokyo', 0,
    'private', 'active', 1, 'wechat',
    'wx_20260726_0840', 'wx_primary', 'seed_rezero_04', '["动漫","单集","艾米莉亚"]',
    NULL, NULL, NULL, '2026-07-26T08:41:12.000Z', '2026-07-26T08:41:12.000Z'
  ),
  (
    'entry_idea_fallback', 'user_primary', 'idea', '公开接口必须有静态回退',
    '记录：主站远程读取失败时不能空白，动漫页至少保留一个版本周期的本地 JSON 回退。',
    '记录 主站远程读取失败时不能空白 动漫页至少保留一个版本周期的本地 JSON 回退',
    '为主站动漫页保留本地静态数据回退。',
    '2026-07-26T06:20:00.000Z', 'Asia/Tokyo', 0,
    'private', 'active', 2, 'wechat',
    'wx_20260726_0620', 'wx_primary', 'seed_idea_fallback', '["产品","降级","主站"]',
    NULL, NULL, NULL, '2026-07-26T06:20:19.000Z', '2026-07-26T06:28:03.000Z'
  ),
  (
    'entry_bocchi_08', 'user_primary', 'anime', '《孤独摇滚！》第 8 集回看',
    '第 8 集再看还是 9.6 分。演出后的安静比第一次更有力量，公开这条到动漫页。',
    '第 8 集再看还是 9.6 分 演出后的安静比第一次更有力量 公开这条到动漫页',
    '演出后的安静在回看时更有力量。',
    '2026-07-24T13:10:00.000Z', 'Asia/Tokyo', 0,
    'public', 'active', 2, 'wechat',
    'wx_20260724_1310', 'wx_primary', 'seed_bocchi_08', '["动漫","回看","公开"]',
    '{"title":"《孤独摇滚！》第 8 集回看","body":"演出后的安静在回看时更有力量。","score":9.6,"occurredAt":"2026-07-24T13:10:00.000Z","mediaTitle":"孤独摇滚！"}',
    '2026-07-24T13:14:22.000Z', NULL,
    '2026-07-24T13:11:05.000Z', '2026-07-24T13:14:22.000Z'
  ),
  (
    'entry_mood_scope', 'user_primary', 'mood', '维护负担有点集中',
    '存一下：这周同时维护太多页面时会明显烦躁。先把 Life Ledger 的动漫闭环做完，不扩摄影附件。',
    '存一下 这周同时维护太多页面时会明显烦躁 先把 Life Ledger 的动漫闭环做完 不扩摄影附件',
    '维护负担集中；继续收敛动漫 MVP。',
    '2026-07-25T02:05:00.000Z', 'Asia/Tokyo', 0,
    'private', 'active', 1, 'wechat',
    'wx_20260725_0205', 'wx_primary', 'seed_mood_scope', '["自述","维护负担","MVP"]',
    NULL, NULL, NULL, '2026-07-25T02:05:31.000Z', '2026-07-25T02:05:31.000Z'
  ),
  (
    'entry_chiramune_07', 'user_primary', 'anime', '《弹珠汽水瓶里的千岁同学》第 7 集',
    '第 7 集给 8.7。光线和人物距离感做得很好，但后半段转折有一点急。',
    '第 7 集给 8.7 光线和人物距离感做得很好 但后半段转折有一点急',
    '光线与人物距离感突出，后半段转折略急。',
    '2026-07-23T14:20:00.000Z', 'Asia/Tokyo', 0,
    'publish_pending', 'active', 1, 'web',
    NULL, NULL, NULL, '["动漫","单集","待确认"]',
    NULL, NULL, NULL, '2026-07-23T14:22:09.000Z', '2026-07-23T14:25:10.000Z'
  ),
  (
    'entry_frieren_18', 'user_primary', 'note', '芙莉莲第 18 集待补感想',
    '记一下：第 18 集先标记看完，晚点补完整感想。',
    '记一下 第 18 集先标记看完 晚点补完整感想',
    '已看完，感想待补。',
    '2026-07-19T12:30:00.000Z', 'Asia/Tokyo', 0,
    'private', 'deleted', 1, 'wechat',
    'wx_20260719_1230', 'wx_primary', 'seed_frieren_18', '["待补","动漫"]',
    NULL, NULL, '2026-07-19T12:35:30.000Z',
    '2026-07-19T12:31:14.000Z', '2026-07-19T12:35:30.000Z'
  );

INSERT OR IGNORE INTO media_logs (
  id, entry_id, media_work_id, rating_scope, season_label, episode_label,
  progress_state, score_100, completed_at, extra_json
) VALUES
  (
    'log_rezero_04', 'entry_rezero_04', 'work_rezero', 'episode', '3', '4',
    'watching', 88, '2026-07-26T08:40:00.000Z', '{}'
  ),
  (
    'log_bocchi_08', 'entry_bocchi_08', 'work_bocchi', 'episode', '1', '8',
    'completed', 96, '2026-07-24T13:10:00.000Z', '{}'
  ),
  (
    'log_chiramune_07', 'entry_chiramune_07', 'work_chiramune', 'episode', '1', '7',
    'watching', 87, '2026-07-23T14:20:00.000Z', '{}'
  ),
  (
    'log_frieren_18', 'entry_frieren_18', 'work_frieren', 'episode', '1', '18',
    'paused', NULL, '2026-07-19T12:30:00.000Z', '{}'
  );

INSERT OR IGNORE INTO entry_revisions (
  id, entry_id, version_no, snapshot_json, actor_type, actor_id, reason, created_at
) SELECT
  'revision_' || id,
  id,
  version_no,
  json_object(
    'title', title,
    'bodyRaw', body_raw,
    'occurredAt', occurred_at,
    'visibility', visibility,
    'status', status,
    'versionNo', version_no
  ),
  CASE source_channel WHEN 'web' THEN 'user' ELSE 'agent' END,
  CASE source_channel WHEN 'web' THEN 'user_primary' ELSE 'hermes' END,
  'seed migration',
  created_at
FROM entries
WHERE id IN (
  'entry_rezero_04',
  'entry_idea_fallback',
  'entry_bocchi_08',
  'entry_mood_scope',
  'entry_chiramune_07',
  'entry_frieren_18'
);

INSERT OR IGNORE INTO audit_events (
  id, request_id, user_id, actor_type, actor_id, action,
  target_type, target_id, detail, metadata_json, created_at
) SELECT
  'audit_' || id,
  'request_seed_' || id,
  user_id,
  CASE source_channel WHEN 'web' THEN 'user' ELSE 'agent' END,
  CASE source_channel WHEN 'web' THEN 'user_primary' ELSE 'hermes' END,
  CASE
    WHEN status = 'deleted' THEN 'entry.deleted'
    WHEN visibility = 'public' THEN 'entry.published'
    WHEN visibility = 'publish_pending' THEN 'publish.prepared'
    ELSE 'entry.created'
  END,
  'entry',
  id,
  'Seeded demo event',
  '{}',
  updated_at
FROM entries
WHERE id IN (
  'entry_rezero_04',
  'entry_idea_fallback',
  'entry_bocchi_08',
  'entry_mood_scope',
  'entry_chiramune_07',
  'entry_frieren_18'
);

INSERT OR IGNORE INTO exports (
  id, user_id, format, scope, status, r2_key, size_bytes,
  row_count, checksum, error_code, created_at, completed_at
) VALUES
  (
    'export_20260726', 'user_primary', 'jsonl', 'incremental', 'completed',
    'backups/2026/07/26/export_20260726/data.jsonl.gz', 43008, 68,
    'sha256:1b4f-demo-9ac2', NULL,
    '2026-07-26T03:20:00.000Z', '2026-07-26T03:20:12.000Z'
  ),
  (
    'export_20260720', 'user_primary', 'sql', 'full', 'completed',
    'backups/2026/07/20/export_20260720/data.sql.gz', 192512, 412,
    'sha256:92de-demo-813a', NULL,
    '2026-07-20T04:00:00.000Z', '2026-07-20T04:00:31.000Z'
  );
