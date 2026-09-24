import {
  ENTRY_MEDIA_EXTENSIONS,
  type EntryMediaMimeType,
} from "@life-ledger/contracts";

export function createEntryMediaObjectKey(mimeType: EntryMediaMimeType): string {
  return `entry-media/${crypto.randomUUID()}.${ENTRY_MEDIA_EXTENSIONS[mimeType]}`;
}

/** Strict standard Base64 (no data: prefix, no whitespace) with a size cap. */
export function decodeEntryMediaBase64(
  base64Data: string,
  maxBytes: number,
): Uint8Array | "too_large" | "invalid" {
  // Format first: a data: URL or stray whitespace is the actionable mistake.
  if (
    base64Data.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      base64Data,
    )
  ) {
    return "invalid";
  }
  if (Math.floor((base64Data.length * 3) / 4) > maxBytes + 2) {
    return "too_large";
  }
  let binary: string;
  try {
    binary = atob(base64Data);
  } catch {
    return "invalid";
  }
  if (binary.length === 0) {
    return "invalid";
  }
  if (binary.length > maxBytes) {
    return "too_large";
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** 32 random bytes, base64url — the secret half of a one-time upload URL. */
export function createUploadToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function isWellFormedUploadToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function uploadBaseOrigin(
  webOrigin: string | undefined,
  mediaPublicBaseUrl: string | undefined,
): string {
  const candidate = webOrigin || mediaPublicBaseUrl;
  if (!candidate) {
    throw new Error(
      "WEB_ORIGIN_NOT_CONFIGURED: Neither WEB_ORIGIN nor MEDIA_PUBLIC_BASE_URL is configured.",
    );
  }
  return new URL(candidate).origin;
}
