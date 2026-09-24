import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  ENTRY_MEDIA_LIMITS,
  captureEntryInputSchema,
  createEntryMediaUploadInputSchema,
  createGameLibraryItemInputSchema,
  createMediaWorkInputSchema,
  createPlaceInputSchema,
  createShelfItemInputSchema,
  datePrecisionSchema,
  entryMediaMimeTypeSchema,
  ledgerStatsInputSchema,
  listEntriesInputSchema,
  listMediaWorksInputSchema,
  normalizeMood,
  listTagsInputSchema,
  logMediaInputSchema,
  mediaKindSchema,
  mediaTypeSchema,
  mediaWatchStatusSchema,
  onThisDayInputSchema,
  placeCategorySchema,
  searchAllInputSchema,
  searchKindSchema,
  settingsSchema,
  shelfExcerptSchema,
  shelfFormatSchema,
  shelfKindSchema,
  shelfStatusSchema,
  updateEntryInputSchema,
  updateGameLibraryItemInputSchema,
  updateMediaWorkInputSchema,
  updatePlaceInputSchema,
  updateShelfItemInputSchema,
  uploadEntryMediaInputSchema,
  uploadMediaImageInputSchema,
  type CoreBinding,
  type EntryLinkInput,
  type YearReview,
} from "@life-ledger/contracts";

export type McpCoreBinding = Pick<
  CoreBinding,
  | "listEntries"
  | "getEntry"
  | "captureEntry"
  | "updateEntry"
  | "deleteEntry"
  | "restoreEntry"
  | "listMediaWorks"
  | "getMediaWork"
  | "createMediaWork"
  | "updateMediaWork"
  | "uploadMediaImage"
  | "getGameLibraryItem"
  | "createGameLibraryItem"
  | "updateGameLibraryItem"
  | "deleteGameLibraryItem"
  | "restoreGameLibraryItem"
  | "getShelfItem"
  | "createShelfItem"
  | "updateShelfItem"
  | "addShelfExcerpt"
  | "deleteShelfItem"
  | "restoreShelfItem"
  | "getPlace"
  | "createPlace"
  | "updatePlace"
  | "deletePlace"
  | "restorePlace"
  | "logMedia"
  | "preparePublish"
  | "confirmAction"
  | "unpublishEntry"
  | "addEntryFollowUp"
  | "deleteFollowUpById"
  | "uploadEntryMedia"
  | "createEntryMediaUpload"
  | "attachEntryMedia"
  | "removeEntryMediaById"
  | "searchAll"
  | "listLinkedEntries"
  | "getYearReview"
  | "getStats"
  | "listTags"
  | "getOnThisDay"
  | "getSettings"
  | "updateSettings"
>;

/**
 * The tool surface is deliberately small (23 tools) so modest models can pick
 * the right one: one "save_*" upsert per library, one search, one get and one
 * delete/restore that dispatch on the id prefix. versionNo and idempotency
 * keys are optional and filled in here when the caller leaves them out.
 */
const SERVER_INSTRUCTIONS = `Life Ledger 是用户的私人人生账本，所有内容默认仅自己可见。
怎么选工具：
- 记一句话、想法、心情、照片 → capture_entry（心情放 mood；聊的是某部作品/书/游戏就把它的 id 放 aboutId）
- 看了番剧/电影/电视剧 → log_media（有评分、集数；当时的心情也可以放 mood）
- 书或音乐（专辑/单曲/歌单）→ save_shelf_item
- 去了某个地方 → save_place
- 玩游戏 → save_game
- 给已有动态补一句 → add_follow_up
- 不知道东西在不在、id 是多少 → 先 search_all
- 看某条的完整内容 → get_item
id 前缀：ent_ 动态、book_ 书、music_ 音乐、place_ 地点、game_ 游戏、work_ 番剧/影视。
新建时不要传 id；修改时传 id，versionNo 可以不传。
用户原话要原样放进 rawText / review / note，不要改写或总结。`;

const idSchema = z.string().trim().min(1).max(256);

const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "日期格式 YYYY-MM-DD")
  .describe("YYYY-MM-DD");

const tagsField = z
  .array(z.string().trim().min(1).max(80))
  .max(30)
  .describe("标签，不带 #，例如 [\"读书\", \"科幻\"]");

const ratingField = z
  .number()
  .min(0)
  .max(10)
  .multipleOf(0.1)
  .nullable()
  .describe("评分 0–10，可以有一位小数");

const postToFeedField = z
  .string()
  .trim()
  .min(1)
  .max(50_000)
  .optional()
  .describe("可选：同时在「日常」发一条动态（用户原话），自动关联到这个条目");

const versionField = z
  .number()
  .int()
  .positive()
  .optional()
  .describe("可不传；传了就检查是否被别处改过");

const mediaIdsField = z
  .array(idSchema)
  .max(ENTRY_MEDIA_LIMITS.maxPerEntry)
  .default([])
  .describe("要附上的照片/视频 mediaId（最多 9 个），先用 upload_photo 或 create_upload_url 取得");

const sourceFields = {
  sourceChannel: z.enum(["wechat", "mcp"]).default("mcp").describe("消息来自微信填 wechat，否则 mcp"),
  idempotencyKey: idSchema
    .optional()
    .describe("可选：原始消息 id。传了之后重试不会重复记录"),
  conversationId: idSchema.nullable().default(null),
};

const moodDescription =
  "心情表情，一个 emoji，例如 😄 开心、😌 平静、😢 难过、😰 焦虑、🥹 感动；微信表情 [加油] [流泪] 这类也能传，会自动换成 emoji";

