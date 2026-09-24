import { describe, expect, it } from "vitest";

import {
  EntryMediaUploadError,
  matchesMediaSignature,
  parseByteRange,
  planEntryMediaUpload,
} from "./entry-media";

function bytes(...values: Array<number | string>): Uint8Array {
  const out: number[] = [];
  for (const value of values) {
    if (typeof value === "number") {
      out.push(value);
    } else {
      for (const character of value) {
        out.push(character.charCodeAt(0));
      }
    }
  }
  return new Uint8Array(out);
}

describe("entry media upload planning", () => {
  it("derives a random key from the MIME type, never the file name", () => {
    const plan = planEntryMediaUpload({
      contentType: "image/jpeg",
      contentLength: "2048",
      width: "1200",
      height: "900",
      durationMs: "5000",
    });
    expect(plan.objectKey).toMatch(/^entry-media\/[a-f0-9-]{36}\.jpg$/);
    expect(plan).toMatchObject({
      kind: "image",
      sizeBytes: 2048,
      width: 1200,
      height: 900,
      durationMs: null,
    });

    const video = planEntryMediaUpload({
      contentType: "video/quicktime",
      contentLength: "4096",
      durationMs: "12500",
      width: "not-a-number",
    });
    expect(video.objectKey).toMatch(/\.mov$/);
    expect(video).toMatchObject({ kind: "video", durationMs: 12500, width: null });
  });

  it("rejects unsupported types, missing lengths and oversized files", () => {
    expect(() =>
      planEntryMediaUpload({ contentType: "text/html", contentLength: "10" }),
    ).toThrow(EntryMediaUploadError);
    expect(() =>
      planEntryMediaUpload({ contentType: "image/png", contentLength: undefined }),
    ).toThrow(/Content-Length/);
    expect(() =>
      planEntryMediaUpload({
        contentType: "image/png",
        contentLength: String(21 * 1024 * 1024),
      }),
    ).toThrow(/图片不能超过/);
    expect(() =>
      planEntryMediaUpload({
        contentType: "video/mp4",
        contentLength: String(96 * 1024 * 1024),
      }),
    ).toThrow(/视频不能超过/);
  });
});

describe("entry media signatures", () => {
  it("accepts real magic bytes and rejects mislabeled content", () => {
    expect(matchesMediaSignature("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(
      matchesMediaSignature("image/png", bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe(true);
    expect(matchesMediaSignature("image/webp", bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe(true);
    expect(matchesMediaSignature("image/gif", bytes("GIF89a"))).toBe(true);
    expect(matchesMediaSignature("video/mp4", bytes(0, 0, 0, 0x18, "ftypisom"))).toBe(true);
    expect(matchesMediaSignature("video/quicktime", bytes(0, 0, 0, 8, "wide"))).toBe(true);
    expect(matchesMediaSignature("video/webm", bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);

    expect(matchesMediaSignature("image/jpeg", bytes("<htm"))).toBe(false);
    expect(matchesMediaSignature("video/mp4", bytes("<!doctype html>"))).toBe(false);
  });
});

describe("byte range parsing", () => {
  it("supports open, closed and suffix ranges", () => {
    expect(parseByteRange("bytes=0-", 100)).toEqual({ offset: 0, length: 100 });
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ offset: 10, length: 10 });
    expect(parseByteRange("bytes=90-500", 100)).toEqual({ offset: 90, length: 10 });
    expect(parseByteRange("bytes=-20", 100)).toEqual({ offset: 80, length: 20 });
  });

  it("flags unsatisfiable ranges and ignores malformed ones", () => {
    expect(parseByteRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=0-1,5-6", 100)).toBeNull();
    expect(parseByteRange("items=0-1", 100)).toBeNull();
    expect(parseByteRange(undefined, 100)).toBeNull();
  });
});
