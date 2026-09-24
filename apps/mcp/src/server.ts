import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  ENTRY_MEDIA_LIMITS,
  captureEntryInputSchema,
  createEntryMediaUploadInputSchema,
  createGameLibraryItemInputSchema,
  createMediaSeasonInputSchema,
  createMediaWorkInputSchema,
  importDryRunInputSchema,
  listEntriesInputSchema,
  listMediaWorksInputSchema,
  logMediaInputSchema,
  mediaKindSchema,
  mediaTypeSchema,
  mediaWatchStatusSchema,
  datePrecisionSchema,
  settingsSchema,
  uploadEntryMediaInputSchema,
  uploadMediaImageInputSchema,
  updateEntryInputSchema,
  updateGameLibraryItemInputSchema,
  updateMediaSeasonInputSchema,
  updateMediaWorkInputSchema,
  type CoreBinding,
} from "@life-ledger/contracts";

export type McpCoreBinding = Pick<
  CoreBinding,
  | "health"
  | "listEntries"
  | "getEntry"
  | "captureEntry"
  | "updateEntry"
  | "deleteEntry"
  | "restoreEntry"
  | "purgeEntry"
  | "listMediaWorks"
  | "getMediaWork"
  | "createMediaWork"
  | "updateMediaWork"
  | "uploadMediaImage"
  | "listGameLibrary"
  | "createGameLibraryItem"
  | "updateGameLibraryItem"
  | "deleteGameLibraryItem"
  | "restoreGameLibraryItem"
  | "listSeasons"
  | "createSeason"
  | "updateSeason"
  | "logMedia"
  | "preparePublish"
  | "confirmAction"
  | "unpublishEntry"
  | "addEntryFollowUp"
  | "deleteEntryFollowUp"
  | "uploadEntryMedia"
  | "createEntryMediaUpload"
  | "attachEntryMedia"
  | "deleteEntryMedia"
  | "createImportDryRun"
  | "commitImport"
  | "createExport"
  | "listExports"
  | "verifyExport"
  | "getSettings"
  | "updateSettings"
>;

const idSchema = z.string().trim().min(1).max(256);

const mediaIdsToolSchema = z
  .array(idSchema)
  .max(ENTRY_MEDIA_LIMITS.maxPerEntry)
  .default([])
  .describe(
    "要附在这条记录上的照片/视频 mediaId（最多 9 个，按顺序展示）；先用 upload_entry_media 或 create_entry_media_upload 取得。",
  );

const captureEntryToolSchema = z.object({
  rawText: z.string().trim().min(1).max(50_000),
  type: z.enum(["thought", "idea", "mood", "note"]).default("note"),
  title: z.string().trim().max(300).nullable().default(null),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  datePrecision: datePrecisionSchema.default("exact"),
  timezone: z.string().trim().min(1).max(80).default("Asia/Tokyo"),
  temporalUncertain: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  sourceChannel: z.enum(["wechat", "mcp"]),
  idempotencyKey: z.string().trim().min(1).max(256),
  conversationId: z.string().trim().min(1).max(256).nullable().default(null),
  mediaIds: mediaIdsToolSchema,
});

const logMediaToolSchema = z.object({
  rawText: z.string().trim().min(1).max(50_000),
  mediaType: mediaTypeSchema.default("anime"),
  mediaKind: mediaKindSchema.nullable().default(null),
  title: z.string().trim().min(1).max(300),
  aliases: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  ratingScope: z.enum(["episode", "season", "work"]).nullable().default(null),
  seasonId: idSchema.nullable().default(null),
  seasonLabel: z.string().trim().min(1).max(80).nullable().default(null),
  episodeLabel: z.string().trim().min(1).max(80).nullable().default(null),
  progressState: mediaWatchStatusSchema.nullable().default(null),
  score: z.number().min(0).max(10).multipleOf(0.1).nullable().default(null),
  comment: z.string().trim().max(50_000).nullable().default(null),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  datePrecision: datePrecisionSchema.default("exact"),
  timezone: z.string().trim().min(1).max(80).default("Asia/Tokyo"),
  sourceChannel: z.enum(["wechat", "mcp"]),
  idempotencyKey: z.string().trim().min(1).max(256),
  conversationId: z.string().trim().min(1).max(256).nullable().default(null),
  mediaIds: mediaIdsToolSchema,
});

