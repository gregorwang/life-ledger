import type {
  MediaImageMimeType,
  MediaImagePurpose,
} from "@life-ledger/contracts";

export const MAX_MEDIA_IMAGE_BYTES = 1024 * 1024;
export const MAX_MEDIA_IMAGE_WIDTH = 8192;
export const MAX_MEDIA_IMAGE_HEIGHT = 8192;
export const MAX_MEDIA_IMAGE_PIXELS = 25_000_000;
export const MAX_MEDIA_IMAGE_BASE64_CHARS =
  Math.ceil(MAX_MEDIA_IMAGE_BYTES / 3) * 4;

export class MediaImageError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(`${code}: ${message}`);
    this.name = "MediaImageError";
    this.code = code;
    this.status = status;
  }
}

export interface ValidatedMediaImage {
  bytes: Uint8Array;
  mimeType: MediaImageMimeType;
  extension: "webp" | "jpg" | "png";
  width: number;
  height: number;
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! |
    (bytes[offset + 1]! << 8) |
    (bytes[offset + 2]! << 16)
  );
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function decodeBase64Strict(base64Data: string): Uint8Array {
  if (
    base64Data.length > MAX_MEDIA_IMAGE_BASE64_CHARS ||
    Math.floor((base64Data.length * 3) / 4) > MAX_MEDIA_IMAGE_BYTES + 2
  ) {
    throw new MediaImageError(
      "IMAGE_TOO_LARGE",
      `图片不得超过 ${MAX_MEDIA_IMAGE_BYTES} 字节。`,
      413,
    );
  }
  if (
    base64Data.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      base64Data,
    )
  ) {
    throw new MediaImageError(
      "INVALID_BASE64",
      "base64Data 必须是不含 data URL 前缀、空白或非法字符的标准 Base64。",
    );
  }

  let binary: string;
  try {
    binary = atob(base64Data);
  } catch {
    throw new MediaImageError(
      "INVALID_BASE64",
      "base64Data 无法严格解码。",
    );
  }
  if (binary.length > MAX_MEDIA_IMAGE_BYTES) {
    throw new MediaImageError(
      "IMAGE_TOO_LARGE",
      `图片不得超过 ${MAX_MEDIA_IMAGE_BYTES} 字节。`,
      413,
    );
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  if (
    bytes.length < 33 ||
    readUint32BigEndian(bytes, 8) !== 13 ||
    ascii(bytes, 12, 4) !== "IHDR"
  ) {
    throw new MediaImageError("INVALID_IMAGE", "PNG 的 IHDR 数据无效。");
  }
  return {
    width: readUint32BigEndian(bytes, 16),
    height: readUint32BigEndian(bytes, 20),
  };
}

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

function jpegDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      continue;
    }
    if (marker === 0xda) {
      break;
    }
    if (offset + 1 >= bytes.length) {
      break;
    }
    const segmentLength = readUint16BigEndian(bytes, offset);
    if (
      segmentLength < 2 ||
      offset + segmentLength > bytes.length
    ) {
      throw new MediaImageError(
        "INVALID_IMAGE",
        "JPEG 分段长度无效。",
      );
    }
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) {
        throw new MediaImageError(
          "INVALID_IMAGE",
          "JPEG 尺寸段无效。",
        );
      }
      return {
        height: readUint16BigEndian(bytes, offset + 3),
        width: readUint16BigEndian(bytes, offset + 5),
      };
    }
    offset += segmentLength;
  }
  throw new MediaImageError(
    "INVALID_IMAGE",
    "JPEG 中没有可验证的尺寸信息。",
  );
}

function webpDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  if (bytes.length < 30) {
    throw new MediaImageError("INVALID_IMAGE", "WebP 数据不完整。");
  }
  const chunkType = ascii(bytes, 12, 4);
  if (chunkType === "VP8X") {
    return {
      width: readUint24LittleEndian(bytes, 24) + 1,
      height: readUint24LittleEndian(bytes, 27) + 1,
    };
  }
  if (chunkType === "VP8L") {
    if (bytes[20] !== 0x2f || bytes.length < 25) {
      throw new MediaImageError(
        "INVALID_IMAGE",
        "WebP lossless 数据无效。",
      );
    }
    return {
      width: 1 + (bytes[21]! | ((bytes[22]! & 0x3f) << 8)),
      height:
        1 +
        ((bytes[22]! >> 6) |
          (bytes[23]! << 2) |
          ((bytes[24]! & 0x0f) << 10)),
    };
  }
  if (chunkType === "VP8 ") {
    if (
      bytes[23] !== 0x9d ||
      bytes[24] !== 0x01 ||
      bytes[25] !== 0x2a
    ) {
      throw new MediaImageError(
        "INVALID_IMAGE",
        "WebP lossy 帧头无效。",
      );
    }
    return {
      width: readUint16LittleEndian(bytes, 26) & 0x3fff,
      height: readUint16LittleEndian(bytes, 28) & 0x3fff,
    };
  }
  throw new MediaImageError(
    "INVALID_IMAGE",
    "不支持或损坏的 WebP chunk。",
  );
}

