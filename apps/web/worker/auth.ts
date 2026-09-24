const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export const SESSION_COOKIE_NAME = "__Host-life_ledger_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const LOGIN_BODY_LIMIT_BYTES = 4 * 1024;

interface SessionPayload {
  v: 1;
  iat: number;
  exp: number;
  sid: string;
}

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Invalid base64url value.");
  }
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const decoded = Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0),
  );
  if (encodeBase64Url(decoded) !== value) {
    throw new Error("Non-canonical base64url value.");
  }
  return decoded;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", textEncoder.encode(value)),
  );
}

function fixedLengthTimingSafeEqual(
  left: Uint8Array,
  right: Uint8Array,
): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }

  const workersSubtleCrypto = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (
      first: Uint8Array,
      second: Uint8Array,
    ) => boolean;
  };
  if (typeof workersSubtleCrypto.timingSafeEqual === "function") {
    return workersSubtleCrypto.timingSafeEqual(left, right);
  }

  // Node's Web Crypto does not expose timingSafeEqual in every supported
  // release. Production Workers use the native branch above; this fallback
  // compares the already fixed-size SHA-256 digests without early return.
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

export async function passwordMatches(
  candidate: string,
  expected: string,
): Promise<boolean> {
  const [candidateDigest, expectedDigest] = await Promise.all([
    sha256(candidate),
    sha256(expected),
  ]);
  return fixedLengthTimingSafeEqual(candidateDigest, expectedDigest);
}

async function importSessionKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = textEncoder.encode(secret);
  if (keyMaterial.byteLength < 32) {
    throw new Error("AUTH_SESSION_SECRET must contain at least 32 bytes.");
  }
  return crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<SessionPayload>;
  return (
    candidate.v === 1 &&
    Number.isSafeInteger(candidate.iat) &&
    Number.isSafeInteger(candidate.exp) &&
    typeof candidate.sid === "string" &&
    candidate.sid.length >= 16 &&
    candidate.sid.length <= 128
  );
}

export async function createSessionToken(
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<string> {
  const payload: SessionPayload = {
    v: 1,
    iat: nowSeconds,
    exp: nowSeconds + SESSION_TTL_SECONDS,
    sid: crypto.randomUUID(),
  };
  const encodedPayload = encodeBase64Url(
    textEncoder.encode(JSON.stringify(payload)),
  );
  const key = await importSessionKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      textEncoder.encode(encodedPayload),
    ),
  );
  return `${encodedPayload}.${encodeBase64Url(signature)}`;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<SessionPayload | null> {
  if (token.length > 2_048) {
    return null;
  }
  const parts = token.split(".");
  const encodedPayload = parts[0];
  const encodedSignature = parts[1];
  if (
    parts.length !== 2 ||
    !encodedPayload ||
    !encodedSignature
  ) {
    return null;
  }

  try {
    const signature = decodeBase64Url(encodedSignature);
    if (signature.byteLength !== 32) {
      return null;
    }
    const key = await importSessionKey(secret);
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      new Uint8Array(signature).buffer,
      textEncoder.encode(encodedPayload),
    );
    if (!validSignature) {
      return null;
    }

    const parsed: unknown = JSON.parse(
      textDecoder.decode(decodeBase64Url(encodedPayload)),
    );
    if (!isSessionPayload(parsed)) {
      return null;
    }
    if (
      parsed.iat > nowSeconds + 60 ||
      parsed.exp <= nowSeconds ||
      parsed.exp <= parsed.iat ||
      parsed.exp - parsed.iat > SESSION_TTL_SECONDS
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getCookie(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }
    if (cookie.slice(0, separatorIndex).trim() === name) {
      return cookie.slice(separatorIndex + 1).trim();
    }
  }
  return null;
}

export function createSessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    `Max-Age=${SESSION_TTL_SECONDS}`,
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

export function clearSessionCookie(): string {
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

export function safeReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001F\u007F]/u.test(value)
  ) {
    return "/";
  }

  try {
    const parsed = new URL(value, "https://life-ledger.invalid");
    if (
      parsed.origin !== "https://life-ledger.invalid" ||
      parsed.pathname === "/auth" ||
      parsed.pathname.startsWith("/auth/")
    ) {
      return "/";
    }
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/";
  }
}

export async function readUrlEncodedBody(
  request: Request,
  maximumBytes = LOGIN_BODY_LIMIT_BYTES,
): Promise<URLSearchParams> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) {
    return new URLSearchParams();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    totalBytes += result.value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new RequestBodyTooLargeError();
    }
    chunks.push(result.value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new URLSearchParams(textDecoder.decode(body));
}

export async function createLoginRateLimitKey(
  request: Request,
): Promise<string> {
  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  return encodeBase64Url(
    await sha256(`life-ledger-login\u0000${address}`),
  );
}
