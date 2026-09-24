import { describe, expect, it } from "vitest";

import { activeEntriesByOccurredAtDesc } from "./timeline-order";

describe("timeline entry ordering", () => {
  it("uses occurredAt and excludes soft-deleted entries", () => {
    const entries = [
      {
        id: "haihara-april",
        occurredAt: "2026-04-02T16:28:00.000Z",
        createdAt: "2026-07-26T12:09:13.088Z",
        status: "active" as const,
      },
      {
        id: "hyouka-july",
        occurredAt: "2026-07-04T15:00:00.000Z",
        createdAt: "2026-07-05T02:16:58.228Z",
        status: "active" as const,
      },
      {
        id: "deleted-latest",
        occurredAt: "2026-07-26T12:09:13.088Z",
        createdAt: "2026-07-26T12:09:13.088Z",
        status: "deleted" as const,
      },
    ];

    expect(activeEntriesByOccurredAtDesc(entries).map((entry) => entry.id)).toEqual([
      "hyouka-july",
      "haihara-april",
    ]);
  });
});
