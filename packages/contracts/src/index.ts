import { z } from "zod";

export const entryTypeSchema = z.enum([
  "thought",
  "idea",
  "mood",
  "anime",
  "screen",
  "game",
  "music",
  "photo",
  "note",
]);

export const entryVisibilitySchema = z.enum([
  "private",
  "publish_pending",
  "public",
]);

export const entryStatusSchema = z.enum(["active", "deleted"]);
export const sourceChannelSchema = z.enum(["wechat", "web", "import", "mcp"]);
export const ratingScopeSchema = z.enum(["episode", "season", "work"]);
export const datePrecisionSchema = z.enum([
  "exact",
  "month",
  "year",
  "approximate",
]);
export const mediaTypeSchema = z.enum(["anime", "screen", "game", "music"]);
export const mediaKindSchema = z.enum(["movie", "tv"]);
export const mediaWatchStatusSchema = z.enum([
  "planned",
  "watching",
  "completed",
  "watched",
  "paused",
  "dropped",
]);
export const mediaImageMimeTypeSchema = z.enum([
  "image/webp",
  "image/jpeg",
  "image/png",
]);
export const mediaImagePurposeSchema = z.enum([
  "media_cover",
  "entry_image",
  "other",
]);

export const uploadMediaImageInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(160),
    mimeType: mediaImageMimeTypeSchema,
    base64Data: z.string().min(4).max(1_398_104),
    purpose: mediaImagePurposeSchema.default("media_cover"),
    mediaWorkId: z.string().trim().min(1).max(256).nullable().default(null),
    idempotencyKey: z.string().trim().min(1).max(256),
  })
  .strict();

export const sourceSchema = z.object({
  channel: sourceChannelSchema,
  messageId: z.string().min(1).max(256).nullable().default(null),
  conversationId: z.string().min(1).max(256).nullable().default(null),
});

export const captureEntryInputSchema = z.object({
  rawText: z.string().trim().min(1).max(50_000),
  type: entryTypeSchema
    .exclude(["anime", "screen", "game", "music", "photo"])
    .default("note"),
  title: z.string().trim().max(300).nullable().default(null),
  occurredAt: z.iso.datetime({ offset: true }),
  datePrecision: datePrecisionSchema.default("exact"),
  timezone: z.string().trim().min(1).max(80).default("Asia/Tokyo"),
  temporalUncertain: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  source: sourceSchema,
  visibility: z.literal("private").default("private"),
});

export const logMediaInputSchema = z
  .object({
    rawText: z.string().trim().min(1).max(50_000),
    mediaType: mediaTypeSchema.default("anime"),
    mediaKind: mediaKindSchema.nullable().default(null),
    title: z.string().trim().min(1).max(300),
    aliases: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
    ratingScope: ratingScopeSchema.nullable().default(null),
    seasonId: z.string().trim().min(1).max(128).nullable().default(null),
    seasonLabel: z.string().trim().min(1).max(80).nullable().default(null),
    episodeLabel: z.string().trim().min(1).max(80).nullable().default(null),
    progressState: mediaWatchStatusSchema.nullable().default(null),
    score: z.number().min(0).max(10).multipleOf(0.1).nullable().default(null),
    comment: z.string().trim().max(50_000).nullable().default(null),
    occurredAt: z.iso.datetime({ offset: true }),
    datePrecision: datePrecisionSchema.default("exact"),
    timezone: z.string().trim().min(1).max(80).default("Asia/Tokyo"),
    source: sourceSchema,
    visibility: z.literal("private").default("private"),
  })
  .superRefine((value, context) => {
    if (value.mediaKind !== null && value.mediaType !== "screen") {
      context.addIssue({
        code: "custom",
        path: ["mediaKind"],
        message: "mediaKind is only valid for screen works.",
      });
    }
    if (value.score !== null && value.ratingScope === null) {
      context.addIssue({
        code: "custom",
        path: ["ratingScope"],
        message: "ratingScope is required when score is provided.",
      });
    }
    if (value.ratingScope === "episode" && value.episodeLabel === null) {
      context.addIssue({
        code: "custom",
        path: ["episodeLabel"],
        message: "episodeLabel is required for an explicit episode log.",
      });
    }
    if (value.ratingScope !== "episode" && value.episodeLabel !== null) {
      context.addIssue({
        code: "custom",
        path: ["episodeLabel"],
        message: "episodeLabel is only stored for explicit episode logs.",
      });
    }
    if (
      value.ratingScope === "season" &&
      value.seasonId === null &&
      value.seasonLabel === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["seasonId"],
        message: "A seasonId or seasonLabel is required for a season rating.",
      });
    }
  });

