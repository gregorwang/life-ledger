import {
  WorkerEntrypoint,
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";

import {
  ENTRY_MEDIA_LIMITS,
  addEntryFollowUpInputSchema,
  attachEntryMediaInputSchema,
  captureEntryInputSchema,
  createEntryMediaUploadInputSchema,
  entryMediaKindFor,
  entryMediaMaxBytes,
  matchesEntryMediaSignature,
  confirmActionInputSchema,
  createGameLibraryItemInputSchema,
  createMediaSeasonInputSchema,
  createMediaWorkInputSchema,
  importDryRunInputSchema,
  integerToScore,
  ledgerStatsInputSchema,
  listEntriesInputSchema,
  listMediaWorksInputSchema,
  listTagsInputSchema,
  logMediaInputSchema,
  registerEntryMediaInputSchema,
  uploadEntryMediaInputSchema,
  normalizeMediaTitle,
  onThisDayInputSchema,
  publicAnimeResponseSchema,
  publicTimelineItemSchema,
  publicTimelineResponseSchema,
  scoreToInteger,
  settingsSchema,
  updateEntryInputSchema,
  updateGameLibraryItemInputSchema,
  updateMediaSeasonInputSchema,
  updateMediaWorkInputSchema,
  type AddEntryFollowUpInput,
  type CreateEntryMediaUploadInput,
  type EntryMediaUploadClaim,
  type EntryMediaUploadTicket,
  type UploadEntryMediaInput,
  type AnimeWorkDetail,
  type AnimeWorkSummary,
  type AuditEvent,
  type CaptureEntryInput,
  type ConfirmActionInput,
  type CreateGameLibraryItemInput,
  type CreateMediaSeasonInput,
  type CreateMediaWorkInput,
  type EntryDetail,
  type EntryFollowUp,
  type EntryMedia,
  type EntryRevision,
  type EntryStatus,
  type EntrySummary,
  type LedgerStats,
  type LedgerStatsInput,
  type LedgerTag,
  type ListTagsInput,
  type OnThisDayInput,
  type OnThisDayResult,
  type EntryType,
  type EntryVisibility,
  type ExportDownload,
  type ExportRecord,
  type ExportVerification,
  type GameLibraryItem,
  type ImportDryRunInput,
  type ImportDryRunReport,
  type LedgerSettings,
  type ListEntriesInput,
  type LogMediaInput,
  type ListMediaWorksInput,
  type MediaKind,
  type MediaImageUploadResult,
  type MediaSeason,
  type MediaType,
  type MediaWatchStatus,
  type MediaWorkDetail,
  type MediaWorkSummary,
  type MutationResult,
  type RegisterEntryMediaInput,
  type PendingAction,
  type PublicAnimeItem,
  type PublicAnimeResponse,
  type PublicTimelineItem,
  type PublicTimelineResponse,
  type RatingScope,
  type SourceChannel,
  type UpdateEntryInput,
  type UpdateGameLibraryItemInput,
  type UpdateMediaSeasonInput,
  type UpdateMediaWorkInput,
  type UploadMediaImageInput,
} from "@life-ledger/contracts";

import {
  buildSqlDump,
  createTarGzip,
  encodeUtf8,
  gzipBytes,
  serializeJsonLines,
  sha256HexBytes,
  type ExportTable,
} from "./export-utils";
import {
  createEntryMediaObjectKey,
  createUploadToken,
  decodeEntryMediaBase64,
  isWellFormedUploadToken,
  uploadBaseOrigin,
} from "./entry-media";
import { mediaWatchStatusFromLegacyStatus } from "./media-import";
import {
  MEDIA_WORK_AGGREGATE_SELECT,
  mediaWorkOrderBy,
} from "./media-order";
import {
  uploadMediaImageToR2,
  type MediaUploadEnvironment,
} from "./media-upload";
import {
  aggregateStats,
  isValidTimeZone,
  localDateKey,
  timeZoneOffsetMinutes,
  type StatsRow,
} from "./stats";


interface Env extends MediaUploadEnvironment {
  DB: D1Database;
  BACKUPS: R2Bucket;
  MEDIA: R2Bucket;
  MEDIA_PUBLIC_BASE_URL: string;
  /** Origin of the web worker that accepts one-time media uploads. */
  WEB_ORIGIN?: string;
  EXPORT_WORKFLOW: Workflow<ExportWorkflowParams>;
}

interface EntryRow {
  id: string;
  type: EntryType;
  title: string | null;
  body_raw: string;
  body_summary: string | null;
  occurred_at: string;
  date_precision: EntrySummary["datePrecision"];
  created_at: string;
  visibility: EntryVisibility;
  status: EntryStatus;
  source_channel: SourceChannel;
  source_message_id: string | null;
  source_conversation_id: string | null;
  tags_json: string;
  temporal_uncertain: number;
  version_no: number;
  published_at: string | null;
  media_work_id: string | null;
  media_title: string | null;
  season_id: string | null;
  rating_scope: RatingScope | null;
  season_label: string | null;
  episode_label: string | null;
  score_100: number | null;
}

interface EntryMediaRow {
  id: string;
  entry_id: string | null;
  kind: EntryMedia["kind"];
  object_key: string;
  mime_type: EntryMedia["mimeType"];
  size_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  created_at: string;
}

interface EntryMediaUploadTicketRow {
  media_id: string;
  object_key: string;
  kind: EntryMedia["kind"];
  mime_type: EntryMedia["mimeType"];
  max_bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  expires_at: string;
  claimed_at: string | null;
}

interface EntryFollowUpRow {
  id: string;
  entry_id: string;
  body_raw: string;
  source_channel: SourceChannel;
  created_at: string;
}

interface RevisionRow {
  id: string;
  version_no: number;
  snapshot_json: string;
  actor_type: string;
  actor_id: string | null;
  reason: string | null;
  created_at: string;
}

interface AuditRow {
  id: string;
  action: string;
  actor_type: string;
  actor_id: string | null;
  detail: string;
  created_at: string;
}

interface AnimeAggregateRow {
  id: string;
  canonical_title: string;
  aliases_json: string;
  cover_url: string | null;
  watch_status: MediaWatchStatus | null;
  overall_score_100: number | null;
  log_count: number;
  public_log_count: number;
  last_logged_at: string | null;
  last_logged_date_precision: EntrySummary["datePrecision"] | null;
  created_at: string;
  updated_at: string;
}

interface MediaWorkAggregateRow {
  id: string;
  media_type: MediaType;
  media_kind: MediaKind | null;
  canonical_title: string;
  aliases_json: string;
  cover_url: string | null;
  watch_status: MediaWatchStatus | null;
  overall_score_100: number | null;
  season_count: number;
  log_count: number;
  public_log_count: number;
  last_logged_at: string | null;
  last_logged_date_precision: EntrySummary["datePrecision"] | null;
  created_at: string;
  updated_at: string;
}

interface MediaSeasonRow {
  id: string;
  media_work_id: string;
  label: string;
  season_number: number | null;
  title: string | null;
  score_100: number | null;
  watch_status: MediaWatchStatus | null;
  created_at: string;
  updated_at: string;
}

interface GameLibraryRow {
  id: string;
  platform: string;
  title: string;
  play_time: string;
  progress: number;
  trophies_platinum: number;
  trophies_gold: number;
  trophies_silver: number;
  trophies_bronze: number;
  achievements_current: number;
  achievements_total: number;
  rating: number;
  review: string;
  tags_json: string;
  cover_url: string;
  source_url: string;
  status: GameLibraryItem["status"];
  version_no: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface ExportRow {
  id: string;
  format: ExportRecord["format"];
  scope: ExportRecord["scope"];
  status: ExportRecord["status"];
  created_at: string;
  completed_at: string | null;
  size_bytes: number | null;
  checksum: string | null;
  row_count: number | null;
  r2_key: string | null;
  error_code: string | null;
}

type ExportKind =
  | "manual_incremental"
  | "manual_full"
  | "daily"
  | "weekly"
  | "monthly";

interface ExportWorkflowParams {
  exportId?: string;
  scope?: "incremental" | "full";
  kind?: ExportKind;
  delayMinutes?: number;
}

interface ExportPlan {
  id: string;
  scope: ExportRecord["scope"];
  format: ExportRecord["format"];
  kind: ExportKind;
  createdAt: string;
  cutoff: string;
  since: string | null;
}

interface StoredExportArtifact {
  r2Key: string;
  checksum: string;
  sizeBytes: number;
  rowCount: number;
}

interface PendingActionRow {
  id: string;
  target_id: string;
  payload_json: string;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
}

interface ExistingIdempotentRow {
  id: string;
  request_hash: string | null;
}

interface PublicProjectionRow {
  work_id: string;
  canonical_title: string;
  cover_url: string | null;
  media_status: MediaWatchStatus | null;
  overall_score_100: number | null;
  entry_id: string;
  body_summary: string | null;
  body_raw: string;
  occurred_at: string;
  rating_scope: RatingScope | null;
  season_label: string | null;
  episode_label: string | null;
  score_100: number | null;
  public_snapshot_json: string | null;
}

interface PublicTimelineProjectionRow {
  entry_id: string;
  entry_type: EntryType;
  media_work_id: string | null;
  rating_scope: RatingScope | null;
  season_label: string | null;
  episode_label: string | null;
  public_snapshot_json: string | null;
}

const USER_ID = "user_primary";
const ACTOR_USER = "user_primary";

function actorForSource(source: SourceChannel): {
  actorType: "agent" | "system" | "user";
  actorId: string;
} {
  switch (source) {
    case "web":
      return { actorType: "user", actorId: ACTOR_USER };
    case "import":
      return { actorType: "system", actorId: "importer" };
    case "mcp":
      return { actorType: "agent", actorId: "mcp_client" };
    case "wechat":
      return { actorType: "agent", actorId: "hermes" };
  }
}

function utcIso(value: string): string {
  return new Date(value).toISOString();
}

export class LedgerDomainError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(`${code}: ${message}`);
    this.name = "LedgerDomainError";
    this.code = code;
    this.status = status;
  }
}

function safeStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function safeRecord(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function safeRecordArray(value: string): Array<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is Record<string, unknown> =>
            typeof item === "object" &&
            item !== null &&
            !Array.isArray(item),
        )
      : [];
  } catch {
    return [];
  }
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function plainText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[#*_>`~[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summary(value: string): string {
  const normalized = plainText(value);
  return normalized.length > 160 ? `${normalized.slice(0, 157)}…` : normalized;
}

function mediaWatchStatusFromProgress(
  value: string | null,
): MediaWatchStatus | null {
  switch (value) {
    case "planned":
    case "watching":
    case "completed":
    case "watched":
    case "paused":
    case "dropped":
      return value;
    default:
      return null;
  }
}

function normalizeSeasonLabel(value: string): string {
  const normalized = normalizeMediaTitle(value);
  const numbered = /^(?:第)?(\d+)(?:季)?$/.exec(normalized);
  return numbered?.[1] ? `第${Number(numbered[1])}季` : normalized;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toSummary(row: EntryRow): EntrySummary {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    bodyRaw: row.body_raw,
    bodySummary: row.body_summary,
    occurredAt: row.occurred_at,
    datePrecision: row.date_precision,
    createdAt: row.created_at,
    visibility: row.visibility,
    status: row.status,
    sourceChannel: row.source_channel,
    tags: safeStringArray(row.tags_json),
    score: integerToScore(row.score_100),
    mediaWorkId: row.media_work_id,
    mediaTitle: row.media_title,
    seasonId: row.season_id,
    seasonLabel: row.season_label,
    episodeLabel: row.episode_label,
    ratingScope: row.rating_scope,
    versionNo: row.version_no,
    media: [],
    followUps: [],
  };
}

/**
 * Entries captured before media attachments existed were hashed without a
 * mediaIds field; omit it when empty so retried source messages still match.
 */
function idempotencyFingerprint(input: { mediaIds: string[] }): string {
  const { mediaIds, ...rest } = input;
  return JSON.stringify(mediaIds.length > 0 ? input : rest);
}

function toEntryMedia(row: EntryMediaRow): EntryMedia {
  return {
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    url: `/media/${row.object_key}`,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
  };
}

function toEntryFollowUp(row: EntryFollowUpRow): EntryFollowUp {
  return {
    id: row.id,
    body: row.body_raw,
    sourceChannel: row.source_channel,
    createdAt: row.created_at,
  };
}

const ENTRY_MEDIA_COLUMNS = `
  id, entry_id, kind, object_key, mime_type, size_bytes,
  width, height, duration_ms, created_at
`;

function toExportRecord(row: ExportRow): ExportRecord {
  return {
    id: row.id,
    format: row.format,
    scope: row.scope,
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    sizeBytes: row.size_bytes,
    checksum: row.checksum,
    rowCount: row.row_count,
  };
}

