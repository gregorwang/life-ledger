import { describe, expect, it } from "vitest";

import {
  buildSqlDump,
  createTarGzip,
  gzipBytes,
  serializeJsonLines,
  sha256HexBytes,
} from "./export-utils";

describe("portable export utilities", () => {
  it("serializes table provenance into deterministic JSONL", () => {
    const body = serializeJsonLines([
      {
        name: "entries",
        rows: [{ id: "entry_1", body_raw: "艾米莉亚" }],
      },
    ]);

    expect(new TextDecoder().decode(body)).toBe(
      '{"table":"entries","data":{"id":"entry_1","body_raw":"艾米莉亚"}}\n',
    );
  });

  it("escapes SQL values without losing the original text", () => {
    const body = buildSqlDump(
      ["CREATE TABLE entries (id TEXT PRIMARY KEY, body_raw TEXT NOT NULL)"],
      [
        {
          name: "entries",
          rows: [{ id: "entry_1", body_raw: "don't rewrite 原文" }],
        },
      ],
    );
    const sql = new TextDecoder().decode(body);

    expect(sql).toContain(
      `INSERT INTO "entries" ("id", "body_raw") VALUES ('entry_1', 'don''t rewrite 原文');`,
    );
    expect(sql).toContain("PRAGMA defer_foreign_keys = true;");
    expect(sql).not.toContain("BEGIN TRANSACTION;");
  });

  it("creates gzip payloads and stable SHA-256 checksums", async () => {
    const source = new TextEncoder().encode("life-ledger");
    const compressed = await gzipBytes(source);

    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);
    await expect(sha256HexBytes(source)).resolves.toBe(
      "9bc544c632f234a94c54ac822168daa9dd32b26a2edbee2b4ee626f8970c54b8",
    );
  });

  it("packs monthly SQL, JSONL and manifest into a standard tar.gz", async () => {
    const archive = await createTarGzip(
      [
        { name: "data.sql", body: new TextEncoder().encode("SELECT 1;") },
        { name: "manifest.json", body: new TextEncoder().encode("{}") },
      ],
      new Date("2026-07-26T00:00:00.000Z"),
    );

    expect(archive[0]).toBe(0x1f);
    expect(archive[1]).toBe(0x8b);
    expect(archive.byteLength).toBeGreaterThan(100);
  });
});
