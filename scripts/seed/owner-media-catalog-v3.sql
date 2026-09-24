-- Owner media catalog normalization requested on 2026-07-26.
--
-- Presentation rule: every released anime season/TV arc is a first-class
-- media work with its own cover. Media seasons remain available for optional
-- episode-level logging, but are not used to collapse several shows into one
-- library card.
--
-- Cover rule: catalog artwork is served through the authenticated Web Worker
-- from the private life-ledger-media R2 bucket. No catalog cover is bundled in
-- the static Worker assets.

-- Preserve any season-labelled history before removing the old umbrella rows.
WITH log_routes (source_id, target_id, season_number) AS (
  VALUES
    ('media_seed_anime_bokuyaba', 'media_seed_anime_bokuyaba_s2', 2),
    ('media_seed_anime_saekano', 'media_seed_anime_saekano_s2', 2),
    ('media_seed_anime_takagi', 'media_seed_anime_takagi_s2', 2),
    ('media_seed_anime_takagi', 'media_seed_anime_takagi_s3', 3),
    ('media_seed_anime_date_a_live', 'media_seed_anime_date_a_live_s2', 2),
    ('media_seed_anime_date_a_live', 'media_seed_anime_date_a_live_s3', 3),
    ('media_seed_anime_date_a_live', 'media_seed_anime_date_a_live_s4', 4),
    ('media_seed_anime_date_a_live', 'media_seed_anime_date_a_live_s5', 5),
    ('media_seed_anime_attack_on_titan', 'media_seed_anime_attack_on_titan_s2', 2),
    ('media_seed_anime_attack_on_titan', 'media_seed_anime_attack_on_titan_s3', 3),
    ('media_seed_anime_attack_on_titan', 'media_seed_anime_attack_on_titan_s4', 4),
    ('media_seed_anime_solo_leveling', 'media_seed_anime_solo_leveling_s2', 2),
    ('media_seed_anime_tower_of_god', 'media_seed_anime_tower_of_god_s2', 2)
)
UPDATE media_logs
SET
  media_work_id = (
    SELECT target_id
    FROM log_routes
    WHERE
      source_id = media_logs.media_work_id AND
      (
        trim(coalesce(media_logs.season_label, '')) =
          CAST(season_number AS TEXT) OR
        trim(coalesce(media_logs.season_label, '')) =
          '第' || CAST(season_number AS TEXT) || '季' OR
        lower(coalesce(media_logs.season_label, '')) LIKE
          '%season ' || CAST(season_number AS TEXT) || '%' OR
        lower(coalesce(media_logs.season_label, '')) =
          's' || CAST(season_number AS TEXT)
      )
  ),
  season_id = NULL
WHERE EXISTS (
  SELECT 1
  FROM log_routes
  WHERE
    source_id = media_logs.media_work_id AND
    (
      trim(coalesce(media_logs.season_label, '')) =
        CAST(season_number AS TEXT) OR
      trim(coalesce(media_logs.season_label, '')) =
        '第' || CAST(season_number AS TEXT) || '季' OR
      lower(coalesce(media_logs.season_label, '')) LIKE
        '%season ' || CAST(season_number AS TEXT) || '%' OR
      lower(coalesce(media_logs.season_label, '')) =
        's' || CAST(season_number AS TEXT)
    )
);

DELETE FROM media_seasons
WHERE media_work_id IN (
  'media_seed_anime_bokuyaba',
  'media_seed_anime_saekano',
  'media_seed_anime_takagi',
  'media_seed_anime_date_a_live',
  'media_seed_anime_attack_on_titan',
  'media_seed_anime_solo_leveling',
  'media_seed_anime_tower_of_god'
);

