export const ENTRY_TYPES = [
  "anime",
  "screen",
  "thought",
  "idea",
  "mood",
  "note",
] as const;

export type EntryType = (typeof ENTRY_TYPES)[number];
export type EntryVisibility = "private" | "publish_pending" | "public";
export type EntryStatus = "active" | "deleted";
export type SourceChannel = "wechat" | "web" | "import" | "mcp";
export type DatePrecision = "exact" | "month" | "year" | "approximate";

export interface EntryRevision {
  id: string;
  versionNo: number;
  bodyRaw: string;
  reason: string;
  actor: string;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  action: string;
  actor: string;
  detail: string;
  createdAt: string;
}

export interface EntryMediaItem {
  id: string;
  kind: "image" | "video";
  mimeType: string;
  url: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface EntryFollowUp {
  id: string;
  body: string;
  sourceChannel: SourceChannel;
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  type: EntryType;
  title: string;
  bodyRaw: string;
  bodySummary: string;
  occurredAt: string;
  datePrecision: DatePrecision;
  createdAt: string;
  visibility: EntryVisibility;
  status: EntryStatus;
  sourceChannel: SourceChannel;
  sourceMessageId: string | null;
  tags: string[];
  score: number | null;
  mediaWorkId: string | null;
  seasonLabel: string | null;
  episodeLabel: string | null;
  ratingScope: "episode" | "season" | "work" | null;
  mediaKind?: "movie" | "tv";
  versionNo: number;
  media: EntryMediaItem[];
  followUps: EntryFollowUp[];
  revisions: EntryRevision[];
  audit: AuditEvent[];
}

export interface AnimeWork {
  id: string;
  title: string;
  subtitle: string;
  aliases: string[];
  coverUrl: string;
  accent: string;
  watchStatus:
    | "planned"
    | "watching"
    | "completed"
    | "watched"
    | "paused"
    | "dropped"
    | null;
  statusLabel: string;
  overallScore: number | null;
  logCount: number;
  lastLoggedAt: string | null;
  lastLoggedDatePrecision: DatePrecision | null;
  createdAt: string;
  updatedAt: string;
  description: string;
}

export interface ScreenWork {
  id: string;
  title: string;
  aliases: string[];
  coverUrl: string | null;
  mediaKind: "movie" | "tv";
  watchStatus:
    | "planned"
    | "watching"
    | "completed"
    | "watched"
    | "paused"
    | "dropped"
    | null;
  overallScore: number | null;
  seasonCount: number;
  logCount: number;
  publicLogCount: number;
  lastLoggedAt: string | null;
  lastLoggedDatePrecision: DatePrecision | null;
}

export interface ExportRecord {
  id: string;
  format: "jsonl" | "sql" | "archive";
  scope: "incremental" | "full";
  status: "pending" | "completed" | "running" | "failed";
  createdAt: string;
  completedAt: string | null;
  size: string;
  checksum: string | null;
  rowCount: number;
}

export interface LedgerSettings {
  timezone: string;
  captureMode: "safe" | "quick_media";
  publicPreview: boolean;
  sensitiveWarning: boolean;
  weeklyReview: boolean;
  retentionDaily: number;
  retentionWeekly: number;
}

export interface CaptureDraft {
  type: EntryType;
  title: string;
  bodyRaw: string;
  score: string;
  workId: string;
  mediaKind: "movie" | "tv";
  ratingScope: "work" | "season" | "episode";
  seasonId: string;
  seasonLabel: string;
  episodeLabel: string;
  mediaIds: string[];
  tags?: string[];
}

export interface CaptureDraftSeed {
  type: EntryType;
  bodyRaw: string;
  mediaIds: string[];
}

export interface ToastMessage {
  id: number;
  tone: "success" | "info" | "danger";
  title: string;
  detail: string;
}

export interface SearchFilters {
  query: string;
  type: "all" | EntryType;
  visibility: "all" | EntryVisibility;
  score: "all" | "high" | "low";
}