const moodField = z.string().trim().min(1).max(16).optional().describe(moodDescription);

const captureEntryToolSchema = z.object({
  rawText: z.string().trim().min(1).max(50_000).describe("用户原话，原样保存，可以带 emoji"),
  type: z.enum(["thought", "idea", "mood", "note"]).default("note"),
  mood: moodField,
  tags: tagsField.default([]),
  aboutId: idSchema
    .optional()
    .describe("可选：这条动态说的是哪本书/哪首歌/哪个地方/哪个游戏/哪部番剧影视的 id，会显示成卡片"),
  mediaIds: mediaIdsField,
  occurredAt: z.iso
    .datetime({ offset: true })
    .optional()
    .describe("发生时间，缺省为现在，例如 2026-09-24T20:00:00+09:00"),
  datePrecision: datePrecisionSchema.default("exact"),
  timezone: z.string().trim().min(1).max(80).default("Asia/Tokyo"),
  title: z.string().trim().max(300).nullable().default(null),
  ...sourceFields,
});

const logMediaToolSchema = z.object({
  title: z.string().trim().min(1).max(300).describe("作品名"),
  rawText: z.string().trim().min(1).max(50_000).describe("用户原话"),
  mediaType: mediaTypeSchema.default("anime").describe("anime 番剧 / screen 电影电视剧"),
  mediaKind: mediaKindSchema.nullable().default(null).describe("screen 时填 movie 或 tv"),
  score: ratingField.default(null),
  ratingScope: z.enum(["episode", "season", "work"]).nullable().default(null).describe("评分针对单集/一季/整部"),
  seasonLabel: z.string().trim().min(1).max(80).nullable().default(null).describe("例如 第3季"),
  episodeLabel: z.string().trim().min(1).max(80).nullable().default(null).describe("例如 第4集"),
  progressState: mediaWatchStatusSchema.nullable().default(null),
  comment: z.string().trim().max(50_000).nullable().default(null),
  mood: moodField,
  aliases: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  mediaIds: mediaIdsField,
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  datePrecision: datePrecisionSchema.default("exact"),
  timezone: z.string().trim().min(1).max(80).default("Asia/Tokyo"),
  ...sourceFields,
});

const saveShelfItemToolSchema = z.object({
  id: idSchema.optional().describe("修改已有条目时填 book_… / music_…；新建时不填"),
  versionNo: versionField,
  kind: shelfKindSchema.optional().describe("新建时必填：book 书 / music 音乐"),
  title: z.string().trim().min(1).max(300).optional().describe("书名、专辑名或歌名；新建时必填"),
  creator: z.string().trim().min(1).max(300).nullable().optional().describe("作者或歌手"),
  format: shelfFormatSchema
    .nullable()
    .optional()
    .describe("书：paper / ebook / audiobook；音乐：album / track / playlist"),
  status: shelfStatusSchema
    .optional()
    .describe("planned 想读想听 / in_progress 在读在循环 / done 读完听过 / dropped 弃了；新建默认 done"),
  rating: ratingField.optional(),
  progress: z.number().int().min(0).max(100).nullable().optional().describe("书读到百分之几"),
  review: z.string().trim().max(50_000).optional().describe("感受，用户原话"),
  addExcerpt: shelfExcerptSchema
    .optional()
    .describe("追加一条摘抄或歌词：{ text, location?, note? }"),
  tags: tagsField.optional(),
  startedOn: localDate.nullable().optional(),
  finishedOn: localDate.nullable().optional(),
  coverUrl: z.string().trim().max(2_000).nullable().optional().describe("封面，用 upload_photo 返回的 url"),
  sourceUrl: z.string().trim().max(2_000).nullable().optional(),
  postToFeed: postToFeedField,
});

const savePlaceToolSchema = z.object({
  id: idSchema.optional().describe("修改已有地点时填 place_…；新建时不填"),
  versionNo: versionField,
  name: z.string().trim().min(1).max(200).optional().describe("地点名；新建时必填"),
  visitedOn: localDate.optional().describe("到达日期；新建时缺省为今天"),
  leftOn: localDate.nullable().optional(),
  city: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .nullable()
    .optional()
    .describe("所在城市，例如 杭州、京都；足迹地图靠它点亮省份，尽量填"),
  country: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .nullable()
    .optional()
    .describe("国家或地区，例如 中国、日本、香港；足迹地图靠它点亮国家，尽量填"),
  category: placeCategorySchema
    .optional()
    .describe("city 城市 / sight 景点 / food 吃喝 / stay 住宿 / nature 自然 / event 活动 / other"),
  trip: z.string().trim().min(1).max(120).nullable().optional().describe("同一次旅行的名字，例如 2026 关西之旅"),
  rating: ratingField.optional(),
  note: z.string().trim().max(50_000).optional().describe("感受，用户原话"),
  tags: tagsField.optional(),
  coverUrl: z.string().trim().max(2_000).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional().describe("只有用户明确给出才填，不要猜"),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  postToFeed: postToFeedField,
});

