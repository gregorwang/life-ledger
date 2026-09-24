// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { readFileSync } from "node:fs";
// @ts-expect-error Node 24 test runtime builtin; production Worker types intentionally exclude Node globals.
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it, vi } from "vitest";

import type { UploadMediaImageInput } from "@life-ledger/contracts";

import { uploadMediaImageToR2 } from "./media-upload";

const ONE_PIXEL_WEBP =
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==";

function readProjectFile(relativePath: string): string {
  return readFileSync(
    new URL(`../../../${relativePath}`, import.meta.url),
    "utf8",
  );
}

class SqliteD1Statement {
  #values: unknown[] = [];

  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): this {
    this.#values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const row = this.database.prepare(this.sql).get(...this.#values);
    return (row as T | undefined) ?? null;
  }

  async run(): Promise<D1Result<unknown>> {
    const result = this.database.prepare(this.sql).run(...this.#values);
    return {
      success: true,
      results: [],
      meta: {
        changed_db: true,
        changes: Number(result.changes),
        duration: 0,
        last_row_id: Number(result.lastInsertRowid),
        rows_read: 0,
        rows_written: Number(result.changes),
        size_after: 0,
      },
    };
  }
}

function createDatabase(): {
  sqlite: DatabaseSync;
  d1: D1Database;
} {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of [
    "migrations/0001_init.sql",
    "migrations/0002_privacy_invariants.sql",
    "migrations/0003_import_staging.sql",
    "migrations/0004_bootstrap_primary_user.sql",
    "migrations/0005_media_catalog_and_seasons.sql",
    "migrations/0006_game_library_and_collectibles.sql",
    "migrations/0007_media_image_uploads.sql",
  ]) {
    sqlite.exec(readProjectFile(migration));
  }
  sqlite.exec(`
    INSERT INTO media_works (
      id, user_id, media_type, canonical_title, normalized_title,
      created_at, updated_at
    )
    VALUES (
      'work_upload_test', 'user_primary', 'anime',
      '上传测试', '上传测试',
      '2026-07-26T00:00:00.000Z', '2026-07-26T00:00:00.000Z'
    );
  `);
  const d1 = {
    prepare(sql: string) {
      return new SqliteD1Statement(sqlite, sql);
    },
  } as unknown as D1Database;
  return { sqlite, d1 };
}

interface StoredObject {
  bytes: Uint8Array;
  httpMetadata: R2HTTPMetadata;
  customMetadata: Record<string, string>;
  etag: string;
}

function r2Object(key: string, object: StoredObject): R2Object {
  return {
    key,
    version: "test-version",
    size: object.bytes.byteLength,
    etag: object.etag,
    httpEtag: `"${object.etag}"`,
    checksums: {},
    uploaded: new Date("2026-07-26T00:00:00.000Z"),
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata,
    writeHttpMetadata(headers: Headers) {
      if (object.httpMetadata.contentType) {
        headers.set("Content-Type", object.httpMetadata.contentType);
      }
    },
  } as unknown as R2Object;
}

function createBucket() {
  const objects = new Map<string, StoredObject>();
  const put = vi.fn(
    async (
      key: string,
      value: Uint8Array,
      options: R2PutOptions,
    ): Promise<R2Object> => {
      const bytes = Uint8Array.from(value);
      const stored = {
        bytes,
        httpMetadata: options.httpMetadata as R2HTTPMetadata,
        customMetadata: options.customMetadata ?? {},
        etag: `etag-${objects.size + 1}`,
      };
      objects.set(key, stored);
      return r2Object(key, stored);
    },
  );
  const bucket = {
    put,
    head: vi.fn(async (key: string) => {
      const object = objects.get(key);
      return object ? r2Object(key, object) : null;
    }),
  } as unknown as R2Bucket;
  return { bucket, objects, put };
}

function validInput(
  overrides: Partial<UploadMediaImageInput> = {},
): UploadMediaImageInput {
  return {
    fileName: "cover.webp",
    mimeType: "image/webp",
    base64Data: ONE_PIXEL_WEBP,
    purpose: "media_cover",
    mediaWorkId: "work_upload_test",
    idempotencyKey: "upload-test-001",
    ...overrides,
  };
}

