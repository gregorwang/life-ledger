-- Owner corrections and recent anime activity captured on 2026-07-26.
-- The two recent-viewing entries deliberately use temporal_uncertain=1 because
-- the owner supplied "最近" rather than an exact viewing timestamp.

PRAGMA foreign_keys = ON;

UPDATE media_works
SET
  canonical_title = '恋爱随意链接',
  normalized_title = '恋爱随意链接',
  aliases_json = '["恋爱连接","心灵链环","Kokoro Connect","ココロコネクト"]',
  cover_url = '/media/covers/anime/kokoro-connect-v1.webp',
  external_refs_json = '{"anilistId":11887,"source":"owner_media_catalog_v4"}',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE
  user_id = 'user_primary'
  AND media_type = 'anime'
  AND normalized_title IN ('恋爱连接', '恋爱随意链接');

INSERT INTO media_works (
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
) VALUES
  (
    'media_seed_anime_kokoro_connect',
    'user_primary',
    'anime',
    NULL,
    '恋爱随意链接',
    '恋爱随意链接',
    '["恋爱连接","心灵链环","Kokoro Connect","ココロコネクト"]',
    '/media/covers/anime/kokoro-connect-v1.webp',
    'completed',
    'completed',
    'completed',
    90,
    '{"anilistId":11887,"source":"owner_media_catalog_v4"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_sentenced_hero',
    'user_primary',
    'anime',
    NULL,
    '判处勇者刑',
    '判处勇者刑',
    '["勇者刑に処す","勇者刑に処す 懲罰勇者9004隊刑務記録","Sentenced to Be a Hero"]',
    '/media/covers/anime/sentenced-to-be-a-hero-v1.webp',
    'completed',
    'completed',
    'completed',
    80,
    '{"anilistId":167152,"source":"owner_media_catalog_v4"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_hyouka',
    'user_primary',
    'anime',
    NULL,
    '冰菓',
    '冰菓',
    '["Hyouka","氷菓"]',
    '/media/covers/anime/hyouka-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":12189,"source":"owner_media_catalog_v4","season":1}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_marriage_toxin',
    'user_primary',
    'anime',
    NULL,
    '婚姻剧毒',
    '婚姻剧毒',
    '["MARRIAGETOXIN","Marriage Toxin","マリッジトキシン"]',
    '/media/covers/anime/marriage-toxin-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":199547,"source":"owner_media_catalog_v4","season":1}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
ON CONFLICT(user_id, media_type, normalized_title) DO UPDATE SET
  canonical_title = excluded.canonical_title,
  aliases_json = excluded.aliases_json,
  cover_url = excluded.cover_url,
  status = excluded.status,
  progress_state = excluded.progress_state,
  watch_status = excluded.watch_status,
  overall_score_100 = coalesce(
    media_works.overall_score_100,
    excluded.overall_score_100
  ),
  external_refs_json = excluded.external_refs_json,
  updated_at = excluded.updated_at;

INSERT INTO entries (
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
  tags_json,
  created_at,
  updated_at
) VALUES
  (
    'entry_seed_anime_marriage_toxin_recent',
    'user_primary',
    'anime',
    '最近看了《婚姻剧毒》',
    '最近看了《婚姻剧毒》。',
    '最近看了《婚姻剧毒》。',
    '最近看了《婚姻剧毒》。',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour'),
    'Asia/Tokyo',
    1,
    'private',
    'active',
    1,
    'mcp',
    '["动漫","最近观看"]',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'entry_seed_anime_hyouka_recent',
    'user_primary',
    'anime',
    '最近看了《冰菓》',
    '最近看了《冰菓》。',
    '最近看了《冰菓》。',
    '最近看了《冰菓》。',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 hours'),
    'Asia/Tokyo',
    1,
    'private',
    'active',
    1,
    'mcp',
    '["动漫","最近观看"]',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
ON CONFLICT(id) DO UPDATE SET
  title = excluded.title,
  body_raw = excluded.body_raw,
  body_plain = excluded.body_plain,
  body_summary = excluded.body_summary,
  temporal_uncertain = excluded.temporal_uncertain,
  visibility = excluded.visibility,
  status = excluded.status,
  tags_json = excluded.tags_json,
  updated_at = excluded.updated_at;

INSERT OR IGNORE INTO media_logs (
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
  'media_log_seed_anime_marriage_toxin_recent',
  'entry_seed_anime_marriage_toxin_recent',
  media_works.id,
  NULL,
  'work',
  NULL,
  NULL,
  'completed',
  NULL,
  entries.occurred_at,
  '{"source":"owner_media_catalog_v4","temporalUncertain":true}'
FROM media_works
JOIN entries ON entries.id = 'entry_seed_anime_marriage_toxin_recent'
WHERE
  media_works.user_id = 'user_primary'
  AND media_works.media_type = 'anime'
  AND media_works.normalized_title = '婚姻剧毒';

INSERT OR IGNORE INTO media_logs (
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
  'media_log_seed_anime_hyouka_recent',
  'entry_seed_anime_hyouka_recent',
  media_works.id,
  NULL,
  'work',
  NULL,
  NULL,
  'completed',
  NULL,
  entries.occurred_at,
  '{"source":"owner_media_catalog_v4","temporalUncertain":true}'
FROM media_works
JOIN entries ON entries.id = 'entry_seed_anime_hyouka_recent'
WHERE
  media_works.user_id = 'user_primary'
  AND media_works.media_type = 'anime'
  AND media_works.normalized_title = '冰菓';
