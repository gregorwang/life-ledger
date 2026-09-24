import { describe, expect, it, vi } from "vitest";

import { loadPublicAnime } from "./index";

const fallback = {
  schemaVersion: "1.0" as const,
  generatedAt: "2026-07-26T00:00:00.000Z",
  revision: "static-v1",
  items: [],
};

describe("public site adapter", () => {
  it("uses a valid remote projection", async () => {
    const remote = { ...fallback, revision: "remote-v2" };
    const result = await loadPublicAnime({
      endpoint: "https://ledger.example.test/public/v1/anime",
      fallback,
      fetcher: vi.fn(async () => Response.json(remote)),
    });

    expect(result).toEqual({
      data: remote,
      source: "remote",
      degraded: false,
    });
  });

  it("falls back when the service fails or leaks undeclared fields", async () => {
    const result = await loadPublicAnime({
      endpoint: "https://ledger.example.test/public/v1/anime",
      fallback,
      fetcher: vi.fn(async () =>
        Response.json({
          ...fallback,
          sourceMessageId: "must-not-leak",
        }),
      ),
    });

    expect(result).toEqual({
      data: fallback,
      source: "static-fallback",
      degraded: true,
    });
  });
});
