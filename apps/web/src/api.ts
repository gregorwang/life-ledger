import type {
  AnimeWorkSummary,
  DashboardResponse,
  EntryDetail,
  EntrySummary,
  ExportRecord as ApiExportRecord,
  ExportVerification,
  GameLibraryItem,
  ImportDryRunReport,
  CollectibleItem,
  MediaWorkDetail,
  MediaWorkSummary,
  MutationResult,
  PendingAction,
} from "@life-ledger/contracts";

import type {
  AnimeWork,
  CaptureDraft,
  ExportRecord,
  LedgerEntry,
  ScreenWork,
} from "./models";

const FALLBACK_COVERS = [
  "/media/covers/anime/catalog-placeholder-v1.webp",
] as const;

const ACCENTS = ["#8a6fe8", "#ee7fa9", "#e4ad42", "#719fc8", "#5fa889"] as const;

async function requestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "object" &&
      payload.error !== null &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export function mapEntry(
  entry: EntrySummary | EntryDetail,
): LedgerEntry {
  const detail = "revisions" in entry ? entry : null;
  const candidateMediaKind = (
    entry as (EntrySummary | EntryDetail) & { mediaKind?: unknown }
  ).mediaKind;
  return {
    id: entry.id,
    type:
      entry.type === "game" || entry.type === "music" || entry.type === "photo"
        ? "note"
        : entry.type,
    title: entry.title || "未命名记录",
    bodyRaw: entry.bodyRaw,
    bodySummary: entry.bodySummary || entry.bodyRaw.slice(0, 90),
    occurredAt: entry.occurredAt,
    datePrecision: entry.datePrecision,
    createdAt: entry.createdAt,
    visibility: entry.visibility,
    status: entry.status,
    sourceChannel: entry.sourceChannel,
    sourceMessageId: detail?.sourceMessageId ?? null,
    tags: entry.tags,
    score: entry.score,
    mediaWorkId: entry.mediaWorkId,
    seasonLabel: entry.seasonLabel,
    episodeLabel: entry.episodeLabel,
    ratingScope: entry.ratingScope,
    ...(candidateMediaKind === "movie" || candidateMediaKind === "tv"
      ? { mediaKind: candidateMediaKind }
      : {}),
    versionNo: entry.versionNo,
    revisions:
      detail?.revisions.map((revision) => ({
        id: revision.id,
        versionNo: revision.versionNo,
        bodyRaw:
          typeof revision.snapshot.bodyRaw === "string"
            ? revision.snapshot.bodyRaw
            : entry.bodyRaw,
        reason: revision.reason || "修订",
        actor: revision.actorId
          ? `${revision.actorType} · ${revision.actorId}`
          : revision.actorType,
        createdAt: revision.createdAt,
      })) ?? [],
    audit:
      detail?.audit.map((event) => ({
        id: event.id,
        action: event.action,
        actor: event.actorId
          ? `${event.actorType} · ${event.actorId}`
          : event.actorType,
        detail: event.detail,
        createdAt: event.createdAt,
      })) ?? [],
  };
}

function mapWork(work: AnimeWorkSummary, index: number): AnimeWork {
  const candidateStatus: unknown = work.watchStatus;
  const watchStatus =
    candidateStatus === "planned" ||
    candidateStatus === "watching" ||
    candidateStatus === "completed" ||
    candidateStatus === "watched" ||
    candidateStatus === "paused" ||
    candidateStatus === "dropped"
      ? candidateStatus
      : null;
  if (
    import.meta.env.DEV &&
    candidateStatus !== null &&
    watchStatus === null
  ) {
    console.warn("Ignoring unknown anime watch status", {
      workId: work.id,
      watchStatus: candidateStatus,
    });
  }
  const statusLabel =
    watchStatus === "planned"
      ? "想看"
      : watchStatus === "watching"
        ? "观看中"
        : watchStatus === "completed" || watchStatus === "watched"
          ? "已看完"
          : watchStatus === "paused"
            ? "暂停"
            : watchStatus === "dropped"
              ? "已弃"
              : "未设置状态";
  return {
    id: work.id,
    title: work.title,
    subtitle: work.aliases[0] || work.title,
    aliases: work.aliases,
    coverUrl: work.coverUrl || FALLBACK_COVERS[index % FALLBACK_COVERS.length]!,
    accent: ACCENTS[index % ACCENTS.length]!,
    watchStatus,
    statusLabel,
    overallScore: work.overallScore,
    logCount: work.logCount,
    lastLoggedAt: work.lastLoggedAt,
    lastLoggedDatePrecision: work.lastLoggedDatePrecision,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    description: `${work.logCount} 条可追溯观看记录；公开与私人内容分开投影。`,
  };
}

