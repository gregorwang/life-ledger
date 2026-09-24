import { describe, expect, it, vi } from "vitest";

import type { CoreBinding } from "@life-ledger/contracts";

import { SESSION_COOKIE_NAME } from "./auth";
import { app, type Env } from "./index";

const TEST_PASSWORD = "integration-test-password";
const TEST_SESSION_SECRET =
  "integration-test-session-key-material-longer-than-32-bytes";

function createEnvironment(rateLimitSuccess = true): Env {
  return {
    CORE: {
      getPublicAnime: vi.fn(async () => ({
        schemaVersion: "1.0",
        generatedAt: "2033-05-18T03:33:20.000Z",
        revision: "test-revision",
        items: [],
      })),
      getPublicTimeline: vi.fn(async () => ({
        schemaVersion: "1.0",
        generatedAt: "2033-05-18T03:33:20.000Z",
        revision: "test-revision",
        items: [],
      })),
    } as unknown as CoreBinding,
    ASSETS: {
      fetch: vi.fn(async () => new Response("private application")),
    } as unknown as Fetcher,
    MEDIA: {
      get: vi.fn(async () => null),
    } as unknown as R2Bucket,
    AUTH_PASSWORD: TEST_PASSWORD,
    AUTH_SESSION_SECRET: TEST_SESSION_SECRET,
    AUTH_RATE_LIMITER: {
      limit: vi.fn(async () => ({ success: rateLimitSuccess })),
    },
    ENVIRONMENT: "test",
    PRIVATE_ORIGINS: "https://ledger.example.test",
  };
}