const searchEntriesToolSchema = z.object({
  query: z.string().trim().min(1).max(300),
  type: z
    .enum([
      "thought",
      "idea",
      "mood",
      "anime",
      "screen",
      "game",
      "music",
      "photo",
      "note",
    ])
    .nullable()
    .default(null),
  visibility: z
    .enum(["private", "publish_pending", "public"])
    .nullable()
    .default(null),
  status: z.enum(["active", "deleted"]).default("active"),
  mediaWorkId: idSchema.nullable().default(null),
  scoreMin: z.number().min(0).max(10).nullable().default(null),
  scoreMax: z.number().min(0).max(10).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).nullable().default(null),
});

const recentEntriesToolSchema = z.object({
  type: z
    .enum([
      "thought",
      "idea",
      "mood",
      "anime",
      "screen",
      "game",
      "music",
      "photo",
      "note",
    ])
    .nullable()
    .default(null),
  visibility: z
    .enum(["private", "publish_pending", "public"])
    .nullable()
    .default(null),
  status: z.enum(["active", "deleted"]).default("active"),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).nullable().default(null),
});

const entryIdToolSchema = z.object({
  entryId: idSchema,
});

const updateEntryToolSchema = z.object({
  entryId: idSchema,
  versionNo: z.number().int().positive(),
  bodyRaw: z.string().trim().min(1).max(50_000).optional(),
  title: z.string().trim().max(300).nullable().optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  datePrecision: datePrecisionSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  score: z.number().min(0).max(10).multipleOf(0.1).nullable().optional(),
  reason: z.string().trim().min(1).max(300).default("Hermes correction"),
});

const deleteEntryToolSchema = z.object({
  entryId: idSchema,
  confirmMoveToTrash: z.literal(true),
});

const purgeEntryToolSchema = z.object({
  entryId: idSchema,
  confirmationEntryId: idSchema,
  confirmPermanentDelete: z.literal(true),
});

const confirmActionToolSchema = z.object({
  actionId: idSchema,
  confirmationCode: z.string().trim().min(1).max(80),
});

const mediaWorkIdToolSchema = z.object({
  mediaWorkId: idSchema,
});

const gameLibraryItemIdSchema = z.object({
  gameLibraryItemId: idSchema,
});

const createGameLibraryItemToolSchema = createGameLibraryItemInputSchema;

const updateGameLibraryItemToolSchema = updateGameLibraryItemInputSchema.safeExtend({
  gameLibraryItemId: idSchema,
});

const mutateGameLibraryItemToolSchema = gameLibraryItemIdSchema.extend({
  versionNo: z.number().int().positive(),
  confirm: z.literal(true),
});

const updateMediaWorkToolSchema = z
  .object({
    mediaWorkId: idSchema,
    mediaKind: mediaKindSchema.nullable().optional(),
    title: z.string().trim().min(1).max(300).optional(),
    aliases: z
      .array(z.string().trim().min(1).max(300))
      .max(30)
      .optional(),
    coverUrl: z.string().trim().min(1).max(2_000).nullable().optional(),
    watchStatus: mediaWatchStatusSchema.nullable().optional(),
    overallScore: z
      .number()
      .min(0)
      .max(10)
      .multipleOf(0.1)
      .nullable()
      .optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "mediaWorkId"), {
    message: "至少提供一个要更新的媒体作品字段。",
  });

const seasonIdToolSchema = z.object({
  seasonId: idSchema,
});

const createSeasonToolSchema = createMediaSeasonInputSchema.extend({
  mediaWorkId: idSchema,
});

const updateSeasonToolSchema = z
  .object({
    seasonId: idSchema,
    label: z.string().trim().min(1).max(120).optional(),
    seasonNumber: z.number().int().positive().nullable().optional(),
    title: z.string().trim().min(1).max(300).nullable().optional(),
    score: z
      .number()
      .min(0)
      .max(10)
      .multipleOf(0.1)
      .nullable()
      .optional(),
    watchStatus: mediaWatchStatusSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "seasonId"), {
    message: "至少提供一个要更新的季度字段。",
  });

