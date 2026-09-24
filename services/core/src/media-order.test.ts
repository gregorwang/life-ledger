// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  MEDIA_WORK_AGGREGATE_SELECT,
  mediaWorkOrderBy,
} from "./media-order";

function readProjectFile(relativePath: string): string {
  return readFileSync(
    new URL(`../../../${relativePath}`, import.meta.url),
    "utf8",
  );
}

const migrations = [
  "migrations/0001_init.sql",
  "migrations/0002_privacy_invariants.sql",
  "migrations/0003_import_staging.sql",
  "migrations/0004_bootstrap_primary_user.sql",
  "migrations/0005_media_catalog_and_seasons.sql",
  "migrations/0006_game_library_and_collectibles.sql",
  "migrations/0007_media_image_uploads.sql",
  "migrations/0008_event_precision.sql",
  "migrations/0009_game_library_mutations.sql",
].map(readProjectFile);

function openMigratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of migrations) {
    database.exec(migration);
  }
  return database;
}

describe("media activity aggregation", () => {
  it("migrates legacy Tokyo sorting anchors to month and year precision", () => {
    const database = new DatabaseSync(":memory:");
    database.exec("PRAGMA foreign_keys = ON");
    try {
      for (const migration of migrations.slice(0, 7)) {
        database.exec(migration);
      }
      database.exec(`
        INSERT INTO entries (
          id, user_id, type, body_raw, body_plain, occurred_at,
          occurred_timezone, temporal_uncertain, source_channel,
          created_at, updated_at
        ) VALUES
          (
            'legacy-month', 'user_primary', 'anime', '约2026年2月',
            '约2026年2月', '2026-02-14T15:00:00.000Z', 'Asia/Tokyo', 1,
            'import', '2026-07-27T00:00:00.000Z',
            '2026-07-27T00:00:00.000Z'
          ),
          (
            'legacy-year', 'user_primary', 'anime', '2024年',
            '2024年', '2024-06-30T15:00:00.000Z', 'Asia/Tokyo', 1,
            'import', '2026-07-27T00:00:00.000Z',
            '2026-07-27T00:00:00.000Z'
          );
      `);
      database.exec(migrations[7]!);
      const rows = database
        .prepare(
          "SELECT id, date_precision FROM entries ORDER BY id",
        )
        .all() as Array<{ id: string; date_precision: string }>;
      expect(rows).toEqual([
        { id: "legacy-month", date_precision: "month" },
        { id: "legacy-year", date_precision: "year" },
      ]);
    } finally {
      database.close();
    }
  });

  it("orders by active occurred_at, keeps nulls last, and ignores soft deletes", () => {
    const database = openMigratedDatabase();
    try {
      const works = [
        ["haihara", "灰原君的青春二周目", "2026-07-27T00:00:00.000Z"],
        ["hyouka", "冰菓", "2026-07-05T01:00:00.000Z"],
        ["seirei", "精灵幻想记 第1季", "2026-07-01T01:00:00.000Z"],
        ["kokoro", "恋爱随意链接", "2026-06-30T01:00:00.000Z"],
        ["madoka", "魔法少女小圆", "2026-07-27T03:00:00.000Z"],
        ["deleted-only", "沙罗周期", "2026-07-28T00:00:00.000Z"],
        ["no-date", "未记录作品", "2026-07-28T00:00:00.000Z"],
      ] as const;
      const insertWork = database.prepare(`
        INSERT INTO media_works (
          id, user_id, media_type, canonical_title, normalized_title,
          created_at, updated_at
        ) VALUES (?, 'user_primary', 'anime', ?, ?, '2026-01-01T00:00:00.000Z', ?)
      `);
      for (const [id, title, updatedAt] of works) {
        insertWork.run(id, title, title, updatedAt);
      }

      const entries = [
        ["haihara", "2026-04-02T16:28:00.000Z", "active"],
        ["hyouka", "2026-07-04T15:00:00.000Z", "active"],
        ["seirei", "2026-06-30T15:00:00.000Z", "active"],
        ["kokoro", "2026-06-29T15:00:00.000Z", "active"],
        ["madoka", "2026-02-14T15:00:00.000Z", "active"],
        ["deleted-only", "2026-07-27T15:00:00.000Z", "deleted"],
      ] as const;
      const insertEntry = database.prepare(`
        INSERT INTO entries (
          id, user_id, type, body_raw, body_plain, occurred_at,
          occurred_timezone, status, source_channel, created_at, updated_at
        ) VALUES (
          ?, 'user_primary', 'anime', '原始中文日志', '原始中文日志', ?,
          'Asia/Tokyo', ?, 'import', '2026-07-27T00:00:00.000Z',
          '2026-07-27T00:00:00.000Z'
        )
      `);
      const insertLog = database.prepare(`
        INSERT INTO media_logs (id, entry_id, media_work_id)
        VALUES (?, ?, ?)
      `);
      for (const [workId, occurredAt, status] of entries) {
        const entryId = `entry-${workId}`;
        insertEntry.run(entryId, occurredAt, status);
        insertLog.run(`log-${workId}`, entryId, workId);
      }
      // A global anime entry that is not linked to a work belongs to
      // “今日与时间线” only and must not affect anime-library ordering.
      insertEntry.run(
        "entry-global-timeline-only",
        "2026-12-31T15:00:00.000Z",
        "active",
      );
      database
        .prepare(
          "UPDATE entries SET date_precision = 'month' WHERE id = 'entry-madoka'",
        )
        .run();

      const rows = database
        .prepare(`
          ${MEDIA_WORK_AGGREGATE_SELECT}
          WHERE mw.user_id = ? AND mw.media_type = 'anime'
          GROUP BY mw.id
          ORDER BY ${mediaWorkOrderBy("recent_desc")}
        `)
        .all("user_primary") as Array<{
          id: string;
          log_count: number;
          last_logged_at: string | null;
          last_logged_date_precision: string | null;
        }>;

      expect(rows.map((row) => row.id)).toEqual([
        "hyouka",
        "seirei",
        "kokoro",
        "haihara",
        "madoka",
        "no-date",
        "deleted-only",
      ]);
      expect(
        rows.find((row) => row.id === "deleted-only"),
      ).toMatchObject({
        log_count: 0,
        last_logged_at: null,
        last_logged_date_precision: null,
      });
      expect(rows.find((row) => row.id === "madoka")).toMatchObject({
        last_logged_at: "2026-02-14T15:00:00.000Z",
        last_logged_date_precision: "month",
      });
    } finally {
      database.close();
    }
  });

  it("stores event precision and supports game-library soft delete columns", () => {
    const database = openMigratedDatabase();
    try {
      database.exec(`
        INSERT INTO entries (
          id, user_id, type, body_raw, body_plain, occurred_at,
          occurred_timezone, source_channel, date_precision,
          created_at, updated_at
        ) VALUES (
          'madoka-entry', 'user_primary', 'anime', '约2026年2月看完',
          '约2026年2月看完', '2026-02-14T15:00:00.000Z', 'Asia/Tokyo',
          'import', 'month', '2026-07-27T00:00:00.000Z',
          '2026-07-27T00:00:00.000Z'
        );
        INSERT INTO game_library_items (
          id, user_id, platform, title, play_time, progress, rating,
          cover_url, source_url, created_at, updated_at
        ) VALUES (
          'game-test', 'user_primary', 'PS5', '测试游戏', '10h', 20, 8,
          '/cover.webp', 'https://example.com/game',
          '2026-07-28T00:00:00.000Z', '2026-07-28T00:00:00.000Z'
        );
        UPDATE game_library_items
        SET status = 'deleted', version_no = version_no + 1,
            deleted_at = '2026-07-28T01:00:00.000Z'
        WHERE id = 'game-test' AND version_no = 1;
      `);
      const entry = database
        .prepare("SELECT date_precision FROM entries WHERE id = 'madoka-entry'")
        .get() as { date_precision: string };
      const game = database
        .prepare(
          "SELECT status, version_no, deleted_at FROM game_library_items WHERE id = 'game-test'",
        )
        .get() as {
        status: string;
        version_no: number;
        deleted_at: string | null;
      };
      expect(entry.date_precision).toBe("month");
      expect(game).toEqual({
        status: "deleted",
        version_no: 2,
        deleted_at: "2026-07-28T01:00:00.000Z",
      });
    } finally {
      database.close();
    }
  });
});
