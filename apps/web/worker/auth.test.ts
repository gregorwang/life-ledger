import { describe, expect, it } from "vitest";

import {
  LOGIN_BODY_LIMIT_BYTES,
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  RequestBodyTooLargeError,
  clearSessionCookie,
  createLoginRateLimitKey,
  createSessionCookie,
  createSessionToken,
  passwordMatches,
  readUrlEncodedBody,
  safeReturnPath,
  verifySessionToken,
} from "./auth";

const TEST_SESSION_SECRET =
  "test-only-session-key-material-that-is-long-enough";

describe("password verification", () => {
  it("accepts only an exact password match", async () => {
    await expect(
      passwordMatches("correct-test-value", "correct-test-value"),
    ).resolves.toBe(true);
    await expect(
      passwordMatches("incorrect-test-value", "correct-test-value"),
    ).resolves.toBe(false);
  });
});

describe("signed sessions", () => {
  it("accepts a valid token and rejects tampering and expiration", async () => {
    const issuedAt = 2_000_000_000;
    const token = await createSessionToken(TEST_SESSION_SECRET, issuedAt);

    const session = await verifySessionToken(
      token,
      TEST_SESSION_SECRET,
      issuedAt + 1,
    );
    expect(session?.iat).toBe(issuedAt);
    expect(session?.exp).toBe(issuedAt + SESSION_TTL_SECONDS);

    const finalCharacter = token.endsWith("a") ? "b" : "a";
    await expect(
      verifySessionToken(
        `${token.slice(0, -1)}${finalCharacter}`,
        TEST_SESSION_SECRET,
        issuedAt + 1,
      ),
    ).resolves.toBeNull();
    await expect(
      verifySessionToken(
        token,
        TEST_SESSION_SECRET,
        issuedAt + SESSION_TTL_SECONDS,
      ),
    ).resolves.toBeNull();
  });

  it("builds host-only hardened cookie headers", () => {
    const sessionCookie = createSessionCookie("signed-token");
    expect(sessionCookie).toContain(
      `${SESSION_COOKIE_NAME}=signed-token`,
    );
    expect(sessionCookie).toContain("Path=/");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toContain("SameSite=Strict");
    expect(sessionCookie).not.toContain("Domain=");

    const clearedCookie = clearSessionCookie();
    expect(clearedCookie).toContain("Max-Age=0");
    expect(clearedCookie).toContain("HttpOnly");
    expect(clearedCookie).toContain("Secure");
  });
});

describe("login request hardening", () => {
  it("allows only same-origin relative return paths", () => {
    expect(safeReturnPath("/entries?q=one")).toBe("/entries?q=one");
    expect(safeReturnPath("https://example.com")).toBe("/");
    expect(safeReturnPath("//example.com/path")).toBe("/");
    expect(safeReturnPath("/auth/logout")).toBe("/");
    expect(safeReturnPath("/\\example.com")).toBe("/");
  });

  it("limits the encoded login body size", async () => {
    const request = new Request("https://example.test/auth/login", {
      method: "POST",
      body: `password=${"x".repeat(LOGIN_BODY_LIMIT_BYTES)}`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    await expect(readUrlEncodedBody(request)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("keys rate limits by address without exposing the address", async () => {
    const first = await createLoginRateLimitKey(
      new Request("https://example.test/auth/login", {
        headers: {
          "CF-Connecting-IP": "192.0.2.1",
          "User-Agent": "first-agent",
        },
      }),
    );
    const sameAddress = await createLoginRateLimitKey(
      new Request("https://example.test/auth/login", {
        headers: {
          "CF-Connecting-IP": "192.0.2.1",
          "User-Agent": "second-agent",
        },
      }),
    );
    const differentAddress = await createLoginRateLimitKey(
      new Request("https://example.test/auth/login", {
        headers: { "CF-Connecting-IP": "192.0.2.2" },
      }),
    );

    expect(first).toBe(sameAddress);
    expect(first).not.toBe(differentAddress);
    expect(first).not.toContain("192.0.2.1");
  });
});