const saveGameToolSchema = z.object({
  id: idSchema.optional().describe("修改已有游戏时填 game_…；新建时不填"),
  versionNo: versionField,
  title: z.string().trim().min(1).max(300).optional().describe("游戏名；新建时必填"),
  platform: z.string().trim().min(1).max(80).optional().describe("例如 PlayStation / Switch / PC；新建时必填"),
  rating: z.number().min(0).max(10).multipleOf(0.1).optional().describe("评分 0–10；新建时必填"),
  playTime: z.string().trim().min(1).max(80).optional().describe("例如 35h"),
  progress: z.number().int().min(0).max(100).optional().describe("完成度百分比"),
  review: z.string().trim().max(50_000).optional(),
  tags: tagsField.optional(),
  achievementsCurrent: z.number().int().min(0).optional(),
  achievementsTotal: z.number().int().min(0).optional(),
  trophies: z
    .object({
      platinum: z.number().int().min(0),
      gold: z.number().int().min(0),
      silver: z.number().int().min(0),
      bronze: z.number().int().min(0),
    })
    .optional(),
  coverUrl: z.string().trim().max(2_000).optional(),
  sourceUrl: z.string().trim().max(2_000).optional(),
  postToFeed: postToFeedField,
});

const saveMediaWorkToolSchema = z.object({
  id: idSchema.optional().describe("修改已有作品时填 work_…；新建时不填（一般直接用 log_media 就会自动建）"),
  mediaType: mediaTypeSchema.optional().describe("新建时必填：anime / screen"),
  mediaKind: mediaKindSchema.nullable().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  aliases: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  coverUrl: z.string().trim().min(1).max(2_000).nullable().optional(),
  watchStatus: mediaWatchStatusSchema.nullable().optional(),
  overallScore: ratingField.optional(),
});

const updateEntryToolSchema = z.object({
  entryId: idSchema,
  versionNo: versionField,
  bodyRaw: z.string().trim().min(1).max(50_000).optional().describe("改正后的原文，会生成新修订"),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  datePrecision: datePrecisionSchema.optional(),
  tags: tagsField.optional(),
  score: ratingField.optional(),
  reason: z.string().trim().min(1).max(300).default("Hermes correction"),
});

const searchEntriesToolSchema = z.object({
  query: z.string().trim().max(300).default("").describe("关键词；不填就按时间倒序列出"),
  type: z
    .enum(["thought", "idea", "mood", "anime", "screen", "note"])
    .nullable()
    .default(null),
  tag: z.string().trim().min(1).max(80).nullable().default(null),
  occurredFrom: z.iso.datetime({ offset: true }).nullable().default(null).describe("开始时间（含）"),
  occurredTo: z.iso.datetime({ offset: true }).nullable().default(null).describe("结束时间（不含）"),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).nullable().default(null).describe("翻页用，填上次返回的 nextCursor"),
});

const uploadPhotoToolSchema = z.object({
  base64Data: z.string().min(4).describe("文件内容的 Base64，不带 data: 前缀；解码后不超过 10 MB"),
  mimeType: entryMediaMimeTypeSchema,
  fileName: z.string().trim().min(1).max(160).default("photo"),
  purpose: z
    .enum(["post", "cover"])
    .default("post")
    .describe("post：配在动态里（返回 mediaId）；cover：作品/书/地点的封面（返回 url，只支持 1 MB 以内的 jpg/png/webp）"),
  width: z.number().int().positive().max(16_384).nullable().default(null),
  height: z.number().int().positive().max(16_384).nullable().default(null),
});

function nowDate(): string {
  return new Date().toISOString().slice(0, 10);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function domainError(code: string, message: string, status = 400): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code, status });
}

/** Which library an id belongs to, from its prefix. */
function kindOfId(id: string): "entry" | "shelf" | "place" | "game" | "work" | "followup" | "media" | null {
  if (id.startsWith("ent_")) return "entry";
  if (id.startsWith("book_") || id.startsWith("music_")) return "shelf";
  if (id.startsWith("place_")) return "place";
  if (id.startsWith("game_")) return "game";
  if (id.startsWith("work_")) return "work";
  if (id.startsWith("followup_")) return "followup";
  if (id.startsWith("media_")) return "media";
  return null;
}

function linkFor(id: string): EntryLinkInput {
  const kind = kindOfId(id);
  if (kind !== "shelf" && kind !== "place" && kind !== "game" && kind !== "work") {
    throw domainError(
      "INVALID_ABOUT_ID",
      "aboutId 只能是书、音乐、地点、游戏或番剧影视的 id（book_ / music_ / place_ / game_ / work_ 开头）。",
    );
  }
  return { kind, id };
}

/** Keeps only the keys the caller actually sent. */
function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

function isIdempotencyConflict(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith("IDEMPOTENCY_CONFLICT");
}