const importCommitToolSchema = z.object({
  batchId: idSchema,
  confirmCommit: z.literal(true),
});

const exportCreateToolSchema = z.object({
  scope: z.enum(["incremental", "full"]).default("full"),
});

const exportIdToolSchema = z.object({
  exportId: idSchema,
});

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
  const server = new McpServer({
    name: "Life Ledger",
    version: "0.4.0",
  });

  server.registerTool(
    "health",
    {
      title: "检查服务健康状态",
      description:
        "检查 Life Ledger Core 与数据库是否可用，不读取或修改个人内容。",
      inputSchema: z.object({}),
      annotations: readOnlyAnnotations,
    },
    () => toolResult(() => core.health()),
  );

  server.registerTool(
    "get_entry",
    {
      title: "读取单条记录",
      description:
        "按 entryId 读取一条完整记录，包括正文、照片/视频（media）、补充（followUps）、修订历史与审计信息；不存在时返回 null。",
      inputSchema: entryIdToolSchema,
      annotations: readOnlyAnnotations,
    },
    ({ entryId }) => toolResult(() => core.getEntry(entryId)),
  );

  server.registerTool(
    "search_entries",
    {
      title: "搜索人生账本",
      description:
        "按文本搜索记录，可筛选类型、可见性、状态、媒体作品、评分和游标；默认只搜有效记录。",
      inputSchema: searchEntriesToolSchema,
      annotations: readOnlyAnnotations,
    },
    (input) =>
      toolResult(() =>
        core.listEntries(
          listEntriesInputSchema.parse({
            query: input.query,
            type: input.type,
            visibility: input.visibility,
            status: input.status,
            mediaWorkId: input.mediaWorkId,
            scoreMin: input.scoreMin,
            scoreMax: input.scoreMax,
            limit: input.limit,
            cursor: input.cursor,
          }),
        ),
      ),
  );

  server.registerTool(
    "get_recent_entries",
    {
      title: "读取最近记录",
      description:
        "按时间倒序读取最近记录，可筛选类型、可见性和状态，并支持游标分页。",
      inputSchema: recentEntriesToolSchema,
      annotations: readOnlyAnnotations,
    },
    (input) =>
      toolResult(() =>
        core.listEntries(
          listEntriesInputSchema.parse({
            query: "",
            type: input.type,
            visibility: input.visibility,
            status: input.status,
            mediaWorkId: null,
            scoreMin: null,
            scoreMax: null,
            limit: input.limit,
            cursor: input.cursor,
          }),
        ),
      ),
  );

  server.registerTool(
    "capture_entry",
    {
      title: "创建私密记录",
      description:
        "创建想法、心情或笔记，会出现在网页「今日与时间线」动态里。新记录强制为私密；必须提供来源渠道与幂等键，重试不会重复写入。要附照片/视频时，先上传拿到 mediaId，再通过 mediaIds 传入。",
      inputSchema: captureEntryToolSchema,
      annotations: {
        ...safeWriteAnnotations,
        idempotentHint: true,
      },
    },
    (input) =>
      toolResult(() =>
        core.captureEntry(
          captureEntryInputSchema.parse({
            rawText: input.rawText,
            type: input.type,
            title: input.title,
            occurredAt: input.occurredAt ?? nowIso(),
            datePrecision: input.datePrecision,
            timezone: input.timezone,
            temporalUncertain: input.temporalUncertain,
            tags: input.tags,
            source: {
              channel: input.sourceChannel,
              messageId: input.idempotencyKey,
              conversationId: input.conversationId,
            },
            visibility: "private",
            mediaIds: input.mediaIds,
          }),
        ),
      ),
  );

  server.registerTool(
    "update_entry",
    {
      title: "更新记录",
      description:
        "用当前 versionNo 乐观锁更新记录正文、标题、时间、标签或评分；成功后保留修订历史。",
      inputSchema: updateEntryToolSchema,
      annotations: safeWriteAnnotations,
    },
    ({ entryId, ...input }) =>
      toolResult(() =>
        core.updateEntry(entryId, updateEntryInputSchema.parse(input)),
      ),
  );

  server.registerTool(
    "delete_entry",
    {
      title: "移入回收站",
      description:
        "软删除一条记录，必要时先取消公开；可恢复。必须显式传入 confirmMoveToTrash=true。",
      inputSchema: deleteEntryToolSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ entryId }) => toolResult(() => core.deleteEntry(entryId)),
  );

  server.registerTool(
    "restore_entry",
    {
      title: "恢复回收站记录",
      description: "把软删除记录恢复为私密有效状态，不会自动重新公开。",
      inputSchema: entryIdToolSchema,
      annotations: {
        ...safeWriteAnnotations,
        idempotentHint: true,
      },
    },
    ({ entryId }) => toolResult(() => core.restoreEntry(entryId)),
  );

  server.registerTool(
    "purge_entry",
    {
      title: "永久删除记录",
      description:
        "不可恢复地永久删除回收站记录。必须传 confirmPermanentDelete=true，且 confirmationEntryId 与 entryId 完全一致。",
      inputSchema: purgeEntryToolSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ entryId, confirmationEntryId }) =>
      toolResult(async () => {
        if (entryId !== confirmationEntryId) {
          throw Object.assign(
            new Error("PURGE_CONFIRMATION_MISMATCH: 确认记录 ID 不一致。"),
            { code: "PURGE_CONFIRMATION_MISMATCH", status: 409 },
          );
        }
        return core.purgeEntry(entryId, confirmationEntryId);
      }),
  );

  server.registerTool(
    "list_media_works",
    {
      title: "列出媒体作品",
      description:
        "列出动漫、影视、游戏或音乐作品，可按标题、观看状态与媒体类型筛选。",
      inputSchema: listMediaWorksInputSchema,
      annotations: readOnlyAnnotations,
    },
    (input) =>
      toolResult(() => core.listMediaWorks(listMediaWorksInputSchema.parse(input))),
  );

  server.registerTool(
    "get_media_work",
    {
      title: "读取媒体作品详情",
      description:
        "按 mediaWorkId 读取作品资料、季度和关联日志；不存在时返回 null。",
      inputSchema: mediaWorkIdToolSchema,
      annotations: readOnlyAnnotations,
    },
    ({ mediaWorkId }) => toolResult(() => core.getMediaWork(mediaWorkId)),
  );

  server.registerTool(
    "list_game_library",
    {
      title: "读取 PlayStation 游戏库",
      description:
        "读取已经迁入 Life Ledger 的完整 PlayStation 游戏清单，包括游玩时长、进度、评分、奖杯和评论。",
      inputSchema: z.object({}),
      annotations: readOnlyAnnotations,
    },
    () => toolResult(() => core.listGameLibrary()),
  );

  server.registerTool(
    "create_game_library_item",
    {
      title: "创建 PlayStation 游戏",
      description:
        "在专用游戏库创建游戏，支持平台、时长、进度、奖杯、成就、评分、评价、标签和封面。",
      inputSchema: createGameLibraryItemToolSchema,
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(() =>
        core.createGameLibraryItem(
          createGameLibraryItemInputSchema.parse(input),
        ),
      ),
  );

  server.registerTool(
    "update_game_library_item",
    {
      title: "更新 PlayStation 游戏",
      description:
        "使用 versionNo 乐观锁更新专用游戏库条目，避免覆盖并发修改。",
      inputSchema: updateGameLibraryItemToolSchema,
      annotations: safeWriteAnnotations,
    },
    ({ gameLibraryItemId, ...input }) =>
      toolResult(() =>
        core.updateGameLibraryItem(
          gameLibraryItemId,
          updateGameLibraryItemInputSchema.parse(input),
        ),
      ),
  );

  server.registerTool(
    "delete_game_library_item",
    {
      title: "将 PlayStation 游戏移入回收站",
      description:
        "软删除专用游戏库条目，可恢复；必须提供当前 versionNo 并显式确认。",
      inputSchema: mutateGameLibraryItemToolSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ gameLibraryItemId, versionNo }) =>
      toolResult(() =>
        core.deleteGameLibraryItem(gameLibraryItemId, versionNo),
      ),
  );

  server.registerTool(
    "restore_game_library_item",
    {
      title: "恢复 PlayStation 游戏",
      description:
        "从回收站恢复专用游戏库条目；必须提供当前 versionNo 并显式确认。",
      inputSchema: mutateGameLibraryItemToolSchema,
      annotations: safeWriteAnnotations,
    },
    ({ gameLibraryItemId, versionNo }) =>
      toolResult(() =>
        core.restoreGameLibraryItem(gameLibraryItemId, versionNo),
      ),
  );

  server.registerTool(
    "create_media_work",
    {
      title: "创建媒体作品",
      description:
        "创建动漫、影视、游戏或音乐作品，可设置别名、封面、观看状态和总评分。",
      inputSchema: createMediaWorkInputSchema,
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(() =>
        core.createMediaWork(createMediaWorkInputSchema.parse(input)),
      ),
  );

  server.registerTool(
    "update_media_work",
    {
      title: "更新媒体作品",
      description:
        "更新指定作品的影视分类、标题、别名、封面、观看状态或总评分；至少提供一个变更字段。",
      inputSchema: updateMediaWorkToolSchema,
      annotations: safeWriteAnnotations,
    },
    ({ mediaWorkId, ...input }) =>
      toolResult(() =>
        core.updateMediaWork(
          mediaWorkId,
          updateMediaWorkInputSchema.parse(input),
        ),
      ),
  );

  server.registerTool(
    "upload_media_image",
    {
      title: "上传图片到私有资源桶",
      description:
        "仅用于作品封面等公开图片：严格校验 Agent 已压缩的 WebP、JPEG 或 PNG，按 SHA-256 去重写入 R2，并返回公开 HTTPS URL；不会自动修改作品封面。动态里的私密照片/视频请用 upload_entry_media 或 create_entry_media_upload。",
      inputSchema: uploadMediaImageInputSchema,
      annotations: {
        ...safeWriteAnnotations,
        idempotentHint: true,
      },
    },
    (input) =>
      toolResult(() =>
        core.uploadMediaImage(uploadMediaImageInputSchema.parse(input)),
      ),
  );

  server.registerTool(
    "list_seasons",
    {
      title: "列出影视季度",
      description:
        "仅在电视剧等确实需要季度结构时，列出指定影视作品的季度与观看状态；动漫每季按独立作品管理。",
      inputSchema: mediaWorkIdToolSchema,
      annotations: readOnlyAnnotations,
    },
    ({ mediaWorkId }) => toolResult(() => core.listSeasons(mediaWorkId)),
  );

  server.registerTool(
    "create_season",
    {
      title: "创建影视季度",
      description:
        "仅为电视剧等影视作品创建季度；动漫季度应使用 create_media_work 创建为独立作品。",
      inputSchema: createSeasonToolSchema,
      annotations: safeWriteAnnotations,
    },
    ({ mediaWorkId, ...input }) =>
      toolResult(() =>
        core.createSeason(
          mediaWorkId,
          createMediaSeasonInputSchema.parse(input),
        ),
      ),
  );

  server.registerTool(
    "update_season",
    {
      title: "更新影视季度",
      description:
        "更新电视剧等影视季度的标签、序号、标题、评分或观看状态；至少提供一个变更字段。",
      inputSchema: updateSeasonToolSchema,
      annotations: safeWriteAnnotations,
    },
    ({ seasonId, ...input }) =>
      toolResult(() =>
        core.updateSeason(
          seasonId,
          updateMediaSeasonInputSchema.parse(input),
        ),
      ),
  );

  server.registerTool(
    "log_media",
    {
      title: "记录媒体体验",
      description:
        "创建私密的动漫、影视、游戏或音乐日志，可关联季度/集数、进度、评分与评论；必须提供来源和幂等键。可通过 mediaIds 附上截图、照片或视频。",
      inputSchema: logMediaToolSchema,
      annotations: {
        ...safeWriteAnnotations,
        idempotentHint: true,
      },
    },
    (input) =>
      toolResult(() =>
        core.logMedia(
          logMediaInputSchema.parse({
            rawText: input.rawText,
            mediaType: input.mediaType,
            mediaKind: input.mediaKind,
            title: input.title,
            aliases: input.aliases,
            ratingScope: input.ratingScope,
            seasonId: input.seasonId,
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
              messageId: input.idempotencyKey,
              conversationId: input.conversationId,
            },
            visibility: "private",
            mediaIds: input.mediaIds,
          }),
        ),
      ),
  );

  server.registerTool(
    "prepare_publish",
    {
      title: "生成公开预览",
      description:
        "生成公开白名单快照与短时确认码，但不会立即公开；必须先把预览展示给用户。",
      inputSchema: entryIdToolSchema,
      annotations: {
        ...safeWriteAnnotations,
        openWorldHint: true,
      },
    },
    ({ entryId }) => toolResult(() => core.preparePublish(entryId)),
  );

  server.registerTool(
    "confirm_action",
    {
      title: "确认公开记录",
      description:
        "用 actionId 和 confirmationCode 确认已经预览过的公开操作；只有白名单快照会进入公开投影。",
      inputSchema: confirmActionToolSchema,
      annotations: {
        ...safeWriteAnnotations,
        openWorldHint: true,
      },
    },
    (input) =>
      toolResult(() =>
        core.confirmAction({
          actionId: input.actionId,
          confirmationCode: input.confirmationCode,
        }),
      ),
  );

  server.registerTool(
    "unpublish_entry",
    {
      title: "取消公开记录",
      description: "立即从公开投影移除一条记录，并把它恢复为私密可见。",
      inputSchema: entryIdToolSchema,
      annotations: {
        ...safeWriteAnnotations,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    ({ entryId }) => toolResult(() => core.unpublishEntry(entryId)),
  );

  server.registerTool(
    "upload_entry_media",
    {
      title: "上传动态照片/短视频（Base64）",
      description:
        "把一张照片或一段很短的视频以 Base64 上传为私密媒体，返回 mediaId；再在 capture_entry / log_media 的 mediaIds 里使用，或用 attach_entry_media 挂到已有记录。解码后不超过 10 MB；更大的文件（尤其是视频）请用 create_entry_media_upload。支持 JPEG、PNG、WebP、GIF、MP4、MOV、WebM，服务端会校验文件头。",
      inputSchema: uploadEntryMediaInputSchema,
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(() =>
        core.uploadEntryMedia(uploadEntryMediaInputSchema.parse(input)),
      ),
  );

  server.registerTool(
    "create_entry_media_upload",
    {
      title: "申请一次性上传地址（大文件/视频）",
      description:
        "为一张照片或一段视频（视频最大 95 MB，照片最大 20 MB）申请 30 分钟内有效、只能用一次的上传地址。返回 mediaId、uploadUrl 与 curl 示例：用 HTTP PUT 把文件原始字节发到 uploadUrl，Content-Type 必须与 mimeType 一致（例如 curl -X PUT -H 'Content-Type: video/mp4' --data-binary @clip.mp4 <uploadUrl>）。上传成功后，再把 mediaId 放进 capture_entry / log_media 的 mediaIds 或 attach_entry_media。文件内容不会经过对话上下文。",
      inputSchema: createEntryMediaUploadInputSchema,
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(() =>
        core.createEntryMediaUpload(
          createEntryMediaUploadInputSchema.parse(input),
        ),
      ),
  );

  server.registerTool(
    "attach_entry_media",
    {
      title: "给已有记录添加照片/视频",
      description:
        "把已上传但尚未使用的 mediaId 追加到一条已有记录后面（例如微信里先发文字、后发照片）。每条记录最多 9 个照片/视频。",
      inputSchema: z.object({
        entryId: idSchema,
        mediaIds: z.array(idSchema).min(1).max(ENTRY_MEDIA_LIMITS.maxPerEntry),
      }),
      annotations: safeWriteAnnotations,
    },
    ({ entryId, mediaIds }) =>
      toolResult(() => core.attachEntryMedia(entryId, mediaIds)),
  );

  server.registerTool(
    "remove_entry_media",
    {
      title: "从记录中移除照片/视频",
      description:
        "从记录中移除一个照片或视频，并永久删除存储里的文件，不可恢复。必须显式传入 confirmRemove=true。",
      inputSchema: z.object({
        entryId: idSchema,
        mediaId: idSchema,
        confirmRemove: z.literal(true),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ entryId, mediaId }) =>
      toolResult(() => core.deleteEntryMedia(entryId, mediaId)),
  );

  server.registerTool(
    "add_entry_follow_up",
    {
      title: "补充记录",
      description:
        "给已有记录追加一段补充（后续想法），原文保持不变；补充按时间顺序显示在该条动态下方。",
      inputSchema: z.object({
        entryId: idSchema,
        body: z.string().trim().min(1).max(50_000),
      }),
      annotations: safeWriteAnnotations,
    },
    ({ entryId, body }) =>
      toolResult(() =>
        core.addEntryFollowUp(entryId, { body, sourceChannel: "mcp" }),
      ),
  );

  server.registerTool(
    "delete_entry_follow_up",
    {
      title: "删除补充",
      description:
        "删除一条记录下的某条补充（followUpId 来自 get_entry 返回的 followUps），不可恢复。必须显式传入 confirmDelete=true。",
      inputSchema: z.object({
        entryId: idSchema,
        followUpId: idSchema,
        confirmDelete: z.literal(true),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    ({ entryId, followUpId }) =>
      toolResult(() => core.deleteEntryFollowUp(entryId, followUpId)),
  );

  server.registerTool(
    "import_dry_run",
    {
      title: "试运行数据导入",
      description:
        "校验并暂存导入数据，只生成重复项/错误报告，不改动正式事实表。",
      inputSchema: importDryRunInputSchema,
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(() =>
        core.createImportDryRun(importDryRunInputSchema.parse(input)),
      ),
  );

  server.registerTool(
    "import_commit",
    {
      title: "确认提交导入批次",
      description:
        "确认提交已经试运行过的导入批次。必须显式传入 confirmCommit=true。",
      inputSchema: importCommitToolSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    ({ batchId }) => toolResult(() => core.commitImport(batchId)),
  );

  server.registerTool(
    "export_create",
    {
      title: "创建私密导出",
      description:
        "创建完整或增量私密导出任务；返回导出记录，可用 export_list 跟踪状态。",
      inputSchema: exportCreateToolSchema,
      annotations: safeWriteAnnotations,
    },
    ({ scope }) => toolResult(() => core.createExport(scope)),
  );

  server.registerTool(
    "export_list",
    {
      title: "列出导出任务",
      description:
        "列出最近的私密导出任务、完成状态、大小、行数和校验和，不暴露 R2 对象键。",
      inputSchema: z.object({}),
      annotations: readOnlyAnnotations,
    },
    () => toolResult(() => core.listExports()),
  );

  server.registerTool(
    "export_verify",
    {
      title: "校验导出归档",
      description:
        "重新计算指定导出归档的 SHA-256 与大小，并与记录值比对；不会返回归档内容或 R2 对象键。",
      inputSchema: exportIdToolSchema,
      annotations: readOnlyAnnotations,
    },
    ({ exportId }) => toolResult(() => core.verifyExport(exportId)),
  );

  server.registerTool(
    "settings_get",
    {
      title: "读取个人设置",
      description:
        "读取时区、采集模式、公开预览、敏感信息警告和备份保留设置。",
      inputSchema: z.object({}),
      annotations: readOnlyAnnotations,
    },
    () => toolResult(() => core.getSettings()),
  );

  server.registerTool(
    "settings_update",
    {
      title: "更新个人设置",
      description:
        "用完整设置对象更新 Life Ledger 个人设置；字段会经过严格校验。",
      inputSchema: settingsSchema,
      annotations: safeWriteAnnotations,
    },
    (input) =>
      toolResult(() => core.updateSettings(settingsSchema.parse(input))),
  );

  return server;
}
