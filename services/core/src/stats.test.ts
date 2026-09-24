import { describe, expect, it } from "vitest";

import {
  aggregateStats,
  isValidTimeZone,
  localDateKey,
  timeZoneOffsetMinutes,
  type StatsRow,
} from "./stats";

function row(overrides: Partial<StatsRow>): StatsRow {
  return {
    id: "ent_1",
    type: "note",
    visibility: "private",
    occurred_at: "2026-09-10T03:00:00.000Z",
    tags_json: "[]",
    media_work_id: null,
    media_title: null,
    media_type: null,
    rating_scope: null,
    score_100: null,
    ...overrides,
  };
}

describe("时区工具", () => {
  it("按个人时区切分日期", () => {
    expect(localDateKey("2026-09-30T16:00:00.000Z", "Asia/Tokyo")).toBe(
      "2026-10-01",
    );
    expect(localDateKey("2026-09-30T16:00:00.000Z", "UTC")).toBe("2026-09-30");
  });

  it("计算时区偏移并拒绝无效时区", () => {
    expect(
      timeZoneOffsetMinutes("Asia/Tokyo", new Date("2026-09-24T12:00:00Z")),
    ).toBe(540);
    expect(
      timeZoneOffsetMinutes(
        "America/New_York",
        new Date("2026-01-15T12:00:00Z"),
      ),
    ).toBe(-300);
    expect(isValidTimeZone("Asia/Tokyo")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
  });
});

describe("aggregateStats", () => {
  const options = {
    from: "2026-09-01T00:00:00.000Z",
    to: "2026-10-01T00:00:00.000Z",
    timezone: "Asia/Tokyo",
    truncated: false,
  };

  it("汇总类型、标签、活跃天数与媒体评分", () => {
    const stats = aggregateStats(
      [
        row({
          id: "ent_a",
          type: "anime",
          occurred_at: "2026-09-12T12:00:00.000Z",
          tags_json: '["动画","周末","周末"]',
          media_work_id: "mw_1",
          media_title: "葬送的芙莉莲",
          media_type: "anime",
          rating_scope: "episode",
          score_100: 95,
        }),
        row({
          id: "ent_b",
          type: "anime",
          occurred_at: "2026-09-13T12:00:00.000Z",
          tags_json: '["动画"]',
          media_work_id: "mw_1",
          media_title: "葬送的芙莉莲",
          media_type: "anime",
          rating_scope: "episode",
          score_100: 88,
        }),
        row({
          id: "ent_c",
          type: "mood",
          visibility: "public",
          occurred_at: "2026-09-13T13:00:00.000Z",
          tags_json: "not json",
        }),
      ],
      options,
    );

    expect(stats.totalEntries).toBe(3);
    expect(stats.activeDays).toBe(2);
    expect(stats.byType).toEqual([
      { key: "anime", count: 2 },
      { key: "mood", count: 1 },
    ]);
    expect(stats.byVisibility).toEqual([
      { key: "private", count: 2 },
      { key: "public", count: 1 },
    ]);
    expect(stats.timeline).toEqual({
      granularity: "day",
      buckets: [
        { key: "2026-09-12", count: 1 },
        { key: "2026-09-13", count: 2 },
      ],
    });
    expect(stats.topTags).toEqual([
      { key: "动画", count: 2 },
      { key: "周末", count: 1 },
    ]);
    expect(stats.media).toMatchObject({
      logCount: 2,
      distinctWorks: 1,
      scoredCount: 2,
      averageScore: 9.2,
      byMediaType: [{ key: "anime", count: 2 }],
      works: [
        {
          mediaWorkId: "mw_1",
          logCount: 2,
          lastOccurredAt: "2026-09-13T12:00:00.000Z",
          averageScore: 9.2,
        },
      ],
    });
    expect(stats.media.topRated.map((item) => item.entryId)).toEqual([
      "ent_a",
      "ent_b",
    ]);
  });

  it("长区间按月分桶，空区间返回零值", () => {
    const yearly = aggregateStats(
      [
        row({ occurred_at: "2026-01-31T16:00:00.000Z" }),
        row({ id: "ent_2", occurred_at: "2026-03-01T00:00:00.000Z" }),
      ],
      { ...options, from: "2026-01-01T00:00:00.000Z" },
    );
    expect(yearly.timeline).toEqual({
      granularity: "month",
      buckets: [
        { key: "2026-02", count: 1 },
        { key: "2026-03", count: 1 },
      ],
    });

    const empty = aggregateStats([], { ...options, truncated: false });
    expect(empty.totalEntries).toBe(0);
    expect(empty.media.averageScore).toBeNull();
    expect(empty.timeline.buckets).toEqual([]);
  });
});
