import { describe, expect, it } from "vitest";

import {
  captureEntryInputSchema,
  createGameLibraryItemInputSchema,
  createMediaSeasonInputSchema,
  createMediaWorkInputSchema,
  entryTypeSchema,
  listMediaWorksInputSchema,
  logMediaInputSchema,
  normalizeMediaTitle,
  publicTimelineResponseSchema,
  scoreToInteger,
  updateGameLibraryItemInputSchema,
} from "./index";

describe("Life Ledger contracts", () => {
  it("forces new capture entries to remain private", () => {
    const parsed = captureEntryInputSchema.parse({
      rawText: "记一下：主站读取失败时保留静态回退。",
      type: "idea",
      occurredAt: "2026-07-26T10:00:00+09:00",
      source: {
        channel: "wechat",
        messageId: "wx-1",
        conversationId: "chat-1",
      },
    });

    expect(parsed.visibility).toBe("private");
  });

  it("rejects media scores outside 0.0–10.0", () => {
    const result = logMediaInputSchema.safeParse({
      rawText: "记录 10.1 分",
      title: "Example",
      score: 10.1,
      occurredAt: "2026-07-26T10:00:00+09:00",
      source: {
        channel: "wechat",
        messageId: "wx-2",
        conversationId: "chat-1",
      },
    });

    expect(result.success).toBe(false);
  });

  it("normalizes aliases and stores scores as integers", () => {
    expect(normalizeMediaTitle("《Re: Zero》")).toBe("rezero");
    expect(scoreToInteger(8.8)).toBe(88);
  });

  it("models movie and TV works inside one screen media type", () => {
    const movie = createMediaWorkInputSchema.parse({
      mediaType: "screen",
      mediaKind: "movie",
      title: "测试电影",
    });
    expect(movie).toMatchObject({
      mediaType: "screen",
      mediaKind: "movie",
      overallScore: null,
    });
    expect(entryTypeSchema.parse("screen")).toBe("screen");
    expect(
      createMediaWorkInputSchema.safeParse({
        mediaType: "anime",
        mediaKind: "tv",
        title: "错误分类",
      }).success,
    ).toBe(false);
    expect(
      listMediaWorksInputSchema.parse({
        mediaType: "screen",
        mediaKind: "tv",
      }),
    ).toMatchObject({ mediaType: "screen", mediaKind: "tv" });
  });

  it("keeps work, season and episode ratings optional and explicit", () => {
    const season = createMediaSeasonInputSchema.parse({
      label: "第2季",
      seasonNumber: 2,
    });
    expect(season.score).toBeNull();
    expect(season.watchStatus).toBeNull();

    const episodeWithoutScore = logMediaInputSchema.safeParse({
      rawText: "只记录看完这一集，不评分。",
      title: "示例动画",
      ratingScope: "episode",
      seasonLabel: "第2季",
      episodeLabel: "3",
      occurredAt: "2026-07-26T10:00:00+09:00",
      source: {
        channel: "web",
        messageId: "episode-explicit",
        conversationId: null,
      },
    });
    expect(episodeWithoutScore.success).toBe(true);

    expect(
      logMediaInputSchema.safeParse({
        rawText: "不能隐式生成单集。",
        title: "示例动画",
        episodeLabel: "3",
        occurredAt: "2026-07-26T10:00:00+09:00",
        source: {
          channel: "web",
          messageId: "episode-implicit",
          conversationId: null,
        },
      }).success,
    ).toBe(false);
    expect(
      logMediaInputSchema.safeParse({
        rawText: "评分必须说明范围。",
        title: "示例动画",
        score: 8.5,
        occurredAt: "2026-07-26T10:00:00+09:00",
        source: {
          channel: "web",
          messageId: "score-ambiguous",
          conversationId: null,
        },
      }).success,
    ).toBe(false);
  });

  it("carries movie/TV classification through screen log capture only", () => {
    const screenLog = logMediaInputSchema.parse({
      rawText: "看完一部电影。",
      mediaType: "screen",
      mediaKind: "movie",
      title: "测试电影",
      occurredAt: "2026-07-26T10:00:00+09:00",
      source: {
        channel: "web",
        messageId: "screen-movie",
        conversationId: null,
      },
    });
    expect(screenLog.mediaKind).toBe("movie");
    expect(
      logMediaInputSchema.safeParse({
        ...screenLog,
        mediaType: "anime",
      }).success,
    ).toBe(false);
  });

  it("keeps the public timeline on a strict field whitelist", () => {
    const valid = {
      schemaVersion: "1.0",
      generatedAt: "2026-07-26T04:00:00.000Z",
      revision: "pub_test",
      items: [
        {
          id: "ent_public",
          type: "note",
          title: "公开记录",
          body: "只包含明确确认的公开快照。",
          occurredAt: "2026-07-26T12:00:00+09:00",
          score: null,
          media: null,
        },
      ],
    };
    expect(publicTimelineResponseSchema.parse(valid)).toEqual(valid);
    expect(
      publicTimelineResponseSchema.safeParse({
        ...valid,
        items: [{ ...valid.items[0], sourceMessageId: "must-not-leak" }],
      }).success,
    ).toBe(false);
  });

  it("rejects free-text media status without changing the raw log body", () => {
    const input = {
      rawText: "首播起逐集追番，完整中文原始日志。",
      mediaType: "anime",
      title: "测试动画",
      progressState: "completed; followed weekly as aired",
      occurredAt: "2026-07-26T10:00:00+09:00",
      source: {
        channel: "mcp",
        messageId: "status-test",
      },
    };
    expect(() => logMediaInputSchema.parse(input)).toThrow();
    expect(input.rawText).toBe("首播起逐集追番，完整中文原始日志。");
  });

  it("validates complete and optimistic game-library mutations", () => {
    const created = createGameLibraryItemInputSchema.parse({
      platform: "PS5",
      title: "测试游戏",
      playTime: "12.5h",
      progress: 40,
      trophies: { platinum: 0, gold: 1, silver: 2, bronze: 3 },
      achievementsCurrent: 6,
      achievementsTotal: 20,
      rating: 8.5,
      review: "中文评价",
      tags: ["RPG"],
      coverUrl: "/cover.webp",
      sourceUrl: "https://example.com/game",
    });
    expect(created.progress).toBe(40);
    expect(
      updateGameLibraryItemInputSchema.parse({
        versionNo: 3,
        playTime: "20h",
      }),
    ).toEqual({ versionNo: 3, playTime: "20h" });
  });
});
