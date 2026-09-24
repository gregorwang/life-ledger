import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const source = JSON.parse(
  await fs.readFile(
    path.join(projectRoot, "data", "playstation-library.json"),
    "utf8",
  ),
);
const outputPath = path.join(projectRoot, "seed", "collections.sql");
const timestamp = "2026-07-26T00:00:00.000Z";

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const statements = [
  "-- Generated from data/playstation-library.json. Re-running is idempotent.",
  "BEGIN TRANSACTION;",
];

for (const item of source.items) {
  statements.push(`
INSERT OR REPLACE INTO game_library_items (
  id, user_id, platform, source_id, title, play_time, progress,
  trophies_platinum, trophies_gold, trophies_silver, trophies_bronze,
  achievements_current, achievements_total, rating, review, tags_json,
  cover_url, source_cover_url, source_url, created_at, updated_at
) VALUES (
  ${sql(item.id)},
  'user_primary',
  ${sql(item.platform)},
  ${sql(item.sourceId)},
  ${sql(item.title)},
  ${sql(item.playTime)},
  ${sql(item.progress)},
  ${sql(item.trophies.platinum)},
  ${sql(item.trophies.gold)},
  ${sql(item.trophies.silver)},
  ${sql(item.trophies.bronze)},
  ${sql(item.achievementsCurrent)},
  ${sql(item.achievementsTotal)},
  ${sql(item.rating)},
  ${sql(item.review)},
  ${sql(JSON.stringify(item.tags))},
  ${sql(item.coverUrl)},
  ${sql(item.sourceCoverUrl)},
  ${sql(item.sourceUrl)},
  ${sql(timestamp)},
  ${sql(timestamp)}
);`.trim());
}

statements.push(`
INSERT OR REPLACE INTO collectible_items (
  id, user_id, category, title, franchise, character_name, manufacturer,
  status, cover_url, source_image_urls_json, model_kind, model_key,
  geometry_confidence, hidden_region_confidence, notes, created_at, updated_at
) VALUES (
  'collectible_sakura_angel_figure',
  'user_primary',
  'figure',
  '木之本樱 天使羽翼坐姿手办',
  '魔卡少女樱',
  '木之本樱',
  'BANPRESTO',
  'owned',
  '/media/covers/collectible/sakura-angel-front-wide-v1.webp',
  '["/media/covers/collectible/sakura-angel-front-wide-v1.webp","/media/covers/collectible/sakura-angel-front-close-v1.webp","/media/covers/collectible/sakura-angel-back-v1.webp"]',
  'procedural-threejs',
  'sakura-angel-figure-v2',
  0.76,
  0.46,
  '依据两张正面与一张背面实拍进行最高相似度程序化重建；侧面、手部遮挡区与羽裙内部属于有标注的结构推断。',
  ${sql(timestamp)},
  ${sql(timestamp)}
);`.trim());

statements.push("COMMIT;", "");
await fs.writeFile(outputPath, statements.join("\n\n"));
console.log(`Generated ${outputPath} with ${source.items.length} games and 1 collectible.`);