export const listMediaWorksInputSchema = z.object({
  mediaType: mediaTypeSchema.nullable().default(null),
  mediaKind: mediaKindSchema.nullable().default(null),
  query: z.string().trim().max(300).default(""),
  watchStatus: mediaWatchStatusSchema.nullable().default(null),
  sort: z
    .enum(["recent_desc", "recent_asc", "updated_desc", "title_asc"])
    .default("recent_desc"),
  limit: z.number().int().min(1).max(200).default(100),
});

export const createMediaWorkInputSchema = z.object({
  mediaType: mediaTypeSchema,
  mediaKind: mediaKindSchema.nullable().default(null),
  title: z.string().trim().min(1).max(300),
  aliases: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
  coverUrl: z.string().trim().min(1).max(2_000).nullable().default(null),
  watchStatus: mediaWatchStatusSchema.nullable().default(null),
  overallScore: z
    .number()
    .min(0)
    .max(10)
    .multipleOf(0.1)
    .nullable()
    .default(null),
}).superRefine((value, context) => {
  if (value.mediaKind !== null && value.mediaType !== "screen") {
    context.addIssue({
      code: "custom",
      path: ["mediaKind"],
      message: "mediaKind is only valid for screen works.",
    });
  }
});

export const updateMediaWorkInputSchema = z
  .object({
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
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one media work field must be provided.",
  });

export const createMediaSeasonInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  seasonNumber: z.number().int().positive().nullable().default(null),
  title: z.string().trim().min(1).max(300).nullable().default(null),
  score: z
    .number()
    .min(0)
    .max(10)
    .multipleOf(0.1)
    .nullable()
    .default(null),
  watchStatus: mediaWatchStatusSchema.nullable().default(null),
});

export const updateMediaSeasonInputSchema = z
  .object({
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
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one season field must be provided.",
  });

const gameTrophiesSchema = z
  .object({
    platinum: z.number().int().min(0),
    gold: z.number().int().min(0),
    silver: z.number().int().min(0),
    bronze: z.number().int().min(0),
  })
  .strict();

export const createGameLibraryItemInputSchema = z
  .object({
    platform: z.string().trim().min(1).max(80),
    title: z.string().trim().min(1).max(300),
    playTime: z.string().trim().min(1).max(80),
    progress: z.number().int().min(0).max(100),
    trophies: gameTrophiesSchema,
    achievementsCurrent: z.number().int().min(0),
    achievementsTotal: z.number().int().min(0),
    rating: z.number().min(0).max(10).multipleOf(0.1),
    review: z.string().trim().max(50_000).default(""),
    tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
    coverUrl: z.string().trim().min(1).max(2_000),
    sourceUrl: z.string().trim().min(1).max(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.achievementsCurrent > value.achievementsTotal) {
      context.addIssue({
        code: "custom",
        path: ["achievementsCurrent"],
        message: "achievementsCurrent cannot exceed achievementsTotal.",
      });
    }
  });

export const updateGameLibraryItemInputSchema = z
  .object({
    versionNo: z.number().int().positive(),
    platform: z.string().trim().min(1).max(80).optional(),
    title: z.string().trim().min(1).max(300).optional(),
    playTime: z.string().trim().min(1).max(80).optional(),
    progress: z.number().int().min(0).max(100).optional(),
    trophies: gameTrophiesSchema.optional(),
    achievementsCurrent: z.number().int().min(0).optional(),
    achievementsTotal: z.number().int().min(0).optional(),
    rating: z.number().min(0).max(10).multipleOf(0.1).optional(),
    review: z.string().trim().max(50_000).optional(),
    tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
    coverUrl: z.string().trim().min(1).max(2_000).optional(),
    sourceUrl: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "versionNo"), {
    message: "At least one game library field must be provided.",
  });

