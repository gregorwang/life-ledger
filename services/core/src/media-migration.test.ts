// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

function readProjectFile(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

const migrations = [
  "migrations/0001_init.sql",
  "migrations/0002_privacy_invariants.sql",
  "migrations/0003_import_staging.sql",
  "migrations/0004_bootstrap_primary_user.sql",
  "migrations/0005_media_catalog_and_seasons.sql",
].map(readProjectFile);

function openDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  return database;
}

describe("media catalog migration", () => {
  it("preserves parent and child history while adding screen media", () => {
    const database = openDatabase();
    try {
      for (const migration of migrations.slice(0, 4)) {
        database.exec(migration);
      }
      database.exec(`
        INSERT INTO media_works (
          id, user_id, media_type, canonical_title, normalized_title,
          created_at, updated_at
        ) VALUES (
          'work_preserve', 'user_primary', 'anime', '保留测试', '保留测试',
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        );
        INSERT INTO entries (
          id, user_id, type, body_raw, body_plain, occurred_at,
          occurred_timezone, source_channel, created_at, updated_at
        ) VALUES (
          'entry_preserve', 'user_primary', 'anime', '原文', '原文',
          '2026-01-01T00:00:00.000Z', 'Asia/Tokyo', 'web',
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        );
        INSERT INTO media_logs (
          id, entry_id, media_work_id, rating_scope,
          season_label, episode_label, score_100
        ) VALUES (
          'log_preserve', 'entry_preserve', 'work_preserve',
          'episode', '1', '2', 88
        );
        INSERT INTO entry_revisions (
          id, entry_id, version_no, snapshot_json, actor_type, created_at
        ) VALUES (
          'revision_preserve', 'entry_preserve', 1, '{}', 'user',
          '2026-01-01T00:00:00.000Z'
        );
      `);

      database.exec(migrations[4]!);

      for (const [table, id] of [
        ["entries", "entry_preserve"],
        ["media_works", "work_preserve"],
        ["media_logs", "log_preserve"],
        ["entry_revisions", "revision_preserve"],
      ] as const) {
        const row = database
          .prepare(`SELECT count(*) AS total FROM ${table} WHERE id = ?`)
          .get(id) as { total: number };
        expect(row.total).toBe(1);
      }
      database.exec(`
        INSERT INTO media_works (
          id, user_id, media_type, media_kind, canonical_title,
          normalized_title, created_at, updated_at
        ) VALUES (
          'screen_work', 'user_primary', 'screen', 'movie', '影视测试',
          '影视测试', '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z'
        );
        INSERT INTO entries (
          id, user_id, type, body_raw, body_plain, occurred_at,
          occurred_timezone, source_channel, created_at, updated_at
        ) VALUES (
          'screen_entry', 'user_primary', 'screen', '影视日志', '影视日志',
          '2026-01-01T00:00:00.000Z', 'Asia/Tokyo', 'web',
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        );
        INSERT INTO media_seasons (
          id, media_work_id, label, normalized_label, season_number,
          created_at, updated_at
        ) VALUES
          (
            'preserve_season', 'work_preserve', '第1季', '第1季', 1,
            '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
          ),
          (
            'screen_season', 'screen_work', '第1季', '第1季', 1,
            '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
          );
      `);
      expect(() =>
        database.exec(`
          INSERT INTO media_logs (
            id, entry_id, media_work_id, season_id, rating_scope,
            season_label
          ) VALUES (
            'cross_work_insert', 'screen_entry', 'screen_work',
            'preserve_season', 'season', '第1季'
          );
        `),
      ).toThrow(/media log season does not belong to media work/);

      database.exec(`
        INSERT INTO media_logs (
          id, entry_id, media_work_id, season_id, rating_scope,
          season_label
        ) VALUES (
          'screen_log', 'screen_entry', 'screen_work',
          'screen_season', 'season', '第1季'
        );
      `);
      expect(() =>
        database.exec(`
          UPDATE media_logs
          SET season_id = 'preserve_season'
          WHERE id = 'screen_log';
        `),
      ).toThrow(/media log season does not belong to media work/);

      const violations = database
        .prepare("SELECT count(*) AS total FROM pragma_foreign_key_check")
        .get() as { total: number };
      expect(violations.total).toBe(0);
    } finally {
      database.close();
    }
  });

  it("seeds 27 unique unscored works idempotently", () => {
    const database = openDatabase();
    try {
      for (const migration of migrations) {
        database.exec(migration);
      }
      const seed = readProjectFile("scripts/seed/owner-anime-catalog.sql");
      database.exec(seed);
      database.exec(seed);

      const works = database
        .prepare(`
          SELECT
            count(*) AS total,
            count(DISTINCT normalized_title) AS unique_titles,
            sum(overall_score_100 IS NOT NULL) AS scored,
            sum(watch_status = 'completed') AS completed
          FROM media_works
          WHERE json_extract(external_refs_json, '$.seed') =
            'owner_anime_catalog_v1'
        `)
        .get() as {
          total: number;
          unique_titles: number;
          scored: number;
          completed: number;
        };
      expect(works).toEqual({
        total: 27,
        unique_titles: 27,
        scored: 0,
        completed: 27,
      });

      const seasons = database
        .prepare(`
          SELECT
            count(*) AS total,
            sum(score_100 IS NOT NULL OR watch_status IS NOT NULL) AS asserted
          FROM media_seasons
          WHERE id LIKE 'season_seed_%'
        `)
        .get() as { total: number; asserted: number };
      expect(seasons).toEqual({ total: 23, asserted: 0 });
    } finally {
      database.close();
    }
  });

  it("keeps development seed watch status aligned with legacy status", () => {
    const database = openDatabase();
    try {
      for (const migration of migrations) {
        database.exec(migration);
      }
      database.exec(readProjectFile("seed/dev.sql"));

      const statuses = database
        .prepare(`
          SELECT
            count(*) AS total,
            sum(watch_status = status) AS aligned,
            sum(watch_status IS NULL) AS missing
          FROM media_works
          WHERE id IN (
            'work_rezero',
            'work_bocchi',
            'work_chiramune',
            'work_frieren',
            'work_euphonium'
          )
        `)
        .get() as { total: number; aligned: number; missing: number };
      expect(statuses).toEqual({ total: 5, aligned: 5, missing: 0 });
    } finally {
      database.close();
    }
  });
});