function mapExport(record: ApiExportRecord): ExportRecord {
  return {
    id: record.id,
    format: record.format,
    scope: record.scope,
    status: record.status,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    size:
      record.sizeBytes === null
        ? "生成中"
        : `${Math.max(1, Math.round(record.sizeBytes / 1024))} KB`,
    checksum: record.checksum,
    rowCount: record.rowCount ?? 0,
  };
}

function mapScreenWork(work: MediaWorkSummary): ScreenWork | null {
  if (work.mediaType !== "screen" || work.mediaKind === null) {
    return null;
  }
  return {
    id: work.id,
    title: work.title,
    aliases: work.aliases,
    coverUrl: work.coverUrl,
    mediaKind: work.mediaKind,
    watchStatus: work.watchStatus,
    overallScore: work.overallScore,
    seasonCount: work.seasonCount,
    logCount: work.logCount,
    publicLogCount: work.publicLogCount,
    lastLoggedAt: work.lastLoggedAt,
    lastLoggedDatePrecision: work.lastLoggedDatePrecision,
  };
}

export async function loadDashboard(signal?: AbortSignal) {
  const requestOptions = signal ? { signal } : undefined;
  const dashboard = await requestJson<DashboardResponse>(
    "/api/v1/bootstrap",
    requestOptions,
  );
  return {
    entries: dashboard.entries.map(mapEntry),
    works: dashboard.anime.map(mapWork),
    exports: dashboard.exports.map(mapExport),
    settings: dashboard.settings,
  };
}

export async function loadScreenWorks(signal?: AbortSignal) {
  const requestOptions = signal ? { signal } : undefined;
  const catalog = await requestJson<{ items: MediaWorkSummary[] }>(
    "/api/v1/media-works?mediaType=screen&limit=100",
    requestOptions,
  );
  return catalog.items
    .map(mapScreenWork)
    .filter((work): work is ScreenWork => work !== null);
}

export async function loadGameLibrary(
  signal?: AbortSignal,
): Promise<GameLibraryItem[]> {
  const response = await requestJson<{ items: GameLibraryItem[] }>(
    "/api/v1/game-library",
    signal ? { signal } : undefined,
  );
  return response.items;
}

export async function loadCollectibles(
  signal?: AbortSignal,
): Promise<CollectibleItem[]> {
  const response = await requestJson<{ items: CollectibleItem[] }>(
    "/api/v1/collectibles",
    signal ? { signal } : undefined,
  );
  return response.items;
}

export async function loadEntry(id: string): Promise<LedgerEntry> {
  return mapEntry(
    await requestJson<EntryDetail>(`/api/v1/entries/${encodeURIComponent(id)}`),
  );
}

export async function loadMediaWork(
  id: string,
  signal?: AbortSignal,
): Promise<MediaWorkDetail> {
  return requestJson<MediaWorkDetail>(
    `/api/v1/media-works/${encodeURIComponent(id)}`,
    signal ? { signal } : undefined,
  );
}

