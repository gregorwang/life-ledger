import { describe, expect, it } from "vitest";

import {
  createEntryMediaObjectKey,
  createUploadToken,
  decodeEntryMediaBase64,
  isWellFormedUploadToken,
  uploadBaseOrigin,
} from "./entry-media";

describe("core entry media helpers", () => {
  it("decodes strict base64 within the cap", () => {
    expect(decodeEntryMediaBase64("/9j/4A==", 16)).toEqual(
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    );
    expect(decodeEntryMediaBase64("data:image/jpeg;base64,/9j/", 16)).toBe("invalid");
    expect(decodeEntryMediaBase64("/9j/4A==", 3)).toBe("too_large");
  });

  it("creates unguessable tokens and extension-matched keys", () => {
    const token = createUploadToken();
    expect(isWellFormedUploadToken(token)).toBe(true);
    expect(createUploadToken()).not.toBe(token);
    expect(isWellFormedUploadToken("../../etc")).toBe(false);
    expect(createEntryMediaObjectKey("video/quicktime")).toMatch(
      /^entry-media\/[a-f0-9-]{36}\.mov$/,
    );
  });

  it("derives the upload origin from configuration", () => {
    expect(
      uploadBaseOrigin(undefined, "https://ledger.example.test/public-media"),
    ).toBe("https://ledger.example.test");
    expect(uploadBaseOrigin("https://web.example.test", undefined)).toBe(
      "https://web.example.test",
    );
  });
});