/** Short, model-friendly version of the web year review. */
function compactYearReview(review: YearReview) {
  return {
    year: review.year,
    entries: review.entries,
    moods: review.moods.counts,
    topTags: review.topTags,
    firstEntry: review.firstEntry,
    works: review.works.map(({ title, mediaType, score, logCount }) => ({ title, mediaType, score, logCount })),
    books: review.books.map((book) => ({
      id: book.id,
      title: book.title,
      creator: book.creator,
      rating: book.rating,
      finishedOn: book.finishedOn,
      excerpts: book.excerpts.length,
    })),
    music: review.music.map((item) => ({ id: item.id, title: item.title, creator: item.creator, rating: item.rating })),
    places: review.places.map((place) => ({
      id: place.id,
      name: place.name,
      city: place.city,
      country: place.country,
      visitedOn: place.visitedOn,
      trip: place.trip,
    })),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function serialize(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function errorDetails(error: unknown): {
  code: string;
  message: string;
  retryable: boolean;
} {
  if (error instanceof Error) {
    const candidate = error as Error & { code?: unknown; status?: unknown };
    const message = error.message || "Life Ledger 操作失败。";
    const messageCode = /^([A-Z][A-Z0-9_]+):/.exec(message)?.[1];
    const code =
      typeof candidate.code === "string"
        ? candidate.code
        : (messageCode ?? "LIFE_LEDGER_ERROR");
    const status =
      typeof candidate.status === "number" ? candidate.status : undefined;
    return {
      code,
      message,
      retryable: status === undefined ? false : status >= 500,
    };
  }
  return {
    code: "UNKNOWN_ERROR",
    message: "Life Ledger 操作失败。",
    retryable: false,
  };
}

async function toolResult<T>(operation: () => Promise<T>) {
  try {
    const value = await operation();
    return {
      content: [
        {
          type: "text" as const,
          text: serialize({ ok: true, data: value }),
        },
      ],
    };
  } catch (error: unknown) {
    const details = errorDetails(error);
    console.error(
      serialize({
        event: "life_ledger_mcp_tool_failed",
        error: details,
      }),
    );
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: serialize({ ok: false, error: details }),
        },
      ],
    };
  }
}

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const safeWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export function createServer(core: McpCoreBinding): McpServer {
  const server = new McpServer(
    { name: "Life Ledger", version: "0.5.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  /** Posts a private 日常 entry linked to a library item; retries are no-ops. */
  const postLinked = async (text: string, link: EntryLinkInput, tag: string) => {
    const key = `about:${link.kind}:${link.id}:${(await sha256Hex(text)).slice(0, 24)}`;
    try {
      return await core.captureEntry(
        captureEntryInputSchema.parse({
          rawText: text,
          type: "thought",
          occurredAt: nowIso(),
          tags: [tag],
          source: { channel: "mcp", messageId: key, conversationId: null },
          visibility: "private",
          mediaIds: [],
          links: [link],
        }),
      );
    } catch (error: unknown) {
      if (isIdempotencyConflict(error)) {
        return { alreadyPosted: true };
      }
      throw error;
    }
  };

  // ---------------------------------------------------------------- 写入

  server.registerTool(
    "capture_entry",
    {
      title: "记一条日常",
      description:
        "记一句话、想法、心情或照片，出现在网页「日常」里，默认仅自己可见。心情用 mood 传一个表情；说的是某本书/歌/地点/游戏/番剧影视时，把它的 id 放进 aboutId（不知道 id 先 search_all）。",
      inputSchema: captureEntryToolSchema,
      annotations: { ...safeWriteAnnotations, idempotentHint: true },
    },
    (input) =>
      toolResult(async () => {
        const occurredAt = input.occurredAt ?? nowIso();
        const messageId =
          input.idempotencyKey ??
          `auto:${(await sha256Hex(`${input.rawText}|${input.occurredAt ?? nowDate()}`)).slice(0, 32)}`;
        try {
          return await core.captureEntry(
            captureEntryInputSchema.parse({
              rawText: input.rawText,
              type: input.type,
              title: input.title,
              occurredAt,
              datePrecision: input.datePrecision,
              timezone: input.timezone,
              tags: input.tags,
              source: {
                channel: input.sourceChannel,
                messageId,
                conversationId: input.conversationId,
              },
              visibility: "private",
              mediaIds: input.mediaIds,
              ...(input.mood ? { mood: normalizeMood(input.mood) } : {}),
              ...(input.aboutId ? { links: [linkFor(input.aboutId)] } : {}),
            }),
          );
        } catch (error: unknown) {
          if (!input.idempotencyKey && isIdempotencyConflict(error)) {
            return { duplicate: true, message: "今天已经记过一模一样的内容，没有重复写入。" };
          }
          throw error;
        }
      }),
  );

  server.registerTool(
    "log_media",
    {
      title: "记一次看番/看剧/看电影",
      description:
        "记录看了什么番剧或电影电视剧，可带集数、季、评分和评论；作品不存在会自动创建。电影电视剧用 mediaType=screen。用户提到当时的心情就用 mood 传一个表情。",
      inputSchema: logMediaToolSchema,
      annotations: { ...safeWriteAnnotations, idempotentHint: true },
    },
    (input) =>
      toolResult(async () => {
        const messageId =
          input.idempotencyKey ??
          `auto:${(await sha256Hex(`${input.title}|${input.rawText}|${input.occurredAt ?? nowDate()}`)).slice(0, 32)}`;
        try {
          return await core.logMedia(
            logMediaInputSchema.parse({
              rawText: input.rawText,
              mediaType: input.mediaType,
              mediaKind: input.mediaKind,
              title: input.title,
              aliases: input.aliases,
              ratingScope: input.ratingScope,
              seasonId: null,
              seasonLabel: input.seasonLabel,
              episodeLabel: input.episodeLabel,
              progressState: input.progressState,
              score: input.score,
              comment: input.comment,
              occurredAt: input.occurredAt ?? nowIso(),
              datePrecision: input.datePrecision,
              timezone: input.timezone,
              source: {
                channel: input.sourceChannel,
                messageId,
                conversationId: input.conversationId,
              },
              visibility: "private",
              mediaIds: input.mediaIds,
              ...(input.mood ? { mood: normalizeMood(input.mood) } : {}),
            }),
          );
        } catch (error: unknown) {
          if (!input.idempotencyKey && isIdempotencyConflict(error)) {
            return { duplicate: true, message: "今天已经记过一模一样的内容，没有重复写入。" };
          }
          throw error;
        }
      }),
  );

  server.registerTool(
    "save_shelf_item",
    {
      title: "保存一本书或一张专辑/一首歌",
      description:
        "新建或修改书架（kind=book）和音乐（kind=music）。新建：不传 id，传 kind 和 title。修改：传 id，只传要改的字段。addExcerpt 追加一条摘抄或歌词；postToFeed 同时在「日常」发一条关联动态。先用 search_all 查一下，避免重复新建。",
      inputSchema: saveShelfItemToolSchema,
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(async () => {
        const fields = defined({
          title: input.title,
          creator: input.creator,
          format: input.format,
          shelfStatus: input.status,
          rating: input.rating,
          progress: input.progress,
          review: input.review,
          tags: input.tags,
          startedOn: input.startedOn,
          finishedOn: input.finishedOn,
          coverUrl: input.coverUrl,
          sourceUrl: input.sourceUrl,
        });
        let item;
        if (input.id) {
          item = await core.getShelfItem(input.id);
          if (Object.keys(fields).length) {
            item = await core.updateShelfItem(
              input.id,
              updateShelfItemInputSchema.parse({
                versionNo: input.versionNo ?? item.versionNo,
                ...fields,
              }),
            );
          }
        } else {
          if (!input.kind || !input.title) {
            throw domainError("MISSING_FIELDS", "新建时 kind（book / music）和 title 必填。");
          }
          item = await core.createShelfItem(
            createShelfItemInputSchema.parse({ kind: input.kind, ...fields }),
          );
        }
        if (input.addExcerpt) {
          item = await core.addShelfExcerpt(item.id, {
            versionNo: item.versionNo,
            excerpt: input.addExcerpt,
          });
        }
        const post = input.postToFeed
          ? await postLinked(input.postToFeed, { kind: "shelf", id: item.id }, item.kind === "book" ? "读书" : "音乐")
          : null;
        return { item, post };
      }),
  );

  server.registerTool(
    "save_place",
    {
      title: "保存一个去过的地方",
      description:
        "新建或修改「足迹」。新建：不传 id，传 name（visitedOn 缺省今天）。修改：传 id，只传要改的字段。trip 填同一次旅行的名字用来分组；postToFeed 同时在「日常」发一条关联动态。",
      inputSchema: savePlaceToolSchema,
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(async () => {
        const fields = defined({
          name: input.name,
          visitedOn: input.visitedOn,
          leftOn: input.leftOn,
          city: input.city,
          country: input.country,
          category: input.category,
          trip: input.trip,
          rating: input.rating,
          note: input.note,
          tags: input.tags,
          coverUrl: input.coverUrl,
          latitude: input.latitude,
          longitude: input.longitude,
        });
        let place;
        if (input.id) {
          place = await core.getPlace(input.id);
          if (Object.keys(fields).length) {
            place = await core.updatePlace(
              input.id,
              updatePlaceInputSchema.parse({
                versionNo: input.versionNo ?? place.versionNo,
                ...fields,
              }),
            );
          }
        } else {
          if (!input.name) {
            throw domainError("MISSING_FIELDS", "新建地点时 name 必填。");
          }
          place = await core.createPlace(
            createPlaceInputSchema.parse({ visitedOn: nowDate(), ...fields }),
          );
        }
        const post = input.postToFeed
          ? await postLinked(input.postToFeed, { kind: "place", id: place.id }, "足迹")
          : null;
        return { item: place, post };
      }),
  );

  server.registerTool(
    "save_game",
    {
      title: "保存一个游戏",
      description:
        "新建或修改游戏库。新建：不传 id，传 title、platform、rating（其余可选）。修改：传 id，只传要改的字段。postToFeed 同时在「日常」发一条关联动态。",
      inputSchema: saveGameToolSchema,
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(async () => {
        const { id, versionNo, postToFeed, ...rest } = input;
        const fields = defined(rest);
        let game;
        if (id) {
          game = await core.getGameLibraryItem(id);
          if (Object.keys(fields).length) {
            game = await core.updateGameLibraryItem(
              id,
              updateGameLibraryItemInputSchema.parse({
                versionNo: versionNo ?? game.versionNo,
                ...fields,
              }),
            );
          }
        } else {
          if (!input.title || !input.platform || input.rating === undefined) {
            throw domainError("MISSING_FIELDS", "新建游戏时 title、platform、rating 必填。");
          }
          game = await core.createGameLibraryItem(createGameLibraryItemInputSchema.parse(fields));
        }
        const post = postToFeed
          ? await postLinked(postToFeed, { kind: "game", id: game.id }, "游戏")
          : null;
        return { item: game, post };
      }),
  );

  server.registerTool(
    "save_media_work",
    {
      title: "修改番剧/影视作品信息",
      description:
        "修改作品的封面、观看状态、总评分、别名等；传 id 修改，不传 id 且给 mediaType + title 则新建。记录看了哪一集请用 log_media。",
      inputSchema: saveMediaWorkToolSchema,
      annotations: safeWriteAnnotations,
    },
    ({ id, ...input }) =>
      toolResult(async () => {
        const fields = defined(input);
        if (id) {
          const { mediaType: _ignored, ...patch } = fields;
          return core.updateMediaWork(id, updateMediaWorkInputSchema.parse(patch));
        }
        if (!input.mediaType || !input.title) {
          throw domainError("MISSING_FIELDS", "新建作品时 mediaType 和 title 必填。");
        }
        return core.createMediaWork(createMediaWorkInputSchema.parse(fields));
      }),
  );

  server.registerTool(
    "add_follow_up",
    {
      title: "给动态补一句",
      description: "给一条已有的日常动态追加补充（后来的想法），原文不变。entryId 以 ent_ 开头。",
      inputSchema: z.object({
        entryId: idSchema,
        body: z.string().trim().min(1).max(50_000).describe("补充内容，用户原话"),
      }),
      annotations: safeWriteAnnotations,
    },
    ({ entryId, body }) =>
      toolResult(() => core.addEntryFollowUp(entryId, { body, sourceChannel: "mcp" })),
  );

  server.registerTool(
    "update_entry",
    {
      title: "修改一条动态",
      description:
        "改正一条日常动态的原文、时间、标签或评分；会生成新的修订，旧版本仍保留。versionNo 可以不传。",
      inputSchema: updateEntryToolSchema,
      annotations: safeWriteAnnotations,
    },
    ({ entryId, versionNo, ...input }) =>
      toolResult(async () => {
        const current = versionNo ?? (await core.getEntry(entryId))?.versionNo;
        if (!current) {
          throw domainError("ENTRY_NOT_FOUND", `找不到动态 ${entryId}。`, 404);
        }
        return core.updateEntry(
          entryId,
          updateEntryInputSchema.parse({ ...defined(input), versionNo: current }),
        );
      }),
  );

  server.registerTool(
    "upload_photo",
    {
      title: "上传照片或短视频（Base64）",
      description:
        "上传一张照片或很短的视频。purpose=post：返回 mediaId，放进 capture_entry / log_media 的 mediaIds，或用 attach_media 挂到已有动态；purpose=cover：返回 url，用作书、地点、作品的封面。超过 10 MB 或较长的视频用 create_upload_url。",
      inputSchema: uploadPhotoToolSchema,
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(async () => {
        if (input.purpose === "cover") {
          if (!["image/jpeg", "image/png", "image/webp"].includes(input.mimeType)) {
            throw domainError("UNSUPPORTED_COVER", "封面只支持 jpg、png、webp。");
          }
          const result = await core.uploadMediaImage(
            uploadMediaImageInputSchema.parse({
              fileName: input.fileName,
              mimeType: input.mimeType,
              base64Data: input.base64Data,
              purpose: "other",
              idempotencyKey: `cover:${(await sha256Hex(input.base64Data)).slice(0, 40)}`,
            }),
          );
          return { url: result.publicUrl, width: result.width, height: result.height };
        }
        const media = await core.uploadEntryMedia(
          uploadEntryMediaInputSchema.parse({
            fileName: input.fileName,
            mimeType: input.mimeType,
            base64Data: input.base64Data,
            width: input.width,
            height: input.height,
          }),
        );
        return { mediaId: media.id, url: media.url, kind: media.kind };
      }),
  );

  server.registerTool(
    "create_upload_url",
    {
      title: "申请大文件/视频上传地址",
      description:
        "视频最大 95 MB、照片最大 20 MB。返回 mediaId 和 30 分钟内有效的一次性 uploadUrl：用 curl -X PUT -H 'Content-Type: <mimeType>' --data-binary @文件 '<uploadUrl>' 上传，成功后把 mediaId 放进 mediaIds 或 attach_media。",
      inputSchema: createEntryMediaUploadInputSchema,
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(() => core.createEntryMediaUpload(createEntryMediaUploadInputSchema.parse(input))),
  );

  server.registerTool(
    "attach_media",
    {
      title: "给已有动态加照片/视频",
      description: "把已上传的 mediaId 追加到一条已有动态（比如先发了文字、后发照片）。每条最多 9 个。",
      inputSchema: z.object({
        entryId: idSchema,
        mediaIds: z.array(idSchema).min(1).max(ENTRY_MEDIA_LIMITS.maxPerEntry),
      }),
      annotations: safeWriteAnnotations,
    },
    ({ entryId, mediaIds }) => toolResult(() => core.attachEntryMedia(entryId, mediaIds)),
  );

  // ---------------------------------------------------------------- 读取

  server.registerTool(
    "search_all",
    {
      title: "全局搜索",
      description:
        "一次搜遍动态、书、音乐、地点、游戏、番剧和影视，返回 id、标题和简介。找东西、查重、回答「我有没有…」都先用它。query 留空 + kinds 指定类型，就是列出该类最近的条目。",
      inputSchema: searchAllInputSchema.extend({
        query: z.string().trim().max(200).default("").describe("关键词，例如 三体、杭州、周杰伦"),
        kinds: z
          .array(searchKindSchema)
          .max(7)
          .default([])
          .describe("只搜这些类型：entry / book / music / place / game / anime / screen；不填搜全部"),
      }),
      annotations: readOnlyAnnotations,
    },
    (input) => toolResult(() => core.searchAll(searchAllInputSchema.parse(input))),
  );

  server.registerTool(
    "search_entries",
    {
      title: "按时间翻日常动态",
      description:
        "列出或搜索「日常」动态，可按时间范围、类型、标签筛选，适合回答「上周/上个月做了什么」。不填 query 就按时间倒序。",
      inputSchema: searchEntriesToolSchema,
      annotations: readOnlyAnnotations,
    },
    (input) =>
      toolResult(() =>
        core.listEntries(
          listEntriesInputSchema.parse({
            query: input.query,
            type: input.type,
            status: "active",
            tag: input.tag,
            occurredFrom: input.occurredFrom,
            occurredTo: input.occurredTo,
            limit: input.limit,
            cursor: input.cursor,
          }),
        ),
      ),
  );

  server.registerTool(
    "get_item",
    {
      title: "查看一条的完整内容",
      description:
        "按 id 读取完整内容：动态（ent_，含补充、照片、修订）、书/音乐（book_ / music_，含摘抄和相关动态）、地点（place_）、游戏（game_）、番剧影视（work_，含观看记录）。",
      inputSchema: z.object({ id: idSchema }),
      annotations: readOnlyAnnotations,
    },
    ({ id }) =>
      toolResult(async () => {
        switch (kindOfId(id)) {
          case "entry":
            return core.getEntry(id);
          case "shelf":
            return { item: await core.getShelfItem(id), relatedEntries: await core.listLinkedEntries("shelf", id) };
          case "place":
            return { item: await core.getPlace(id), relatedEntries: await core.listLinkedEntries("place", id) };
          case "game":
            return { item: await core.getGameLibraryItem(id), relatedEntries: await core.listLinkedEntries("game", id) };
          case "work":
            return { item: await core.getMediaWork(id), relatedEntries: await core.listLinkedEntries("work", id) };
          default:
            throw domainError("UNKNOWN_ID", `认不出 ${id} 是什么，先用 search_all 查 id。`);
        }
      }),
  );

  server.registerTool(
    "get_stats",
    {
      title: "统计一段时间",
      description:
        "汇总 [from, to) 区间的动态：总数、活跃天数、类型分布、按天或按月分布、常用标签、看过的作品和评分。适合周报、月报。",
      inputSchema: ledgerStatsInputSchema,
      annotations: readOnlyAnnotations,
    },
    (input) => toolResult(() => core.getStats(input)),
  );

  server.registerTool(
    "get_year_review",
    {
      title: "年度回顾",
      description:
        "某一年的总结：动态数、记录天数、最长连续、心情分布、常用话题、今年第一条、看过的作品、读完的书、听的音乐、去过的地方。回答「我今年过得怎么样」「今年读了几本书」时用。",
      inputSchema: z.object({
        year: z.number().int().min(1900).max(2200).optional().describe("缺省为今年"),
      }),
      annotations: readOnlyAnnotations,
    },
    ({ year }) =>
      toolResult(async () =>
        compactYearReview(await core.getYearReview(year ?? new Date().getUTCFullYear())),
      ),
  );

  server.registerTool(
    "on_this_day",
    {
      title: "那年今日",
      description: "往年同月同日的动态；date 缺省为今天。",
      inputSchema: onThisDayInputSchema,
      annotations: readOnlyAnnotations,
    },
    (input) => toolResult(() => core.getOnThisDay(input)),
  );

  server.registerTool(
    "list_tags",
    {
      title: "列出已用标签",
      description: "已经用过的标签和次数。写入前看一眼，复用已有标签，避免同义词分裂。",
      inputSchema: listTagsInputSchema,
      annotations: readOnlyAnnotations,
    },
    (input) => toolResult(() => core.listTags(input)),
  );

  // ---------------------------------------------------------------- 管理

  server.registerTool(
    "delete_item",
    {
      title: "删除（移入回收站）",
      description:
        "按 id 删除：动态、书、音乐、地点、游戏会进回收站，可用 restore_item 恢复；补充（followup_）和照片视频（media_）会直接删除。必须传 confirm=true，只在用户明确要求删除时调用。",
      inputSchema: z.object({
        id: idSchema,
        confirm: z.literal(true).describe("用户明确要求删除时才传 true"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ id }) =>
      toolResult(async () => {
        switch (kindOfId(id)) {
          case "entry":
            return core.deleteEntry(id);
          case "shelf":
            return core.deleteShelfItem(id, (await core.getShelfItem(id)).versionNo);
          case "place":
            return core.deletePlace(id, (await core.getPlace(id)).versionNo);
          case "game":
            return core.deleteGameLibraryItem(id, (await core.getGameLibraryItem(id)).versionNo);
          case "followup":
            return core.deleteFollowUpById(id);
          case "media":
            return core.removeEntryMediaById(id);
          default:
            throw domainError("UNKNOWN_ID", `不能删除 ${id}：只支持动态、书、音乐、地点、游戏、补充和照片。`);
        }
      }),
  );

  server.registerTool(
    "restore_item",
    {
      title: "从回收站恢复",
      description: "按 id 恢复被删除的动态、书、音乐、地点或游戏。动态恢复后是仅自己可见。",
      inputSchema: z.object({ id: idSchema }),
      annotations: { ...safeWriteAnnotations, idempotentHint: true },
    },
    ({ id }) =>
      toolResult(async () => {
        switch (kindOfId(id)) {
          case "entry":
            return core.restoreEntry(id);
          case "shelf":
            return core.restoreShelfItem(id, (await core.getShelfItem(id)).versionNo);
          case "place":
            return core.restorePlace(id, (await core.getPlace(id)).versionNo);
          case "game":
            return core.restoreGameLibraryItem(id, (await core.getGameLibraryItem(id)).versionNo);
          default:
            throw domainError("UNKNOWN_ID", `不能恢复 ${id}。`);
        }
      }),
  );

  server.registerTool(
    "publish_entry",
    {
      title: "公开一条动态（两步）",
      description:
        "第一步只传 entryId：返回公开预览、actionId 和确认码，先把预览给用户看。用户同意后第二步：再传 entryId + actionId + confirmationCode 才会真正公开。",
      inputSchema: z.object({
        entryId: idSchema,
        actionId: idSchema.optional().describe("第二步才填，来自第一步的返回"),
        confirmationCode: z.string().trim().min(1).max(80).optional().describe("第二步才填，来自第一步的返回"),
      }),
      annotations: { ...safeWriteAnnotations, openWorldHint: true },
    },
    ({ entryId, actionId, confirmationCode }) =>
      toolResult<unknown>(() =>
        actionId && confirmationCode
          ? core.confirmAction({ actionId, confirmationCode })
          : core.preparePublish(entryId),
      ),
  );

  server.registerTool(
    "unpublish_entry",
    {
      title: "取消公开",
      description: "把一条公开的动态立即改回仅自己可见。",
      inputSchema: z.object({ entryId: idSchema }),
      annotations: { ...safeWriteAnnotations, idempotentHint: true, openWorldHint: true },
    },
    ({ entryId }) => toolResult(() => core.unpublishEntry(entryId)),
  );

  server.registerTool(
    "settings",
    {
      title: "查看或修改设置",
      description: "不传参数就返回当前设置（时区等）；传了哪个字段就只改哪个字段。",
      inputSchema: settingsSchema.partial(),
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(async () => {
        const current = await core.getSettings();
        const patch = defined(input);
        return Object.keys(patch).length
          ? core.updateSettings(settingsSchema.parse({ ...current, ...patch }))
          : current;
      }),
  );

  registerContextResources(server, core);
  registerReviewPrompts(server);

  return server;
}

async function jsonResource(uri: URL, read: () => Promise<unknown>) {
  let payload: unknown;
  try {
    payload = { ok: true, data: await read() };
  } catch (error: unknown) {
    payload = { ok: false, error: errorDetails(error) };
  }
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: serialize(payload),
      },
    ],
  };
}

const DAY_MS = 86_400_000;

function registerContextResources(server: McpServer, core: McpCoreBinding) {
  server.registerResource(
    "settings",
    "life-ledger://settings",
    {
      title: "个人设置",
      description: "时区、写入模式、公开预览等设置；解释时间和写入前可先读取。",
      mimeType: "application/json",
    },
    (uri) => jsonResource(uri, () => core.getSettings()),
  );

  server.registerResource(
    "tags",
    "life-ledger://tags",
    {
      title: "标签词表",
      description: "已使用标签及次数；写入新记录时优先复用这些标签。",
      mimeType: "application/json",
    },
    (uri) => jsonResource(uri, () => core.listTags({ limit: 200 })),
  );

  server.registerResource(
    "media-in-progress",
    "life-ledger://media/in-progress",
    {
      title: "正在看 / 正在玩",
      description: "观看状态为 watching 的媒体作品，用于把新记录挂到正确作品上。",
      mimeType: "application/json",
    },
    (uri) =>
      jsonResource(uri, () =>
        core.listMediaWorks(
          listMediaWorksInputSchema.parse({
            watchStatus: "watching",
            sort: "recent_desc",
            limit: 50,
          }),
        ),
      ),
  );

  server.registerResource(
    "digest-last-7-days",
    "life-ledger://digest/last-7-days",
    {
      title: "最近 7 天概览",
      description: "最近 7 天的统计汇总，相当于随时可读的简版周报。",
      mimeType: "application/json",
    },
    (uri) =>
      jsonResource(uri, () => {
        const to = new Date();
        return core.getStats({
          from: new Date(to.getTime() - 7 * DAY_MS).toISOString(),
          to: to.toISOString(),
        });
      }),
  );

  server.registerResource(
    "on-this-day",
    "life-ledger://on-this-day",
    {
      title: "那年今日",
      description: "往年今天（按个人时区）的记录。",
      mimeType: "application/json",
    },
    (uri) => jsonResource(uri, () => core.getOnThisDay({})),
  );
}

function reviewPrompt(text: string) {
  return {
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text },
      },
    ],
  };
}

const REVIEW_RULES = [
  "只依据工具返回的数据，不编造记录；数据不足就直接说明。",
  "引用具体记录时附上 entryId，方便我回看。",
  "不要调用任何写入、发布或删除工具。",
].join("\n- ");

function registerReviewPrompts(server: McpServer) {
  server.registerPrompt(
    "weekly_review",
    {
      title: "生成周回顾",
      description: "基于最近 7 天的统计和记录，写一份私人周回顾。",
    },
    () =>
      reviewPrompt(
        [
          "请为我写一份 Life Ledger 周回顾，覆盖截至现在的最近 7 天。",
          "步骤：",
          "1. 调用 get_stats，from 为 7 天前、to 为现在。",
          "2. 调用 search_entries，用同一时间范围（occurredFrom / occurredTo）翻页读取记录原文。",
          "3. 调用 search_all（kinds 为 book、music、place，query 留空）看看这周读了、听了、去了什么。",
          "4. 按「看了什么 / 读了听了什么 / 去了哪里 / 想了什么 / 心情走势 / 值得延续或调整的事」输出，最后给一句总结。",
          `规则：\n- ${REVIEW_RULES}`,
        ].join("\n"),
      ),
  );

  server.registerPrompt(
    "monthly_recap",
    {
      title: "生成月度回顾",
      description: "基于指定月份的统计和记录，写一份月度回顾；缺省为上个月。",
      argsSchema: {
        month: z
          .string()
          .regex(/^\d{4}-\d{2}$/u)
          .optional()
          .describe("YYYY-MM，缺省为上个月"),
      },
    },
    ({ month }) =>
      reviewPrompt(
        [
          `请为我写一份 Life Ledger 月度回顾，月份：${month ?? "上个月"}（按个人设置里的时区）。`,
          "步骤：",
          "1. 先读取资源 life-ledger://settings 确认时区，再计算该月第一天 00:00 到下月第一天 00:00 的区间。",
          "2. 调用 get_stats 获取该区间的统计。",
          "3. 用 search_entries 按同一区间翻页读取记录，重点阅读 mood、thought、idea 与有评分的媒体记录。",
          "4. 用 search_all（kinds 为 book、music、place）找出这个月读完的书、听的音乐和去过的地方。",
          "5. 输出：本月数字概览、看/读/听的清单与评分、去过的地方、反复出现的主题、情绪变化、下个月可以尝试的一件事。",
          `规则：\n- ${REVIEW_RULES}`,
        ].join("\n"),
      ),
  );
}
