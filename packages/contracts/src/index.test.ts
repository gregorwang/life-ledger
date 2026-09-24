import { describe, expect, it } from "vitest";

import {
  captureEntryInputSchema,
  createGameLibraryItemInputSchema,
  createMediaSeasonInputSchema,
  createMediaWorkInputSchema,
  entryTypeSchema,
  listMediaWorksInputSchema,
  logMediaInputSchema,
  moodFromTags,
  normalizeMood,
  replaceStickerCodes,
  normalizeMediaTitle,
  profileSchema,
  createShelfItemInputSchema,
  updateShelfItemInputSchema,
  publicTimelineResponseSchema,
  registerEntryMediaInputSchema,
  scoreToInteger,
  updateGameLibraryItemInputSchema,
  withMoodTag,
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

  it("defaults media attachments to none and caps them at nine", () => {
    const base = {
      rawText: "拍了几张照片",
      occurredAt: "2026-09-24T12:00:00+09:00",
      source: { channel: "web", messageId: null, conversationId: null },
    };
    expect(captureEntryInputSchema.parse(base).mediaIds).toEqual([]);
    expect(() =>
      captureEntryInputSchema.parse({
        ...base,
        mediaIds: Array.from({ length: 10 }, (_, index) => `media_${index}`),
      }),
    ).toThrow();
    expect(() =>
      captureEntryInputSchema.parse({ ...base, mediaIds: ["media_1", "media_1"] }),
    ).toThrow();
  });

  it("accepts only consistent entry media registrations", () => {
    const key = "entry-media/0b8f6a2e-5c1d-4f7a-9e3b-2d6c8a1f4e70";
    expect(
      registerEntryMediaInputSchema.parse({
        objectKey: `${key}.mp4`,
        kind: "video",
        mimeType: "video/mp4",
        sizeBytes: 50 * 1024 * 1024,
        durationMs: 12_000,
      }),
    ).toMatchObject({ width: null, height: null, durationMs: 12_000 });
    for (const invalid of [
      { objectKey: `${key}.mp4`, kind: "image", mimeType: "video/mp4", sizeBytes: 10 },
      { objectKey: `${key}.jpg`, kind: "image", mimeType: "image/png", sizeBytes: 10 },
      { objectKey: `${key}.jpg`, kind: "image", mimeType: "image/jpeg", sizeBytes: 30 * 1024 * 1024 },
      { objectKey: "covers/anime/x-v1.webp", kind: "image", mimeType: "image/webp", sizeBytes: 10 },
    ]) {
      expect(() => registerEntryMediaInputSchema.parse(invalid)).toThrow();
    }
  });

  it("stores one mood emoji as a tag and reads it back", () => {
    const tags = withMoodTag(["mood:😢", "散步"], "😌");
    expect(tags).toEqual(["mood:😌", "散步"]);
    expect(moodFromTags(tags)).toBe("😌");
    expect(withMoodTag(tags, null)).toEqual(["散步"]);
    expect(moodFromTags(["散步"])).toBeNull();
    expect(withMoodTag(Array.from({ length: 30 }, (_, i) => `t${i}`), "😄")).toHaveLength(30);
  });

  it("keeps emoji in raw text and accepts a mood on capture", () => {
    const parsed = captureEntryInputSchema.parse({
      rawText: "今天好累 😮‍💨 但是吃到了拉面 🍜",
      occurredAt: "2026-09-24T12:00:00+09:00",
      source: { channel: "mcp", messageId: "m1", conversationId: null },
      mood: "🥱",
    });
    expect(parsed.rawText).toBe("今天好累 😮‍💨 但是吃到了拉面 🍜");
    expect(parsed.mood).toBe("🥱");
  });

  it("only lets the profile point at private entry-media images", () => {
    expect(profileSchema.parse({})).toEqual({
      displayName: null,
      signature: null,
      avatarUrl: null,
      coverUrl: null,
    });
    expect(
      profileSchema.parse({
        avatarUrl: "/media/entry-media/0f8fad5b-d9cb-469f-a165-70867728950e.webp",
      }).avatarUrl,
    ).toContain("entry-media");
    for (const url of [
      "https://example.com/a.webp",
      "/media/entry-media/0f8fad5b-d9cb-469f-a165-70867728950e.mp4",
      "/media/entry-media/../secret.webp",
    ]) {
      expect(() => profileSchema.parse({ coverUrl: url })).toThrow();
    }
  });

  it("validates shelf items per kind", () => {
    const book = createShelfItemInputSchema.parse({ kind: "book", title: "百年孤独" });
    expect(book).toMatchObject({ shelfStatus: "done", format: null, excerpts: [], rating: null });
    expect(() =>
      createShelfItemInputSchema.parse({ kind: "music", title: "晴天", format: "ebook" }),
    ).toThrow();
    expect(() =>
      createShelfItemInputSchema.parse({
        kind: "book",
        title: "x",
        startedOn: "2026-09-10",
        finishedOn: "2026-09-01",
      }),
    ).toThrow();
    for (const coverUrl of ["javascript:alert(1)", "http://example.com/a.jpg", "//evil/x.png"]) {
      expect(() =>
        createShelfItemInputSchema.parse({ kind: "book", title: "x", coverUrl }),
      ).toThrow();
    }
    expect(
      createShelfItemInputSchema.parse({
        kind: "music",
        title: "x",
        coverUrl: "/media/entry-media/0f8fad5b-d9cb-469f-a165-70867728950e.webp",
      }).coverUrl,
    ).toContain("/media/");
    expect(() => updateShelfItemInputSchema.parse({ versionNo: 1 })).toThrow();
  });
});

describe("sticker codes", () => {
  it("turns WeChat sticker codes into emoji and leaves other brackets alone", () => {
    expect(replaceStickerCodes("respect！[加油]看看后面[捂脸]")).toBe("respect！💪看看后面🤦");
    expect(replaceStickerCodes("第[3]集 [不存在的表情] [a b]")).toBe("第[3]集 [不存在的表情] [a b]");
  });

  it("normalises moods given as stickers or preset names", () => {
    expect(normalizeMood("[流泪]")).toBe("😢");
    expect(normalizeMood("平静")).toBe("😌");
    expect(normalizeMood(" 🥹 ")).toBe("🥹");
  });

  it("keeps the mood on media logs", () => {
    const parsed = logMediaInputSchema.parse({
      rawText: "看完了",
      title: "作品",
      occurredAt: "2026-09-24T08:00:00Z",
      source: { channel: "mcp", messageId: "m1", conversationId: null },
      mood: "🥹",
    });
    expect(parsed.mood).toBe("🥹");
  });
});