export const listEntriesInputSchema = z.object({
  query: z.string().trim().max(300).default(""),
  type: entryTypeSchema.nullable().default(null),
  visibility: entryVisibilitySchema.nullable().default(null),
  status: entryStatusSchema.default("active"),
  mediaWorkId: z.string().trim().min(1).nullable().default(null),
  scoreMin: z.number().min(0).max(10).nullable().default(null),
  scoreMax: z.number().min(0).max(10).nullable().default(null),
  occurredFrom: z.iso.datetime({ offset: true }).nullable().default(null),
  occurredTo: z.iso.datetime({ offset: true }).nullable().default(null),
  tag: z.string().trim().min(1).max(80).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).nullable().default(null),
});

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "日期格式必须是 YYYY-MM-DD。");

export const ledgerStatsInputSchema = z
  .object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(80).nullable().default(null),
  })
  .refine((value) => Date.parse(value.from) < Date.parse(value.to), {
    message: "from 必须早于 to。",
  })
  .refine(
    (value) =>
      Date.parse(value.to) - Date.parse(value.from) <= 1_100 * 86_400_000,
    { message: "统计区间最长约 3 年。" },
  );

export const listTagsInputSchema = z.object({
  limit: z.number().int().min(1).max(500).default(200),
});

export const onThisDayInputSchema = z.object({
  date: localDateSchema.nullable().default(null),
  timezone: z.string().trim().min(1).max(80).nullable().default(null),
  limit: z.number().int().min(1).max(100).default(50),
});

export const updateEntryInputSchema = z.object({
  versionNo: z.number().int().positive(),
  bodyRaw: z.string().trim().min(1).max(50_000).optional(),
  title: z.string().trim().max(300).nullable().optional(),
  occurredAt: z.iso.datetime({ offset: true }).optional(),
  datePrecision: datePrecisionSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  score: z.number().min(0).max(10).multipleOf(0.1).nullable().optional(),
  reason: z.string().trim().min(1).max(300).default("manual edit"),
});

export const confirmActionInputSchema = z.object({
  actionId: z.string().trim().min(1),
  confirmationCode: z.string().trim().min(1).max(80),
});

export const settingsSchema = z.object({
  timezone: z.string().trim().min(1).max(80),
  captureMode: z.enum(["safe", "quick_media"]),
  publicPreview: z.boolean(),
  sensitiveWarning: z.boolean(),
  weeklyReview: z.boolean(),
  retentionDaily: z.number().int().min(7).max(90),
  retentionWeekly: z.number().int().min(4).max(52),
});

export const importDryRunInputSchema = z.object({
  sourceName: z.string().trim().min(1).max(300),
  records: z.array(z.record(z.string(), z.unknown())).max(5_000),
});

export type EntryType = z.infer<typeof entryTypeSchema>;
export type EntryVisibility = z.infer<typeof entryVisibilitySchema>;
export type EntryStatus = z.infer<typeof entryStatusSchema>;
export type SourceChannel = z.infer<typeof sourceChannelSchema>;
export type RatingScope = z.infer<typeof ratingScopeSchema>;
export type DatePrecision = z.infer<typeof datePrecisionSchema>;
export type MediaType = z.infer<typeof mediaTypeSchema>;
export type MediaKind = z.infer<typeof mediaKindSchema>;
export type MediaWatchStatus = z.infer<typeof mediaWatchStatusSchema>;
export type MediaImageMimeType = z.infer<typeof mediaImageMimeTypeSchema>;
export type MediaImagePurpose = z.infer<typeof mediaImagePurposeSchema>;
export type UploadMediaImageInput = z.infer<
  typeof uploadMediaImageInputSchema
>;
export type CaptureEntryInput = z.infer<typeof captureEntryInputSchema>;
export type LogMediaInput = z.infer<typeof logMediaInputSchema>;
export type ListMediaWorksInput = z.infer<typeof listMediaWorksInputSchema>;
export type CreateMediaWorkInput = z.infer<typeof createMediaWorkInputSchema>;
export type UpdateMediaWorkInput = z.infer<typeof updateMediaWorkInputSchema>;
export type CreateMediaSeasonInput = z.infer<
  typeof createMediaSeasonInputSchema
>;
export type UpdateMediaSeasonInput = z.infer<
  typeof updateMediaSeasonInputSchema