function toAnimeSummary(row: AnimeAggregateRow): AnimeWorkSummary {
  return {
    id: row.id,
    title: row.canonical_title,
    aliases: safeStringArray(row.aliases_json),
    coverUrl: row.cover_url,
    watchStatus: row.watch_status,
    overallScore: integerToScore(row.overall_score_100),
    logCount: Number(row.log_count),
    publicLogCount: Number(row.public_log_count),
    lastLoggedAt: row.last_logged_at,
    lastLoggedDatePrecision: row.last_logged_date_precision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMediaWorkSummary(row: MediaWorkAggregateRow): MediaWorkSummary {
  return {
    id: row.id,
    mediaType: row.media_type,
    mediaKind: row.media_kind,
    title: row.canonical_title,
    aliases: safeStringArray(row.aliases_json),
    coverUrl: row.cover_url,
    watchStatus: row.watch_status,
    overallScore: integerToScore(row.overall_score_100),
    seasonCount: Number(row.season_count),
    logCount: Number(row.log_count),
    publicLogCount: Number(row.public_log_count),
    lastLoggedAt: row.last_logged_at,
    lastLoggedDatePrecision: row.last_logged_date_precision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMediaSeason(row: MediaSeasonRow): MediaSeason {
  return {
    id: row.id,
    mediaWorkId: row.media_work_id,
    label: row.label,
    seasonNumber: row.season_number,
    title: row.title,
    score: integerToScore(row.score_100),
    watchStatus: row.watch_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toGameLibraryItem(row: GameLibraryRow): GameLibraryItem {
  return {
    id: row.id,
    platform: row.platform,
    title: row.title,
    playTime: row.play_time,
    progress: Number(row.progress),
    trophies: {
      platinum: Number(row.trophies_platinum),
      gold: Number(row.trophies_gold),
      silver: Number(row.trophies_silver),
      bronze: Number(row.trophies_bronze),
    },
    achievementsCurrent: Number(row.achievements_current),
    achievementsTotal: Number(row.achievements_total),
    rating: Number(row.rating),
    review: row.review,
    tags: safeStringArray(row.tags_json),
    coverUrl: row.cover_url,
    sourceUrl: row.source_url,
    status: row.status,
    versionNo: Number(row.version_no),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

const ENTRY_SELECT = `
  SELECT
    e.id,
    e.type,
    e.title,
    e.body_raw,
    e.body_summary,
    e.occurred_at,
    e.date_precision,
    e.created_at,
    e.visibility,
    e.status,
    e.source_channel,
    e.source_message_id,
    e.source_conversation_id,
    e.tags_json,
    e.temporal_uncertain,
    e.version_no,
    e.published_at,
    mw.id AS media_work_id,
    mw.canonical_title AS media_title,
    ml.season_id,
    ml.rating_scope,
    ml.season_label,
    ml.episode_label,
    ml.score_100
  FROM entries e
  LEFT JOIN media_logs ml ON ml.entry_id = e.id
  LEFT JOIN media_works mw ON mw.id = ml.media_work_id
`;

const FULL_EXPORT_TABLES = [
  "users",
  "entries",
  "media_works",
  "media_seasons",
  "media_logs",
  "entry_revisions",
  "pending_actions",
  "audit_events",
  "exports",
  "app_meta",
  "import_batches",
  "media_assets",
  "media_upload_requests",
  "entry_media",
  "entry_follow_ups",
] as const;

const STATS_ROW_LIMIT = 20_000;
const EXPORT_PAGE_SIZE = 250;
const DAILY_SCHEDULE = "20 18 * * *";
const WEEKLY_SCHEDULE = "0 19 * * 0";
const MONTHLY_SCHEDULE = "20 18 1 * *";

function scheduledExportKind(cron: string | undefined): ExportKind {
  if (cron === WEEKLY_SCHEDULE) {
    return "weekly";
  }
  if (cron === MONTHLY_SCHEDULE) {
    return "monthly";
  }
  return "daily";
}

function formatForExportKind(
  kind: ExportKind,
  scope: ExportRecord["scope"],
): ExportRecord["format"] {
  if (kind === "weekly") {
    return "sql";
  }
  if (kind === "monthly" || (kind === "manual_full" && scope === "full")) {
    return "archive";
  }
  return "jsonl";
}

function exportFolder(kind: ExportKind): string {
  switch (kind) {
    case "daily":
      return "daily";
    case "weekly":
      return "weekly";
    case "monthly":
      return "monthly";
    case "manual_full":
    case "manual_incremental":
      return "manual";
  }
}

async function readPagedRows(
  database: D1Database,
  query: string,
  values: unknown[] = [],
): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  let offset = 0;
  for (;;) {
    const page = await database
      .prepare(`${query} LIMIT ? OFFSET ?`)
      .bind(...values, EXPORT_PAGE_SIZE, offset)
      .all<Record<string, unknown>>();
    rows.push(...page.results);
    if (page.results.length < EXPORT_PAGE_SIZE) {
      return rows;
    }
    offset += page.results.length;
  }
}

async function collectFullExport(
  database: D1Database,
): Promise<{ tables: ExportTable[]; schema: string[] }> {
  const tables: ExportTable[] = [];
  for (const table of FULL_EXPORT_TABLES) {
    tables.push({
      name: table,
      rows: await readPagedRows(
        database,
        `SELECT * FROM "${table}" ORDER BY rowid`,
      ),
    });
  }
  const schemaRows = await readPagedRows(
    database,
    `
      SELECT sql
      FROM sqlite_master
      WHERE sql IS NOT NULL
        AND name NOT LIKE 'sqlite_%'
        AND name NOT LIKE '_cf_%'
      ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name
    `,
  );
  return {
    tables,
    schema: schemaRows
      .map((row) => row.sql)
      .filter((sql): sql is string => typeof sql === "string"),
  };
}

async function collectIncrementalExport(
  database: D1Database,
  since: string | null,
  cutoff: string,
): Promise<{ tables: ExportTable[]; schema: string[] }> {
  const start = since ?? "1970-01-01T00:00:00.000Z";
  const tables: ExportTable[] = [
    {
      name: "entries",
      rows: await readPagedRows(
        database,
        `
          SELECT *
          FROM entries
          WHERE user_id = ? AND updated_at > ? AND updated_at <= ?
          ORDER BY updated_at, id
        `,
        [USER_ID, start, cutoff],
      ),
    },
    {
      name: "media_works",
      rows: await readPagedRows(
        database,
        `
          SELECT *
          FROM media_works
          WHERE user_id = ? AND updated_at > ? AND updated_at <= ?
          ORDER BY updated_at, id
        `,
        [USER_ID, start, cutoff],
      ),
    },
    {
      name: "media_logs",
      rows: await readPagedRows(
        database,
        `
          SELECT ml.*
          FROM media_logs ml
          INNER JOIN entries e ON e.id = ml.entry_id
          WHERE e.user_id = ? AND e.updated_at > ? AND e.updated_at <= ?
          ORDER BY e.updated_at, ml.id
        `,
        [USER_ID, start, cutoff],
      ),
    },
    {
      name: "media_seasons",
      rows: await readPagedRows(
        database,
        `
          SELECT ms.*
          FROM media_seasons ms
          INNER JOIN media_works mw ON mw.id = ms.media_work_id
          WHERE
            mw.user_id = ? AND
            ms.updated_at > ? AND
            ms.updated_at <= ?
          ORDER BY ms.updated_at, ms.id
        `,
        [USER_ID, start, cutoff],
      ),
    },
    {
      name: "entry_revisions",
      rows: await readPagedRows(
        database,
        `
          SELECT er.*
          FROM entry_revisions er
          INNER JOIN entries e ON e.id = er.entry_id
          WHERE e.user_id = ? AND er.created_at > ? AND er.created_at <= ?
          ORDER BY er.created_at, er.id
        `,
        [USER_ID, start, cutoff],
      ),
    },
    {
      name: "media_assets",
      rows: await readPagedRows(
        database,
        `
          SELECT *
          FROM media_assets
          WHERE user_id = ? AND created_at > ? AND created_at <= ?
          ORDER BY created_at, id
        `,
        [USER_ID, start, cutoff],
      ),
    },
    {
      name: "media_upload_requests",
      rows: await readPagedRows(
        database,
        `
          SELECT *
          FROM media_upload_requests
          WHERE user_id = ? AND created_at > ? AND created_at <= ?
          ORDER BY created_at, id
        `,
        [USER_ID, start, cutoff],
      ),
    },
    {
      name: "entry_media",
      rows: await readPagedRows(
        database,
        `
          SELECT *
          FROM entry_media
          WHERE
            user_id = ? AND
            coalesce(attached_at, created_at) > ? AND
            coalesce(attached_at, created_at) <= ?
          ORDER BY created_at, id
        `,
        [USER_ID, start, cutoff],
      ),
    },
    {
      name: "entry_follow_ups",
      rows: await readPagedRows(
        database,
        `
          SELECT *
          FROM entry_follow_ups
          WHERE user_id = ? AND created_at > ? AND created_at <= ?
          ORDER BY created_at, id
        `,
        [USER_ID, start, cutoff],
      ),
    },
  ];
  return { tables, schema: [] };
}

async function putBackupObject(
  bucket: R2Bucket,
  key: string,
  body: Uint8Array,
  contentType: string,
  exportId: string,
  checksum: string,
): Promise<void> {
  await bucket.put(key, Uint8Array.from(body), {
    httpMetadata: { contentType },
    customMetadata: {
      exportId,
      sha256: checksum,
    },
  });
}

async function buildAndStoreExport(
  env: Env,
  plan: ExportPlan,
): Promise<StoredExportArtifact> {
  const collected =
    plan.scope === "full"
      ? await collectFullExport(env.DB)
      : await collectIncrementalExport(env.DB, plan.since, plan.cutoff);
  const rowCount = collected.tables.reduce(
    (total, table) => total + table.rows.length,
    0,
  );
  const datePath = plan.cutoff.slice(0, 10).replaceAll("-", "/");
  const prefix = `backups/${exportFolder(plan.kind)}/${datePath}/${plan.id}`;
  const files: Array<{
    name: string;
    key: string;
    body: Uint8Array;
    checksum: string;
    contentType: string;
  }> = [];
  let jsonlRaw: Uint8Array | null = null;
  let sqlRaw: Uint8Array | null = null;

  if (
    plan.format === "jsonl" ||
    plan.format === "archive" ||
    plan.kind === "monthly"
  ) {
    jsonlRaw = serializeJsonLines(collected.tables);
    const body = await gzipBytes(jsonlRaw);
    const checksum = await sha256HexBytes(body);
    const name = "data.jsonl.gz";
    files.push({
      name,
      key: `${prefix}/${name}`,
      body,
      checksum,
      contentType: "application/gzip",
    });
  }

  if (
    plan.format === "sql" ||
    plan.format === "archive" ||
    plan.kind === "monthly"
  ) {
    sqlRaw = buildSqlDump(collected.schema, collected.tables);
    const body = await gzipBytes(sqlRaw);
    const checksum = await sha256HexBytes(body);
    const name = "data.sql.gz";
    files.push({
      name,
      key: `${prefix}/${name}`,
      body,
      checksum,
      contentType: "application/gzip",
    });
  }

  await Promise.all(
    files.map((file) =>
      putBackupObject(
        env.BACKUPS,
        file.key,
        file.body,
        file.contentType,
        plan.id,
        file.checksum,
      ),
    ),
  );

  const manifest = {
    schemaVersion: "1.0",
    exportId: plan.id,
    database: "life-ledger-prod",
    kind: plan.kind,
    scope: plan.scope,
    generatedAt: plan.cutoff,
    incrementalSince: plan.since,
    rowCount,
    tables: Object.fromEntries(
      collected.tables.map((table) => [table.name, table.rows.length]),
    ),
    files: files.map((file) => ({
      name: file.name,
      key: file.key,
      sizeBytes: file.body.byteLength,
      sha256: file.checksum,
    })),
  };
  const manifestBody = encodeUtf8(`${JSON.stringify(manifest, null, 2)}\n`);
  const manifestChecksum = await sha256HexBytes(manifestBody);
  await putBackupObject(
    env.BACKUPS,
    `${prefix}/manifest.json`,
    manifestBody,
    "application/json; charset=utf-8",
    plan.id,
    manifestChecksum,
  );

  if (plan.format === "archive") {
    if (jsonlRaw === null || sqlRaw === null) {
      throw new Error("EXPORT_ARCHIVE_INPUT_MISSING");
    }
    const archiveBody = await createTarGzip(
      [
        { name: "data.jsonl", body: jsonlRaw },
        { name: "data.sql", body: sqlRaw },
        { name: "manifest.json", body: manifestBody },
      ],
      new Date(plan.cutoff),
    );
    const archiveChecksum = await sha256HexBytes(archiveBody);
    const archiveKey = `${prefix}/life-ledger-${plan.id}.tar.gz`;
    await putBackupObject(
      env.BACKUPS,
      archiveKey,
      archiveBody,
      "application/gzip",
      plan.id,
      archiveChecksum,
    );
    return {
      r2Key: archiveKey,
      checksum: archiveChecksum,
      sizeBytes: archiveBody.byteLength,
      rowCount,
    };
  }

  const primary = files[0];
  if (!primary) {
    throw new Error("EXPORT_PRIMARY_ARTIFACT_MISSING");
  }
  return {
    r2Key: primary.key,
    checksum: primary.checksum,
    sizeBytes: primary.body.byteLength,
    rowCount,
  };
}

async function initializeExportPlan(
  env: Env,
  event: WorkflowEvent<ExportWorkflowParams>,
): Promise<ExportPlan> {
  const payload = event.payload;
  const existingId =
    typeof payload?.exportId === "string" && payload.exportId
      ? payload.exportId
      : null;
  const kind =
    payload?.kind ??
    (existingId
      ? payload?.scope === "incremental"
        ? "manual_incremental"
        : "manual_full"
      : scheduledExportKind(event.schedule?.cron));
  const scope: ExportRecord["scope"] =
    payload?.scope ?? (kind === "daily" ? "incremental" : "full");
  const format = formatForExportKind(kind, scope);
  const createdAt = event.timestamp.toISOString();
  const id = existingId ?? `export_${event.instanceId}`;

  if (existingId === null) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO exports (
        id, user_id, format, scope, status, created_at
      ) VALUES (?, ?, ?, ?, 'pending', ?)
    `)
      .bind(id, USER_ID, format, scope, createdAt)
      .run();
  }
  const row = await env.DB.prepare(`
    SELECT id, format, scope, created_at
    FROM exports
    WHERE id = ? AND user_id = ?
    LIMIT 1
  `)
    .bind(id, USER_ID)
    .first<{
      id: string;
      format: ExportRecord["format"];
      scope: ExportRecord["scope"];
      created_at: string;
    }>();
  if (!row) {
    throw new Error("EXPORT_RECORD_NOT_FOUND");
  }

  const cutoff = nowIso();
  const previous =
    row.scope === "incremental"
      ? await env.DB.prepare(`
          SELECT completed_at
          FROM exports
          WHERE user_id = ?
            AND scope = 'incremental'
            AND status = 'completed'
            AND id <> ?
            AND completed_at IS NOT NULL
          ORDER BY completed_at DESC
          LIMIT 1
        `)
          .bind(USER_ID, id)
          .first<{ completed_at: string }>()
      : null;
  await env.DB.prepare(`
    UPDATE exports
    SET status = 'running', error_code = NULL
    WHERE id = ? AND user_id = ?
  `)
    .bind(id, USER_ID)
    .run();

  return {
    id,
    scope: row.scope,
    format: row.format,
    kind,
    createdAt: row.created_at,
    cutoff,
    since: previous?.completed_at ?? null,
  };
}

export class ExportWorkflow extends WorkflowEntrypoint<
  Env,
  ExportWorkflowParams
> {
  override async run(
    event: Readonly<WorkflowEvent<ExportWorkflowParams>>,
    step: WorkflowStep,
  ): Promise<StoredExportArtifact> {
    let plan: ExportPlan | null = null;
    try {
      if (
        event.schedule?.cron === DAILY_SCHEDULE &&
        event.payload?.kind === undefined
      ) {
        await step.do("schedule periodic full backups", async () => {
          const localDate = new Date(
            event.schedule!.scheduledTime + 9 * 60 * 60 * 1000,
          );
          const children: Array<
            WorkflowInstanceCreateOptions<ExportWorkflowParams>
          > = [];
          if (localDate.getUTCDay() === 0) {
            children.push({
              id: `scheduled-weekly-${event.schedule!.scheduledTime}`,
              params: {
                kind: "weekly",
                scope: "full",
                delayMinutes: 40,
              },
              retention: {
                successRetention: "30 days",
                errorRetention: "30 days",
              },
            });
          }
          if (localDate.getUTCDate() === 1) {
            children.push({
              id: `scheduled-monthly-${event.schedule!.scheduledTime}`,
              params: { kind: "monthly", scope: "full" },
              retention: {
                successRetention: "30 days",
                errorRetention: "30 days",
              },
            });
          }
          if (children.length > 0) {
            await this.env.EXPORT_WORKFLOW.createBatch(children);
          }
          return { scheduled: children.map((child) => child.id) };
        });
      }
      const delayMinutes = event.payload?.delayMinutes ?? 0;
      if (delayMinutes > 0) {
        await step.sleep(
          "wait for configured backup window",
          delayMinutes * 60_000,
        );
      }
      plan = await step.do("initialize export record", async () =>
        initializeExportPlan(this.env, event),
      );
      const artifact = await step.do(
        "build and upload private backup",
        {
          retries: {
            limit: 3,
            delay: "10 seconds",
            backoff: "exponential",
          },
          timeout: "10 minutes",
        },
        async () => buildAndStoreExport(this.env, plan!),
      );
      await step.do("finalize export record", async () => {
        const completedAt = nowIso();
        await this.env.DB.batch([
          this.env.DB.prepare(`
            UPDATE exports
            SET
              status = 'completed',
              r2_key = ?,
              size_bytes = ?,
              row_count = ?,
              checksum = ?,
              error_code = NULL,
              completed_at = ?
            WHERE id = ? AND user_id = ?
          `).bind(
            artifact.r2Key,
            artifact.sizeBytes,
            artifact.rowCount,
            artifact.checksum,
            completedAt,
            plan!.id,
            USER_ID,
          ),
          this.env.DB.prepare(`
            INSERT OR IGNORE INTO audit_events (
              id, request_id, user_id, actor_type, actor_id,
              action, target_type, target_id, detail, metadata_json, created_at
            ) VALUES (?, ?, ?, 'workflow', 'export_workflow',
              'export.completed', 'export', ?, ?, '{}', ?)
          `).bind(
            `audit_export_completed_${plan!.id}`,
            `workflow_${event.instanceId}`,
            USER_ID,
            plan!.id,
            `Private R2 export completed (${artifact.rowCount} rows).`,
            completedAt,
          ),
        ]);
        return { completedAt };
      });
      return artifact;
    } catch (error) {
      if (plan !== null) {
        await step.do("mark export failed", async () => {
          const failedAt = nowIso();
          await this.env.DB.batch([
            this.env.DB.prepare(`
              UPDATE exports
              SET status = 'failed', error_code = 'WORKFLOW_FAILED', completed_at = ?
              WHERE id = ? AND user_id = ?
            `).bind(failedAt, plan!.id, USER_ID),
            this.env.DB.prepare(`
              INSERT OR IGNORE INTO audit_events (
                id, request_id, user_id, actor_type, actor_id,
                action, target_type, target_id, detail, metadata_json, created_at
              ) VALUES (?, ?, ?, 'workflow', 'export_workflow',
                'export.failed', 'export', ?, 'Export workflow failed.', '{}', ?)
            `).bind(
              `audit_export_failed_${plan!.id}`,
              `workflow_${event.instanceId}`,
              USER_ID,
              plan!.id,
              failedAt,
            ),
          ]);
          return { failedAt };
        });
      }
      throw error;
    }
  }
}

export default class LifeLedgerCore extends WorkerEntrypoint<Env> {
  async health(): Promise<{ ok: true; service: "life-ledger-core"; now: string }> {
    await this.env.DB.prepare("SELECT 1").first();
    return { ok: true, service: "life-ledger-core", now: nowIso() };
  }

  async listGameLibrary(): Promise<GameLibraryItem[]> {
    const result = await this.env.DB.prepare(`
      SELECT
        id,
        platform,
        title,
        play_time,
        progress,
        trophies_platinum,
        trophies_gold,
        trophies_silver,
        trophies_bronze,
        achievements_current,
        achievements_total,
        rating,
        review,
        tags_json,
        cover_url,
        source_url,
        status,
        version_no,
        created_at,
        updated_at,
        deleted_at
      FROM game_library_items
      WHERE user_id = ? AND status = 'active'
      ORDER BY
        progress DESC,
        rating DESC,
        CAST(replace(play_time, 'h', '') AS REAL) DESC,
        title
    `)
      .bind(USER_ID)
      .all<GameLibraryRow>();
    return result.results.map(toGameLibraryItem);
  }

  async createGameLibraryItem(
    input: CreateGameLibraryItemInput,
  ): Promise<GameLibraryItem> {
    const parsed = createGameLibraryItemInputSchema.parse(input);
    const id = createId("game");
    const timestamp = nowIso();
    await this.env.DB.prepare(`
      INSERT INTO game_library_items (
        id, user_id, platform, title, play_time, progress,
        trophies_platinum, trophies_gold, trophies_silver, trophies_bronze,
        achievements_current, achievements_total, rating, review, tags_json,
        cover_url, source_cover_url, source_url, created_at, updated_at,
        status, version_no, deleted_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, NULL, ?, ?, ?,
        'active', 1, NULL
      )
    `)
      .bind(
        id,
        USER_ID,
        parsed.platform,
        parsed.title,
        parsed.playTime,
        parsed.progress,
        parsed.trophies.platinum,
        parsed.trophies.gold,
        parsed.trophies.silver,
        parsed.trophies.bronze,
        parsed.achievementsCurrent,
        parsed.achievementsTotal,
        parsed.rating,
        parsed.review,
        JSON.stringify(parsed.tags),
        parsed.coverUrl,
        parsed.sourceUrl,
        timestamp,
        timestamp,
      )
      .run();
    return this.#requireGameLibraryItem(id);
  }

  async updateGameLibraryItem(
    id: string,
    input: UpdateGameLibraryItemInput,
  ): Promise<GameLibraryItem> {
    const parsed = updateGameLibraryItemInputSchema.parse(input);
    const current = await this.#requireGameLibraryItem(id);
    if (current.status !== "active") {
      throw new LedgerDomainError(
        "GAME_LIBRARY_ITEM_DELETED",
        "Restore the game library item before editing it.",
        409,
      );
    }
    if (current.versionNo !== parsed.versionNo) {
      throw new LedgerDomainError(
        "VERSION_CONFLICT",
        "The game library item changed; reload it before editing.",
        409,
      );
    }
    const achievementsCurrent =
      parsed.achievementsCurrent ?? current.achievementsCurrent;
    const achievementsTotal =
      parsed.achievementsTotal ?? current.achievementsTotal;
    if (achievementsCurrent > achievementsTotal) {
      throw new LedgerDomainError(
        "INVALID_ACHIEVEMENT_COUNTS",
        "achievementsCurrent cannot exceed achievementsTotal.",
      );
    }
    const trophies = parsed.trophies ?? current.trophies;
    const result = await this.env.DB.prepare(`
      UPDATE game_library_items
      SET
        platform = ?,
        title = ?,
        play_time = ?,
        progress = ?,
        trophies_platinum = ?,
        trophies_gold = ?,
        trophies_silver = ?,
        trophies_bronze = ?,
        achievements_current = ?,
        achievements_total = ?,
        rating = ?,
        review = ?,
        tags_json = ?,
        cover_url = ?,
        source_url = ?,
        version_no = version_no + 1,
        updated_at = ?
      WHERE id = ? AND user_id = ? AND status = 'active' AND version_no = ?
    `)
      .bind(
        parsed.platform ?? current.platform,
        parsed.title ?? current.title,
        parsed.playTime ?? current.playTime,
        parsed.progress ?? current.progress,
        trophies.platinum,
        trophies.gold,
        trophies.silver,
        trophies.bronze,
        achievementsCurrent,
        achievementsTotal,
        parsed.rating ?? current.rating,
        parsed.review ?? current.review,
        JSON.stringify(parsed.tags ?? current.tags),
        parsed.coverUrl ?? current.coverUrl,
        parsed.sourceUrl ?? current.sourceUrl,
        nowIso(),
        id,
        USER_ID,
        parsed.versionNo,
      )
      .run();
    if (result.meta.changes !== 1) {
      throw new LedgerDomainError(
        "VERSION_CONFLICT",
        "The game library item changed; reload it before editing.",
        409,
      );
    }
    return this.#requireGameLibraryItem(id);
  }

  async deleteGameLibraryItem(
    id: string,
    versionNo: number,
  ): Promise<GameLibraryItem> {
    const timestamp = nowIso();
    const result = await this.env.DB.prepare(`
      UPDATE game_library_items
      SET
        status = 'deleted',
        deleted_at = ?,
        updated_at = ?,
        version_no = version_no + 1
      WHERE id = ? AND user_id = ? AND status = 'active' AND version_no = ?
    `)
      .bind(timestamp, timestamp, id, USER_ID, versionNo)
      .run();
    if (result.meta.changes !== 1) {
      await this.#throwGameLibraryMutationConflict(id, versionNo, "delete");
    }
    return this.#requireGameLibraryItem(id);
  }

  async restoreGameLibraryItem(
    id: string,
    versionNo: number,
  ): Promise<GameLibraryItem> {
    const result = await this.env.DB.prepare(`
      UPDATE game_library_items
      SET
        status = 'active',
        deleted_at = NULL,
        updated_at = ?,
        version_no = version_no + 1
      WHERE id = ? AND user_id = ? AND status = 'deleted' AND version_no = ?
    `)
      .bind(nowIso(), id, USER_ID, versionNo)
      .run();
    if (result.meta.changes !== 1) {
      await this.#throwGameLibraryMutationConflict(id, versionNo, "restore");
    }
    return this.#requireGameLibraryItem(id);
  }

  async #requireGameLibraryItem(id: string): Promise<GameLibraryItem> {
    const row = await this.env.DB.prepare(`
      SELECT
        id, platform, title, play_time, progress,
        trophies_platinum, trophies_gold, trophies_silver, trophies_bronze,
        achievements_current, achievements_total, rating, review, tags_json,
        cover_url, source_url, status, version_no, created_at, updated_at,
        deleted_at
      FROM game_library_items
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `)
      .bind(id, USER_ID)
      .first<GameLibraryRow>();
    if (!row) {
      throw new LedgerDomainError(
        "GAME_LIBRARY_ITEM_NOT_FOUND",
        "Game library item not found.",
        404,
      );
    }
    return toGameLibraryItem(row);
  }

  async #throwGameLibraryMutationConflict(
    id: string,
    versionNo: number,
    action: "delete" | "restore",
  ): Promise<never> {
    const current = await this.#requireGameLibraryItem(id);
    if (current.versionNo !== versionNo) {
      throw new LedgerDomainError(
        "VERSION_CONFLICT",
        "The game library item changed; reload it before editing.",
        409,
      );
    }
    throw new LedgerDomainError(
      "INVALID_GAME_LIBRARY_STATE",
      `Cannot ${action} a ${current.status} game library item.`,
      409,
    );
  }

  async uploadMediaImage(
    input: UploadMediaImageInput,
  ): Promise<MediaImageUploadResult> {
    return uploadMediaImageToR2(this.env, input, USER_ID);
  }

  async listEntries(input: ListEntriesInput): Promise<EntrySummary[]> {
    await this.#expireStalePendingActions();
    const parsed = listEntriesInputSchema.parse(input);
    const conditions = ["e.user_id = ?", "e.status = ?"];
    const values: Array<string | number | null> = [USER_ID, parsed.status];

    if (parsed.type !== null) {
      conditions.push("e.type = ?");
      values.push(parsed.type);
    }
    if (parsed.visibility !== null) {
      conditions.push("e.visibility = ?");
      values.push(parsed.visibility);
    }
    if (parsed.mediaWorkId !== null) {
      conditions.push("mw.id = ?");
      values.push(parsed.mediaWorkId);
    }
    if (parsed.scoreMin !== null) {
      conditions.push("ml.score_100 >= ?");
      values.push(scoreToInteger(parsed.scoreMin));
    }
    if (parsed.scoreMax !== null) {
      conditions.push("ml.score_100 <= ?");
      values.push(scoreToInteger(parsed.scoreMax));
    }
    if (parsed.occurredFrom !== null) {
      conditions.push("e.occurred_at >= ?");
      values.push(utcIso(parsed.occurredFrom));
    }
    if (parsed.occurredTo !== null) {
      conditions.push("e.occurred_at < ?");
      values.push(utcIso(parsed.occurredTo));
    }
    if (parsed.tag !== null) {
      conditions.push(`EXISTS (
        SELECT 1 FROM json_each(e.tags_json) AS t
        WHERE lower(t.value) = ?
      )`);
      values.push(parsed.tag.toLocaleLowerCase("zh-CN"));
    }
    if (parsed.cursor !== null) {
      const separator = parsed.cursor.lastIndexOf("|");
      if (separator > 0) {
        const cursorTime = parsed.cursor.slice(0, separator);
        const cursorId = parsed.cursor.slice(separator + 1);
        conditions.push(
          "(e.occurred_at < ? OR (e.occurred_at = ? AND e.id < ?))",
        );
        values.push(cursorTime, cursorTime, cursorId);
      } else {
        conditions.push("e.occurred_at < ?");
        values.push(parsed.cursor);
      }
    }
    if (parsed.query) {
      conditions.push(`(
        lower(coalesce(e.title, '')) LIKE ? OR
        lower(e.body_plain) LIKE ? OR
        lower(e.tags_json) LIKE ? OR
        lower(coalesce(mw.canonical_title, '')) LIKE ? OR
        lower(coalesce(mw.aliases_json, '')) LIKE ?
      )`);
      const pattern = `%${parsed.query.toLocaleLowerCase("zh-CN")}%`;
      values.push(pattern, pattern, pattern, pattern, pattern);
    }

    values.push(parsed.limit);
    const result = await this.env.DB.prepare(`
      ${ENTRY_SELECT}
      WHERE ${conditions.join(" AND ")}
      ORDER BY e.occurred_at DESC, e.id DESC
      LIMIT ?
    `)
      .bind(...values)
      .all<EntryRow>();

    return this.#withEntryExtras(result.results.map(toSummary));
  }

  async getEntry(id: string): Promise<EntryDetail | null> {
    await this.#expireStalePendingActions();
    const row = await this.env.DB.prepare(`
      ${ENTRY_SELECT}
      WHERE e.user_id = ? AND e.id = ?
      LIMIT 1
    `)
      .bind(USER_ID, id)
      .first<EntryRow>();

    if (!row) {
      return null;
    }

    const detailResults = await this.env.DB.batch<RevisionRow | AuditRow>([
      this.env.DB.prepare(`
        SELECT id, version_no, snapshot_json, actor_type, actor_id, reason, created_at
        FROM entry_revisions
        WHERE entry_id = ?
        ORDER BY version_no DESC
      `).bind(id),
      this.env.DB.prepare(`
        SELECT id, action, actor_type, actor_id, detail, created_at
        FROM audit_events
        WHERE target_type = 'entry' AND target_id = ?
        ORDER BY created_at DESC
      `).bind(id),
    ]);
    const revisionResult = detailResults[0];
    const auditResult = detailResults[1];
    if (!revisionResult || !auditResult) {
      throw new LedgerDomainError(
        "ENTRY_DETAIL_READ_FAILED",
        "Entry detail rows could not be loaded.",
        500,
      );
    }

    const revisions = (revisionResult.results as unknown as RevisionRow[]).map(
      (revision): EntryRevision => ({
        id: revision.id,
        versionNo: revision.version_no,
        snapshot: safeRecord(revision.snapshot_json),
        actorType: revision.actor_type,
        actorId: revision.actor_id,
        reason: revision.reason,
        createdAt: revision.created_at,
      }),
    );
    const audit = (auditResult.results as unknown as AuditRow[]).map(
      (event): AuditEvent => ({
        id: event.id,
        action: event.action,
        actorType: event.actor_type,
        actorId: event.actor_id,
        detail: event.detail,
        createdAt: event.created_at,
      }),
    );

    const [hydrated] = await this.#withEntryExtras([toSummary(row)]);
    return {
      ...hydrated!,
      sourceMessageId: row.source_message_id,
      sourceConversationId: row.source_conversation_id,
      temporalUncertain: row.temporal_uncertain === 1,
      publishedAt: row.published_at,
      revisions,
      audit,
    };
  }

  async captureEntry(input: CaptureEntryInput): Promise<MutationResult> {
    const parsed = captureEntryInputSchema.parse(input);
    const occurredAt = utcIso(parsed.occurredAt);
    const datePrecision =
      parsed.datePrecision === "exact" && parsed.temporalUncertain
        ? "approximate"
        : parsed.datePrecision;
    const actor = actorForSource(parsed.source.channel);
    const requestHash = await sha256(idempotencyFingerprint(parsed));
    const existing = await this.#findIdempotent(
      parsed.source.channel,
      parsed.source.messageId,
    );
    if (existing) {
      return this.#resolveIdempotent(existing, requestHash);
    }

    await this.#assertAttachableMedia(parsed.mediaIds);
    const entryId = createId("ent");
    const requestId = createId("req");
    const createdAt = nowIso();
    const title = parsed.title || summary(parsed.rawText).slice(0, 80);
    const snapshot = {
      title,
      bodyRaw: parsed.rawText,
      occurredAt,
      datePrecision,
      visibility: "private",
      status: "active",
      versionNo: 1,
    };

    try {
      await this.env.DB.batch([
        this.env.DB.prepare(`
        INSERT INTO entries (
          id, user_id, type, title, body_raw, body_plain, body_summary,
          occurred_at, occurred_timezone, temporal_uncertain, date_precision,
          visibility, status, version_no, source_channel,
          source_message_id, source_conversation_id, request_hash, tags_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', 'active', 1, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        entryId,
        USER_ID,
        parsed.type,
        title,
        parsed.rawText,
        plainText(parsed.rawText),
        summary(parsed.rawText),
        occurredAt,
        parsed.timezone,
        datePrecision === "exact" ? 0 : 1,
        datePrecision,
        parsed.source.channel,
        parsed.source.messageId,
        parsed.source.conversationId,
        requestHash,
        JSON.stringify(parsed.tags),
        createdAt,
        createdAt,
      ),
        this.#revisionStatement(
          entryId,
          1,
          snapshot,
          actor.actorType,
          actor.actorId,
          "created",
          createdAt,
        ),
        this.#auditStatement(
          requestId,
          actor.actorType,
          actor.actorId,
          "entry.created",
          entryId,
          "Generic entry captured; visibility forced to private.",
          createdAt,
        ),
        ...this.#attachMediaStatements(entryId, parsed.mediaIds, createdAt),
      ]);
    } catch (error: unknown) {
      const concurrent = await this.#findIdempotent(
        parsed.source.channel,
        parsed.source.messageId,
      );
      if (concurrent) {
        return this.#resolveIdempotent(concurrent, requestHash);
      }
      throw error;
    }

    return this.#mutationResult(entryId, requestId, false);
  }

  async logMedia(input: LogMediaInput): Promise<MutationResult> {
    const parsed = logMediaInputSchema.parse(input);
    const occurredAt = utcIso(parsed.occurredAt);
    const actor = actorForSource(parsed.source.channel);
    const requestHash = await sha256(idempotencyFingerprint(parsed));
    const existing = await this.#findIdempotent(
      parsed.source.channel,
      parsed.source.messageId,
    );
    if (existing) {
      return this.#resolveIdempotent(existing, requestHash);
    }

    await this.#assertAttachableMedia(parsed.mediaIds);
    const createdAt = nowIso();
    const requestId = createId("req");
    const entryId = createId("ent");
    const normalizedTitle = normalizeMediaTitle(parsed.title);
    const score100 = scoreToInteger(parsed.score);
    const body = parsed.comment || parsed.rawText;
    const existingWork = await this.env.DB.prepare(`
      SELECT id FROM media_works
      WHERE user_id = ? AND media_type = ? AND normalized_title = ?
      LIMIT 1
    `)
      .bind(USER_ID, parsed.mediaType, normalizedTitle)
      .first<{ id: string }>();
    const deterministicWorkId = `work_${(
      await sha256(`${USER_ID}:${parsed.mediaType}:${normalizedTitle}`)
    ).slice(0, 24)}`;
    const workId = existingWork?.id ?? deterministicWorkId;
    const watchStatus = mediaWatchStatusFromProgress(parsed.progressState);
    let seasonId = parsed.seasonId;
    let seasonLabel = parsed.seasonLabel;
    let seasonUpsert: D1PreparedStatement | null = null;

    if (seasonId !== null) {
      const season = await this.env.DB.prepare(`
        SELECT ms.label
        FROM media_seasons ms
        JOIN media_works mw ON mw.id = ms.media_work_id
        WHERE
          ms.id = ? AND
          ms.media_work_id = ? AND
          mw.user_id = ?
        LIMIT 1
      `)
        .bind(seasonId, workId, USER_ID)
        .first<{ label: string }>();
      if (!season) {
        throw new LedgerDomainError(
          "MEDIA_SEASON_NOT_FOUND",
          "The selected season does not belong to this media work.",
          404,
        );
      }
      seasonLabel = season.label;
    } else if (seasonLabel !== null) {
      const normalizedSeasonLabel = normalizeSeasonLabel(seasonLabel);
      const existingSeason = existingWork
        ? await this.env.DB.prepare(`
            SELECT id
            FROM media_seasons
            WHERE media_work_id = ? AND normalized_label = ?
            LIMIT 1
          `)
            .bind(workId, normalizedSeasonLabel)
            .first<{ id: string }>()
        : null;
      seasonId =
        existingSeason?.id ??
        `season_${(
          await sha256(`${workId}:${normalizedSeasonLabel}`)
        ).slice(0, 24)}`;
      seasonUpsert = this.env.DB.prepare(`
        INSERT INTO media_seasons (
          id, media_work_id, label, normalized_label, season_number,
          title, score_100, watch_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
        ON CONFLICT(media_work_id, normalized_label)
        DO UPDATE SET
          score_100 = CASE
            WHEN ? = 'season' THEN excluded.score_100
            ELSE media_seasons.score_100
          END,
          watch_status = coalesce(
            excluded.watch_status,
            media_seasons.watch_status
          ),
          updated_at = excluded.updated_at
      `).bind(
        seasonId,
        workId,
        seasonLabel,
        normalizedSeasonLabel,
        parsed.ratingScope === "season" ? score100 : null,
        watchStatus,
        createdAt,
        createdAt,
        parsed.ratingScope,
      );
    }

    const workUpsert = this.env.DB.prepare(`
      INSERT INTO media_works (
        id, user_id, media_type, media_kind, canonical_title, normalized_title,
        aliases_json, status, progress_state, watch_status, overall_score_100,
        external_refs_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
      ON CONFLICT(user_id, media_type, normalized_title)
      DO UPDATE SET
        media_kind = coalesce(excluded.media_kind, media_works.media_kind),
        aliases_json = CASE
          WHEN excluded.aliases_json = '[]' THEN media_works.aliases_json
          ELSE excluded.aliases_json
        END,
        status = coalesce(excluded.status, media_works.status),
        progress_state = coalesce(excluded.progress_state, media_works.progress_state),
        watch_status = coalesce(excluded.watch_status, media_works.watch_status),
        overall_score_100 = CASE
          WHEN ? = 'work' THEN excluded.overall_score_100
          ELSE media_works.overall_score_100
        END,
        updated_at = excluded.updated_at
    `)
      .bind(
        workId,
        USER_ID,
        parsed.mediaType,
        parsed.mediaKind,
        parsed.title,
        normalizedTitle,
        JSON.stringify(parsed.aliases),
        watchStatus,
        parsed.progressState,
        watchStatus,
        parsed.ratingScope === "work" ? score100 : null,
        createdAt,
        createdAt,
        parsed.ratingScope,
      );

    const mediaType: EntryType =
      parsed.mediaType === "anime"
        ? "anime"
        : parsed.mediaType === "screen"
          ? "screen"
        : parsed.mediaType === "game"
          ? "game"
          : parsed.mediaType === "music"
            ? "music"
            : "note";
    const titleParts = [
      `《${parsed.title}》`,
      seasonLabel ?? "",
      parsed.episodeLabel ? `第 ${parsed.episodeLabel} 集` : "",
    ].filter(Boolean);
    const entryTitle = titleParts.join(" ");
    const snapshot = {
      title: entryTitle,
      bodyRaw: parsed.rawText,
      occurredAt,
      datePrecision: parsed.datePrecision,
      visibility: "private",
      status: "active",
      versionNo: 1,
      score: parsed.score,
      mediaWorkId: workId,
      seasonId,
    };

    const writeStatements: D1PreparedStatement[] = [workUpsert];
    if (seasonUpsert) {
      writeStatements.push(seasonUpsert);
    } else if (
      seasonId !== null &&
      parsed.ratingScope === "season" &&
      score100 !== null
    ) {
      writeStatements.push(
        this.env.DB.prepare(`
          UPDATE media_seasons
          SET score_100 = ?, updated_at = ?
          WHERE id = ? AND media_work_id = ?
        `).bind(score100, createdAt, seasonId, workId),
      );
    }
    writeStatements.push(
      this.env.DB.prepare(`
        INSERT INTO entries (
          id, user_id, type, title, body_raw, body_plain, body_summary,
          occurred_at, occurred_timezone, temporal_uncertain, date_precision,
          visibility, status, version_no, source_channel,
          source_message_id, source_conversation_id, request_hash, tags_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'private', 'active', 1, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        entryId,
        USER_ID,
        mediaType,
        entryTitle,
        parsed.rawText,
        plainText(parsed.rawText),
        summary(body),
        occurredAt,
        parsed.timezone,
        parsed.datePrecision === "exact" ? 0 : 1,
        parsed.datePrecision,
        parsed.source.channel,
        parsed.source.messageId,
        parsed.source.conversationId,
        requestHash,
        JSON.stringify([parsed.mediaType, parsed.ratingScope].filter(Boolean)),
        createdAt,
        createdAt,
      ),
      this.env.DB.prepare(`
        INSERT INTO media_logs (
          id, entry_id, media_work_id, season_id, rating_scope, season_label,
          episode_label, progress_state, score_100, completed_at, extra_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}')
      `).bind(
        createId("log"),
        entryId,
        workId,
        seasonId,
        parsed.ratingScope,
        seasonLabel,
        parsed.episodeLabel,
        parsed.progressState,
        score100,
        occurredAt,
      ),
      this.#revisionStatement(
        entryId,
        1,
        snapshot,
        actor.actorType,
        actor.actorId,
        "created",
        createdAt,
      ),
      this.#auditStatement(
        requestId,
        actor.actorType,
        actor.actorId,
        "entry.created",
        entryId,
        "Media log captured; visibility forced to private.",
        createdAt,
      ),
      ...this.#attachMediaStatements(entryId, parsed.mediaIds, createdAt),
    );
    try {
      await this.env.DB.batch(writeStatements);
    } catch (error: unknown) {
      const concurrent = await this.#findIdempotent(
        parsed.source.channel,
        parsed.source.messageId,
      );
      if (concurrent) {
        return this.#resolveIdempotent(concurrent, requestHash);
      }
      throw error;
    }

    return this.#mutationResult(entryId, requestId, false);
  }

  async updateEntry(id: string, input: UpdateEntryInput): Promise<EntryDetail> {
    const parsed = updateEntryInputSchema.parse(input);
    const current = await this.#requireEntry(id);
    if (current.status === "deleted") {
      throw new LedgerDomainError(
        "ENTRY_DELETED",
        "Restore the entry before editing it.",
        409,
      );
    }
    if (current.versionNo !== parsed.versionNo) {
      throw new LedgerDomainError(
        "VERSION_CONFLICT",
        `Expected version ${parsed.versionNo}, current version is ${current.versionNo}.`,
        409,
      );
    }
    if (
      current.mediaWorkId !== null &&
      parsed.score !== undefined &&
      parsed.score !== null &&
      current.ratingScope === null
    ) {
      throw new LedgerDomainError(
        "RATING_SCOPE_REQUIRED",
        "Choose work, season, or episode before adding a media score.",
        422,
      );
    }

    const nextVersion = current.versionNo + 1;
    const updatedAt = nowIso();
    const nextBody = parsed.bodyRaw ?? current.bodyRaw;
    const nextTitle = parsed.title === undefined ? current.title : parsed.title;
    const nextOccurredAt =
      parsed.occurredAt === undefined
        ? current.occurredAt
        : utcIso(parsed.occurredAt);
    const nextDatePrecision =
      parsed.datePrecision ?? current.datePrecision;
    const nextTags = parsed.tags ?? current.tags;
    const score100 =
      parsed.score === undefined ? scoreToInteger(current.score) : scoreToInteger(parsed.score);
    const snapshot = {
      title: nextTitle,
      bodyRaw: nextBody,
      occurredAt: nextOccurredAt,
      datePrecision: nextDatePrecision,
      visibility: current.visibility,
      status: current.status,
      versionNo: nextVersion,
      score: integerToScore(score100),
    };
    const statements: D1PreparedStatement[] = [
      this.env.DB.prepare(`
        UPDATE entries SET
          title = ?,
          body_raw = ?,
          body_plain = ?,
          body_summary = ?,
          occurred_at = ?,
          temporal_uncertain = ?,
          date_precision = ?,
          tags_json = ?,
          version_no = ?,
          updated_at = ?
        WHERE user_id = ? AND id = ? AND version_no = ?
      `).bind(
        nextTitle,
        nextBody,
        plainText(nextBody),
        summary(nextBody),
        nextOccurredAt,
        nextDatePrecision === "exact" ? 0 : 1,
        nextDatePrecision,
        JSON.stringify(nextTags),
        nextVersion,
        updatedAt,
        USER_ID,
        id,
        current.versionNo,
      ),
      this.#revisionStatement(
        id,
        nextVersion,
        snapshot,
        "user",
        ACTOR_USER,
        parsed.reason,
        updatedAt,
      ),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "entry.updated",
        id,
        `Version ${current.versionNo} updated to ${nextVersion}.`,
        updatedAt,
      ),
    ];

    if (current.mediaWorkId !== null && parsed.score !== undefined) {
      statements.push(
        this.env.DB.prepare("UPDATE media_logs SET score_100 = ? WHERE entry_id = ?")
          .bind(score100, id),
      );
      if (current.ratingScope === "work") {
        statements.push(
          this.env.DB.prepare(`
            UPDATE media_works
            SET overall_score_100 = ?, updated_at = ?
            WHERE id = ? AND user_id = ?
          `).bind(score100, updatedAt, current.mediaWorkId, USER_ID),
        );
      } else if (
        current.ratingScope === "season" &&
        current.seasonId !== null
      ) {
        statements.push(
          this.env.DB.prepare(`
            UPDATE media_seasons
            SET score_100 = ?, updated_at = ?
            WHERE id = ? AND media_work_id = ?
          `).bind(score100, updatedAt, current.seasonId, current.mediaWorkId),
        );
      }
    }

    await this.env.DB.batch(statements);
    return this.#requireEntry(id);
  }

  async deleteEntry(id: string): Promise<EntryDetail> {
    const current = await this.#requireEntry(id);
    if (current.status === "deleted") {
      return current;
    }
    const timestamp = nowIso();
    await this.env.DB.batch([
      this.env.DB.prepare(`
        UPDATE entries SET
          visibility = 'private',
          status = 'deleted',
          deleted_at = ?,
          updated_at = ?
        WHERE user_id = ? AND id = ?
      `).bind(timestamp, timestamp, USER_ID, id),
      this.env.DB.prepare(`
        UPDATE pending_actions SET consumed_at = ?
        WHERE user_id = ? AND target_id = ? AND consumed_at IS NULL
      `).bind(timestamp, USER_ID, id),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "entry.deleted",
        id,
        "Entry unpublished if necessary and soft deleted.",
        timestamp,
      ),
      this.#publicRevisionStatement(timestamp),
    ]);
    return this.#requireEntry(id);
  }

  async restoreEntry(id: string): Promise<EntryDetail> {
    const current = await this.#requireEntry(id);
    if (current.status === "active") {
      return current;
    }
    const timestamp = nowIso();
    await this.env.DB.batch([
      this.env.DB.prepare(`
        UPDATE entries SET
          visibility = 'private',
          status = 'active',
          deleted_at = NULL,
          updated_at = ?
        WHERE user_id = ? AND id = ?
      `).bind(timestamp, USER_ID, id),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "entry.restored",
        id,
        "Entry restored with private visibility.",
        timestamp,
      ),
    ]);
    return this.#requireEntry(id);
  }

  async purgeEntry(
    id: string,
    confirmationId: string,
  ): Promise<{ id: string; purged: true }> {
    if (confirmationId !== id) {
      throw new LedgerDomainError(
        "CONFIRMATION_INVALID",
        "The full entry ID is required for permanent deletion.",
        422,
      );
    }
    const current = await this.#requireEntry(id);
    if (current.status !== "deleted") {
      throw new LedgerDomainError(
        "ENTRY_NOT_DELETED",
        "Move the entry to Trash before permanently deleting it.",
        409,
      );
    }
    const timestamp = nowIso();
    const mediaKeys = await this.env.DB.prepare(`
      SELECT object_key FROM entry_media WHERE user_id = ? AND entry_id = ?
    `)
      .bind(USER_ID, id)
      .all<{ object_key: string }>();
    const purgeResults = await this.env.DB.batch([
      this.env.DB.prepare(`
        DELETE FROM pending_actions
        WHERE user_id = ? AND target_id = ?
      `).bind(USER_ID, id),
      this.env.DB.prepare(`
        DELETE FROM entries
        WHERE user_id = ? AND id = ? AND status = 'deleted'
      `).bind(USER_ID, id),
      this.env.DB.prepare(`
        INSERT INTO audit_events (
          id, request_id, user_id, actor_type, actor_id,
          action, target_type, target_id, detail, metadata_json, created_at
        )
        SELECT ?, ?, ?, 'user', ?, 'entry.purged', 'entry', ?, ?, '{}', ?
        WHERE changes() = 1
      `).bind(
        createId("audit"),
        createId("req"),
        USER_ID,
        ACTOR_USER,
        id,
        "Business data permanently deleted after full-ID confirmation.",
        timestamp,
      ),
    ]);
    if (!purgeResults[1] || (await this.getEntry(id)) !== null) {
      throw new LedgerDomainError(
        "PURGE_CONFLICT",
        "The entry changed before it could be permanently deleted.",
        409,
      );
    }
    const objectKeys = mediaKeys.results.map((row) => row.object_key);
    if (objectKeys.length > 0) {
      await this.env.MEDIA.delete(objectKeys);
    }
    return { id, purged: true };
  }

  async registerEntryMedia(input: RegisterEntryMediaInput): Promise<EntryMedia> {
    const parsed = registerEntryMediaInputSchema.parse(input);
    const id = parsed.mediaId ?? createId("media");
    const createdAt = nowIso();
    const actor =
      parsed.uploadedVia === "mcp"
        ? { actorType: "agent", actorId: "mcp_client" }
        : { actorType: "user", actorId: ACTOR_USER };
    await this.env.DB.batch([
      this.env.DB.prepare(`
        INSERT INTO entry_media (
          id, user_id, entry_id, position, kind, object_key, mime_type,
          size_bytes, width, height, duration_ms, created_at, attached_at
        ) VALUES (?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      `).bind(
        id,
        USER_ID,
        parsed.kind,
        parsed.objectKey,
        parsed.mimeType,
        parsed.sizeBytes,
        parsed.width,
        parsed.height,
        parsed.durationMs,
        createdAt,
      ),
      this.#auditStatement(
        createId("req"),
        actor.actorType,
        actor.actorId,
        "entry_media.uploaded",
        id,
        `Entry ${parsed.kind} stored in R2 via ${parsed.uploadedVia} and awaiting attachment.`,
        createdAt,
        "entry_media",
      ),
    ]);
    const row = await this.env.DB.prepare(`
      SELECT ${ENTRY_MEDIA_COLUMNS} FROM entry_media WHERE id = ?
    `)
      .bind(id)
      .first<EntryMediaRow>();
    if (!row) {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_WRITE_FAILED",
        "Entry media metadata could not be persisted.",
        500,
      );
    }
    return toEntryMedia(row);
  }

  async uploadEntryMedia(input: UploadEntryMediaInput): Promise<EntryMedia> {
    const parsed = uploadEntryMediaInputSchema.parse(input);
    const maxBytes = Math.min(
      entryMediaMaxBytes(parsed.mimeType),
      ENTRY_MEDIA_LIMITS.maxInlineBytes,
    );
    const bytes = decodeEntryMediaBase64(parsed.base64Data, maxBytes);
    if (bytes === "too_large") {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_TOO_LARGE",
        `Base64 uploads are limited to ${maxBytes} bytes; use create_entry_media_upload for larger files.`,
        413,
      );
    }
    if (bytes === "invalid") {
      throw new LedgerDomainError(
        "INVALID_BASE64",
        "base64Data must be standard Base64 without a data: prefix or whitespace.",
        422,
      );
    }
    if (!matchesEntryMediaSignature(parsed.mimeType, bytes.subarray(0, 16))) {
      throw new LedgerDomainError(
        "MEDIA_CONTENT_MISMATCH",
        "The file content does not match the declared mimeType.",
        415,
      );
    }
    const kind = entryMediaKindFor(parsed.mimeType);
    const objectKey = createEntryMediaObjectKey(parsed.mimeType);
    await this.env.MEDIA.put(objectKey, bytes, {
      httpMetadata: {
        contentType: parsed.mimeType,
        cacheControl: "private, max-age=31536000, immutable",
        contentDisposition: "inline",
      },
      customMetadata: { kind, source: "mcp" },
    });
    try {
      return await this.registerEntryMedia({
        uploadedVia: "mcp",
        objectKey,
        kind,
        mimeType: parsed.mimeType,
        sizeBytes: bytes.byteLength,
        width: parsed.width,
        height: parsed.height,
        durationMs: kind === "video" ? parsed.durationMs : null,
      });
    } catch (error: unknown) {
      await this.env.MEDIA.delete(objectKey);
      throw error;
    }
  }

  async createEntryMediaUpload(
    input: CreateEntryMediaUploadInput,
  ): Promise<EntryMediaUploadTicket> {
    const parsed = createEntryMediaUploadInputSchema.parse(input);
    const origin = uploadBaseOrigin(
      this.env.WEB_ORIGIN,
      this.env.MEDIA_PUBLIC_BASE_URL,
    );
    const mediaId = createId("media");
    const token = createUploadToken();
    const createdAt = nowIso();
    const expiresAt = new Date(
      Date.now() + ENTRY_MEDIA_LIMITS.uploadTicketMinutes * 60_000,
    ).toISOString();
    const maxBytes = entryMediaMaxBytes(parsed.mimeType);
    const kind = entryMediaKindFor(parsed.mimeType);
    await this.env.DB.batch([
      this.env.DB.prepare(`
        INSERT INTO entry_media_upload_tickets (
          media_id, user_id, token_hash, object_key, kind, mime_type,
          max_bytes, width, height, duration_ms, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        mediaId,
        USER_ID,
        await sha256(token),
        createEntryMediaObjectKey(parsed.mimeType),
        kind,
        parsed.mimeType,
        maxBytes,
        parsed.width,
        parsed.height,
        kind === "video" ? parsed.durationMs : null,
        createdAt,
        expiresAt,
      ),
      this.#auditStatement(
        createId("req"),
        "agent",
        "mcp_client",
        "entry_media.upload_ticket_created",
        mediaId,
        `One-time ${kind} upload URL issued; expires ${expiresAt}.`,
        createdAt,
        "entry_media",
      ),
    ]);
    const uploadUrl = `${origin}/upload/entry-media/${token}`;
    return {
      mediaId,
      uploadUrl,
      method: "PUT",
      headers: { "Content-Type": parsed.mimeType },
      maxBytes,
      expiresAt,
      curlExample: `curl -sS -X PUT -H 'Content-Type: ${parsed.mimeType}' --data-binary @<file> '${uploadUrl}'`,
    };
  }

  async claimEntryMediaUpload(
    token: string,
    request: { mimeType: string; sizeBytes: number },
  ): Promise<EntryMediaUploadClaim> {
    const notFound = new LedgerDomainError(
      "ENTRY_MEDIA_UPLOAD_NOT_FOUND",
      "Upload URL is invalid.",
      404,
    );
    if (!isWellFormedUploadToken(token)) {
      throw notFound;
    }
    const tokenHash = await sha256(token);
    const row = await this.env.DB.prepare(`
      SELECT
        media_id, object_key, kind, mime_type, max_bytes, width, height,
        duration_ms, expires_at, claimed_at
      FROM entry_media_upload_tickets
      WHERE user_id = ? AND token_hash = ?
    `)
      .bind(USER_ID, tokenHash)
      .first<EntryMediaUploadTicketRow>();
    if (!row) {
      throw notFound;
    }
    if (row.claimed_at !== null) {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_UPLOAD_USED",
        "This upload URL has already been used; request a new one.",
        409,
      );
    }
    if (row.expires_at <= nowIso()) {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_UPLOAD_EXPIRED",
        "This upload URL has expired; request a new one.",
        410,
      );
    }
    if (request.mimeType !== row.mime_type) {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_UPLOAD_TYPE_MISMATCH",
        `Content-Type must be ${row.mime_type}.`,
        415,
      );
    }
    if (request.sizeBytes <= 0 || request.sizeBytes > row.max_bytes) {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_TOO_LARGE",
        `Upload must be between 1 and ${row.max_bytes} bytes.`,
        413,
      );
    }
    const claimed = await this.env.DB.prepare(`
      UPDATE entry_media_upload_tickets
      SET claimed_at = ?
      WHERE user_id = ? AND token_hash = ? AND claimed_at IS NULL
    `)
      .bind(nowIso(), USER_ID, tokenHash)
      .run();
    if ((claimed.meta.changes ?? 0) === 0) {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_UPLOAD_USED",
        "This upload URL has already been used; request a new one.",
        409,
      );
    }
    return {
      mediaId: row.media_id,
      objectKey: row.object_key,
      kind: row.kind,
      mimeType: row.mime_type,
      maxBytes: row.max_bytes,
      width: row.width,
      height: row.height,
      durationMs: row.duration_ms,
    };
  }

  async attachEntryMedia(
    entryId: string,
    mediaIds: string[],
  ): Promise<EntryDetail> {
    const parsed = attachEntryMediaInputSchema.parse({ mediaIds });
    const current = await this.#requireEntry(entryId);
    if (current.status === "deleted") {
      throw new LedgerDomainError(
        "ENTRY_DELETED",
        "Restore the entry before adding photos or videos.",
        409,
      );
    }
    if (
      current.media.length + parsed.mediaIds.length >
      ENTRY_MEDIA_LIMITS.maxPerEntry
    ) {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_LIMIT_CONFLICT",
        `An entry holds at most ${ENTRY_MEDIA_LIMITS.maxPerEntry} photos or videos.`,
        409,
      );
    }
    await this.#assertAttachableMedia(parsed.mediaIds);
    const attachedAt = nowIso();
    await this.env.DB.batch([
      ...this.#attachMediaStatements(
        entryId,
        parsed.mediaIds,
        attachedAt,
        current.media.length,
      ),
      this.#auditStatement(
        createId("req"),
        "agent",
        "mcp_client",
        "entry.media_attached",
        entryId,
        `${parsed.mediaIds.length} photo/video item(s) attached.`,
        attachedAt,
      ),
    ]);
    return this.#requireEntry(entryId);
  }

  async deleteEntryMedia(entryId: string, mediaId: string): Promise<EntryDetail> {
    await this.#requireEntry(entryId);
    const row = await this.env.DB.prepare(`
      SELECT object_key FROM entry_media
      WHERE user_id = ? AND entry_id = ? AND id = ?
    `)
      .bind(USER_ID, entryId, mediaId)
      .first<{ object_key: string }>();
    if (!row) {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_NOT_FOUND",
        "This photo or video is not attached to the entry.",
        404,
      );
    }
    await this.env.DB.batch([
      this.env.DB.prepare(`
        DELETE FROM entry_media WHERE user_id = ? AND entry_id = ? AND id = ?
      `).bind(USER_ID, entryId, mediaId),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "entry.media_removed",
        entryId,
        "A photo or video was removed from the entry and deleted from R2.",
        nowIso(),
      ),
    ]);
    await this.env.MEDIA.delete(row.object_key);
    return this.#requireEntry(entryId);
  }

  async discardEntryMedia(id: string): Promise<{ id: string; discarded: true }> {
    const row = await this.env.DB.prepare(`
      SELECT ${ENTRY_MEDIA_COLUMNS}
      FROM entry_media
      WHERE user_id = ? AND id = ?
    `)
      .bind(USER_ID, id)
      .first<EntryMediaRow>();
    if (!row) {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_NOT_FOUND",
        "Entry media not found.",
        404,
      );
    }
    if (row.entry_id !== null) {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_ATTACHED",
        "Media already attached to an entry cannot be discarded separately.",
        409,
      );
    }
    await this.env.DB.prepare(`
      DELETE FROM entry_media
      WHERE user_id = ? AND id = ? AND entry_id IS NULL
    `)
      .bind(USER_ID, id)
      .run();
    await this.env.MEDIA.delete(row.object_key);
    return { id, discarded: true };
  }

  async addEntryFollowUp(
    entryId: string,
    input: AddEntryFollowUpInput,
  ): Promise<EntryDetail> {
    const parsed = addEntryFollowUpInputSchema.parse(input);
    const current = await this.#requireEntry(entryId);
    if (current.status === "deleted") {
      throw new LedgerDomainError(
        "ENTRY_DELETED",
        "Restore the entry before adding a follow-up.",
        409,
      );
    }
    const actor = actorForSource(parsed.sourceChannel);
    const followUpId = createId("followup");
    const createdAt = nowIso();
    await this.env.DB.batch([
      this.env.DB.prepare(`
        INSERT INTO entry_follow_ups (
          id, user_id, entry_id, body_raw, source_channel, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        followUpId,
        USER_ID,
        entryId,
        parsed.body,
        parsed.sourceChannel,
        createdAt,
      ),
      this.#auditStatement(
        createId("req"),
        actor.actorType,
        actor.actorId,
        "entry.follow_up_added",
        entryId,
        "Follow-up note appended to the entry.",
        createdAt,
      ),
    ]);
    return this.#requireEntry(entryId);
  }

  async deleteEntryFollowUp(
    entryId: string,
    followUpId: string,
  ): Promise<EntryDetail> {
    await this.#requireEntry(entryId);
    const timestamp = nowIso();
    const results = await this.env.DB.batch([
      this.env.DB.prepare(`
        DELETE FROM entry_follow_ups
        WHERE user_id = ? AND entry_id = ? AND id = ?
      `).bind(USER_ID, entryId, followUpId),
      this.env.DB.prepare(`
        INSERT INTO audit_events (
          id, request_id, user_id, actor_type, actor_id,
          action, target_type, target_id, detail, metadata_json, created_at
        )
        SELECT ?, ?, ?, 'user', ?, 'entry.follow_up_deleted', 'entry', ?, ?, '{}', ?
        WHERE changes() = 1
      `).bind(
        createId("audit"),
        createId("req"),
        USER_ID,
        ACTOR_USER,
        entryId,
        "Follow-up note removed from the entry.",
        timestamp,
      ),
    ]);
    if ((results[0]?.meta.changes ?? 0) === 0) {
      throw new LedgerDomainError(
        "FOLLOW_UP_NOT_FOUND",
        "Follow-up not found.",
        404,
      );
    }
    return this.#requireEntry(entryId);
  }

  async preparePublish(id: string): Promise<PendingAction> {
    const entry = await this.#requireEntry(id);
    if (entry.status === "deleted") {
      throw new LedgerDomainError(
        "ENTRY_DELETED",
        "Restore the entry before publishing it.",
        409,
      );
    }
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const actionId = createId("action");
    const confirmationCode = `LL-${crypto.getRandomValues(new Uint16Array(1))[0]!.toString().padStart(5, "0").slice(-5)}`;
    const tokenHash = await sha256(confirmationCode);
    const preview = {
      title: entry.title || "未命名记录",
      body: entry.bodySummary || summary(entry.bodyRaw),
      score: entry.score,
      occurredAt: entry.occurredAt,
      mediaTitle: entry.mediaTitle,
      versionNo: entry.versionNo,
    };

    await this.env.DB.batch([
      this.env.DB.prepare(`
        UPDATE pending_actions SET consumed_at = ?
        WHERE user_id = ? AND target_id = ? AND consumed_at IS NULL
      `).bind(createdAt, USER_ID, id),
      this.env.DB.prepare(`
        INSERT INTO pending_actions (
          id, user_id, action_type, target_type, target_id,
          payload_json, token_hash, expires_at, consumed_at, created_at
        ) VALUES (?, ?, 'publish', 'entry', ?, ?, ?, ?, NULL, ?)
      `).bind(
        actionId,
        USER_ID,
        id,
        JSON.stringify(preview),
        tokenHash,
        expiresAt,
        createdAt,
      ),
      this.env.DB.prepare(`
        UPDATE entries
        SET visibility = 'publish_pending', updated_at = ?
        WHERE user_id = ? AND id = ?
      `).bind(createdAt, USER_ID, id),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "publish.prepared",
        id,
        "Public snapshot preview generated; awaiting confirmation.",
        createdAt,
      ),
    ]);

    return { actionId, targetId: id, confirmationCode, expiresAt, preview };
  }

  async confirmAction(input: ConfirmActionInput): Promise<EntryDetail> {
    const parsed = confirmActionInputSchema.parse(input);
    const action = await this.env.DB.prepare(`
      SELECT id, target_id, payload_json, token_hash, expires_at, consumed_at
      FROM pending_actions
      WHERE user_id = ? AND id = ? AND action_type = 'publish'
      LIMIT 1
    `)
      .bind(USER_ID, parsed.actionId)
      .first<PendingActionRow>();

    if (!action) {
      throw new LedgerDomainError("ACTION_NOT_FOUND", "Confirmation action not found.", 404);
    }
    if (action.consumed_at !== null) {
      throw new LedgerDomainError("ACTION_CONSUMED", "Confirmation action already used.", 409);
    }
    if (new Date(action.expires_at).getTime() <= Date.now()) {
      await this.env.DB.prepare(`
        UPDATE entries SET visibility = 'private', updated_at = ?
        WHERE user_id = ? AND id = ? AND visibility = 'publish_pending'
      `).bind(nowIso(), USER_ID, action.target_id).run();
      throw new LedgerDomainError("ACTION_EXPIRED", "Confirmation action expired.", 409);
    }
    const confirmationHash = await sha256(parsed.confirmationCode);
    if (confirmationHash !== action.token_hash) {
      throw new LedgerDomainError("CONFIRMATION_INVALID", "Confirmation code is invalid.", 422);
    }
    const entry = await this.#requireEntry(action.target_id);
    if (entry.status === "deleted") {
      throw new LedgerDomainError(
        "ENTRY_DELETED",
        "Restore the entry and generate a new preview before publishing it.",
        409,
      );
    }
    const preview = safeRecord(action.payload_json);
    if (
      typeof preview.versionNo !== "number" ||
      preview.versionNo !== entry.versionNo
    ) {
      throw new LedgerDomainError(
        "VERSION_CONFLICT",
        "The entry changed after the preview was generated. Generate a new preview.",
        409,
      );
    }

    const timestamp = nowIso();
    const confirmResults = await this.env.DB.batch([
      this.env.DB.prepare(`
        UPDATE entries SET
          visibility = 'public',
          public_snapshot_json = ?,
          published_at = ?,
          updated_at = ?
        WHERE
          user_id = ? AND
          id = ? AND
          status = 'active' AND
          visibility = 'publish_pending' AND
          version_no = ? AND
          EXISTS (
            SELECT 1 FROM pending_actions pa
            WHERE
              pa.user_id = ? AND
              pa.id = ? AND
              pa.target_id = entries.id AND
              pa.consumed_at IS NULL AND
              pa.expires_at > ? AND
              pa.token_hash = ?
          )
      `).bind(
        action.payload_json,
        timestamp,
        timestamp,
        USER_ID,
        action.target_id,
        entry.versionNo,
        USER_ID,
        action.id,
        timestamp,
        confirmationHash,
      ),
      this.env.DB.prepare(`
        UPDATE pending_actions SET consumed_at = ?
        WHERE
          user_id = ? AND
          id = ? AND
          consumed_at IS NULL AND
          expires_at > ? AND
          token_hash = ? AND
          EXISTS (
            SELECT 1 FROM entries e
            WHERE
              e.user_id = ? AND
              e.id = pending_actions.target_id AND
              e.visibility = 'public' AND
              e.status = 'active' AND
              e.version_no = ? AND
              e.public_snapshot_json = ?
          )
      `).bind(
        timestamp,
        USER_ID,
        action.id,
        timestamp,
        confirmationHash,
        USER_ID,
        entry.versionNo,
        action.payload_json,
      ),
      this.env.DB.prepare(`
        INSERT INTO audit_events (
          id, request_id, user_id, actor_type, actor_id,
          action, target_type, target_id, detail, metadata_json, created_at
        )
        SELECT ?, ?, ?, 'user', ?, 'entry.published', 'entry', ?, ?, '{}', ?
        WHERE changes() = 1
      `).bind(
        createId("audit"),
        createId("req"),
        USER_ID,
        ACTOR_USER,
        action.target_id,
        "Confirmation accepted; public whitelist projection updated.",
        timestamp,
      ),
      this.env.DB.prepare(`
        INSERT INTO app_meta(key, value, updated_at)
        SELECT 'public_revision', ?, ?
        WHERE changes() = 1
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).bind(createId("pub"), timestamp),
    ]);
    if (
      !confirmResults[0] ||
      !confirmResults[1] ||
      confirmResults[0].meta.changes !== 1 ||
      confirmResults[1].meta.changes !== 1
    ) {
      throw new LedgerDomainError(
        "ACTION_CONFLICT",
        "The entry or confirmation action changed. Generate a new preview.",
        409,
      );
    }

    return this.#requireEntry(action.target_id);
  }

  async unpublishEntry(id: string): Promise<EntryDetail> {
    const entry = await this.#requireEntry(id);
    if (entry.visibility === "private") {
      return entry;
    }
    const timestamp = nowIso();
    await this.env.DB.batch([
      this.env.DB.prepare(`
        UPDATE pending_actions SET consumed_at = ?
        WHERE user_id = ? AND target_id = ? AND consumed_at IS NULL
      `).bind(timestamp, USER_ID, id),
      this.env.DB.prepare(`
        UPDATE entries SET visibility = 'private', updated_at = ?
        WHERE user_id = ? AND id = ?
      `).bind(timestamp, USER_ID, id),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "entry.unpublished",
        id,
        "Public exposure reduced immediately.",
        timestamp,
      ),
      this.#publicRevisionStatement(timestamp),
    ]);
    return this.#requireEntry(id);
  }

  async listMediaWorks(
    input: ListMediaWorksInput,
  ): Promise<MediaWorkSummary[]> {
    const parsed = listMediaWorksInputSchema.parse(input);
    const conditions = ["mw.user_id = ?"];
    const values: Array<string | number | null> = [USER_ID];
    if (parsed.mediaType !== null) {
      conditions.push("mw.media_type = ?");
      values.push(parsed.mediaType);
    }
    if (parsed.mediaKind !== null) {
      conditions.push("mw.media_kind = ?");
      values.push(parsed.mediaKind);
    }
    if (parsed.watchStatus !== null) {
      conditions.push("mw.watch_status = ?");
      values.push(parsed.watchStatus);
    }
    if (parsed.query) {
      conditions.push(`(
        lower(mw.canonical_title) LIKE ? OR
        lower(mw.aliases_json) LIKE ? OR
        mw.normalized_title LIKE ?
      )`);
      const query = parsed.query.toLocaleLowerCase("zh-CN");
      const pattern = `%${query}%`;
      values.push(pattern, pattern, `%${normalizeMediaTitle(query)}%`);
    }
    values.push(parsed.limit);

    const result = await this.env.DB.prepare(`
      ${MEDIA_WORK_AGGREGATE_SELECT}
      WHERE ${conditions.join(" AND ")}
      GROUP BY mw.id
      ORDER BY ${mediaWorkOrderBy(parsed.sort)}
      LIMIT ?
    `)
      .bind(...values)
      .all<MediaWorkAggregateRow>();
    return result.results.map(toMediaWorkSummary);
  }

  async getMediaWork(id: string): Promise<MediaWorkDetail | null> {
    const row = await this.env.DB.prepare(`
      ${MEDIA_WORK_AGGREGATE_SELECT}
      WHERE mw.user_id = ? AND mw.id = ?
      GROUP BY mw.id
      LIMIT 1
    `)
      .bind(USER_ID, id)
      .first<MediaWorkAggregateRow>();
    if (!row) {
      return null;
    }
    const [seasons, logs] = await Promise.all([
      this.listSeasons(id),
      this.listEntries(
        listEntriesInputSchema.parse({
          mediaWorkId: id,
          status: "active",
          limit: 100,
        }),
      ),
    ]);
    return {
      ...toMediaWorkSummary(row),
      seasons,
      logs,
    };
  }

  async createMediaWork(
    input: CreateMediaWorkInput,
  ): Promise<MediaWorkDetail> {
    const parsed = createMediaWorkInputSchema.parse(input);
    const normalizedTitle = normalizeMediaTitle(parsed.title);
    const timestamp = nowIso();
    const id = `work_${(
      await sha256(`${USER_ID}:${parsed.mediaType}:${normalizedTitle}`)
    ).slice(0, 24)}`;
    const existing = await this.env.DB.prepare(`
      SELECT id
      FROM media_works
      WHERE user_id = ? AND media_type = ? AND normalized_title = ?
      LIMIT 1
    `)
      .bind(USER_ID, parsed.mediaType, normalizedTitle)
      .first<{ id: string }>();
    if (existing) {
      throw new LedgerDomainError(
        "MEDIA_WORK_CONFLICT",
        "A media work with this title and type already exists.",
        409,
      );
    }

    await this.env.DB.batch([
      this.env.DB.prepare(`
        INSERT INTO media_works (
          id, user_id, media_type, media_kind, canonical_title,
          normalized_title, aliases_json, cover_url, status, progress_state,
          watch_status, overall_score_100, external_refs_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
      `).bind(
        id,
        USER_ID,
        parsed.mediaType,
        parsed.mediaKind,
        parsed.title,
        normalizedTitle,
        JSON.stringify(parsed.aliases),
        parsed.coverUrl,
        parsed.watchStatus,
        parsed.watchStatus,
        parsed.watchStatus,
        scoreToInteger(parsed.overallScore),
        timestamp,
        timestamp,
      ),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "media_work.created",
        id,
        "Media catalog work created.",
        timestamp,
        "media_work",
      ),
    ]);
    const created = await this.getMediaWork(id);
    if (!created) {
      throw new LedgerDomainError(
        "MEDIA_WORK_CREATE_FAILED",
        "The media work could not be loaded after creation.",
        500,
      );
    }
    return created;
  }

  async updateMediaWork(
    id: string,
    input: UpdateMediaWorkInput,
  ): Promise<MediaWorkDetail> {
    const parsed = updateMediaWorkInputSchema.parse(input);
    const current = await this.getMediaWork(id);
    if (!current) {
      throw new LedgerDomainError(
        "MEDIA_WORK_NOT_FOUND",
        "Media work not found.",
        404,
      );
    }
    if (
      parsed.mediaKind !== undefined &&
      parsed.mediaKind !== null &&
      current.mediaType !== "screen"
    ) {
      throw new LedgerDomainError(
        "MEDIA_KIND_INVALID",
        "Only screen works can be classified as movie or TV.",
        422,
      );
    }

    const updates: string[] = [];
    const values: Array<string | number | null> = [];
    if (parsed.mediaKind !== undefined) {
      updates.push("media_kind = ?");
      values.push(parsed.mediaKind);
    }
    if (parsed.title !== undefined) {
      updates.push("canonical_title = ?", "normalized_title = ?");
      values.push(parsed.title, normalizeMediaTitle(parsed.title));
    }
    if (parsed.aliases !== undefined) {
      updates.push("aliases_json = ?");
      values.push(JSON.stringify(parsed.aliases));
    }
    if (parsed.coverUrl !== undefined) {
      updates.push("cover_url = ?");
      values.push(parsed.coverUrl);
    }
    if (parsed.watchStatus !== undefined) {
      updates.push("watch_status = ?", "status = ?", "progress_state = ?");
      values.push(
        parsed.watchStatus,
        parsed.watchStatus,
        parsed.watchStatus,
      );
    }
    if (parsed.overallScore !== undefined) {
      updates.push("overall_score_100 = ?");
      values.push(scoreToInteger(parsed.overallScore));
    }
    const timestamp = nowIso();
    updates.push("updated_at = ?");
    values.push(timestamp, USER_ID, id);

    try {
      await this.env.DB.batch([
        this.env.DB.prepare(`
          UPDATE media_works
          SET ${updates.join(", ")}
          WHERE user_id = ? AND id = ?
        `).bind(...values),
        this.#auditStatement(
          createId("req"),
          "user",
          ACTOR_USER,
          "media_work.updated",
          id,
          "Media catalog work updated.",
          timestamp,
          "media_work",
        ),
      ]);
    } catch (error: unknown) {
      if (
        parsed.title !== undefined &&
        await this.env.DB.prepare(`
          SELECT 1
          FROM media_works
          WHERE
            user_id = ? AND
            media_type = ? AND
            normalized_title = ? AND
            id <> ?
          LIMIT 1
        `)
          .bind(
            USER_ID,
            current.mediaType,
            normalizeMediaTitle(parsed.title),
            id,
          )
          .first()
      ) {
        throw new LedgerDomainError(
          "MEDIA_WORK_CONFLICT",
          "A media work with this title and type already exists.",
          409,
        );
      }
      throw error;
    }

    const updated = await this.getMediaWork(id);
    if (!updated) {
      throw new LedgerDomainError(
        "MEDIA_WORK_UPDATE_FAILED",
        "The media work could not be loaded after update.",
        500,
      );
    }
    return updated;
  }

  async deleteMediaWork(id: string): Promise<{ id: string; deleted: true }> {
    const current = await this.getMediaWork(id);
    if (!current) {
      throw new LedgerDomainError(
        "MEDIA_WORK_NOT_FOUND",
        "Media work not found.",
        404,
      );
    }
    if (current.logCount > 0) {
      throw new LedgerDomainError(
        "MEDIA_WORK_HAS_LOGS",
        "Delete or move the work logs before deleting this media work.",
        409,
      );
    }
    const timestamp = nowIso();
    await this.env.DB.batch([
      this.env.DB.prepare(`
        DELETE FROM media_works WHERE user_id = ? AND id = ?
      `).bind(USER_ID, id),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "media_work.deleted",
        id,
        "Empty media catalog work deleted.",
        timestamp,
        "media_work",
      ),
    ]);
    return { id, deleted: true };
  }

  async listSeasons(mediaWorkId: string): Promise<MediaSeason[]> {
    const result = await this.env.DB.prepare(`
      SELECT
        ms.id,
        ms.media_work_id,
        ms.label,
        ms.season_number,
        ms.title,
        ms.score_100,
        ms.watch_status,
        ms.created_at,
        ms.updated_at
      FROM media_seasons ms
      JOIN media_works mw ON mw.id = ms.media_work_id
      WHERE mw.user_id = ? AND ms.media_work_id = ?
      ORDER BY
        CASE WHEN ms.season_number IS NULL THEN 1 ELSE 0 END,
        ms.season_number,
        ms.normalized_label
    `)
      .bind(USER_ID, mediaWorkId)
      .all<MediaSeasonRow>();
    return result.results.map(toMediaSeason);
  }

  async createSeason(
    mediaWorkId: string,
    input: CreateMediaSeasonInput,
  ): Promise<MediaSeason> {
    const parsed = createMediaSeasonInputSchema.parse(input);
    const work = await this.getMediaWork(mediaWorkId);
    if (!work) {
      throw new LedgerDomainError(
        "MEDIA_WORK_NOT_FOUND",
        "Media work not found.",
        404,
      );
    }
    const normalizedLabel = normalizeSeasonLabel(parsed.label);
    const id = `season_${(
      await sha256(`${mediaWorkId}:${normalizedLabel}`)
    ).slice(0, 24)}`;
    const timestamp = nowIso();
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(`
          INSERT INTO media_seasons (
            id, media_work_id, label, normalized_label, season_number,
            title, score_100, watch_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          id,
          mediaWorkId,
          parsed.label,
          normalizedLabel,
          parsed.seasonNumber,
          parsed.title,
          scoreToInteger(parsed.score),
          parsed.watchStatus,
          timestamp,
          timestamp,
        ),
        this.#auditStatement(
          createId("req"),
          "user",
          ACTOR_USER,
          "media_season.created",
          id,
          "Media season created.",
          timestamp,
          "media_season",
        ),
      ]);
    } catch (error: unknown) {
      const existing = await this.env.DB.prepare(`
        SELECT id
        FROM media_seasons
        WHERE media_work_id = ? AND normalized_label = ?
        LIMIT 1
      `)
        .bind(mediaWorkId, normalizedLabel)
        .first<{ id: string }>();
      if (existing) {
        throw new LedgerDomainError(
          "MEDIA_SEASON_CONFLICT",
          "This media work already has a season with the same label.",
          409,
        );
      }
      throw error;
    }
    const created = await this.#getSeason(id);
    if (!created) {
      throw new LedgerDomainError(
        "MEDIA_SEASON_CREATE_FAILED",
        "The media season could not be loaded after creation.",
        500,
      );
    }
    return created;
  }

  async updateSeason(
    id: string,
    input: UpdateMediaSeasonInput,
  ): Promise<MediaSeason> {
    const parsed = updateMediaSeasonInputSchema.parse(input);
    const current = await this.#getSeason(id);
    if (!current) {
      throw new LedgerDomainError(
        "MEDIA_SEASON_NOT_FOUND",
        "Media season not found.",
        404,
      );
    }
    const updates: string[] = [];
    const values: Array<string | number | null> = [];
    if (parsed.label !== undefined) {
      updates.push("label = ?", "normalized_label = ?");
      values.push(parsed.label, normalizeSeasonLabel(parsed.label));
    }
    if (parsed.seasonNumber !== undefined) {
      updates.push("season_number = ?");
      values.push(parsed.seasonNumber);
    }
    if (parsed.title !== undefined) {
      updates.push("title = ?");
      values.push(parsed.title);
    }
    if (parsed.score !== undefined) {
      updates.push("score_100 = ?");
      values.push(scoreToInteger(parsed.score));
    }
    if (parsed.watchStatus !== undefined) {
      updates.push("watch_status = ?");
      values.push(parsed.watchStatus);
    }
    const timestamp = nowIso();
    updates.push("updated_at = ?");
    values.push(timestamp, id);
    try {
      await this.env.DB.batch([
        this.env.DB.prepare(`
          UPDATE media_seasons
          SET ${updates.join(", ")}
          WHERE id = ?
        `).bind(...values),
        this.#auditStatement(
          createId("req"),
          "user",
          ACTOR_USER,
          "media_season.updated",
          id,
          "Media season updated.",
          timestamp,
          "media_season",
        ),
      ]);
    } catch (error: unknown) {
      if (parsed.label !== undefined) {
        const conflict = await this.env.DB.prepare(`
          SELECT 1
          FROM media_seasons
          WHERE
            media_work_id = ? AND
            normalized_label = ? AND
            id <> ?
          LIMIT 1
        `)
          .bind(
            current.mediaWorkId,
            normalizeSeasonLabel(parsed.label),
            id,
          )
          .first();
        if (conflict) {
          throw new LedgerDomainError(
            "MEDIA_SEASON_CONFLICT",
            "This media work already has a season with the same label.",
            409,
          );
        }
      }
      throw error;
    }
    const updated = await this.#getSeason(id);
    if (!updated) {
      throw new LedgerDomainError(
        "MEDIA_SEASON_UPDATE_FAILED",
        "The media season could not be loaded after update.",
        500,
      );
    }
    return updated;
  }

  async deleteSeason(id: string): Promise<{ id: string; deleted: true }> {
    const current = await this.#getSeason(id);
    if (!current) {
      throw new LedgerDomainError(
        "MEDIA_SEASON_NOT_FOUND",
        "Media season not found.",
        404,
      );
    }
    const timestamp = nowIso();
    await this.env.DB.batch([
      this.env.DB.prepare(`
        DELETE FROM media_seasons WHERE id = ?
      `).bind(id),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "media_season.deleted",
        id,
        "Media season deleted; historical log labels were retained.",
        timestamp,
        "media_season",
      ),
    ]);
    return { id, deleted: true };
  }

  async listAnime(): Promise<AnimeWorkSummary[]> {
    const result = await this.env.DB.prepare(`
      SELECT
        mw.id,
        mw.canonical_title,
        mw.aliases_json,
        mw.cover_url,
        mw.watch_status,
        mw.overall_score_100,
        sum(CASE WHEN e.status = 'active' THEN 1 ELSE 0 END) AS log_count,
        sum(CASE WHEN e.visibility = 'public' AND e.status = 'active' THEN 1 ELSE 0 END)
          AS public_log_count,
        max(CASE WHEN e.status = 'active' THEN e.occurred_at ELSE NULL END)
          AS last_logged_at,
        (
          SELECT latest.date_precision
          FROM media_logs latest_log
          INNER JOIN entries latest ON latest.id = latest_log.entry_id
          WHERE latest_log.media_work_id = mw.id
            AND latest.status = 'active'
          ORDER BY latest.occurred_at DESC, latest.id ASC
          LIMIT 1
        ) AS last_logged_date_precision,
        mw.created_at,
        mw.updated_at
      FROM media_works mw
      LEFT JOIN media_logs ml ON ml.media_work_id = mw.id
      LEFT JOIN entries e ON e.id = ml.entry_id
      WHERE mw.user_id = ? AND mw.media_type = 'anime'
      GROUP BY mw.id
      ORDER BY
        CASE WHEN last_logged_at IS NULL THEN 1 ELSE 0 END ASC,
        last_logged_at DESC,
        mw.canonical_title ASC,
        mw.id ASC
    `)
      .bind(USER_ID)
      .all<AnimeAggregateRow>();

    return result.results.map(toAnimeSummary);
  }

  async getAnime(id: string): Promise<AnimeWorkDetail | null> {
    const works = await this.listAnime();
    const work = works.find((item) => item.id === id);
    if (!work) {
      return null;
    }
    const logs = await this.listEntries(
      listEntriesInputSchema.parse({ mediaWorkId: id, status: "active" }),
    );
    return { ...work, logs };
  }

  async getPublicAnime(): Promise<PublicAnimeResponse> {
    const [rowsResult, revisionRow] = await Promise.all([
      this.env.DB.prepare(`
        SELECT
          mw.id AS work_id,
          mw.canonical_title,
          mw.cover_url,
          mw.watch_status AS media_status,
          mw.overall_score_100,
          e.id AS entry_id,
          e.body_summary,
          e.body_raw,
          e.occurred_at,
          ml.rating_scope,
          ml.season_label,
          ml.episode_label,
          ml.score_100,
          e.public_snapshot_json
        FROM entries e
        JOIN media_logs ml ON ml.entry_id = e.id
        JOIN media_works mw ON mw.id = ml.media_work_id
        WHERE
          e.user_id = ? AND
          e.type = 'anime' AND
          e.visibility = 'public' AND
          e.status = 'active'
        ORDER BY e.occurred_at DESC
        LIMIT 2000
      `)
        .bind(USER_ID)
        .all<PublicProjectionRow>(),
      this.env.DB.prepare(`
        SELECT value, updated_at FROM app_meta WHERE key = 'public_revision'
      `).first<{ value: string; updated_at: string }>(),
    ]);

    const byWork = new Map<string, PublicAnimeItem>();
    for (const row of rowsResult.results) {
      if (!row.public_snapshot_json) {
        continue;
      }
      const snapshot = safeRecord(row.public_snapshot_json);
      if (
        typeof snapshot.body !== "string" ||
        typeof snapshot.occurredAt !== "string"
      ) {
        continue;
      }
      const existing = byWork.get(row.work_id);
      if (!existing && byWork.size >= 100) {
        continue;
      }
      const publicScore =
        typeof snapshot.score === "number" ? snapshot.score : null;
      const item = byWork.get(row.work_id) ?? {
        id: row.work_id,
        title:
          typeof snapshot.mediaTitle === "string"
            ? snapshot.mediaTitle
            : row.canonical_title,
        coverUrl: row.cover_url,
        overallScore: null,
        status: null,
        recentLogs: [],
      };
      if (item.recentLogs.length >= 20) {
        continue;
      }
      item.recentLogs.push({
        entryId: row.entry_id,
        scope: row.rating_scope,
        season: row.season_label,
        episode: row.episode_label,
        score: publicScore,
        comment: snapshot.body,
        occurredAt: snapshot.occurredAt,
      });
      if (row.rating_scope === "work" && publicScore !== null) {
        item.overallScore = publicScore;
      }
      byWork.set(row.work_id, item);
    }

    return publicAnimeResponseSchema.parse({
      schemaVersion: "1.0",
      generatedAt: revisionRow?.updated_at ?? nowIso(),
      revision: revisionRow?.value ?? "pub_unknown",
      items: [...byWork.values()],
    });
  }

  async getPublicTimeline(): Promise<PublicTimelineResponse> {
    const [rowsResult, revisionRow] = await Promise.all([
      this.env.DB.prepare(`
        SELECT
          e.id AS entry_id,
          e.type AS entry_type,
          mw.id AS media_work_id,
          ml.rating_scope,
          ml.season_label,
          ml.episode_label,
          e.public_snapshot_json
        FROM entries e
        LEFT JOIN media_logs ml ON ml.entry_id = e.id
        LEFT JOIN media_works mw ON mw.id = ml.media_work_id
        WHERE
          e.user_id = ? AND
          e.visibility = 'public' AND
          e.status = 'active'
        ORDER BY e.occurred_at DESC, e.id DESC
        LIMIT 500
      `)
        .bind(USER_ID)
        .all<PublicTimelineProjectionRow>(),
      this.env.DB.prepare(`
        SELECT value, updated_at FROM app_meta WHERE key = 'public_revision'
      `).first<{ value: string; updated_at: string }>(),
    ]);

    const items: PublicTimelineItem[] = [];
    for (const row of rowsResult.results) {
      if (!row.public_snapshot_json) {
        continue;
      }
      const snapshot = safeRecord(row.public_snapshot_json);
      const mediaTitle =
        typeof snapshot.mediaTitle === "string" && snapshot.mediaTitle
          ? snapshot.mediaTitle
          : null;
      const candidate = publicTimelineItemSchema.safeParse({
        id: row.entry_id,
        type: row.entry_type,
        title: snapshot.title,
        body: snapshot.body,
        occurredAt: snapshot.occurredAt,
        score:
          typeof snapshot.score === "number" ? snapshot.score : null,
        media:
          row.media_work_id && mediaTitle
            ? {
                workId: row.media_work_id,
                title: mediaTitle,
                scope: row.rating_scope,
                season: row.season_label,
                episode: row.episode_label,
              }
            : null,
      });
      if (candidate.success) {
        items.push(candidate.data);
      }
    }

    return publicTimelineResponseSchema.parse({
      schemaVersion: "1.0",
      generatedAt: revisionRow?.updated_at ?? nowIso(),
      revision: revisionRow?.value ?? "pub_unknown",
      items,
    });
  }

  async getStats(input: LedgerStatsInput): Promise<LedgerStats> {
    const parsed = ledgerStatsInputSchema.parse(input);
    const timezone = await this.#resolveTimeZone(parsed.timezone);
    const from = utcIso(parsed.from);
    const to = utcIso(parsed.to);
    const result = await this.env.DB.prepare(`
      SELECT
        e.id,
        e.type,
        e.visibility,
        e.occurred_at,
        e.tags_json,
        mw.id AS media_work_id,
        mw.canonical_title AS media_title,
        mw.media_type,
        ml.rating_scope,
        ml.score_100
      FROM entries e
      LEFT JOIN media_logs ml ON ml.entry_id = e.id
      LEFT JOIN media_works mw ON mw.id = ml.media_work_id
      WHERE e.user_id = ? AND e.status = 'active'
        AND e.occurred_at >= ? AND e.occurred_at < ?
      ORDER BY e.occurred_at DESC
      LIMIT ?
    `)
      .bind(USER_ID, from, to, STATS_ROW_LIMIT + 1)
      .all<StatsRow>();
    const truncated = result.results.length > STATS_ROW_LIMIT;
    return aggregateStats(result.results.slice(0, STATS_ROW_LIMIT), {
      from,
      to,
      timezone,
      truncated,
    });
  }

  async listTags(input: ListTagsInput = {}): Promise<LedgerTag[]> {
    const parsed = listTagsInputSchema.parse(input);
    const result = await this.env.DB.prepare(`
      SELECT t.value AS tag, count(*) AS count, max(e.occurred_at) AS last_used_at
      FROM entries e, json_each(e.tags_json) AS t
      WHERE e.user_id = ? AND e.status = 'active' AND t.type = 'text'
      GROUP BY t.value
      ORDER BY count DESC, last_used_at DESC
      LIMIT ?
    `)
      .bind(USER_ID, parsed.limit)
      .all<{ tag: string; count: number; last_used_at: string }>();
    return result.results.map((row) => ({
      tag: row.tag,
      count: Number(row.count),
      lastUsedAt: row.last_used_at,
    }));
  }

  async getOnThisDay(input: OnThisDayInput = {}): Promise<OnThisDayResult> {
    const parsed = onThisDayInputSchema.parse(input);
    const timezone = await this.#resolveTimeZone(parsed.timezone);
    const date = parsed.date ?? localDateKey(new Date(), timezone);
    const noon = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(noon.getTime()) || noon.toISOString().slice(0, 10) !== date) {
      throw new LedgerDomainError("INVALID_DATE", `无效日期：${date}`);
    }
    const offset = `${timeZoneOffsetMinutes(timezone, noon)} minutes`;
    const result = await this.env.DB.prepare(`
      ${ENTRY_SELECT}
      WHERE e.user_id = ? AND e.status = 'active'
        AND e.date_precision IN ('exact', 'approximate')
        AND strftime('%m-%d', e.occurred_at, ?) = ?
        AND strftime('%Y', e.occurred_at, ?) < ?
      ORDER BY e.occurred_at DESC, e.id DESC
      LIMIT ?
    `)
      .bind(
        USER_ID,
        offset,
        date.slice(5),
        offset,
        date.slice(0, 4),
        parsed.limit,
      )
      .all<EntryRow>();
    return { date, timezone, entries: result.results.map(toSummary) };
  }

  async #resolveTimeZone(requested: string | null): Promise<string> {
    const timezone = requested ?? (await this.getSettings()).timezone;
    if (!isValidTimeZone(timezone)) {
      throw new LedgerDomainError("INVALID_TIMEZONE", `无效时区：${timezone}`);
    }
    return timezone;
  }

  async getSettings(): Promise<LedgerSettings> {
    const row = await this.env.DB.prepare(`
      SELECT timezone, settings_json FROM users WHERE id = ?
    `)
      .bind(USER_ID)
      .first<{ timezone: string; settings_json: string }>();
    if (!row) {
      throw new LedgerDomainError("USER_NOT_FOUND", "Primary user not found.", 500);
    }
    const raw = safeRecord(row.settings_json);
    return settingsSchema.parse({
      timezone: row.timezone,
      captureMode: raw.captureMode ?? "safe",
      publicPreview: raw.publicPreview ?? true,
      sensitiveWarning: raw.sensitiveWarning ?? true,
      weeklyReview: raw.weeklyReview ?? false,
      retentionDaily: raw.retentionDaily ?? 30,
      retentionWeekly: raw.retentionWeekly ?? 12,
    });
  }

  async updateSettings(settings: LedgerSettings): Promise<LedgerSettings> {
    const parsed = settingsSchema.parse(settings);
    const timestamp = nowIso();
    await this.env.DB.batch([
      this.env.DB.prepare(`
        UPDATE users SET timezone = ?, settings_json = ?, updated_at = ?
        WHERE id = ?
      `).bind(parsed.timezone, JSON.stringify(parsed), timestamp, USER_ID),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "settings.updated",
        USER_ID,
        "User settings updated.",
        timestamp,
        "user",
      ),
    ]);
    return parsed;
  }

  async createImportDryRun(
    input: ImportDryRunInput,
  ): Promise<ImportDryRunReport> {
    const parsed = importDryRunInputSchema.parse(input);
    const serializedRecords = JSON.stringify(parsed.records);
    if (serializedRecords.length > 5_000_000) {
      throw new LedgerDomainError(
        "IMPORT_TOO_LARGE",
        "The normalized import payload exceeds 5 MB.",
        413,
      );
    }
    const existingResult = await this.env.DB.prepare(`
      SELECT normalized_title
      FROM media_works
      WHERE user_id = ? AND media_type = 'anime'
    `)
      .bind(USER_ID)
      .all<{ normalized_title: string }>();
    const knownTitles = new Set(
      existingResult.results.map((row) => row.normalized_title),
    );
    let newRecords = 0;
    let duplicates = 0;
    let errors = 0;

    for (const record of parsed.records) {
      const titleCandidate =
        typeof record.title === "string"
          ? record.title
          : typeof record.canonical_title === "string"
            ? record.canonical_title
            : typeof record.name === "string"
              ? record.name
              : "";
      const normalizedTitle = normalizeMediaTitle(titleCandidate);
      const scoreCandidate =
        typeof record.score === "number"
          ? record.score
          : typeof record.overallScore === "number"
            ? record.overallScore
            : null;
      if (
        !normalizedTitle ||
        (scoreCandidate !== null &&
          (scoreCandidate < 0 || scoreCandidate > 10))
      ) {
        errors += 1;
      } else if (knownTitles.has(normalizedTitle)) {
        duplicates += 1;
      } else {
        newRecords += 1;
        knownTitles.add(normalizedTitle);
      }
    }

    const timestamp = nowIso();
    const batchId = createId("import");
    const report: ImportDryRunReport = {
      batchId,
      sourceName: parsed.sourceName,
      total: parsed.records.length,
      newRecords,
      duplicates,
      ambiguous: 0,
      errors,
      status: "dry_run",
    };
    await this.env.DB.batch([
      this.env.DB.prepare(`
        INSERT INTO import_batches (
          id, user_id, source_name, status, records_json,
          report_json, created_at, committed_at
        ) VALUES (?, ?, ?, 'dry_run', ?, ?, ?, NULL)
      `).bind(
        batchId,
        USER_ID,
        parsed.sourceName,
        serializedRecords,
        JSON.stringify(report),
        timestamp,
      ),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "import.dry_run",
        batchId,
        `Import dry-run staged ${parsed.records.length} records without changing facts.`,
        timestamp,
        "import",
      ),
    ]);
    return report;
  }

  async commitImport(batchId: string): Promise<ImportDryRunReport> {
    const row = await this.env.DB.prepare(`
      SELECT source_name, status, report_json, records_json
      FROM import_batches
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `)
      .bind(batchId, USER_ID)
      .first<{
        source_name: string;
        status: "dry_run" | "committed";
        report_json: string;
        records_json: string;
      }>();
    if (!row) {
      throw new LedgerDomainError(
        "IMPORT_NOT_FOUND",
        "Import batch not found.",
        404,
      );
    }
    const report = safeRecord(row.report_json);
    const committed: ImportDryRunReport = {
      batchId,
      sourceName: row.source_name,
      total: typeof report.total === "number" ? report.total : 0,
      newRecords:
        typeof report.newRecords === "number" ? report.newRecords : 0,
      duplicates:
        typeof report.duplicates === "number" ? report.duplicates : 0,
      ambiguous:
        typeof report.ambiguous === "number" ? report.ambiguous : 0,
      errors: typeof report.errors === "number" ? report.errors : 0,
      status: "committed",
    };
    if (row.status === "committed") {
      return committed;
    }
    const timestamp = nowIso();
    const records = safeRecordArray(row.records_json);
    const insertStatements: D1PreparedStatement[] = [];
    const seen = new Set<string>();
    for (const [index, record] of records.entries()) {
      const title =
        typeof record.title === "string"
          ? record.title.trim()
          : typeof record.canonical_title === "string"
            ? record.canonical_title.trim()
            : typeof record.name === "string"
              ? record.name.trim()
              : "";
      const normalizedTitle = normalizeMediaTitle(title);
      const score =
        typeof record.score === "number"
          ? record.score
          : typeof record.overallScore === "number"
            ? record.overallScore
            : null;
      if (
        !title ||
        !normalizedTitle ||
        seen.has(normalizedTitle) ||
        (score !== null && (score < 0 || score > 10))
      ) {
        continue;
      }
      seen.add(normalizedTitle);
      const rawAliases =
        Array.isArray(record.aliases)
          ? record.aliases
          : typeof record.alias === "string"
            ? [record.alias]
            : [];
      const aliases = rawAliases.filter(
        (alias): alias is string =>
          typeof alias === "string" && alias.trim().length > 0,
      );
      const coverUrl =
        typeof record.coverUrl === "string"
          ? record.coverUrl
          : typeof record.cover_url === "string"
            ? record.cover_url
            : null;
      const mediaStatus =
        typeof record.status === "string" ? record.status : null;
      const watchStatus = mediaWatchStatusFromLegacyStatus(mediaStatus);
      const progress =
        typeof record.progress === "string"
          ? record.progress
          : typeof record.progressState === "string"
            ? record.progressState
            : null;
      const mediaIdHash = await sha256(
        `${batchId}:${index}:${normalizedTitle}`,
      );
      insertStatements.push(
        this.env.DB.prepare(`
          INSERT OR IGNORE INTO media_works (
            id, user_id, media_type, canonical_title, normalized_title,
            aliases_json, cover_url, status, progress_state,
            watch_status, overall_score_100, external_refs_json,
            created_at, updated_at
          ) VALUES (?, ?, 'anime', ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
        `).bind(
          `media_import_${mediaIdHash.slice(0, 24)}`,
          USER_ID,
          title,
          normalizedTitle,
          JSON.stringify(aliases),
          coverUrl,
          mediaStatus,
          progress,
          watchStatus,
          scoreToInteger(score),
          timestamp,
          timestamp,
        ),
      );
    }
    for (let index = 0; index < insertStatements.length; index += 50) {
      await this.env.DB.batch(insertStatements.slice(index, index + 50));
    }
    await this.env.DB.batch([
      this.env.DB.prepare(`
        UPDATE import_batches
        SET status = 'committed', report_json = ?, committed_at = ?
        WHERE id = ? AND user_id = ? AND status = 'dry_run'
      `).bind(JSON.stringify(committed), timestamp, batchId, USER_ID),
      this.#auditStatement(
        createId("req"),
        "system",
        "importer",
        "import.committed",
        batchId,
        `Import committed ${insertStatements.length} validated anime catalog rows with idempotent conflict handling.`,
        timestamp,
        "import",
      ),
    ]);
    return committed;
  }

  async listExports(): Promise<ExportRecord[]> {
    const result = await this.env.DB.prepare(`
      SELECT
        id, format, scope, status, created_at, completed_at,
        size_bytes, checksum, row_count, r2_key, error_code
      FROM exports
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `)
      .bind(USER_ID)
      .all<ExportRow>();
    return result.results.map(toExportRecord);
  }

  async createExport(scope: "incremental" | "full"): Promise<ExportRecord> {
    const timestamp = nowIso();
    const id = createId("export");
    const format: ExportRecord["format"] = scope === "full" ? "archive" : "jsonl";
    await this.env.DB.batch([
      this.env.DB.prepare(`
        INSERT INTO exports (
          id, user_id, format, scope, status, created_at
        ) VALUES (?, ?, ?, ?, 'pending', ?)
      `).bind(id, USER_ID, format, scope, timestamp),
      this.#auditStatement(
        createId("req"),
        "user",
        ACTOR_USER,
        "export.created",
        id,
        "Private R2 export queued through Cloudflare Workflows.",
        timestamp,
        "export",
      ),
    ]);
    try {
      await this.env.EXPORT_WORKFLOW.create({
        id: `manual-${id}`,
        params: {
          exportId: id,
          scope,
          kind: scope === "full" ? "manual_full" : "manual_incremental",
        },
        retention: {
          successRetention: "30 days",
          errorRetention: "30 days",
        },
      });
    } catch {
      await this.env.DB.prepare(`
        UPDATE exports
        SET status = 'failed', error_code = 'WORKFLOW_CREATE_FAILED', completed_at = ?
        WHERE id = ? AND user_id = ?
      `)
        .bind(nowIso(), id, USER_ID)
        .run();
      throw new LedgerDomainError(
        "EXPORT_WORKFLOW_UNAVAILABLE",
        "The export workflow could not be started.",
        503,
      );
    }
    const row = await this.env.DB.prepare(`
      SELECT
        id, format, scope, status, created_at, completed_at,
        size_bytes, checksum, row_count, r2_key, error_code
      FROM exports
      WHERE id = ?
    `)
      .bind(id)
      .first<ExportRow>();
    if (!row) {
      throw new LedgerDomainError("EXPORT_CREATE_FAILED", "Export record was not created.", 500);
    }
    return toExportRecord(row);
  }

  async downloadExport(id: string): Promise<ExportDownload> {
    const row = await this.env.DB.prepare(`
      SELECT r2_key, checksum
      FROM exports
      WHERE id = ? AND user_id = ? AND status = 'completed'
      LIMIT 1
    `)
      .bind(id, USER_ID)
      .first<{ r2_key: string | null; checksum: string | null }>();
    if (!row?.r2_key || !row.checksum) {
      throw new LedgerDomainError(
        "EXPORT_NOT_READY",
        "The requested export is not ready for download.",
        404,
      );
    }
    const object = await this.env.BACKUPS.get(row.r2_key);
    if (!object) {
      throw new LedgerDomainError(
        "EXPORT_ARTIFACT_MISSING",
        "The private backup artifact is missing.",
        503,
      );
    }
    const fileName = row.r2_key.split("/").at(-1) ?? `${id}.bin`;
    return {
      fileName,
      contentType: object.httpMetadata?.contentType ?? "application/octet-stream",
      body: await object.arrayBuffer(),
      checksum: row.checksum,
    };
  }

  async verifyExport(id: string): Promise<ExportVerification> {
    const row = await this.env.DB.prepare(`
      SELECT r2_key, checksum
      FROM exports
      WHERE id = ? AND user_id = ? AND status = 'completed'
      LIMIT 1
    `)
      .bind(id, USER_ID)
      .first<{ r2_key: string | null; checksum: string | null }>();
    if (!row?.r2_key || !row.checksum) {
      throw new LedgerDomainError(
        "EXPORT_NOT_READY",
        "The requested export is not ready for verification.",
        404,
      );
    }
    const object = await this.env.BACKUPS.get(row.r2_key);
    if (!object) {
      throw new LedgerDomainError(
        "EXPORT_ARTIFACT_MISSING",
        "The private backup artifact is missing.",
        503,
      );
    }
    const body = new Uint8Array(await object.arrayBuffer());
    const computedChecksum = await sha256HexBytes(body);
    const checkedAt = nowIso();
    const verified = computedChecksum === row.checksum;
    await this.env.DB.prepare(`
      INSERT INTO audit_events (
        id, request_id, user_id, actor_type, actor_id,
        action, target_type, target_id, detail, metadata_json, created_at
      ) VALUES (?, ?, ?, 'user', ?, ?, 'export', ?, ?, ?, ?)
    `)
      .bind(
        createId("audit"),
        createId("req"),
        USER_ID,
        ACTOR_USER,
        verified ? "export.verified" : "export.verification_failed",
        id,
        verified
          ? "Private R2 artifact checksum verified."
          : "Private R2 artifact checksum mismatch.",
        JSON.stringify({
          expectedChecksum: row.checksum,
          computedChecksum,
          sizeBytes: body.byteLength,
        }),
        checkedAt,
      )
      .run();
    return {
      id,
      verified,
      expectedChecksum: row.checksum,
      computedChecksum,
      sizeBytes: body.byteLength,
      checkedAt,
    };
  }

  async #getSeason(id: string): Promise<MediaSeason | null> {
    const row = await this.env.DB.prepare(`
      SELECT
        ms.id,
        ms.media_work_id,
        ms.label,
        ms.season_number,
        ms.title,
        ms.score_100,
        ms.watch_status,
        ms.created_at,
        ms.updated_at
      FROM media_seasons ms
      JOIN media_works mw ON mw.id = ms.media_work_id
      WHERE mw.user_id = ? AND ms.id = ?
      LIMIT 1
    `)
      .bind(USER_ID, id)
      .first<MediaSeasonRow>();
    return row ? toMediaSeason(row) : null;
  }

  async #expireStalePendingActions(): Promise<void> {
    const timestamp = nowIso();
    await this.env.DB.batch([
      this.env.DB.prepare(`
        UPDATE pending_actions
        SET consumed_at = ?
        WHERE user_id = ? AND consumed_at IS NULL AND expires_at <= ?
      `).bind(timestamp, USER_ID, timestamp),
      this.env.DB.prepare(`
        UPDATE entries
        SET visibility = 'private', updated_at = ?
        WHERE user_id = ?
          AND visibility = 'publish_pending'
          AND NOT EXISTS (
            SELECT 1
            FROM pending_actions pa
            WHERE pa.user_id = entries.user_id
              AND pa.target_id = entries.id
              AND pa.action_type = 'publish'
              AND pa.consumed_at IS NULL
              AND pa.expires_at > ?
          )
      `).bind(timestamp, USER_ID, timestamp),
    ]);
  }

  async #withEntryExtras<T extends EntrySummary>(entries: T[]): Promise<T[]> {
    if (entries.length === 0) {
      return entries;
    }
    const ids = JSON.stringify(entries.map((entry) => entry.id));
    const [mediaResult, followUpResult] = await this.env.DB.batch<
      EntryMediaRow | EntryFollowUpRow
    >([
      this.env.DB.prepare(`
        SELECT ${ENTRY_MEDIA_COLUMNS}
        FROM entry_media
        WHERE user_id = ? AND entry_id IN (SELECT value FROM json_each(?))
        ORDER BY entry_id, position, created_at
      `).bind(USER_ID, ids),
      this.env.DB.prepare(`
        SELECT id, entry_id, body_raw, source_channel, created_at
        FROM entry_follow_ups
        WHERE user_id = ? AND entry_id IN (SELECT value FROM json_each(?))
        ORDER BY entry_id, created_at, id
      `).bind(USER_ID, ids),
    ]);
    const mediaByEntry = new Map<string, EntryMedia[]>();
    for (const row of (mediaResult?.results ?? []) as EntryMediaRow[]) {
      const list = mediaByEntry.get(row.entry_id!) ?? [];
      list.push(toEntryMedia(row));
      mediaByEntry.set(row.entry_id!, list);
    }
    const followUpsByEntry = new Map<string, EntryFollowUp[]>();
    for (const row of (followUpResult?.results ?? []) as EntryFollowUpRow[]) {
      const list = followUpsByEntry.get(row.entry_id) ?? [];
      list.push(toEntryFollowUp(row));
      followUpsByEntry.set(row.entry_id, list);
    }
    return entries.map((entry) => ({
      ...entry,
      media: mediaByEntry.get(entry.id) ?? [],
      followUps: followUpsByEntry.get(entry.id) ?? [],
    }));
  }

  async #assertAttachableMedia(mediaIds: string[]): Promise<void> {
    if (mediaIds.length === 0) {
      return;
    }
    const row = await this.env.DB.prepare(`
      SELECT count(*) AS count
      FROM entry_media
      WHERE
        user_id = ? AND
        entry_id IS NULL AND
        id IN (SELECT value FROM json_each(?))
    `)
      .bind(USER_ID, JSON.stringify(mediaIds))
      .first<{ count: number }>();
    if ((row?.count ?? 0) !== mediaIds.length) {
      throw new LedgerDomainError(
        "ENTRY_MEDIA_UNAVAILABLE",
        "Some media are missing or already attached to another entry.",
        409,
      );
    }
  }

  #attachMediaStatements(
    entryId: string,
    mediaIds: string[],
    attachedAt: string,
    startPosition = 0,
  ): D1PreparedStatement[] {
    return mediaIds.map((mediaId, index) =>
      this.env.DB.prepare(`
        UPDATE entry_media
        SET entry_id = ?, position = ?, attached_at = ?
        WHERE user_id = ? AND id = ? AND entry_id IS NULL
      `).bind(entryId, startPosition + index, attachedAt, USER_ID, mediaId),
    );
  }

  async #requireEntry(id: string): Promise<EntryDetail> {
    const entry = await this.getEntry(id);
    if (!entry) {
      throw new LedgerDomainError("ENTRY_NOT_FOUND", "Entry not found.", 404);
    }
    return entry;
  }

  async #findIdempotent(
    sourceChannel: string,
    sourceMessageId: string | null,
  ): Promise<ExistingIdempotentRow | null> {
    if (sourceMessageId === null) {
      return null;
    }
    return this.env.DB.prepare(`
      SELECT id, request_hash
      FROM entries
      WHERE user_id = ? AND source_channel = ? AND source_message_id = ?
      LIMIT 1
    `)
      .bind(USER_ID, sourceChannel, sourceMessageId)
      .first<ExistingIdempotentRow>();
  }

  async #resolveIdempotent(
    existing: ExistingIdempotentRow,
    requestHash: string,
  ): Promise<MutationResult> {
    if (existing.request_hash !== requestHash) {
      throw new LedgerDomainError(
        "IDEMPOTENCY_CONFLICT",
        "The source message ID already exists with different content.",
        409,
      );
    }
    return this.#mutationResult(existing.id, createId("req"), true);
  }

  async #mutationResult(
    entryId: string,
    requestId: string,
    deduplicated: boolean,
  ): Promise<MutationResult> {
    const entry = await this.#requireEntry(entryId);
    return {
      entry,
      deduplicated,
      requestId,
      undoExpiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
  }

  #revisionStatement(
    entryId: string,
    versionNo: number,
    snapshot: Record<string, unknown>,
    actorType: string,
    actorId: string,
    reason: string,
    createdAt: string,
  ): D1PreparedStatement {
    return this.env.DB.prepare(`
      INSERT INTO entry_revisions (
        id, entry_id, version_no, snapshot_json,
        actor_type, actor_id, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      createId("revision"),
      entryId,
      versionNo,
      JSON.stringify(snapshot),
      actorType,
      actorId,
      reason,
      createdAt,
    );
  }

  #auditStatement(
    requestId: string,
    actorType: string,
    actorId: string,
    action: string,
    targetId: string,
    detail: string,
    createdAt: string,
    targetType = "entry",
  ): D1PreparedStatement {
    return this.env.DB.prepare(`
      INSERT INTO audit_events (
        id, request_id, user_id, actor_type, actor_id,
        action, target_type, target_id, detail, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)
    `).bind(
      createId("audit"),
      requestId,
      USER_ID,
      actorType,
      actorId,
      action,
      targetType,
      targetId,
      detail,
      createdAt,
    );
  }

  #publicRevisionStatement(timestamp: string): D1PreparedStatement {
    return this.env.DB.prepare(`
      INSERT INTO app_meta(key, value, updated_at)
      VALUES ('public_revision', ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(createId("pub"), timestamp);
  }
}
