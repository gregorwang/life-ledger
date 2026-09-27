import { describe, expect, it } from "vitest";

import {
  buildYearReview,
  type YearReviewEntryRow,
  type YearReviewMediaRow,
} from "./year-review";

function row(overrides: Partial<YearReviewEntryRow>): YearReviewEntryRow {
  return {
    id: "e",
    type: "thought",
    occurred_at: "2026-03-01T03:00:00.000Z",
    date_precision: "exact",
    tags_json: "[]",
    excerpt: "",
    ...overrides,
  };
}

function log(overrides: Partial<YearReviewMediaRow>): YearReviewMediaRow {
  return {
    media_work_id: "w",
    title: "Re:Zero",
    media_type: "anime",
    cover_url: null,
    occurred_at: "2026-05-01T00:00:00Z",
    date_precision: "exact",
    progress_state: null,
    rating_scope: "work",
    score_100: null,
    ...overrides,
  };
}

describe("buildYearReview", () => {
  it("counts the local year, streaks, moods and tags", () => {
    const review = buildYearReview({
      year: 2026,
      timezone: "Asia/Tokyo",
      years: [2026, 2025],
      entries: [
        // 2025-12-31 23:30 UTC is already 2026-01-01 in Tokyo.
        row({ id: "a", occurred_at: "2025-12-31T23:30:00.000Z", excerpt: "新年第一条" }),
        row({ id: "b", occurred_at: "2026-01-02T03:00:00.000Z", type: "mood", tags_json: '["mood:😢","散步"]' }),
        row({ id: "c", occurred_at: "2026-01-02T09:00:00.000Z", type: "mood", tags_json: '["mood:😌","散步"]' }),
        row({ id: "d", occurred_at: "2026-01-03T03:00:00.000Z", tags_json: '["thought","读书"]' }),
        row({ id: "e", occurred_at: "2026-02-10T03:00:00.000Z", date_precision: "month" }),
        // 2026-12-31 16:00 UTC is 2027 in Tokyo and must be excluded.
        row({ id: "f", occurred_at: "2026-12-31T16:00:00.000Z" }),
      ],
      media: [],
      books: [],
      music: [],
      places: [],
    });

    expect(review.entries.total).toBe(5);
    expect(review.entries.activeDays).toBe(3);
    expect(review.entries.longestStreak).toBe(3);
    expect(review.entries.byMonth.slice(0, 3)).toEqual([4, 1, 0]);
    expect(review.moods.days).toEqual([{ date: "2026-01-02", mood: "😌" }]);
    expect(review.moods.counts).toEqual([
      { key: "😌", count: 1 },
      { key: "😢", count: 1 },
    ]);
    expect(review.topTags).toEqual([
      { key: "散步", count: 2 },
      { key: "读书", count: 1 },
    ]);
    expect(review.firstEntry).toMatchObject({ id: "a", excerpt: "新年第一条" });
  });

  it("keeps the latest score per work", () => {
    const review = buildYearReview({
      year: 2026,
      timezone: "UTC",
      years: [2026],
      entries: [],
      media: [
        log({ occurred_at: "2026-05-01T00:00:00Z", score_100: 80 }),
        log({ occurred_at: "2026-06-01T00:00:00Z", score_100: 95 }),
        // An episode score does not replace the work score.
        log({ occurred_at: "2026-07-01T00:00:00Z", score_100: 40, rating_scope: "episode" }),
      ],
      books: [],
      music: [],
      places: [],
    });
    expect(review.works).toEqual([
      expect.objectContaining({ mediaWorkId: "w", logCount: 3, score: 9.5, completedOn: null }),
    ]);
  });

  it("lists every work seen this year, unscored and finished ones first", () => {
    const scoredInProgress = Array.from({ length: 13 }, (_, index) =>
      log({ media_work_id: `w${index}`, title: `W${index}`, progress_state: "watching", score_100: 90 }),
    );
    const review = buildYearReview({
      year: 2026,
      timezone: "Asia/Tokyo",
      years: [2026],
      entries: [],
      media: [
        ...scoredInProgress,
        // 2026-07-05 22:00 in Tokyo, finished without a score.
        log({
          media_work_id: "hyouka",
          title: "冰菓",
          occurred_at: "2026-07-05T13:00:00Z",
          progress_state: "completed",
        }),
        log({
          media_work_id: "toxin",
          title: "婚姻剧毒",
          occurred_at: "2026-07-20T00:00:00Z",
          date_precision: "month",
          progress_state: "watched",
        }),
        // Only on the want-to-watch list.
        log({ media_work_id: "planned", title: "想看", progress_state: "planned" }),
      ],
      books: [],
      music: [],
      places: [],
    });

    expect(review.works).toHaveLength(15);
    expect(review.works.slice(0, 2)).toEqual([
      expect.objectContaining({ mediaWorkId: "hyouka", score: null, completedOn: "2026-07-05" }),
      expect.objectContaining({ mediaWorkId: "toxin", score: null, completedOn: "2026-07" }),
    ]);
    expect(review.works.some((work) => work.mediaWorkId === "planned")).toBe(false);
  });
});
