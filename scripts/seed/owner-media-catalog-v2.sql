-- Owner catalog additions requested on 2026-07-26.
--
-- Re:ZERO seasons are first-class works: each season has its own cover,
-- completion state, and 10.0 work-level rating. This seed is idempotent.

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
    'media_seed_anime_re_zero',
    'user_primary',
    'anime',
    NULL,
    'Re:从零开始的异世界生活 第1季',
    're从零开始的异世界生活第1季',
    '["Re:ZERO 第1季","Re:ZERO -Starting Life in Another World- Season 1","Re:ゼロから始める異世界生活"]',
    '/media/covers/anime/re-zero-season-1-v1.webp',
    'completed',
    'completed',
    'completed',
    100,
    '{"anilistId":21355,"source":"owner_media_catalog_v2","season":1}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_re_zero_s2',
    'user_primary',
    'anime',
    NULL,
    'Re:从零开始的异世界生活 第2季',
    're从零开始的异世界生活第2季',
    '["Re:ZERO 第2季","Re:ZERO -Starting Life in Another World- Season 2","Re:ゼロから始める異世界生活 2nd Season"]',
    '/media/covers/anime/re-zero-season-2-v1.webp',
    'completed',
    'completed',
    'completed',
    100,
    '{"anilistId":108632,"source":"owner_media_catalog_v2","season":2}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_re_zero_s3',
    'user_primary',
    'anime',
    NULL,
    'Re:从零开始的异世界生活 第3季',
    're从零开始的异世界生活第3季',
    '["Re:ZERO 第3季","Re:ZERO -Starting Life in Another World- Season 3","Re:ゼロから始める異世界生活 3rd season"]',
    '/media/covers/anime/re-zero-season-3-v1.webp',
    'completed',
    'completed',
    'completed',
    100,
    '{"anilistId":163134,"source":"owner_media_catalog_v2","season":3}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_re_zero_s4',
    'user_primary',
    'anime',
    NULL,
    'Re:从零开始的异世界生活 第4季',
    're从零开始的异世界生活第4季',
    '["Re:ZERO 第4季","Re:ZERO -Starting Life in Another World- Season 4","Re:ゼロから始める異世界生活 4th season"]',
    '/media/covers/anime/re-zero-season-4-v1.webp',
    'completed',
    'completed',
    'completed',
    100,
    '{"anilistId":189046,"source":"owner_media_catalog_v2","season":4}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_art_club',
    'user_primary',
    'anime',
    NULL,
    '这个美术室大有问题！',
    '这个美术室大有问题',
    '["这个美术社大有问题！","This Art Club Has a Problem!","この美術部には問題がある!"]',
    '/media/covers/anime/this-art-club-has-a-problem-v1.webp',
    'watching',
    'watching',
    'watching',
    NULL,
    '{"anilistId":21457,"source":"owner_media_catalog_v2"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_k_on',
    'user_primary',
    'anime',
    NULL,
    '轻音少女',
    '轻音少女',
    '["K-ON!","けいおん!"]',
    '/media/covers/anime/k-on-v1.webp',
    'planned',
    'planned',
    'planned',
    NULL,
    '{"anilistId":5680,"source":"owner_media_catalog_v2"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_tamako_market',
    'user_primary',
    'anime',
    NULL,
    '玉子爱情市场',
    '玉子爱情市场',
    '["玉子市场","Tamako Market","たまこまーけっと"]',
    '/media/covers/anime/tamako-market-v1.webp',
    'planned',
    'planned',
    'planned',
    NULL,
    '{"anilistId":16417,"source":"owner_media_catalog_v2"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
ON CONFLICT(id) DO UPDATE SET
  media_type = excluded.media_type,
  media_kind = excluded.media_kind,
  canonical_title = excluded.canonical_title,
  normalized_title = excluded.normalized_title,
  aliases_json = excluded.aliases_json,
  cover_url = excluded.cover_url,
  status = excluded.status,
  progress_state = excluded.progress_state,
  watch_status = excluded.watch_status,
  overall_score_100 = excluded.overall_score_100,
  external_refs_json = excluded.external_refs_json,
  updated_at = excluded.updated_at;

-- Preserve any historical logs that were recorded against the former
-- umbrella Re:ZERO work by moving them to the matching first-class work.
UPDATE media_logs
SET media_work_id = 'media_seed_anime_re_zero_s2', season_id = NULL
WHERE
  media_work_id = 'media_seed_anime_re_zero' AND
  (
    season_label IN ('2', '第2季', '第二季') OR
    lower(coalesce(season_label, '')) LIKE '%season 2%'
  );

UPDATE media_logs
SET media_work_id = 'media_seed_anime_re_zero_s3', season_id = NULL
WHERE
  media_work_id = 'media_seed_anime_re_zero' AND
  (
    season_label IN ('3', '第3季', '第三季') OR
    lower(coalesce(season_label, '')) LIKE '%season 3%'
  );

