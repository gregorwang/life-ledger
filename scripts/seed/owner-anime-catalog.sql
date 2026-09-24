-- Idempotent owner catalog seed.
-- Ratings are intentionally NULL: the owner did not provide any scores.
-- Work-level completion is recorded without manufacturing episode history.
INSERT OR IGNORE INTO media_works (
  id,
  user_id,
  media_type,
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
  ('media_seed_anime_re_zero', 'user_primary', 'anime', 'Re从零开始的异世界生活', 're从零开始的异世界生活', '["Re:从零开始的异世界生活"]', '/media/covers/anime/re-zero-season-1-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_blue_box', 'user_primary', 'anime', '青之箱', '青之箱', '[]', '/media/covers/anime/blue-box-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_medalist', 'user_primary', 'anime', '金牌得主', '金牌得主', '[]', '/media/covers/anime/medalist-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_saekano', 'user_primary', 'anime', '路人女主', '路人女主', '["路人女主的养成方法"]', '/media/covers/anime/saekano-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_takagi', 'user_primary', 'anime', '擅长捉弄的高木同学', '擅长捉弄的高木同学', '["高木同学"]', '/media/covers/anime/takagi-san-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_shikimori', 'user_primary', 'anime', '式守同学不只可爱而已', '式守同学不只可爱而已', '["式守同学"]', '/media/covers/anime/shikimori-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_kubo', 'user_primary', 'anime', '久保同学不放过我', '久保同学不放过我', '["久保同学"]', '/media/covers/anime/kubo-san-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_date_a_live', 'user_primary', 'anime', '约会大作战', '约会大作战', '[]', '/media/covers/anime/date-a-live-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_iroduku', 'user_primary', 'anime', '来自多彩世界的明天', '来自多彩世界的明天', '[]', '/media/covers/anime/iroduku-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_summer_pockets', 'user_primary', 'anime', '夏日口袋', '夏日口袋', '["Summer Pockets"]', '/media/covers/anime/summer-pockets-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_summertime_rendering', 'user_primary', 'anime', '夏日重现', '夏日重现', '[]', '/media/covers/anime/summertime-rendering-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_makeine', 'user_primary', 'anime', '败犬女主太多了！', '败犬女主太多了', '["败犬女主也太多了"]', '/media/covers/anime/makeine-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_bokuyaba', 'user_primary', 'anime', '我心里危险的东西', '我心里危险的东西', '[]', '/media/covers/anime/dangers-in-my-heart-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_madoka', 'user_primary', 'anime', '魔法少女小圆', '魔法少女小圆', '[]', '/media/covers/anime/madoka-magica-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_demon_slayer', 'user_primary', 'anime', '鬼灭之刃', '鬼灭之刃', '[]', '/media/covers/anime/demon-slayer-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_attack_on_titan', 'user_primary', 'anime', '进击的巨人', '进击的巨人', '[]', '/media/covers/anime/attack-on-titan-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_fate', 'user_primary', 'anime', 'Fate 系列', 'fate系列', '["Fate"]', '/media/covers/anime/fate-series-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1","scope":"unspecified-franchise"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_chainsaw_man', 'user_primary', 'anime', '电锯人', '电锯人', '[]', '/media/covers/anime/chainsaw-man-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_darling', 'user_primary', 'anime', 'DARLING in the FRANXX', 'darlinginthefranxx', '[]', '/media/covers/anime/darling-franxx-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_sakurasou', 'user_primary', 'anime', '樱花庄的宠物女孩', '樱花庄的宠物女孩', '[]', '/media/covers/anime/sakurasou-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_bocchi', 'user_primary', 'anime', '孤独摇滚！', '孤独摇滚', '["孤独摇滚"]', '/media/covers/anime/bocchi-the-rock-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_henneko', 'user_primary', 'anime', '变态王子与不笑猫', '变态王子与不笑猫', '[]', '/media/covers/anime/henneko-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_oresuki', 'user_primary', 'anime', '喜欢本大爷的居然就你一个？', '喜欢本大爷的居然就你一个', '["喜欢本大爷的居然就你一个"]', '/media/covers/anime/oresuki-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_lycoris', 'user_primary', 'anime', '莉可丽丝', '莉可丽丝', '["莉可莉丝"]', '/media/covers/anime/lycoris-recoil-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_solo_leveling', 'user_primary', 'anime', '我独自升级', '我独自升级', '[]', '/media/covers/anime/solo-leveling-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_tower_of_god', 'user_primary', 'anime', '神之塔', '神之塔', '[]', '/media/covers/anime/tower-of-god-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('media_seed_anime_fog_hill', 'user_primary', 'anime', '雾山五行', '雾山五行', '[]', '/media/covers/anime/fog-hill-v1.webp', 'completed', 'watched', 'completed', NULL, '{"seed":"owner_anime_catalog_v1"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Neutral catalog structure for unambiguous numbered continuations.
-- Season ratings and watch states remain NULL because the owner did not
-- identify which individual seasons were completed.
WITH season_seed (
  id,
  work_normalized_title,
  label,
  normalized_label,
  season_number
) AS (
  VALUES
    ('season_seed_re_zero_1', 're从零开始的异世界生活', '第1季', '第1季', 1),
    ('season_seed_re_zero_2', 're从零开始的异世界生活', '第2季', '第2季', 2),
    ('season_seed_re_zero_3', 're从零开始的异世界生活', '第3季', '第3季', 3),
    ('season_seed_saekano_1', '路人女主', '第1季', '第1季', 1),
    ('season_seed_saekano_2', '路人女主', '第2季', '第2季', 2),
    ('season_seed_takagi_1', '擅长捉弄的高木同学', '第1季', '第1季', 1),
    ('season_seed_takagi_2', '擅长捉弄的高木同学', '第2季', '第2季', 2),
    ('season_seed_takagi_3', '擅长捉弄的高木同学', '第3季', '第3季', 3),
    ('season_seed_date_a_live_1', '约会大作战', '第1季', '第1季', 1),
    ('season_seed_date_a_live_2', '约会大作战', '第2季', '第2季', 2),
    ('season_seed_date_a_live_3', '约会大作战', '第3季', '第3季', 3),
    ('season_seed_date_a_live_4', '约会大作战', '第4季', '第4季', 4),
    ('season_seed_date_a_live_5', '约会大作战', '第5季', '第5季', 5),
    ('season_seed_bokuyaba_1', '我心里危险的东西', '第1季', '第1季', 1),
    ('season_seed_bokuyaba_2', '我心里危险的东西', '第2季', '第2季', 2),
    ('season_seed_attack_on_titan_1', '进击的巨人', '第1季', '第1季', 1),
    ('season_seed_attack_on_titan_2', '进击的巨人', '第2季', '第2季', 2),
    ('season_seed_attack_on_titan_3', '进击的巨人', '第3季', '第3季', 3),
    ('season_seed_attack_on_titan_4', '进击的巨人', '第4季', '第4季', 4),
    ('season_seed_solo_leveling_1', '我独自升级', '第1季', '第1季', 1),
    ('season_seed_solo_leveling_2', '我独自升级', '第2季', '第2季', 2),
    ('season_seed_tower_of_god_1', '神之塔', '第1季', '第1季', 1),
    ('season_seed_tower_of_god_2', '神之塔', '第2季', '第2季', 2)
)
INSERT OR IGNORE INTO media_seasons (
  id,
  media_work_id,
  label,
  normalized_label,
  season_number,
  title,
  score_100,
  watch_status,
  created_at,
  updated_at
)
SELECT
  ss.id,
  mw.id,
  ss.label,
  ss.normalized_label,
  ss.season_number,
  NULL,
  NULL,
  NULL,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM season_seed ss
JOIN media_works mw
  ON mw.user_id = 'user_primary'
 AND mw.media_type = 'anime'
 AND mw.normalized_title = ss.work_normalized_title;
