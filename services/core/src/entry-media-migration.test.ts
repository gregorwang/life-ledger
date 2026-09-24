// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

const MIGRATIONS = [
  "0001_init.sql",
  "0002_privacy_invariants.sql",
  "0003_import_staging.sql",
  "0004_bootstrap_primary_user.sql",
  "0005_media_catalog_and_seasons.sql",
  "0006_game_library_and_collectibles.sql",
  "0007_media_image_uploads.sql",
  "0008_event_precision.sql",
  "0009_game_library_mutations.sql",
  "0010_drop_collectibles.sql",
  "0011_entry_media_and_follow_ups.sql",
  "0012_entry_media_upload_tickets.sql",
];

function openDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const name of MIGRATIONS) {
    database.exec(
      readFileSync(new URL(`../../../migrations/${name}`, import.meta.url), "utf8"),
    );
  }
  database.exec(`
    INSERT INTO entries (
      id, user_id, type, body_raw, body_plain, occurred_at,
      occurred_timezone, source_channel, created_at, updated_at
    ) VALUES (
      'ent_1', 'user_primary', 'thought', '今天拍了几张照片', '今天拍了几张照片',
      '2026-09-24T01:00:00.000Z', 'Asia/Tokyo', 'web',
      '2026-09-24T01:00:00.000Z', '2026-09-24T01:00:00.000Z'
    );
  `);
  return database;
}

function insertMedia(
  database: DatabaseSync,
  id: string,
  mimeType = "image/jpeg",
  kind = "image",
): void {
  database
    .prepare(`
      INSERT INTO entry_media (
        id, user_id, kind, object_key, mime_type, size_bytes, created_at
      ) VALUES (?, 'user_primary', ?, ?, ?, 1024, '2026-09-24T01:00:00.000Z')
    `)
    .run(id, kind, `entry-media/${id}.bin`, mimeType);
}

describe("entry media and follow-up schema", () => {
  it("drops the retired collectible table", () => {
    const database = openDatabase();
    try {
      const table = database
        .prepare("SELECT name FROM sqlite_master WHERE name = 'collectible_items'")
        .get();
      expect(table).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it("attaches unattached media once and hydrates by entry id list", () => {
    const database = openDatabase();
    try {
      insertMedia(database, "media_a");
      insertMedia(database, "media_b", "video/mp4", "video");
      const attach = database.prepare(`
        UPDATE entry_media
        SET entry_id = ?, position = ?, attached_at = ?
        WHERE user_id = 'user_primary' AND id = ? AND entry_id IS NULL
      `);
      attach.run("ent_1", 1, "2026-09-24T01:01:00.000Z", "media_a");
      attach.run("ent_1", 0, "2026-09-24T01:01:00.000Z", "media_b");
      // A second attach of the same media must not steal it.
      expect(
        Number(attach.run("ent_other", 0, "2026-09-24T01:02:00.000Z", "media_a").changes),
      ).toBe(0);

      const rows = database
        .prepare(`
          SELECT id, kind FROM entry_media
          WHERE user_id = 'user_primary'
            AND entry_id IN (SELECT value FROM json_each(?))
          ORDER BY entry_id, position, created_at
        `)
        .all(JSON.stringify(["ent_1", "ent_missing"]));
      expect(rows).toEqual([
        { id: "media_b", kind: "video" },
        { id: "media_a", kind: "image" },
      ]);
    } finally {
      database.close();
    }
  });

  it("rejects unsupported media types", () => {
    const database = openDatabase();
    try {
      expect(() => insertMedia(database, "media_bad", "text/html")).toThrow();
    } finally {
      database.close();
    }
  });

  it("cascades media and follow-ups when an entry is purged", () => {
    const database = openDatabase();
    try {
      insertMedia(database, "media_a");
      database.exec(`
        UPDATE entry_media SET entry_id = 'ent_1' WHERE id = 'media_a';
        INSERT INTO entry_follow_ups (
          id, user_id, entry_id, body_raw, source_channel, created_at
        ) VALUES (
          'followup_1', 'user_primary', 'ent_1', '隔天补一句', 'web',
          '2026-09-25T01:00:00.000Z'
        );
      `);
      database.exec("DELETE FROM entries WHERE id = 'ent_1'");
      const counts = database
        .prepare(`
          SELECT
            (SELECT count(*) FROM entry_media) AS media,
            (SELECT count(*) FROM entry_follow_ups) AS followUps
        `)
        .get();
      expect(counts).toEqual({ media: 0, followUps: 0 });
    } finally {
      database.close();
    }
  });
});