UPDATE media_logs
SET media_work_id = 'media_seed_anime_re_zero_s4', season_id = NULL
WHERE
  media_work_id = 'media_seed_anime_re_zero' AND
  (
    season_label IN ('4', '第4季', '第四季') OR
    lower(coalesce(season_label, '')) LIKE '%season 4%'
  );

-- The old umbrella season rows are no longer part of the presentation model.
DELETE FROM media_seasons
WHERE media_work_id = 'media_seed_anime_re_zero';

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
    'media_seed_movie_interstellar',
    'user_primary',
    'screen',
    'movie',
    '星际穿越',
    '星际穿越',
    '["Interstellar"]',
    '/media/covers/screen/interstellar-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"tmdbId":157336,"source":"owner_media_catalog_v2"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_movie_demon_slayer_infinity_castle',
    'user_primary',
    'screen',
    'movie',
    '鬼灭之刃：无限城篇',
    '鬼灭之刃无限城篇',
    '["鬼灭之刃无限城","Demon Slayer: Kimetsu no Yaiba Infinity Castle","劇場版「鬼滅の刃」無限城編 第一章 猗窩座再来"]',
    '/media/covers/screen/demon-slayer-infinity-castle-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":178788,"source":"owner_media_catalog_v2"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_movie_persian_lessons',
    'user_primary',
    'screen',
    'movie',
    '波斯语课',
    '波斯语课',
    '["Persian Lessons"]',
    '/media/covers/screen/persian-lessons-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"tmdbId":581577,"source":"owner_media_catalog_v2"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_movie_ip_man',
    'user_primary',
    'screen',
    'movie',
    '叶问',
    '叶问',
    '["Ip Man"]',
    '/media/covers/screen/ip-man-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"tmdbId":14756,"source":"owner_media_catalog_v2","series":"叶问"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_movie_ip_man_2',
    'user_primary',
    'screen',
    'movie',
    '叶问2',
    '叶问2',
    '["Ip Man 2"]',
    '/media/covers/screen/ip-man-2-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"tmdbId":37472,"source":"owner_media_catalog_v2","series":"叶问"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_movie_ip_man_3',
    'user_primary',
    'screen',
    'movie',
    '叶问3',
    '叶问3',
    '["Ip Man 3"]',
    '/media/covers/screen/ip-man-3-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"tmdbId":365222,"source":"owner_media_catalog_v2","series":"叶问"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_movie_ip_man_4',
    'user_primary',
    'screen',
    'movie',
    '叶问4：完结篇',
    '叶问4完结篇',
    '["叶问4","Ip Man 4: The Finale"]',
    '/media/covers/screen/ip-man-4-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"tmdbId":449924,"source":"owner_media_catalog_v2","series":"叶问"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_movie_catch_me_if_you_can',
    'user_primary',
    'screen',
    'movie',
    '猫鼠游戏',
    '猫鼠游戏',
    '["Catch Me If You Can"]',
    '/media/covers/screen/catch-me-if-you-can-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"tmdbId":640,"source":"owner_media_catalog_v2"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_movie_ant_man_2',
    'user_primary',
    'screen',
    'movie',
    '蚁人2：黄蜂女现身',
    '蚁人2黄蜂女现身',
    '["蚁人2","Ant-Man and the Wasp"]',
    '/media/covers/screen/ant-man-and-the-wasp-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"tmdbId":363088,"source":"owner_media_catalog_v2"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_movie_avengers_5',
    'user_primary',
    'screen',
    'movie',
    '复仇者联盟5：毁灭日',
    '复仇者联盟5毁灭日',
    '["复仇者联盟5","Avengers: Doomsday"]',
    '/media/covers/screen/avengers-doomsday-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"source":"owner_media_catalog_v2","officialPage":"https://www.marvel.com/movies/avengers-doomsday"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_movie_iron_man',
    'user_primary',
    'screen',
    'movie',
    '钢铁侠',
    '钢铁侠',
    '["Iron Man"]',
    '/media/covers/screen/iron-man-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"tmdbId":1726,"source":"owner_media_catalog_v2"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
ON CONFLICT(id) DO UPDATE SET
  media_type = excluded.media_type,
  media_kind = excluded.media_kind,
  canonical_title = excluded.canonical_title,
  normalized_title = excluded.normalized_title,
  aliases_json = excluded.aliases_json,
  cover_url = excluded.cover_url,
  status = excluded.status,
  progress_state = excluded.progress_state,
  watch_status = excluded.watch_status,
  overall_score_100 = excluded.overall_score_100,
  external_refs_json = excluded.external_refs_json,
  updated_at = excluded.updated_at;