export async function createEntry(
  draft: CaptureDraft,
  works: AnimeWork[],
): Promise<LedgerEntry> {
  const now = new Date().toISOString();
  const source = {
    channel: "web" as const,
    messageId: `web_${crypto.randomUUID()}`,
    conversationId: null,
  };
  const result =
    draft.type === "anime" || draft.type === "screen"
      ? await requestJson<MutationResult>("/api/v1/media-logs", {
          method: "POST",
          body: JSON.stringify({
            rawText: draft.bodyRaw,
            mediaType: draft.type,
            mediaKind: draft.type === "screen" ? draft.mediaKind : null,
            title:
              (draft.type === "anime"
                ? works.find((work) => work.id === draft.workId)?.title
                : null) ||
              draft.title ||
              "未命名作品",
            aliases: [],
            ratingScope: draft.ratingScope,
            seasonId:
              draft.ratingScope === "work" || !draft.seasonId.trim()
                ? null
                : draft.seasonId.trim(),
            seasonLabel:
              draft.ratingScope === "work" || !draft.seasonLabel.trim()
                ? null
                : draft.seasonLabel.trim(),
            episodeLabel:
              draft.ratingScope !== "episode" || !draft.episodeLabel.trim()
                ? null
                : draft.episodeLabel.trim(),
            progressState: null,
            score: draft.score.trim() ? Number(draft.score) : null,
            comment: draft.bodyRaw,
            occurredAt: now,
            timezone: window.localStorage.getItem("life-ledger.timezone") || "Asia/Tokyo",
            source,
            visibility: "private",
          }),
        })
      : await requestJson<MutationResult>("/api/v1/entries", {
          method: "POST",
          body: JSON.stringify({
            rawText: draft.bodyRaw,
            type: draft.type,
            title: draft.title.trim() || null,
            occurredAt: now,
            timezone: window.localStorage.getItem("life-ledger.timezone") || "Asia/Tokyo",
            temporalUncertain: false,
            tags: [draft.type],
            source,
            visibility: "private",
          }),
        });
  return mapEntry(result.entry);
}

export async function updateEntryBody(
  entry: LedgerEntry,
  bodyRaw: string,
): Promise<LedgerEntry> {
  return mapEntry(
    await requestJson<EntryDetail>(`/api/v1/entries/${encodeURIComponent(entry.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        versionNo: entry.versionNo,
        bodyRaw,
        reason: "网页校对",
      }),
    }),
  );
}

export async function mutateEntry(
  id: string,
  action: "delete" | "restore" | "unpublish",
): Promise<LedgerEntry> {
  const path =
    action === "delete"
      ? `/api/v1/entries/${encodeURIComponent(id)}`
      : `/api/v1/entries/${encodeURIComponent(id)}/${action}`;
  return mapEntry(
    await requestJson<EntryDetail>(path, {
      method: action === "delete" ? "DELETE" : "POST",
    }),
  );
}

export async function purgeEntry(id: string): Promise<void> {
  await requestJson<{ id: string; purged: true }>(
    `/api/v1/entries/${encodeURIComponent(id)}/purge`,
    {
      method: "POST",
      body: JSON.stringify({ confirmationId: id }),
    },
  );
}

export async function preparePublish(id: string): Promise<PendingAction> {
  return requestJson<PendingAction>(
    `/api/v1/entries/${encodeURIComponent(id)}/prepare-publish`,
    { method: "POST" },
  );
}

export async function confirmPublish(
  actionId: string,
  confirmationCode: string,
): Promise<LedgerEntry> {
  return mapEntry(
    await requestJson<EntryDetail>(
      `/api/v1/actions/${encodeURIComponent(actionId)}/confirm`,
      {
        method: "POST",
        body: JSON.stringify({ confirmationCode }),
      },
    ),
  );
}

export async function saveSettings(settings: DashboardResponse["settings"]) {
  return requestJson<DashboardResponse["settings"]>("/api/v1/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function createImportDryRun(
  sourceName: string,
  records: Array<Record<string, unknown>>,
): Promise<ImportDryRunReport> {
  return requestJson<ImportDryRunReport>("/api/v1/imports/dry-run", {
    method: "POST",
    body: JSON.stringify({ sourceName, records }),
  });
}

export async function commitImport(
  batchId: string,
): Promise<ImportDryRunReport> {
  return requestJson<ImportDryRunReport>(
    `/api/v1/imports/${encodeURIComponent(batchId)}/commit`,
    { method: "POST" },
  );
}

export async function createExport(): Promise<ExportRecord> {
  return mapExport(
    await requestJson<ApiExportRecord>("/api/v1/exports", {
      method: "POST",
      body: JSON.stringify({ scope: "full" }),
    }),
  );
}

export function exportDownloadUrl(exportId: string): string {
  return `/api/v1/exports/${encodeURIComponent(exportId)}/download`;
}

export async function verifyExport(
  exportId: string,
): Promise<ExportVerification> {
  return requestJson<ExportVerification>(
    `/api/v1/exports/${encodeURIComponent(exportId)}/verify`,
    { method: "POST" },
  );
}
