import {
  ENTRY_MEDIA_EXTENSIONS,
  ENTRY_MEDIA_LIMITS,
  ENTRY_MEDIA_OBJECT_KEY_PATTERN,
  entryMediaMimeTypeSchema,
  type EntryMediaMimeType,
} from "@life-ledger/contracts";

export class EntryMediaUploadError extends Error {
  readonly code: string;
  readonly status: 400 | 411 | 413 | 415;

  constructor(code: string, message: string, status: 400 | 411 | 413 | 415) {
    super(message);
    this.name = "EntryMediaUploadError";
    this.code = code;
    this.status = status;
  }
}

export interface EntryMediaUploadPlan {
  objectKey: string;
  mimeType: EntryMediaMimeType;
  kind: "image" | "video";
  sizeBytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

function optionalPositiveInteger(
  value: string | undefined,
  max: number,
): number | null {
  if (value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= max
    ? parsed
    : null;
}

/**
 * Validates the declared upload before any byte reaches R2: an allow-listed
 * MIME type, a declared Content-Length within the per-kind limit, and a
 * random object key that never derives from the client's file name.
 */
export function planEntryMediaUpload(input: {
  contentType: string | undefined;
  contentLength: string | undefined;
  width?: string | undefined;
  height?: string | undefined;
  durationMs?: string | undefined;
}): EntryMediaUploadPlan {
  const declaredType = input.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  const mimeType = entryMediaMimeTypeSchema.safeParse(declaredType);
  if (!mimeType.success) {
    throw new EntryMediaUploadError(
      "UNSUPPORTED_MEDIA_TYPE",
      "只支持 JPEG、PNG、WebP、GIF 图片和 MP4、MOV、WebM 视频。",
      415,
    );
  }
  const kind = mimeType.data.startsWith("video/") ? "video" : "image";
  if (!input.contentLength || !/^\d+$/.test(input.contentLength)) {
    throw new EntryMediaUploadError(
      "LENGTH_REQUIRED",
      "上传请求必须带有 Content-Length。",
      411,
    );
  }
  const sizeBytes = Number(input.contentLength);
  const limit =
    kind === "video"
      ? ENTRY_MEDIA_LIMITS.maxVideoBytes
      : ENTRY_MEDIA_LIMITS.maxImageBytes;
  if (sizeBytes <= 0) {
    throw new EntryMediaUploadError("EMPTY_UPLOAD", "上传内容为空。", 400);
  }
  if (sizeBytes > limit) {
    throw new EntryMediaUploadError(
      "MEDIA_TOO_LARGE",
      kind === "video"
        ? `视频不能超过 ${Math.floor(limit / 1024 / 1024)} MB。`
        : `图片不能超过 ${Math.floor(limit / 1024 / 1024)} MB。`,
      413,
    );
  }
  const durationMs =
    input.durationMs === undefined || input.durationMs === ""
      ? null
      : Number.isInteger(Number(input.durationMs)) &&
          Number(input.durationMs) >= 0 &&
          Number(input.durationMs) <= 86_400_000
        ? Number(input.durationMs)
        : null;
  return {
    objectKey: `entry-media/${crypto.randomUUID()}.${ENTRY_MEDIA_EXTENSIONS[mimeType.data]}`,
    mimeType: mimeType.data,
    kind,
    sizeBytes,
    width: optionalPositiveInteger(input.width, 16_384),
    height: optionalPositiveInteger(input.height, 16_384),
    durationMs: kind === "video" ? durationMs : null,
  };
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

const QUICKTIME_ATOMS = new Set(["ftyp", "moov", "mdat", "wide", "free", "skip"]);

/** Magic-byte check so a mislabeled upload cannot be served as media. */
export function matchesMediaSignature(
  mimeType: EntryMediaMimeType,
  head: Uint8Array,
): boolean {
  switch (mimeType) {
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    case "image/png":
      return (
        head.length >= 8 &&
        head[0] === 0x89 &&
        ascii(head, 1, 3) === "PNG" &&
        head[4] === 0x0d &&
        head[5] === 0x0a &&
        head[6] === 0x1a &&
        head[7] === 0x0a
      );
    case "image/webp":
      return ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 4) === "WEBP";
    case "image/gif":
      return ascii(head, 0, 6) === "GIF87a" || ascii(head, 0, 6) === "GIF89a";
    case "video/mp4":
      return ascii(head, 4, 4) === "ftyp";
    case "video/quicktime":
      return QUICKTIME_ATOMS.has(ascii(head, 4, 4));
    case "video/webm":
      return (
        head[0] === 0x1a &&
        head[1] === 0x45 &&
        head[2] === 0xdf &&
        head[3] === 0xa3
      );
  }
}

export function isEntryMediaKey(key: string): boolean {
  return ENTRY_MEDIA_OBJECT_KEY_PATTERN.test(key);
}

/** Parses a single `bytes=` range; multi-range requests fall back to 200. */
export function parseByteRange(
  header: string | undefined,
  size: number,
): { offset: number; length: number } | "unsatisfiable" | null {
  if (!header) {
    return null;
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) {
    return null;
  }
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) {
      return "unsatisfiable";
    }
    const length = Math.min(suffix, size);
    return { offset: size - length, length };
  }
  const start = Number(match[1]);
  if (start >= size) {
    return "unsatisfiable";
  }
  const end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (end < start) {
    return null;
  }
  return { offset: start, length: end - start + 1 };
}
