import { MOOD_TAG_PREFIX } from "@life-ledger/contracts";

import { formatOccurredAt } from "./date-display";
import type { EntryMediaItem, EntryType, LedgerEntry } from "./models";
import { compareEntriesByOccurredAtDesc } from "./timeline-order";

export const FEED_TABS = [
  { id: "all", label: "全部", types: null },
  { id: "thoughts", label: "想法", types: ["thought", "idea", "note"] },
  { id: "anime", label: "番剧", types: ["anime"] },
  { id: "screen", label: "影视", types: ["screen"] },
  { id: "mood", label: "心情", types: ["mood"] },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  types: readonly EntryType[] | null;
}>;

export type FeedTabId = (typeof FEED_TABS)[number]["id"];

export function matchesFeedTab(tab: FeedTabId, entry: LedgerEntry): boolean {
  const definition = FEED_TABS.find((item) => item.id === tab);
  if (!definition || definition.types === null) {
    return true;
  }
  return (definition.types as readonly EntryType[]).includes(entry.type);
}

export function dayKey(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date(value));
}

export function dayLabel(key: string, now: Date, timeZone: string): string {
  const today = dayKey(now.toISOString(), timeZone);
  const yesterday = dayKey(
    new Date(now.getTime() - 86_400_000).toISOString(),
    timeZone,
  );
  const date = new Date(`${key}T12:00:00Z`);
  const monthDay = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
  if (key === today) {
    return `今天 · ${monthDay}`;
  }
  if (key === yesterday) {
    return `昨天 · ${monthDay}`;
  }
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("zh-CN", {
    ...(sameYear ? {} : { year: "numeric" }),
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "UTC",
  }).format(date);
}

export interface FeedDay {
  key: string;
  label: string;
  entries: LedgerEntry[];
}

/**
 * Groups entries into day sections, newest first. Entries whose date is only
 * known to month/year precision get their own section labelled by that
 * precision so they never masquerade as a precise day.
 */
export function groupFeedByDay(
  entries: readonly LedgerEntry[],
  now: Date,
  timeZone: string,
): FeedDay[] {
  const sorted = [...entries].sort(compareEntriesByOccurredAtDesc);
  const days: FeedDay[] = [];
  for (const entry of sorted) {
    const exact = entry.datePrecision === "exact";
    const key = exact
      ? dayKey(entry.occurredAt, timeZone)
      : `${dayKey(entry.occurredAt, timeZone)}|${entry.datePrecision}`;
    const last = days.at(-1);
    if (last && last.key === key) {
      last.entries.push(entry);
      continue;
    }
    days.push({
      key,
      label: exact
        ? dayLabel(key, now, timeZone)
        : formatOccurredAt(entry.occurredAt, entry.datePrecision, timeZone),
      entries: [entry],
    });
  }
  return days;
}

/** Time shown in a post header: clock time for exact entries. */
export function feedTime(entry: LedgerEntry, timeZone: string): string {
  if (entry.datePrecision !== "exact") {
    return formatOccurredAt(entry.occurredAt, entry.datePrecision, timeZone);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(entry.occurredAt));
}

export function relativeTime(value: string, now: Date, timeZone: string): string {
  const elapsed = now.getTime() - new Date(value).getTime();
  if (elapsed < 60_000) {
    return "刚刚";
  }
  if (elapsed < 3_600_000) {
    return `${Math.floor(elapsed / 60_000)} 分钟前`;
  }
  if (elapsed < 86_400_000) {
    return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(value));
}

const SYSTEM_TAGS = new Set<string>([
  "anime",
  "screen",
  "game",
  "music",
  "photo",
  "thought",
  "idea",
  "mood",
  "note",
  "work",
  "season",
  "episode",
]);

export function visibleTags(entry: LedgerEntry): string[] {
  return entry.tags.filter(
    (tag) => !SYSTEM_TAGS.has(tag) && !tag.startsWith(MOOD_TAG_PREFIX),
  );
}

const MEDIA_ONLY_MARKERS = new Set(["[照片]", "[视频]", "[照片和视频]"]);

/** Text stored as the original record when a post is only photos/videos. */
export function mediaOnlyMarker(media: readonly Pick<EntryMediaItem, "kind">[]): string {
  const hasImage = media.some((item) => item.kind === "image");
  const hasVideo = media.some((item) => item.kind === "video");
  return hasImage && hasVideo ? "[照片和视频]" : hasVideo ? "[视频]" : "[照片]";
}

export function isMediaOnlyBody(entry: LedgerEntry): boolean {
  return entry.media.length > 0 && MEDIA_ONLY_MARKERS.has(entry.bodyRaw.trim());
}

export function mediaGridLayout(count: number): "single" | "pair" | "grid" {
  if (count <= 1) {
    return "single";
  }
  if (count === 2 || count === 4) {
    return "pair";
  }
  return "grid";
}

export interface WeekStats {
  posts: number;
  mediaLogs: number;
  publicPosts: number;
}

export function weekStats(
  entries: readonly LedgerEntry[],
  now: Date,
): WeekStats {
  const since = now.getTime() - 7 * 86_400_000;
  const recent = entries.filter(
    (entry) =>
      entry.status === "active" && new Date(entry.occurredAt).getTime() >= since,
  );
  return {
    posts: recent.length,
    mediaLogs: recent.filter(
      (entry) => entry.type === "anime" || entry.type === "screen",
    ).length,
    publicPosts: recent.filter((entry) => entry.visibility === "public").length,
  };
}

export function formatDuration(durationMs: number | null): string | null {
  if (durationMs === null) {
    return null;
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