describe("Worker authentication boundary", () => {
  it("fails closed when required secret bindings are missing", async () => {
    const environment = createEnvironment();
    environment.AUTH_SESSION_SECRET = "";

    const response = await app.request(
      "https://ledger.example.test/",
      { headers: { Accept: "text/html" } },
      environment,
    );
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("redirects unauthenticated page navigation and rejects API requests", async () => {
    const environment = createEnvironment();
    const pageResponse = await app.request(
      "https://ledger.example.test/entries?view=all",
      { headers: { Accept: "text/html" } },
      environment,
    );
    expect(pageResponse.status).toBe(303);
    expect(pageResponse.headers.get("location")).toBe(
      "/auth/login?next=%2Fentries%3Fview%3Dall",
    );
    expect(pageResponse.headers.get("cache-control")).toBe("no-store");

    const apiResponse = await app.request(
      "https://ledger.example.test/api/v1/health",
      undefined,
      environment,
    );
    expect(apiResponse.status).toBe(401);
    expect(apiResponse.headers.get("www-authenticate")).toContain("Cookie");
    await expect(apiResponse.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
  });

  it("leaves only the declared public projection unauthenticated", async () => {
    const environment = createEnvironment();
    const publicResponse = await app.request(
      "https://ledger.example.test/public/v1/anime",
      { headers: { Origin: "https://personal-site.example.test" } },
      environment,
    );
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.headers.get("access-control-allow-origin")).toBe("*");
    await expect(publicResponse.json()).resolves.toMatchObject({
      schemaVersion: "1.0",
      revision: "test-revision",
    });

    const timelineResponse = await app.request(
      "https://ledger.example.test/public/v1/timeline",
      undefined,
      environment,
    );
    expect(timelineResponse.status).toBe(200);
    await expect(timelineResponse.json()).resolves.toMatchObject({
      schemaVersion: "1.0",
      revision: "test-revision",
      items: [],
    });
    const unchangedTimelineResponse = await app.request(
      "https://ledger.example.test/public/v1/timeline",
      { headers: { "If-None-Match": '"test-revision"' } },
      environment,
    );
    expect(unchangedTimelineResponse.status).toBe(304);
    expect(unchangedTimelineResponse.headers.get("etag")).toBe(
      '"test-revision"',
    );

    const undeclaredPublicResponse = await app.request(
      "https://ledger.example.test/public/v1/private-data",
      undefined,
      environment,
    );
    expect(undeclaredPublicResponse.status).toBe(401);
  });

  it("serves only content-addressed upload objects publicly without a session", async () => {
    const environment = createEnvironment();
    const content = new TextEncoder().encode("real-webp-bytes");
    const sha256 = "a".repeat(64);
    const key = `media-covers/work_001/${sha256}.webp`;
    environment.MEDIA = {
      get: vi.fn(async (requestedKey: string) =>
        requestedKey === key
          ? {
              body: new Blob([content]).stream(),
              size: content.byteLength,
              etag: "public-etag",
              httpEtag: '"public-etag"',
              httpMetadata: {
                contentType: "image/webp",
                cacheControl: "public, max-age=31536000, immutable",
              },
              writeHttpMetadata(headers: Headers) {
                headers.set("Content-Type", "image/webp");
              },
            }
          : null,
      ),
    } as unknown as R2Bucket;

    const publicUrl =
      `https://ledger.example.test/public-media/${key}`;
    const response = await app.request(publicUrl, undefined, environment);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("etag")).toBe('"public-etag"');
    await expect(response.text()).resolves.toBe("real-webp-bytes");

    const unchanged = await app.request(
      publicUrl,
      { headers: { "If-None-Match": '"public-etag"' } },
      environment,
    );
    expect(unchanged.status).toBe(304);

    const traversal = await app.request(
      "https://ledger.example.test/public-media/../private.webp",
      undefined,
      environment,
    );
    expect(traversal.status).not.toBe(200);

    const anonymousWrite = await app.request(
      publicUrl,
      { method: "POST", body: "not allowed" },
      environment,
    );
    expect(anonymousWrite.status).toBe(401);
  });

  it("creates a signed session that unlocks private assets", async () => {
    const environment = createEnvironment();
    const loginResponse = await app.request(
      "https://ledger.example.test/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://ledger.example.test",
        },
        body: new URLSearchParams({
          password: TEST_PASSWORD,
          next: "/entries",
        }).toString(),
      },
      environment,
    );

    expect(loginResponse.status).toBe(303);
    expect(loginResponse.headers.get("location")).toBe("/entries");
    const setCookie = loginResponse.headers.get("set-cookie");
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");

    const cookie = setCookie!.split(";", 1)[0]!;
    const applicationResponse = await app.request(
      "https://ledger.example.test/entries",
      {
        headers: {
          Accept: "text/html",
          Cookie: cookie,
        },
      },
      environment,
    );
    expect(applicationResponse.status).toBe(200);
    expect(applicationResponse.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(applicationResponse.headers.get("vary")).toBe("Cookie");
    await expect(applicationResponse.text()).resolves.toBe(
      "private application",
    );

    environment.ASSETS = {
      fetch: vi.fn(async () =>
        new Response("<html><head></head><body>anime</body></html>", {
          headers: { "Content-Type": "text/html" },
        }),
      ),
    } as unknown as Fetcher;
    const animeResponse = await app.request(
      "https://ledger.example.test/anime",
      {
        headers: {
          Accept: "text/html",
          Cookie: cookie,
        },
      },
      environment,
    );
    expect(animeResponse.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    await expect(animeResponse.text()).resolves.toContain(
      'rel="preload" as="image"',
    );

    const mediaBody = new TextEncoder().encode("webp");
    environment.MEDIA = {
      get: vi.fn(async () => ({
        body: new Blob([mediaBody]).stream(),
        size: mediaBody.byteLength,
        httpEtag: '"media-etag"',
        httpMetadata: { contentType: "image/webp" },
        writeHttpMetadata(headers: Headers) {
          headers.set("Content-Type", "image/webp");
        },
      })),
    } as unknown as R2Bucket;
    const mediaResponse = await app.request(
      "https://ledger.example.test/media/covers/anime/example-v1.webp",
      { headers: { Cookie: cookie } },
      environment,
    );
    expect(mediaResponse.status).toBe(200);
    expect(mediaResponse.headers.get("content-type")).toBe("image/webp");
    expect(mediaResponse.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(mediaResponse.headers.get("etag")).toBe('"media-etag"');
    await expect(mediaResponse.text()).resolves.toBe("webp");

    const unchangedMediaResponse = await app.request(
      "https://ledger.example.test/media/covers/anime/example-v1.webp",
      {
        headers: {
          Cookie: cookie,
          "If-None-Match": '"media-etag"',
        },
      },
      environment,
    );
    expect(unchangedMediaResponse.status).toBe(304);
  });

  it("streams and verifies private R2 exports only through an authenticated route", async () => {
    const environment = createEnvironment();
    const body = new TextEncoder().encode("private archive").buffer;
    Object.assign(environment.CORE, {
      downloadExport: vi.fn(async () => ({
        fileName: "life-ledger-backup.tar.gz",
        contentType: "application/gzip",
        body,
        checksum: "a".repeat(64),
      })),
      verifyExport: vi.fn(async () => ({
        id: "export_1",
        verified: true,
        expectedChecksum: "a".repeat(64),
        computedChecksum: "a".repeat(64),
        sizeBytes: body.byteLength,
        checkedAt: "2033-05-18T03:33:20.000Z",
      })),
    });
    const loginResponse = await app.request(
      "https://ledger.example.test/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://ledger.example.test",
        },
        body: new URLSearchParams({ password: TEST_PASSWORD }).toString(),
      },
      environment,
    );
    const cookie = loginResponse.headers.get("set-cookie")!.split(";", 1)[0]!;

    const downloadResponse = await app.request(
      "https://ledger.example.test/api/v1/exports/export_1/download",
      { headers: { Cookie: cookie } },
      environment,
    );
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-disposition")).toContain(
      "life-ledger-backup.tar.gz",
    );
    expect(downloadResponse.headers.get("x-checksum-sha256")).toBe(
      "a".repeat(64),
    );
    await expect(downloadResponse.text()).resolves.toBe("private archive");

    const verifyResponse = await app.request(
      "https://ledger.example.test/api/v1/exports/export_1/verify",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "https://ledger.example.test",
        },
      },
      environment,
    );
    expect(verifyResponse.status).toBe(200);
    await expect(verifyResponse.json()).resolves.toMatchObject({
      id: "export_1",
      verified: true,
    });
  });

  it("returns a generic failure and rate-limits repeated login attempts", async () => {
    const invalidPasswordEnvironment = createEnvironment();
    const invalidResponse = await app.request(
      "https://ledger.example.test/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          password: "not-the-test-password",
        }).toString(),
      },
      invalidPasswordEnvironment,
    );
    expect(invalidResponse.status).toBe(401);
    await expect(invalidResponse.text()).resolves.toContain(
      "密码无效，请重试。",
    );

    const rateLimitedEnvironment = createEnvironment(false);
    const rateLimitedResponse = await app.request(
      "https://ledger.example.test/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          password: "any-test-value",
        }).toString(),
      },
      rateLimitedEnvironment,
    );
    expect(rateLimitedResponse.status).toBe(429);
    expect(rateLimitedResponse.headers.get("retry-after")).toBe("60");
  });

  it("stores verified entry media in R2 and discards mislabeled uploads", async () => {
    const environment = createEnvironment();
    const objects = new Map<string, Uint8Array>();
    const put = vi.fn(async (key: string, value: ReadableStream) => {
      const stored = new Uint8Array(await new Response(value).arrayBuffer());
      objects.set(key, stored);
      return { key, size: stored.byteLength };
    });
    const get = vi.fn(
      async (key: string, options?: { range?: { offset: number; length: number } }) => {
        const stored = objects.get(key);
        if (!stored) {
          return null;
        }
        const slice = options?.range
          ? stored.slice(options.range.offset, options.range.offset + options.range.length)
          : stored;
        return {
          size: stored.byteLength,
          httpEtag: '"etag"',
          httpMetadata: { contentType: "image/jpeg" },
          writeHttpMetadata: () => undefined,
          body: new Response(slice.buffer as ArrayBuffer).body,
          arrayBuffer: async () => slice.buffer,
        };
      },
    );
    const head = vi.fn(async (key: string) =>
      objects.has(key) ? { size: objects.get(key)!.byteLength } : null,
    );
    const remove = vi.fn(async (key: string) => {
      objects.delete(key);
    });
    environment.MEDIA = { put, get, head, delete: remove } as unknown as R2Bucket;
    const registerEntryMedia = vi.fn(async (input: { objectKey: string }) => ({
      id: "media_1",
      kind: "image",
      mimeType: "image/jpeg",
      url: `/media/${input.objectKey}`,
      sizeBytes: 12,
      width: 3,
      height: 2,
      durationMs: null,
      createdAt: "2033-05-18T03:33:20.000Z",
    }));
    Object.assign(environment.CORE, { registerEntryMedia });

    const loginResponse = await app.request(
      "https://ledger.example.test/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://ledger.example.test",
        },
        body: new URLSearchParams({ password: TEST_PASSWORD }).toString(),
      },
      environment,
    );
    const cookie = loginResponse.headers.get("set-cookie")!.split(";", 1)[0]!;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

    const uploadResponse = await app.request(
      "https://ledger.example.test/api/v1/entry-media?width=3&height=2",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "https://ledger.example.test",
          "Content-Type": "image/jpeg",
          "Content-Length": String(jpeg.byteLength),
        },
        body: jpeg.buffer as ArrayBuffer,
      },
      environment,
    );
    expect(uploadResponse.status).toBe(201);
    const media = (await uploadResponse.json()) as { url: string };
    expect(media.url).toMatch(/^\/media\/entry-media\/[a-f0-9-]{36}\.jpg$/);
    expect(registerEntryMedia).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "image", width: 3, height: 2, sizeBytes: 12 }),
    );

    const rangeResponse = await app.request(
      `https://ledger.example.test${media.url}`,
      { headers: { Cookie: cookie, Range: "bytes=4-7" } },
      environment,
    );
    expect(rangeResponse.status).toBe(206);
    expect(rangeResponse.headers.get("content-range")).toBe("bytes 4-7/12");
    expect(new Uint8Array(await rangeResponse.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 4]),
    );

    const html = new TextEncoder().encode("<html>nope</html>");
    const spoofResponse = await app.request(
      "https://ledger.example.test/api/v1/entry-media",
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          Origin: "https://ledger.example.test",
          "Content-Type": "image/jpeg",
          "Content-Length": String(html.byteLength),
        },
        body: html.buffer as ArrayBuffer,
      },
      environment,
    );
    expect(spoofResponse.status).toBe(415);
    expect(remove).toHaveBeenCalledOnce();
    expect(registerEntryMedia).toHaveBeenCalledOnce();

    const unauthenticated = await app.request(
      `https://ledger.example.test${media.url}`,
      {},
      environment,
    );
    expect(unauthenticated.status).toBe(401);
  });

  it("accepts one-time MCP upload URLs without a session and never twice", async () => {
    const environment = createEnvironment();
    const objects = new Map<string, Uint8Array>();
    environment.MEDIA = {
      put: vi.fn(async (key: string, value: ReadableStream) => {
        const stored = new Uint8Array(await new Response(value).arrayBuffer());
        objects.set(key, stored);
        return { key, size: stored.byteLength };
      }),
      get: vi.fn(async (key: string) => {
        const stored = objects.get(key);
        return stored
          ? { arrayBuffer: async () => stored.slice(0, 16).buffer }
          : null;
      }),
      delete: vi.fn(async (key: string) => {
        objects.delete(key);
      }),
    } as unknown as R2Bucket;
    let claimed = false;
    const claimEntryMediaUpload = vi.fn(
      async (_token: string, request: { mimeType: string; sizeBytes: number }) => {
        if (claimed) {
          throw new Error("ENTRY_MEDIA_UPLOAD_USED: This upload URL has already been used.");
        }
        if (request.mimeType !== "video/webm") {
          throw new Error("ENTRY_MEDIA_UPLOAD_TYPE_MISMATCH: Content-Type must be video/webm.");
        }
        claimed = true;
        return {
          mediaId: "media_abc_0123abcd",
          objectKey: "entry-media/0b8f6a2e-5c1d-4f7a-9e3b-2d6c8a1f4e70.webm",
          kind: "video",
          mimeType: "video/webm",
          maxBytes: 1000,
          width: 640,
          height: 360,
          durationMs: 2000,
        };
      },
    );
    const registerEntryMedia = vi.fn(async (input: { mediaId: string }) => ({
      id: input.mediaId,
    }));
    Object.assign(environment.CORE, { claimEntryMediaUpload, registerEntryMedia });
    const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4]);
    const put = (contentType: string) =>
      app.request(
        "https://ledger.example.test/upload/entry-media/token-value",
        {
          method: "PUT",
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(webm.byteLength),
          },
          body: webm.buffer as ArrayBuffer,
        },
        environment,
      );

    const wrongType = await put("video/mp4");
    expect(wrongType.status).toBe(415);

    const accepted = await put("video/webm");
    expect(accepted.status).toBe(201);
    await expect(accepted.json()).resolves.toEqual({
      ok: true,
      data: { id: "media_abc_0123abcd" },
    });
    expect(registerEntryMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaId: "media_abc_0123abcd",
        uploadedVia: "mcp",
        sizeBytes: 8,
        durationMs: 2000,
      }),
    );

    const replay = await put("video/webm");
    expect(replay.status).toBe(409);

    const getWithToken = await app.request(
      "https://ledger.example.test/upload/entry-media/token-value",
      {},
      environment,
    );
    expect(getWithToken.status).toBe(401);
  });

  it("clears the hardened session cookie on logout", async () => {
    const response = await app.request(
      "https://ledger.example.test/auth/logout",
      {
        method: "POST",
        headers: { Origin: "https://ledger.example.test" },
      },
      createEnvironment(),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/auth/login");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
