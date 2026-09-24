export interface ExportTable {
  name: string;
  rows: Array<Record<string, unknown>>;
}

export interface TarFile {
  name: string;
  body: Uint8Array;
}

const encoder = new TextEncoder();

export function encodeUtf8(value: string): Uint8Array {
  return encoder.encode(value);
}

export async function sha256HexBytes(value: Uint8Array): Promise<string> {
  const bytes = Uint8Array.from(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function gzipBytes(value: Uint8Array): Promise<Uint8Array> {
  const source = new Blob([Uint8Array.from(value)]).stream();
  const compressed = source.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

export function serializeJsonLines(tables: ExportTable[]): Uint8Array {
  const lines: string[] = [];
  for (const table of tables) {
    for (const row of table.rows) {
      lines.push(JSON.stringify({ table: table.name, data: row }));
    }
  }
  return encodeUtf8(lines.length === 0 ? "" : `${lines.join("\n")}\n`);
}

function sqlIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("SQL_EXPORT_NON_FINITE_NUMBER");
    }
    return String(value);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (value instanceof ArrayBuffer) {
    return `X'${[...new Uint8Array(value)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}'`;
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );
    return `X'${[...bytes]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}'`;
  }
  const text =
    typeof value === "string" ? value : JSON.stringify(value);
  return `'${text.replaceAll("'", "''")}'`;
}

export interface SchemaObject {
  type: string;
  name: string;
  sql: string;
}

function toSchemaObject(value: string | SchemaObject): SchemaObject {
  if (typeof value !== "string") {
    return value;
  }
  const match = /^\s*CREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|TRIGGER|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?["`[]?([^\s"`\](]+)/iu.exec(
    value,
  );
  return {
    type: match?.[1]?.toLowerCase() ?? "table",
    name: match?.[2] ?? "",
    sql: value,
  };
}

/** Parent tables first, so a restore never inserts a child before its parent. */
export function orderTablesByDependency(tables: SchemaObject[]): SchemaObject[] {
  const byName = new Map(tables.map((table) => [table.name.toLowerCase(), table]));
  const ordered: SchemaObject[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (table: SchemaObject) => {
    const key = table.name.toLowerCase();
    if (state.get(key)) {
      return;
    }
    state.set(key, "visiting");
    for (const match of table.sql.matchAll(/REFERENCES\s+["`[]?([A-Za-z0-9_]+)/giu)) {
      const parent = byName.get(match[1]!.toLowerCase());
      if (parent && parent !== table && state.get(parent.name.toLowerCase()) !== "visiting") {
        visit(parent);
      }
    }
    state.set(key, "done");
    ordered.push(table);
  };
  for (const table of tables) {
    visit(table);
  }
  return ordered;
}

/**
 * A SQL file that restores into an empty D1 database
 * (`wrangler d1 execute <db> --file`) or a plain SQLite file. D1 rejects
 * BEGIN/COMMIT, so foreign keys are deferred instead; tables are created and
 * filled before indexes and triggers so no trigger can veto historic rows.
 */
export function buildSqlDump(
  schema: Array<string | SchemaObject>,
  tables: ExportTable[],
): Uint8Array {
  const objects = schema.map(toSchemaObject);
  const tableObjects = orderTablesByDependency(
    objects.filter((object) => object.type === "table"),
  );
  const rank = new Map(
    tableObjects.map((object, index) => [object.name.toLowerCase(), index]),
  );
  const orderedData = [...tables].sort(
    (left, right) =>
      (rank.get(left.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(right.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER),
  );
  const lines = [
    "-- Life Ledger portable SQLite export",
    "-- Restore into an EMPTY database: wrangler d1 execute <db> --remote --file <this file>",
    "PRAGMA defer_foreign_keys = true;",
  ];
  for (const object of tableObjects) {
    lines.push(`${object.sql.replace(/;\s*$/, "")};`);
  }
  for (const table of orderedData) {
    for (const row of table.rows) {
      const entries = Object.entries(row);
      if (entries.length === 0) {
        continue;
      }
      const columns = entries
        .map(([column]) => sqlIdentifier(column))
        .join(", ");
      const values = entries
        .map(([, value]) => sqlLiteral(value))
        .join(", ");
      lines.push(
        `INSERT INTO ${sqlIdentifier(table.name)} (${columns}) VALUES (${values});`,
      );
    }
  }
  for (const object of objects) {
    if (object.type !== "table") {
      lines.push(`${object.sql.replace(/;\s*$/, "")};`);
    }
  }
  lines.push("");
  return encodeUtf8(lines.join("\n"));
}

function writeAscii(
  target: Uint8Array,
  offset: number,
  length: number,
  value: string,
): void {
  const bytes = encoder.encode(value);
  if (bytes.length > length) {
    throw new Error("TAR_FIELD_TOO_LONG");
  }
  target.set(bytes, offset);
}

function writeOctal(
  target: Uint8Array,
  offset: number,
  length: number,
  value: number,
): void {
  const octal = Math.max(0, Math.trunc(value))
    .toString(8)
    .padStart(length - 1, "0");
  writeAscii(target, offset, length, `${octal}\0`);
}

function tarHeader(file: TarFile, modifiedAt: Date): Uint8Array {
  const header = new Uint8Array(512);
  writeAscii(header, 0, 100, file.name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, file.body.byteLength);
  writeOctal(header, 136, 12, Math.floor(modifiedAt.getTime() / 1000));
  header.fill(0x20, 148, 156);
  writeAscii(header, 156, 1, "0");
  writeAscii(header, 257, 6, "ustar\0");
  writeAscii(header, 263, 2, "00");
  writeAscii(header, 265, 32, "life-ledger");
  writeAscii(header, 297, 32, "life-ledger");
  const checksum = header.reduce((total, byte) => total + byte, 0);
  const encodedChecksum = checksum.toString(8).padStart(6, "0");
  writeAscii(header, 148, 8, `${encodedChecksum}\0 `);
  return header;
}

function concatenate(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((size, part) => size + part.byteLength, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

export function createTar(files: TarFile[], modifiedAt: Date): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const file of files) {
    parts.push(tarHeader(file, modifiedAt), file.body);
    const remainder = file.body.byteLength % 512;
    if (remainder !== 0) {
      parts.push(new Uint8Array(512 - remainder));
    }
  }
  parts.push(new Uint8Array(1024));
  return concatenate(parts);
}

export async function createTarGzip(
  files: TarFile[],
  modifiedAt: Date,
): Promise<Uint8Array> {
  return gzipBytes(createTar(files, modifiedAt));
}