>;
export type CreateGameLibraryItemInput = z.infer<
  typeof createGameLibraryItemInputSchema
>;
export type UpdateGameLibraryItemInput = z.infer<
  typeof updateGameLibraryItemInputSchema
>;
export type ListEntriesInput = z.infer<typeof listEntriesInputSchema>;
export type UpdateEntryInput = z.infer<typeof updateEntryInputSchema>;
export type ConfirmActionInput = z.infer<typeof confirmActionInputSchema>;
export type LedgerSettings = z.infer<typeof settingsSchema>;
export type LedgerStatsInput = z.input<typeof ledgerStatsInputSchema>;
export type ListTagsInput = z.input<typeof listTagsInputSchema>;
export type OnThisDayInput = z.input<typeof onThisDayInputSchema>;

export interface CountBucket<K extends string = string> {
  key: K;
  count: number;
}

export interface LedgerStatsMediaWork {
  mediaWorkId: string;
  title: string;
  mediaType: MediaType;
  logCount: number;
  lastOccurredAt: string;
  averageScore: number | null;
}

export interface LedgerStatsRatedLog {
  entryId: string;
  mediaWorkId: string;
  title: string;
  mediaType: MediaType;
  score: number;
  ratingScope: RatingScope | null;
  occurredAt: string;
}

export interface LedgerStats {
  range: { from: string; to: string; timezone: string };
  totalEntries: number;
  truncated: boolean;
  activeDays: number;
  byType: Array<CountBucket<EntryType>>;
  byVisibility: Array<CountBucket<EntryVisibility>>;
  timeline: {
    granularity: "day" | "month";
    buckets: CountBucket[];
  };
  topTags: CountBucket[];
  media: {
    logCount: number;
    distinctWorks: number;
    scoredCount: number;
    averageScore: number | null;
    byMediaType: Array<CountBucket<MediaType>>;
    works: LedgerStatsMediaWork[];
    topRated: LedgerStatsRatedLog[];
  };
}

export interface LedgerTag {
  tag: string;
  count: number;
  lastUsedAt: string;
}

export interface OnThisDayResult {
  date: string;
  timezone: string;
  entries: EntrySummary[];
}
export type ImportDryRunInput = z.infer<typeof importDryRunInputSchema>;

export interface ImportDryRunReport {
  batchId: string;
  sourceName: string;
  total: number;
  newRecords: number;
  duplicates: number;
  ambiguous: number;
  errors: number;
  status: "dry_run" | "committed";
}

export interface EntrySummary {
  id: string;
  type: EntryType;
  title: string | null;
  bodyRaw: string;
  bodySummary: string | null;
  occurredAt: string;
  datePrecision: DatePrecision;
  createdAt: string;
  visibility: EntryVisibility;
  status: EntryStatus;
  sourceChannel: SourceChannel;
  tags: string[];
  score: number | null;
  mediaWorkId: string | null;
  mediaTitle: string | null;
  seasonId: string | null;
  seasonLabel: string | null;
  episodeLabel: string | null;
  ratingScope: RatingScope | null;
  versionNo: number;
}

export interface EntryRevision {
  id: string;
  versionNo: number;
  snapshot: Record<string, unknown>;
  actorType: string;
  actorId: string | null;
  reason: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  actorType: string;
  actorId: string | null;
  detail: string;
  createdAt: string;
}

export interface EntryDetail extends EntrySummary {
  sourceMessageId: string | null;
  sourceConversationId: string | null;
  temporalUncertain: boolean;
  publishedAt: string | null;
  revisions: EntryRevision[];
  audit: AuditEvent[];
}

export interface MutationResult {
  entry: EntryDetail;
  deduplicated: boolean;
  requestId: string;
  undoExpiresAt: string;
}

export interface PendingAction {
  actionId: string;
  targetId: string;
  confirmationCode: string;
  expiresAt: string;
  preview: {
    title: string;
    body: string;
    score: number | null;
    occurredAt: string;
    mediaTitle: string | null;
  };
}