function detectImage(bytes: Uint8Array): {
  mimeType: MediaImageMimeType;
  extension: ValidatedMediaImage["extension"];
  dimensions: { width: number; height: number };
} {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      mimeType: "image/png",
      extension: "png",
      dimensions: pngDimensions(bytes),
    };
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return {
      mimeType: "image/jpeg",
      extension: "jpg",
      dimensions: jpegDimensions(bytes),
    };
  }
  if (
    bytes.length >= 16 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  ) {
    return {
      mimeType: "image/webp",
      extension: "webp",
      dimensions: webpDimensions(bytes),
    };
  }
  throw new MediaImageError(
    "UNSUPPORTED_IMAGE_FORMAT",
    "只允许真实的 WebP、JPEG 或 PNG 位图；SVG、HTML、PDF 等格式会被拒绝。",
    415,
  );
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new MediaImageError("INVALID_IMAGE", "图片宽高无效。");
  }
  if (
    width > MAX_MEDIA_IMAGE_WIDTH ||
    height > MAX_MEDIA_IMAGE_HEIGHT ||
    width * height > MAX_MEDIA_IMAGE_PIXELS
  ) {
    throw new MediaImageError(
      "IMAGE_DIMENSIONS_EXCEEDED",
      `图片不得超过 ${MAX_MEDIA_IMAGE_WIDTH}×${MAX_MEDIA_IMAGE_HEIGHT} 或 ${MAX_MEDIA_IMAGE_PIXELS} 像素。`,
      413,
    );
  }
}

export function assertSafeOriginalFileName(fileName: string): string {
  const normalized = fileName.normalize("NFKC").trim();
  if (
    normalized.length === 0 ||
    normalized.length > 160 ||
    normalized.includes("..") ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new MediaImageError(
      "INVALID_FILE_NAME",
      "fileName 含路径穿越、路径分隔符或控制字符。",
    );
  }
  return normalized;
}

export function validateMediaImage(
  base64Data: string,
  declaredMimeType: MediaImageMimeType,
): ValidatedMediaImage {
  const bytes = decodeBase64Strict(base64Data);
  const detected = detectImage(bytes);
  if (detected.mimeType !== declaredMimeType) {
    throw new MediaImageError(
      "IMAGE_MIME_MISMATCH",
      `声明的 ${declaredMimeType} 与实际 ${detected.mimeType} 不一致。`,
      415,
    );
  }
  validateDimensions(
    detected.dimensions.width,
    detected.dimensions.height,
  );
  return {
    bytes,
    mimeType: detected.mimeType,
    extension: detected.extension,
    width: detected.dimensions.width,
    height: detected.dimensions.height,
  };
}

export async function sha256Hex(value: Uint8Array | string): Promise<string> {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    Uint8Array.from(bytes),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function purposePrefix(purpose: MediaImagePurpose): string {
  switch (purpose) {
    case "media_cover":
      return "media-covers";
    case "entry_image":
      return "entry-images";
    case "other":
      return "other-images";
  }
}

export async function createMediaObjectKey(
  purpose: MediaImagePurpose,
  mediaWorkId: string | null,
  contentSha256: string,
  extension: ValidatedMediaImage["extension"],
): Promise<string> {
  const workSegment =
    mediaWorkId === null
      ? "unassigned"
      : /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(mediaWorkId)
        ? mediaWorkId
        : `work-${(await sha256Hex(mediaWorkId)).slice(0, 24)}`;
  return `${purposePrefix(purpose)}/${workSegment}/${contentSha256}.${extension}`;
}

export function buildPublicMediaUrl(
  configuredBaseUrl: string | undefined,
  objectKey: string,
): string {
  if (!configuredBaseUrl) {
    throw new MediaImageError(
      "MEDIA_PUBLIC_BASE_URL_NOT_CONFIGURED",
      "MEDIA_PUBLIC_BASE_URL 未配置。",
      500,
    );
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredBaseUrl);
  } catch {
    throw new MediaImageError(
      "MEDIA_PUBLIC_BASE_URL_INVALID",
      "MEDIA_PUBLIC_BASE_URL 不是有效 URL。",
      500,
    );
  }
  if (baseUrl.protocol !== "https:" || baseUrl.username || baseUrl.password) {
    throw new MediaImageError(
      "MEDIA_PUBLIC_BASE_URL_INVALID",
      "MEDIA_PUBLIC_BASE_URL 必须是无凭据的 HTTPS URL。",
      500,
    );
  }
  baseUrl.search = "";
  baseUrl.hash = "";
  const basePath = baseUrl.pathname.replace(/\/+$/u, "");
  const encodedKey = objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  baseUrl.pathname = `${basePath}/${encodedKey}`;
  return baseUrl.toString();
}
