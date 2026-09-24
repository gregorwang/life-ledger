// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = new URL("../../../migrations/", import.meta.url);

function openDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const names = (readdirSync(MIGRATIONS_DIR) as string[])
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of names) {
    database.exec(readFileSync(new URL(name, MIGRATIONS_DIR), "utf8"));
  }
  return database;
}

function insert(
  database: DatabaseSync,
  values: { id: string; kind: string; format?: string | null; rating?: number | null },
): void {
  database
    .prepare(`
      INSERT INTO shelf_items (
        id, user_id, kind, title, format, rating, created_at, updated_at
      ) VALUES (?, 'user_primary', ?, '示例', ?, ?, '2026-09-24T00:00:00Z', '2026-09-24T00:00:00Z')
    `)
    .run(values.id, values.kind, values.format ?? null, values.rating ?? null);
}

describe("shelf_items schema", () => {
  it("stores books and music with sensible defaults", () => {
    const database = openDatabase();
    insert(database, { id: "book_1", kind: "book", format: "paper", rating: 9.5 });
    insert(database, { id: "music_1", kind: "music", format: "album" });
    const rows = database
      .prepare("SELECT id, shelf_status, status, version_no, excerpts_json FROM shelf_items ORDER BY id")
      .all();
    expect(rows).toEqual([
      { id: "book_1", shelf_status: "done", status: "active", version_no: 1, excerpts_json: "[]" },
      { id: "music_1", shelf_status: "done", status: "active", version_no: 1, excerpts_json: "[]" },
    ]);
  });

  it("rejects formats that belong to the other kind and out-of-range ratings", () => {
    const database = openDatabase();
    expect(() => insert(database, { id: "x1", kind: "music", format: "paper" })).toThrow();
    expect(() => insert(database, { id: "x2", kind: "book", format: "album" })).toThrow();
    expect(() => insert(database, { id: "x3", kind: "movie" })).toThrow();
    expect(() => insert(database, { id: "x4", kind: "book", rating: 11 })).toThrow();
  });
});
