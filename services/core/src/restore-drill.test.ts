// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { readdirSync, readFileSync } from "node:fs";
// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import { buildSqlDump, type ExportTable, type SchemaObject } from "./export-utils";

const MIGRATIONS_DIR = new URL("../../../migrations/", import.meta.url);
const NOW = "2026-09-24T01:00:00.000Z";

function migratedDatabase(): DatabaseSync {
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

/** Mirrors collectFullExport: every table plus its schema objects. */
function snapshot(database: DatabaseSync): { schema: SchemaObject[]; tables: ExportTable[] } {
  const schema = database
    .prepare(`
      SELECT type, name, sql FROM sqlite_master
      WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
      ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name
    `)
    .all() as SchemaObject[];
  const tables = schema
    .filter((object) => object.type === "table")
    .map((object) => ({
      name: object.name,
      rows: database.prepare(`SELECT * FROM "${object.name}" ORDER BY rowid`).all() as Array<
        Record<string, unknown>
      >,
    }));
  return { schema, tables };
}

function seed(database: DatabaseSync): void {
  database.exec(`
    INSERT INTO entries (
      id, user_id, type, body_raw, body_plain, occurred_at, occurred_timezone,
      source_channel, tags_json, created_at, updated_at
    ) VALUES
      ('ent_1', 'user_primary', 'mood', '下雨天 ☕ it''s fine', '下雨天', '${NOW}', 'Asia/Tokyo', 'web', '["mood:😌"]', '${NOW}', '${NOW}'),
      ('ent_2', 'user_primary', 'thought', '第二条', '第二条', '${NOW}', 'Asia/Tokyo', 'mcp', '[]', '${NOW}', '${NOW}');
    INSERT INTO entry_revisions (id, entry_id, version_no, snapshot_json, actor_type, created_at)
    VALUES ('rev_1', 'ent_1', 1, '{}', 'user', '${NOW}');
    INSERT INTO entry_media (id, user_id, entry_id, position, kind, object_key, mime_type, size_bytes, created_at, attached_at)
    VALUES ('media_1', 'user_primary', 'ent_1', 0, 'image', 'entry-media/0f8fad5b-d9cb-469f-a165-70867728950e.jpg', 'image/jpeg', 1024, '${NOW}', '${NOW}');
    INSERT INTO entry_follow_ups (id, user_id, entry_id, body_raw, source_channel, created_at)
    VALUES ('fu_1', 'user_primary', 'ent_1', '后来雨停了', 'web', '${NOW}');
    INSERT INTO shelf_items (id, user_id, kind, title, creator, excerpts_json, created_at, updated_at)
    VALUES ('book_1', 'user_primary', 'book', '三体', '刘慈欣', '[{"text":"弱小和无知","location":null,"note":null}]', '${NOW}', '${NOW}');
  `);
}

describe("backup restore drill", () => {
  it("restores every table row-for-row into an empty database", () => {
    const source = migratedDatabase();
    seed(source);
    const before = snapshot(source);
    const sql = new TextDecoder().decode(buildSqlDump(before.schema, before.tables));

    expect(sql).not.toMatch(/BEGIN TRANSACTION|COMMIT;|foreign_keys\s*=\s*OFF/iu);

    const target = new DatabaseSync(":memory:");
    target.exec("PRAGMA foreign_keys = ON");
    // D1 runs an imported file as one transaction; do the same here.
    target.exec(`BEGIN;\n${sql}\nCOMMIT;`);
    const after = snapshot(target);

    expect(after.schema.map((object) => `${object.type}:${object.name}`).sort()).toEqual(
      before.schema.map((object) => `${object.type}:${object.name}`).sort(),
    );
    for (const table of before.tables) {
      expect(after.tables.find((candidate) => candidate.name === table.name)?.rows, table.name).toEqual(
        table.rows,
      );
    }
    expect(target.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("puts parent tables before the tables that reference them", () => {
    const sql = new TextDecoder().decode(
      buildSqlDump(
        [
          "CREATE TABLE child (id TEXT, parent_id TEXT REFERENCES parent(id))",
          "CREATE TABLE parent (id TEXT PRIMARY KEY)",
          "CREATE INDEX ix_child ON child(parent_id)",
        ],
        [
          { name: "child", rows: [{ id: "c", parent_id: "p" }] },
          { name: "parent", rows: [{ id: "p" }] },
        ],
      ),
    );
    expect(sql.indexOf("CREATE TABLE parent")).toBeLessThan(sql.indexOf("CREATE TABLE child"));
    expect(sql.indexOf('INSERT INTO "parent"')).toBeLessThan(sql.indexOf('INSERT INTO "child"'));
    expect(sql.indexOf("CREATE INDEX")).toBeGreaterThan(sql.indexOf('INSERT INTO "child"'));
  });
});