describe("R2 media upload orchestration", () => {
  it("uploads a valid WebP with metadata and persists a Base64-free audit", async () => {
    const { sqlite, d1 } = createDatabase();
    const { bucket, objects, put } = createBucket();
    try {
      const result = await uploadMediaImageToR2(
        {
          DB: d1,
          MEDIA: bucket,
          MEDIA_PUBLIC_BASE_URL:
            "https://ledger.example.test/public-media",
        },
        validInput(),
        "user_primary",
      );

      expect(result).toMatchObject({
        publicUrl: expect.stringMatching(/^https:\/\/ledger\.example\.test\//),
        mimeType: "image/webp",
        sizeBytes: 46,
        width: 1,
        height: 1,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        etag: "etag-1",
      });
      expect(result.objectKey).toBe(
        `media-covers/work_upload_test/${result.sha256}.webp`,
      );
      expect(put).toHaveBeenCalledOnce();
      const stored = objects.get(result.objectKey)!;
      expect(stored.httpMetadata).toMatchObject({
        contentType: "image/webp",
        cacheControl: "public, max-age=31536000, immutable",
        contentDisposition: "inline",
      });
      expect(stored.customMetadata).toMatchObject({
        sha256: result.sha256,
        width: "1",
        height: "1",
        source: "mcp",
      });

      const persisted = sqlite
        .prepare(`
          SELECT
            ma.object_key,
            ma.public_url,
            ma.sha256,
            ma.mime_type,
            ma.size_bytes,
            ma.width,
            ma.height,
            mur.purpose,
            mur.media_work_id,
            mur.idempotency_key,
            mur.source_channel
          FROM media_assets ma
          INNER JOIN media_upload_requests mur ON mur.asset_id = ma.id
        `)
        .get();
      expect(persisted).toMatchObject({
        object_key: result.objectKey,
        public_url: result.publicUrl,
        sha256: result.sha256,
        mime_type: "image/webp",
        size_bytes: 46,
        width: 1,
        height: 1,
        purpose: "media_cover",
        media_work_id: "work_upload_test",
        idempotency_key: "upload-test-001",
        source_channel: "mcp",
      });
      const audit = sqlite
        .prepare("SELECT detail, metadata_json FROM audit_events WHERE target_type = 'media_asset'")
        .get() as { detail: string; metadata_json: string };
      expect(`${audit.detail}${audit.metadata_json}`).not.toContain(
        ONE_PIXEL_WEBP,
      );
    } finally {
      sqlite.close();
    }
  });

  it("returns the same result for an idempotent retry without another R2 put", async () => {
    const { sqlite, d1 } = createDatabase();
    const { bucket, put } = createBucket();
    try {
      const env = {
        DB: d1,
        MEDIA: bucket,
        MEDIA_PUBLIC_BASE_URL:
          "https://ledger.example.test/public-media",
      };
      const first = await uploadMediaImageToR2(
        env,
        validInput(),
        "user_primary",
      );
      const second = await uploadMediaImageToR2(
        env,
        validInput(),
        "user_primary",
      );
      expect(second).toEqual(first);
      expect(put).toHaveBeenCalledOnce();
    } finally {
      sqlite.close();
    }
  });

  it("deduplicates identical content across different idempotency keys", async () => {
    const { sqlite, d1 } = createDatabase();
    const { bucket, put } = createBucket();
    try {
      const env = {
        DB: d1,
        MEDIA: bucket,
        MEDIA_PUBLIC_BASE_URL:
          "https://ledger.example.test/public-media",
      };
      const first = await uploadMediaImageToR2(
        env,
        validInput(),
        "user_primary",
      );
      const second = await uploadMediaImageToR2(
        env,
        validInput({ idempotencyKey: "upload-test-002" }),
        "user_primary",
      );
      expect(second).toEqual(first);
      expect(put).toHaveBeenCalledOnce();
      expect(
        (
          sqlite
            .prepare("SELECT count(*) AS total FROM media_assets")
            .get() as { total: number }
        ).total,
      ).toBe(1);
      expect(
        (
          sqlite
            .prepare("SELECT count(*) AS total FROM media_upload_requests")
            .get() as { total: number }
        ).total,
      ).toBe(2);
    } finally {
      sqlite.close();
    }
  });

  it("rejects reuse of an idempotency key for a different request", async () => {
    const { sqlite, d1 } = createDatabase();
    const { bucket } = createBucket();
    try {
      const env = {
        DB: d1,
        MEDIA: bucket,
        MEDIA_PUBLIC_BASE_URL:
          "https://ledger.example.test/public-media",
      };
      await uploadMediaImageToR2(env, validInput(), "user_primary");
      await expect(
        uploadMediaImageToR2(
          env,
          validInput({ fileName: "different.webp" }),
          "user_primary",
        ),
      ).rejects.toThrow(/IDEMPOTENCY_CONFLICT/);
    } finally {
      sqlite.close();
    }
  });

  it("fails clearly when R2 or the public base URL is missing", async () => {
    const { sqlite, d1 } = createDatabase();
    const { bucket } = createBucket();
    try {
      await expect(
        uploadMediaImageToR2(
          {
            DB: d1,
            MEDIA_PUBLIC_BASE_URL:
              "https://ledger.example.test/public-media",
          },
          validInput(),
          "user_primary",
        ),
      ).rejects.toThrow(/MEDIA_BUCKET_NOT_CONFIGURED/);
      await expect(
        uploadMediaImageToR2(
          { DB: d1, MEDIA: bucket },
          validInput(),
          "user_primary",
        ),
      ).rejects.toThrow(/MEDIA_PUBLIC_BASE_URL_NOT_CONFIGURED/);
    } finally {
      sqlite.close();
    }
  });
});