export interface AnimeWorkSummary {
  id: string;
  title: string;
  aliases: string[];
  coverUrl: string | null;
  watchStatus: MediaWatchStatus | null;
  overallScore: number | null;
  logCount: number;
  publicLogCount: number;
  lastLoggedAt: string | null;
  lastLoggedDatePrecision: DatePrecision | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnimeWorkDetail extends AnimeWorkSummary {
  logs: EntrySummary[];
}

export interface MediaSeason {
  id: string;
  mediaWorkId: string;
  label: string;
  seasonNumber: number | null;
  title: string | null;
  score: number | null;
  watchStatus: MediaWatchStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaWorkSummary {
  id: string;
  mediaType: MediaType;
  mediaKind: MediaKind | null;
  title: string;
  aliases: string[];
  coverUrl: string | null;
  watchStatus: MediaWatchStatus | null;
  overallScore: number | null;
  seasonCount: number;
  logCount: number;
  publicLogCount: number;
  lastLoggedAt: string | null;
  lastLoggedDatePrecision: DatePrecision | null;
  createdAt: string;
  updatedAt: string;
}

export interface MediaWorkDetail extends MediaWorkSummary {
  seasons: MediaSeason[];
  logs: EntrySummary[];
}

export interface GameLibraryItem {
  id: string;
  platform: string;
  title: string;
  playTime: string;
  progress: number;
  trophies: {
    platinum: number;
    gold: number;
    silver: number;
    bronze: number;
  };
  achievementsCurrent: number;
  achievementsTotal: number;
  rating: number;
  review: string;
  tags: string[];
  coverUrl: string;
  sourceUrl: string;
  status: "active" | "deleted";
  versionNo: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MediaImageUploadResult {
  objectKey: string;
  publicUrl: string;
  mimeType: MediaImageMimeType;
  sizeBytes: number;
  width: number;
  height: number;
  sha256: string;
  etag: string;
  createdAt: string;
}

export interface ExportRecord {
  id: string;
  format: "jsonl" | "sql" | "archive";
  scope: "incremental" | "full";
  status: "pending" | "running" | "completed" | "failed";
  createdAt: string;
  completedAt: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  rowCount: number | null;
}

export interface ExportDownload {
  fileName: string;
  contentType: string;
  body: ArrayBuffer;
  checksum: string;
}

export interface ExportVerification {
  id: string;
  verified: boolean;
  expectedChecksum: string;
  computedChecksum: string;
  sizeBytes: number;
  checkedAt: string;
}

export interface DashboardResponse {
  entries: EntrySummary[];
  anime: AnimeWorkSummary[];
  settings: LedgerSettings;
  exports: ExportRecord[];
  generatedAt: string;
}

export const publicAnimeLogSchema = z
  .object({
    entryId: z.string().min(1),
    scope: ratingScopeSchema.nullable(),
    season: z.string().nullable(),
    episode: z.string().nullable(),
    score: z.number().min(0).max(10).nullable(),
    comment: z.string(),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const publicAnimeItemSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    coverUrl: z.string().nullable(),
    overallScore: z.number().min(0).max(10).nullable(),
    status: mediaWatchStatusSchema.nullable(),
    recentLogs: z.array(publicAnimeLogSchema).max(20),
  })
  .strict();

export const publicAnimeResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    generatedAt: z.iso.datetime({ offset: true }),
    revision: z.string().min(1),
    items: z.array(publicAnimeItemSchema).max(100),
  })
  .strict();

export type PublicAnimeLog = z.infer<typeof publicAnimeLogSchema>;
export type PublicAnimeItem = z.infer<typeof publicAnimeItemSchema>;
export type PublicAnimeResponse = z.infer<typeof publicAnimeResponseSchema>;

export const publicTimelineMediaSchema = z
  .object({
    workId: z.string().min(1),
    title: z.string().min(1),
    scope: ratingScopeSchema.nullable(),
    season: z.string().nullable(),
    episode: z.string().nullable(),
  })
  .strict();

export const publicTimelineItemSchema = z
  .object({
    id: z.string().min(1),
    type: entryTypeSchema,
    title: z.string().min(1),
    body: z.string(),
    occurredAt: z.iso.datetime({ offset: true }),
    score: z.number().min(0).max(10).nullable(),
    media: publicTimelineMediaSchema.nullable(),
  })
  .strict();

export const publicTimelineResponseSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    generatedAt: z.iso.datetime({ offset: true }),
    revision: z.string().min(1),
    items: z.array(publicTimelineItemSchema).max(500),
  })
  .strict();

