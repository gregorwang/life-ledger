// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

function readProjectFile(relativePath: string): string {
  return readFileSync(
    new URL(`../../../${relativePath}`, import.meta.url),
    "utf8",
  );
}

describe("media upload migration", () => {
  it("adds content-addressed assets and per-request idempotency metadata", () => {
    const database = new DatabaseSync(":memory:");
    try {
      database.exec("PRAGMA foreign_keys = ON");
      for (const migration of [
        "migrations/0001_init.sql",
        "migrations/0002_privacy_invariants.sql",
        "migrations/0003_import_staging.sql",
        "migrations/0004_bootstrap_primary_user.sql",
        "migrations/0005_media_catalog_and_seasons.sql",
        "migrations/0006_game_library_and_collectibles.sql",
        "migrations/0007_media_image_uploads.sql",
      ]) {
        database.exec(readProjectFile(migration));
      }

      const tables = database
        .prepare(`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table' AND name IN (
            'media_assets',
            'media_upload_requests'
          )
          ORDER BY name
        `)
        .all() as Array<{ name: string }>;
      expect(tables.map((row) => row.name)).toEqual([
        "media_assets",
        "media_upload_requests",
      ]);
      const violations = database
        .prepare("SELECT count(*) AS total FROM pragma_foreign_key_check")
        .get() as { total: number };
      expect(violations.total).toBe(0);
    } finally {
      database.close();
    }
  });
});