WITH base_updates (
  id,
  canonical_title,
  normalized_title,
  aliases_json,
  external_refs_json
) AS (
  VALUES
    (
      'media_seed_anime_bokuyaba',
      '我心里危险的东西 第1季',
      '我心里危险的东西第1季',
      '["我心里危险的东西","The Dangers in My Heart","僕の心のヤバイやつ"]',
      '{"anilistId":153152,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_saekano',
      '路人女主的养成方法 第1季',
      '路人女主的养成方法第1季',
      '["路人女主","Saekano: How to Raise a Boring Girlfriend","冴えない彼女の育てかた"]',
      '{"anilistId":20657,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_takagi',
      '擅长捉弄的高木同学 第1季',
      '擅长捉弄的高木同学第1季',
      '["高木同学 第1季","Teasing Master Takagi-san","からかい上手の高木さん"]',
      '{"anilistId":99468,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_date_a_live',
      '约会大作战 第1季',
      '约会大作战第1季',
      '["Date A Live","デート・ア・ライブ"]',
      '{"anilistId":15583,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_attack_on_titan',
      '进击的巨人 第1季',
      '进击的巨人第1季',
      '["Attack on Titan","進撃の巨人"]',
      '{"anilistId":16498,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_solo_leveling',
      '我独自升级 第1季',
      '我独自升级第1季',
      '["Solo Leveling","俺だけレベルアップな件"]',
      '{"anilistId":151807,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_tower_of_god',
      '神之塔 第1季',
      '神之塔第1季',
      '["Tower of God","神之塔 -Tower of God-"]',
      '{"anilistId":115230,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_k_on',
      '轻音少女 第1季',
      '轻音少女第1季',
      '["轻音少女","K-ON!","けいおん!"]',
      '{"anilistId":5680,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_medalist',
      '金牌得主 第1季',
      '金牌得主第1季',
      '["金牌得主","Medalist","メダリスト"]',
      '{"anilistId":165171,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_fog_hill',
      '雾山五行 第1季：灼源神火',
      '雾山五行第1季灼源神火',
      '["雾山五行","Fog Hill of Five Elements","雾山五行 灼源神火"]',
      '{"anilistId":107069,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_demon_slayer',
      '鬼灭之刃：灶门炭治郎 立志篇',
      '鬼灭之刃灶门炭治郎立志篇',
      '["鬼灭之刃 第1季","Demon Slayer: Kimetsu no Yaiba","鬼滅の刃"]',
      '{"anilistId":101922,"source":"owner_media_catalog_v3","arc":"立志篇"}'
    ),
    (
      'media_seed_anime_blue_box',
      '青之箱 第1季',
      '青之箱第1季',
      '["青之箱","Blue Box","アオのハコ"]',
      '{"anilistId":170942,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_makeine',
      '败犬女主太多了！第1季',
      '败犬女主太多了第1季',
      '["败犬女主也太多了","Makeine: Too Many Losing Heroines!","負けヒロインが多すぎる！"]',
      '{"anilistId":171457,"source":"owner_media_catalog_v3","season":1}'
    ),
    (
      'media_seed_anime_bocchi',
      '孤独摇滚！第1季',
      '孤独摇滚第1季',
      '["孤独摇滚","BOCCHI THE ROCK!","ぼっち・ざ・ろっく！"]',
      '{"anilistId":130003,"source":"owner_media_catalog_v3","season":1}'
    )
)
UPDATE media_works
SET
  canonical_title = (
    SELECT canonical_title FROM base_updates WHERE id = media_works.id
  ),
  normalized_title = (
    SELECT normalized_title FROM base_updates WHERE id = media_works.id
  ),
  aliases_json = (
    SELECT aliases_json FROM base_updates WHERE id = media_works.id
  ),
  external_refs_json = (
    SELECT external_refs_json FROM base_updates WHERE id = media_works.id
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id IN (SELECT id FROM base_updates);

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
    'media_seed_anime_bokuyaba_s2',
    'user_primary',
    'anime',
    NULL,
    '我心里危险的东西 第2季',
    '我心里危险的东西第2季',
    '["The Dangers in My Heart Season 2","僕の心のヤバイやつ 第2期"]',
    '/media/covers/anime/dangers-in-my-heart-season-2-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":166216,"source":"owner_media_catalog_v3","season":2}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_saekano_s2',
    'user_primary',
    'anime',
    NULL,
    '路人女主的养成方法 第2季',
    '路人女主的养成方法第2季',
    '["路人女主 ♭","Saekano: How to Raise a Boring Girlfriend ♭","冴えない彼女の育てかた ♭"]',
    '/media/covers/anime/saekano-season-2-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":21180,"source":"owner_media_catalog_v3","season":2}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_takagi_s2',
    'user_primary',
    'anime',
    NULL,
    '擅长捉弄的高木同学 第2季',
    '擅长捉弄的高木同学第2季',
    '["高木同学 第2季","Teasing Master Takagi-san Season 2","からかい上手の高木さん 2"]',
    '/media/covers/anime/takagi-san-season-2-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":107068,"source":"owner_media_catalog_v3","season":2}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_takagi_s3',
    'user_primary',
    'anime',
    NULL,
    '擅长捉弄的高木同学 第3季',
    '擅长捉弄的高木同学第3季',
    '["高木同学 第3季","Teasing Master Takagi-san Season 3","からかい上手の高木さん 3"]',
    '/media/covers/anime/takagi-san-season-3-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":138424,"source":"owner_media_catalog_v3","season":3}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_date_a_live_s2',
    'user_primary',
    'anime',
    NULL,
    '约会大作战 第2季',
    '约会大作战第2季',
    '["Date A Live II","デート・ア・ライブⅡ"]',
    '/media/covers/anime/date-a-live-season-2-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":19163,"source":"owner_media_catalog_v3","season":2}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_date_a_live_s3',
    'user_primary',
    'anime',
    NULL,
    '约会大作战 第3季',
    '约会大作战第3季',
    '["Date A Live III","デート・ア・ライブⅢ"]',
    '/media/covers/anime/date-a-live-season-3-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":100722,"source":"owner_media_catalog_v3","season":3}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_date_a_live_s4',
    'user_primary',
    'anime',
    NULL,
    '约会大作战 第4季',
    '约会大作战第4季',
    '["Date A Live IV","デート・ア・ライブIV"]',
    '/media/covers/anime/date-a-live-season-4-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":116605,"source":"owner_media_catalog_v3","season":4}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_date_a_live_s5',
    'user_primary',
    'anime',
    NULL,
    '约会大作战 第5季',
    '约会大作战第5季',
    '["Date A Live V","デート・ア・ライブV"]',
    '/media/covers/anime/date-a-live-season-5-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":151380,"source":"owner_media_catalog_v3","season":5}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_attack_on_titan_s2',
    'user_primary',
    'anime',
    NULL,
    '进击的巨人 第2季',
    '进击的巨人第2季',
    '["Attack on Titan Season 2","進撃の巨人 Season 2"]',
    '/media/covers/anime/attack-on-titan-season-2-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":20958,"source":"owner_media_catalog_v3","season":2}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_attack_on_titan_s3',
    'user_primary',
    'anime',
    NULL,
    '进击的巨人 第3季',
    '进击的巨人第3季',
    '["Attack on Titan Season 3","進撃の巨人 Season 3"]',
    '/media/covers/anime/attack-on-titan-season-3-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":99147,"source":"owner_media_catalog_v3","season":3}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_attack_on_titan_s4',
    'user_primary',
    'anime',
    NULL,
    '进击的巨人 最终季',
    '进击的巨人最终季',
    '["进击的巨人 第4季","Attack on Titan Final Season","進撃の巨人 The Final Season"]',
    '/media/covers/anime/attack-on-titan-season-4-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":110277,"source":"owner_media_catalog_v3","season":4}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_solo_leveling_s2',
    'user_primary',
    'anime',
    NULL,
    '我独自升级 第2季',
    '我独自升级第2季',
    '["Solo Leveling Season 2 -Arise from the Shadow-","俺だけレベルアップな件 Season 2"]',
    '/media/covers/anime/solo-leveling-season-2-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":176496,"source":"owner_media_catalog_v3","season":2}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_tower_of_god_s2',
    'user_primary',
    'anime',
    NULL,
    '神之塔 第2季',
    '神之塔第2季',
    '["Tower of God Season 2","神之塔 -Tower of God- 第2期"]',
    '/media/covers/anime/tower-of-god-season-2-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":153406,"source":"owner_media_catalog_v3","season":2}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_k_on_s2',
    'user_primary',
    'anime',
    NULL,
    '轻音少女 第2季',
    '轻音少女第2季',
    '["K-ON!!","K-ON! Season 2","けいおん!!"]',
    '/media/covers/anime/k-on-season-2-v1.webp',
    'planned',
    'planned',
    'planned',
    NULL,
    '{"anilistId":7791,"source":"owner_media_catalog_v3","season":2}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_medalist_s2',
    'user_primary',
    'anime',
    NULL,
    '金牌得主 第2季',
    '金牌得主第2季',
    '["Medalist Season 2","メダリスト 第2期"]',
    '/media/covers/anime/medalist-season-2-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":189275,"source":"owner_media_catalog_v3","season":2}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_fog_hill_s2',
    'user_primary',
    'anime',
    NULL,
    '雾山五行 第2季：犀川幻紫林',
    '雾山五行第2季犀川幻紫林',
    '["Fog Hill of Five Elements 2","雾山五行·犀川幻紫林"]',
    '/media/covers/anime/fog-hill-season-2-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":122585,"source":"owner_media_catalog_v3","season":2}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_demon_slayer_mugen_train',
    'user_primary',
    'anime',
    NULL,
    '鬼灭之刃：无限列车篇',
    '鬼灭之刃无限列车篇',
    '["鬼灭之刃 无限列车篇 TV","Demon Slayer: Mugen Train Arc","鬼滅の刃 無限列車編"]',
    '/media/covers/anime/demon-slayer-mugen-train-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":129874,"source":"owner_media_catalog_v3","arc":"无限列车篇"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_demon_slayer_entertainment_district',
    'user_primary',
    'anime',
    NULL,
    '鬼灭之刃：游郭篇',
    '鬼灭之刃游郭篇',
    '["Demon Slayer: Entertainment District Arc","鬼滅の刃 遊郭編"]',
    '/media/covers/anime/demon-slayer-entertainment-district-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":142329,"source":"owner_media_catalog_v3","arc":"游郭篇"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_demon_slayer_swordsmith_village',
    'user_primary',
    'anime',
    NULL,
    '鬼灭之刃：刀匠村篇',
    '鬼灭之刃刀匠村篇',
    '["Demon Slayer: Swordsmith Village Arc","鬼滅の刃 刀鍛冶の里編"]',
    '/media/covers/anime/demon-slayer-swordsmith-village-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":145139,"source":"owner_media_catalog_v3","arc":"刀匠村篇"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  ),
  (
    'media_seed_anime_demon_slayer_hashira_training',
    'user_primary',
    'anime',
    NULL,
    '鬼灭之刃：柱训练篇',
    '鬼灭之刃柱训练篇',
    '["Demon Slayer: Hashira Training Arc","鬼滅の刃 柱稽古編"]',
    '/media/covers/anime/demon-slayer-hashira-training-v1.webp',
    'completed',
    'completed',
    'completed',
    NULL,
    '{"anilistId":166240,"source":"owner_media_catalog_v3","arc":"柱训练篇"}',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  )
ON CONFLICT(id) DO UPDATE SET
  canonical_title = excluded.canonical_title,
  normalized_title = excluded.normalized_title,
  aliases_json = excluded.aliases_json,
  cover_url = excluded.cover_url,
  status = excluded.status,
  progress_state = excluded.progress_state,
  watch_status = excluded.watch_status,
  external_refs_json = excluded.external_refs_json,
  updated_at = excluded.updated_at;

-- Switch the complete existing catalog to authenticated R2 URLs.
WITH cover_map (id, cover_url) AS (
  VALUES
    ('media_seed_anime_darling', '/media/covers/anime/darling-franxx-v1.webp'),
    ('media_seed_anime_fate', '/media/covers/anime/fate-series-v1.webp'),
    ('media_seed_anime_re_zero', '/media/covers/anime/re-zero-season-1-v1.webp'),
    ('media_seed_anime_re_zero_s2', '/media/covers/anime/re-zero-season-2-v1.webp'),
    ('media_seed_anime_re_zero_s3', '/media/covers/anime/re-zero-season-3-v1.webp'),
    ('media_seed_anime_re_zero_s4', '/media/covers/anime/re-zero-season-4-v1.webp'),
    ('media_seed_anime_kubo', '/media/covers/anime/kubo-san-v1.webp'),
    ('media_seed_anime_henneko', '/media/covers/anime/henneko-v1.webp'),
    ('media_seed_anime_oresuki', '/media/covers/anime/oresuki-v1.webp'),
    ('media_seed_anime_summer_pockets', '/media/covers/anime/summer-pockets-v1.webp'),
    ('media_seed_anime_summertime_rendering', '/media/covers/anime/summertime-rendering-v1.webp'),
    ('media_seed_anime_bocchi', '/media/covers/anime/bocchi-the-rock-v1.webp'),
    ('media_seed_anime_shikimori', '/media/covers/anime/shikimori-v1.webp'),
    ('media_seed_anime_bokuyaba', '/media/covers/anime/dangers-in-my-heart-v1.webp'),
    ('media_seed_anime_bokuyaba_s2', '/media/covers/anime/dangers-in-my-heart-season-2-v1.webp'),
    ('media_seed_anime_solo_leveling', '/media/covers/anime/solo-leveling-v1.webp'),
    ('media_seed_anime_solo_leveling_s2', '/media/covers/anime/solo-leveling-season-2-v1.webp'),
    ('media_seed_anime_takagi', '/media/covers/anime/takagi-san-v1.webp'),
    ('media_seed_anime_takagi_s2', '/media/covers/anime/takagi-san-season-2-v1.webp'),
    ('media_seed_anime_takagi_s3', '/media/covers/anime/takagi-san-season-3-v1.webp'),
    ('media_seed_anime_iroduku', '/media/covers/anime/iroduku-v1.webp'),
    ('media_seed_anime_sakurasou', '/media/covers/anime/sakurasou-v1.webp'),
    ('media_seed_anime_tamako_market', '/media/covers/anime/tamako-market-v1.webp'),
    ('media_seed_anime_chainsaw_man', '/media/covers/anime/chainsaw-man-v1.webp'),
    ('media_seed_anime_tower_of_god', '/media/covers/anime/tower-of-god-v1.webp'),
    ('media_seed_anime_tower_of_god_s2', '/media/covers/anime/tower-of-god-season-2-v1.webp'),
    ('media_seed_anime_date_a_live', '/media/covers/anime/date-a-live-v1.webp'),
    ('media_seed_anime_date_a_live_s2', '/media/covers/anime/date-a-live-season-2-v1.webp'),
    ('media_seed_anime_date_a_live_s3', '/media/covers/anime/date-a-live-season-3-v1.webp'),
    ('media_seed_anime_date_a_live_s4', '/media/covers/anime/date-a-live-season-4-v1.webp'),
    ('media_seed_anime_date_a_live_s5', '/media/covers/anime/date-a-live-season-5-v1.webp'),
    ('media_seed_anime_lycoris', '/media/covers/anime/lycoris-recoil-v1.webp'),
    ('media_seed_anime_makeine', '/media/covers/anime/makeine-v1.webp'),
    ('media_seed_anime_saekano', '/media/covers/anime/saekano-v1.webp'),
    ('media_seed_anime_saekano_s2', '/media/covers/anime/saekano-season-2-v1.webp'),
    ('media_seed_anime_k_on', '/media/covers/anime/k-on-v1.webp'),
    ('media_seed_anime_k_on_s2', '/media/covers/anime/k-on-season-2-v1.webp'),
    ('media_seed_anime_art_club', '/media/covers/anime/this-art-club-has-a-problem-v1.webp'),
    ('media_seed_anime_attack_on_titan', '/media/covers/anime/attack-on-titan-v1.webp'),
    ('media_seed_anime_attack_on_titan_s2', '/media/covers/anime/attack-on-titan-season-2-v1.webp'),
    ('media_seed_anime_attack_on_titan_s3', '/media/covers/anime/attack-on-titan-season-3-v1.webp'),
    ('media_seed_anime_attack_on_titan_s4', '/media/covers/anime/attack-on-titan-season-4-v1.webp'),
    ('media_seed_anime_medalist', '/media/covers/anime/medalist-v1.webp'),
    ('media_seed_anime_medalist_s2', '/media/covers/anime/medalist-season-2-v1.webp'),
    ('media_seed_anime_fog_hill', '/media/covers/anime/fog-hill-v1.webp'),
    ('media_seed_anime_fog_hill_s2', '/media/covers/anime/fog-hill-season-2-v1.webp'),
    ('media_seed_anime_blue_box', '/media/covers/anime/blue-box-v1.webp'),
    ('media_seed_anime_demon_slayer', '/media/covers/anime/demon-slayer-v1.webp'),
    ('media_seed_anime_demon_slayer_mugen_train', '/media/covers/anime/demon-slayer-mugen-train-v1.webp'),
    ('media_seed_anime_demon_slayer_entertainment_district', '/media/covers/anime/demon-slayer-entertainment-district-v1.webp'),
    ('media_seed_anime_demon_slayer_swordsmith_village', '/media/covers/anime/demon-slayer-swordsmith-village-v1.webp'),
    ('media_seed_anime_demon_slayer_hashira_training', '/media/covers/anime/demon-slayer-hashira-training-v1.webp'),
    ('media_seed_anime_madoka', '/media/covers/anime/madoka-magica-v1.webp'),
    ('media_seed_movie_interstellar', '/media/covers/screen/interstellar-v1.webp'),
    ('media_seed_movie_demon_slayer_infinity_castle', '/media/covers/screen/demon-slayer-infinity-castle-v1.webp'),
    ('media_seed_movie_persian_lessons', '/media/covers/screen/persian-lessons-v1.webp'),
    ('media_seed_movie_ip_man', '/media/covers/screen/ip-man-v1.webp'),
    ('media_seed_movie_ip_man_2', '/media/covers/screen/ip-man-2-v1.webp'),
    ('media_seed_movie_ip_man_3', '/media/covers/screen/ip-man-3-v1.webp'),
    ('media_seed_movie_ip_man_4', '/media/covers/screen/ip-man-4-v1.webp'),
    ('media_seed_movie_catch_me_if_you_can', '/media/covers/screen/catch-me-if-you-can-v1.webp'),
    ('media_seed_movie_ant_man_2', '/media/covers/screen/ant-man-and-the-wasp-v1.webp'),
    ('media_seed_movie_avengers_5', '/media/covers/screen/avengers-doomsday-v1.webp'),
    ('media_seed_movie_iron_man', '/media/covers/screen/iron-man-v1.webp')
)
UPDATE media_works
SET
  cover_url = (
    SELECT cover_url FROM cover_map WHERE id = media_works.id
  ),
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id IN (SELECT id FROM cover_map);
