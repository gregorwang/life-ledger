import { describe, expect, it } from "vitest";

import {
  dayLabel,
  feedTime,
  groupFeedByDay,
  isMediaOnlyBody,
  matchesFeedTab,
  mediaGridLayout,
  mediaOnlyMarker,
  visibleTags,
  weekStats,
} from "./feed-model";
import type { LedgerEntry } from "./models";

const TZ = "Asia/Tokyo";
const NOW = new Date("2026-09-24T03:00:00Z"); // 12:00 in Tokyo

function entry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    id: "entry",
    type: "thought",
    title: "",
    bodyRaw: "正文",
    bodySummary: "",
    occurredAt: "2026-09-24T01:00:00Z",
    datePrecision: "exact",
    createdAt: "2026-09-24T01:00:00Z",
    visibility: "private",
    status: "active",
    sourceChannel: "web",
    sourceMessageId: null,
    tags: [],
    score: null,
    mediaWorkId: null,
    seasonLabel: null,
    episodeLabel: null,
    ratingScope: null,
    versionNo: 1,
    media: [],
    followUps: [],
    links: [],
    revisions: [],
    audit: [],
    ...overrides,
  };
}

describe("feed grouping", () => {
  it("groups by local day, newest first, with today/yesterday labels", () => {
    const days = groupFeedByDay(
      [
        entry({ id: "a", occurredAt: "2026-09-23T14:30:00Z" }), // 23:30 on the 23rd
        entry({ id: "b", occurredAt: "2026-09-23T15:30:00Z" }), // 00:30 on the 24th
        entry({ id: "c", occurredAt: "2026-09-24T02:00:00Z" }),
      ],
      NOW,
      TZ,
    );
    expect(days.map((day) => [day.label, day.entries.map((item) => item.id)])).toEqual([
      ["今天 · 9月24日", ["c", "b"]],
      ["昨天 · 9月23日", ["a"]],
    ]);
  });

  it("keeps imprecise dates in their own section", () => {
    const days = groupFeedByDay(
      [
        entry({ id: "exact", occurredAt: "2026-02-14T03:00:00Z" }),
        entry({
          id: "month",
          occurredAt: "2026-02-14T03:00:00Z",
          datePrecision: "month",
        }),
      ],
      NOW,
      TZ,
    );
    expect(days).toHaveLength(2);
    expect(days.find((day) => day.entries[0]!.id === "month")!.label).toBe("约2026年2月");
  });

  it("adds the year only for other years", () => {
    expect(dayLabel("2026-09-01", NOW, TZ)).not.toContain("2026");
    expect(dayLabel("2025-09-01", NOW, TZ)).toContain("2025");
  });
});

describe("feed post helpers", () => {
  it("shows clock time for exact entries", () => {
    expect(feedTime(entry({ occurredAt: "2026-09-24T01:05:00Z" }), TZ)).toBe("10:05");
  });

  it("filters tabs by entry type", () => {
    expect(matchesFeedTab("thoughts", entry({ type: "idea" }))).toBe(true);
    expect(matchesFeedTab("thoughts", entry({ type: "mood" }))).toBe(false);
    expect(matchesFeedTab("anime", entry({ type: "anime" }))).toBe(true);
    expect(matchesFeedTab("all", entry({ type: "screen" }))).toBe(true);
  });

  it("hides system tags but keeps user tags", () => {
    expect(visibleTags(entry({ tags: ["thought", "episode", "散步"] }))).toEqual(["散步"]);
  });

  it("keeps the mood tag out of the hashtag row", () => {
    expect(visibleTags(entry({ tags: ["mood:😌", "散步"] }))).toEqual(["散步"]);
  });

  it("marks media-only posts so the placeholder text is not rendered", () => {
    const media = [
      {
        id: "m",
        kind: "video" as const,
        mimeType: "video/mp4",
        url: "/media/x",
        width: null,
        height: null,
        durationMs: 1000,
      },
    ];
    expect(mediaOnlyMarker(media)).toBe("[视频]");
    expect(isMediaOnlyBody(entry({ bodyRaw: "[视频]", media }))).toBe(true);
    expect(isMediaOnlyBody(entry({ bodyRaw: "[视频]" }))).toBe(false);
  });

  it("chooses a WeChat-style grid", () => {
    expect([1, 2, 3, 4, 5, 9].map(mediaGridLayout)).toEqual([
      "single",
      "pair",
      "grid",
      "pair",
      "grid",
      "grid",
    ]);
  });

  it("counts the last seven days", () => {
    expect(
      weekStats(
        [
          entry({ id: "1", type: "anime", visibility: "public" }),
          entry({ id: "2" }),
          entry({ id: "3", occurredAt: "2026-09-01T00:00:00Z" }),
          entry({ id: "4", status: "deleted" }),
        ],
        NOW,
      ),
    ).toEqual({ posts: 2, mediaLogs: 1, publicPosts: 1 });
  });
});