export type PublicTimelineItem = z.infer<typeof publicTimelineItemSchema>;
export type PublicTimelineResponse = z.infer<
  typeof publicTimelineResponseSchema
>;

export interface CoreBinding {
  health(): Promise<{ ok: true; service: "life-ledger-core"; now: string }>;
  listEntries(input: ListEntriesInput): Promise<EntrySummary[]>;
  getEntry(id: string): Promise<EntryDetail | null>;
  captureEntry(input: CaptureEntryInput): Promise<MutationResult>;
  logMedia(input: LogMediaInput): Promise<MutationResult>;
  updateEntry(id: string, input: UpdateEntryInput): Promise<EntryDetail>;
  deleteEntry(id: string): Promise<EntryDetail>;
  restoreEntry(id: string): Promise<EntryDetail>;
  purgeEntry(id: string, confirmationId: string): Promise<{ id: string; purged: true }>;
  preparePublish(id: string): Promise<PendingAction>;
  confirmAction(input: ConfirmActionInput): Promise<EntryDetail>;
  unpublishEntry(id: string): Promise<EntryDetail>;
  listAnime(): Promise<AnimeWorkSummary[]>;
  getAnime(id: string): Promise<AnimeWorkDetail | null>;
  listMediaWorks(input: ListMediaWorksInput): Promise<MediaWorkSummary[]>;
  getMediaWork(id: string): Promise<MediaWorkDetail | null>;
  createMediaWork(input: CreateMediaWorkInput): Promise<MediaWorkDetail>;
  updateMediaWork(
    id: string,
    input: UpdateMediaWorkInput,
  ): Promise<MediaWorkDetail>;
  uploadMediaImage(
    input: UploadMediaImageInput,
  ): Promise<MediaImageUploadResult>;
  deleteMediaWork(id: string): Promise<{ id: string; deleted: true }>;
  listSeasons(mediaWorkId: string): Promise<MediaSeason[]>;
  createSeason(
    mediaWorkId: string,
    input: CreateMediaSeasonInput,
  ): Promise<MediaSeason>;
  updateSeason(
    id: string,
    input: UpdateMediaSeasonInput,
  ): Promise<MediaSeason>;
  deleteSeason(id: string): Promise<{ id: string; deleted: true }>;
  listGameLibrary(): Promise<GameLibraryItem[]>;
  createGameLibraryItem(
    input: CreateGameLibraryItemInput,
  ): Promise<GameLibraryItem>;
  updateGameLibraryItem(
    id: string,
    input: UpdateGameLibraryItemInput,
  ): Promise<GameLibraryItem>;
  deleteGameLibraryItem(
    id: string,
    versionNo: number,
  ): Promise<GameLibraryItem>;
  restoreGameLibraryItem(
    id: string,
    versionNo: number,
  ): Promise<GameLibraryItem>;
  getPublicAnime(): Promise<PublicAnimeResponse>;
  getPublicTimeline(): Promise<PublicTimelineResponse>;
  getStats(input: LedgerStatsInput): Promise<LedgerStats>;
  listTags(input?: ListTagsInput): Promise<LedgerTag[]>;
  getOnThisDay(input?: OnThisDayInput): Promise<OnThisDayResult>;
  getSettings(): Promise<LedgerSettings>;
  updateSettings(settings: LedgerSettings): Promise<LedgerSettings>;
  createImportDryRun(input: ImportDryRunInput): Promise<ImportDryRunReport>;
  commitImport(batchId: string): Promise<ImportDryRunReport>;
  listExports(): Promise<ExportRecord[]>;
  createExport(scope: "incremental" | "full"): Promise<ExportRecord>;
  downloadExport(id: string): Promise<ExportDownload>;
  verifyExport(id: string): Promise<ExportVerification>;
}

export function normalizeMediaTitle(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[《》「」『』【】()[\]（）\s:：·・!！?？,，.。'"]/g, "");
}

export function scoreToInteger(score: number | null): number | null {
  return score === null ? null : Math.round(score * 10);
}

export function integerToScore(score: number | null): number | null {
  return score === null ? null : score / 10;
}
