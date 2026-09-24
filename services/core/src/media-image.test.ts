import { describe, expect, it } from "vitest";

import {
  MAX_MEDIA_IMAGE_BASE64_CHARS,
  MAX_MEDIA_IMAGE_BYTES,
  assertSafeOriginalFileName,
  buildPublicMediaUrl,
  createMediaObjectKey,
  validateMediaImage,
} from "./media-image";

const ONE_PIXEL_WEBP =
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==";

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function oversizedPngHeader(): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  bytes.set([0, 0, 0x23, 0x29], 16);
  bytes.set([0, 0, 0, 1], 20);
  return bytes;
}

describe("secure media image validation", () => {
  it("strictly validates a real WebP and reports dimensions", () => {
    const image = validateMediaImage(ONE_PIXEL_WEBP, "image/webp");
    expect(image.mimeType).toBe("image/webp");
    expect(image.extension).toBe("webp");
    expect(image.bytes.byteLength).toBe(46);
    expect({ width: image.width, height: image.height }).toEqual({
      width: 1,
      height: 1,
    });
  });

  it("rejects invalid Base64 and data URL prefixes", () => {
    expect(() => validateMediaImage("%%%%", "image/webp")).toThrow(
      /INVALID_BASE64/,
    );
    expect(() =>
      validateMediaImage(
        `data:image\/webp;base64,${ONE_PIXEL_WEBP}`,
        "image/webp",
      ),
    ).toThrow(/INVALID_BASE64/);
  });

  it("rejects declared MIME that differs from magic bytes", () => {
    expect(() => validateMediaImage(ONE_PIXEL_WEBP, "image/png")).toThrow(
      /IMAGE_MIME_MISMATCH/,
    );
  });

  it.each([
    ["SVG", "<svg xmlns='http://www.w3.org/2000/svg'></svg>"],
    ["HTML", "<html><script>alert(1)</script></html>"],
    ["PDF", "%PDF-1.7"],
  ])("rejects %s masquerading as a supported image", (_label, source) => {
    expect(() =>
      validateMediaImage(
        base64(new TextEncoder().encode(source)),
        "image/png",
      ),
    ).toThrow(/UNSUPPORTED_IMAGE_FORMAT/);
  });

  it("rejects payloads over the one MiB encoded limit before decoding", () => {
    const tooLarge = "A".repeat(MAX_MEDIA_IMAGE_BASE64_CHARS + 4);
    expect(() => validateMediaImage(tooLarge, "image/png")).toThrow(
      /IMAGE_TOO_LARGE/,
    );
    expect(MAX_MEDIA_IMAGE_BYTES).toBe(1_048_576);
  });

  it("rejects excessive width and pixel dimensions", () => {
    expect(() =>
      validateMediaImage(base64(oversizedPngHeader()), "image/png"),
    ).toThrow(/IMAGE_DIMENSIONS_EXCEEDED/);
  });

  it("rejects path traversal and control characters in original names", () => {
    expect(() => assertSafeOriginalFileName("../cover.webp")).toThrow(
      /INVALID_FILE_NAME/,
    );
    expect(() => assertSafeOriginalFileName("folder\\cover.webp")).toThrow(
      /INVALID_FILE_NAME/,
    );
    expect(() => assertSafeOriginalFileName("cover\u0000.webp")).toThrow(
      /INVALID_FILE_NAME/,
    );
  });

  it("generates a content-addressed key without trusting the file name", async () => {
    const sha256 = "a".repeat(64);
    await expect(
      createMediaObjectKey(
        "media_cover",
        "work_123",
        sha256,
        "webp",
      ),
    ).resolves.toBe(`media-covers/work_123/${sha256}.webp`);
    await expect(
      createMediaObjectKey(
        "entry_image",
        "../../unsafe",
        sha256,
        "png",
      ),
    ).resolves.toMatch(
      /^entry-images\/work-[a-f0-9]{24}\/[a-f0-9]{64}\.png$/,
    );
  });

  it("requires an HTTPS public base URL and preserves its path prefix", () => {
    expect(
      buildPublicMediaUrl(
        "https://ledger.example/public-media/",
        `media-covers/work_1/${"b".repeat(64)}.webp`,
      ),
    ).toBe(
      `https://ledger.example/public-media/media-covers/work_1/${"b".repeat(64)}.webp`,
    );
    expect(() =>
      buildPublicMediaUrl(
        "http://ledger.example/public-media",
        "media-covers/work_1/image.webp",
      ),
    ).toThrow(/MEDIA_PUBLIC_BASE_URL_INVALID/);
  });
});
