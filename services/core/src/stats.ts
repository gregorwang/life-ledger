import type {
  CountBucket,
  EntryType,
  EntryVisibility,
  LedgerStats,
  LedgerStatsMediaWork,
  LedgerStatsRatedLog,
  MediaType,
  RatingScope,
} from "@life-ledger/contracts";

export interface StatsRow {
  id: string;
  type: EntryType;
  visibility: EntryVisibility;
  occurred_at: string;
  tags_json: string;
  media_work_id: string | null;
  media_title: string | null;
  media_type: MediaType | null;
  rating_scope: RatingScope | null;
  score_100: number | null;
}

export interface StatsOptions {
  from: string;
  to: string;
  timezone: string;
  truncated: boolean;
  topTagLimit?: number;
  workLimit?: number;
  topRatedLimit?: number;
}

const DAY_GRANULARITY_MAX_DAYS = 62;

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    dateFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** Calendar date (YYYY-MM-DD) of an instant in the given IANA zone. */
export function localDateKey(instant: string | Date, timeZone: string): string {
  const parts = dateFormatter(timeZone).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Minutes the zone is ahead of UTC at the given instant (Tokyo = 540). */
export function timeZoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  const wholeSeconds = Math.floor(at.getTime() / 1000) * 1000;
  return Math.round((asUtc - wholeSeconds) / 60_000);
}

function safeTags(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function increment<K extends string>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function sortedBuckets<K extends string>(
  map: Map<K, number>,
  limit?: number,
): Array<CountBucket<K>> {
  const buckets = [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return limit === undefined ? buckets : buckets.slice(0, limit);
}

function roundScore(total: number, count: number): number | null {
  return count === 0 ? null : Math.round(total / count) / 10;
}

export function aggregateStats(
  rows: readonly StatsRow[],
  options: StatsOptions,
): LedgerStats {
  const rangeDays =
    (Date.parse(options.to) - Date.parse(options.from)) / 86_400_000;
  const granularity = rangeDays <= DAY_GRANULARITY_MAX_DAYS ? "day" : "month";

  const byType = new Map<EntryType, number>();
  const byVisibility = new Map<EntryVisibility, number>();
  const timeline = new Map<string, number>();
  const activeDays = new Set<string>();
  const tagCounts = new Map<string, number>();
  const byMediaType = new Map<MediaType, number>();
  const works = new Map<
    string,
    LedgerStatsMediaWork & { scoreTotal: number; scoreCount: number }
  >();
  const rated: LedgerStatsRatedLog[] = [];
  let mediaLogCount = 0;
  let scoreTotal = 0;
  let scoreCount = 0;

  for (const row of rows) {
    increment(byType, row.type);
    increment(byVisibility, row.visibility);
    const day = localDateKey(row.occurred_at, options.timezone);
    activeDays.add(day);
    increment(timeline, granularity === "day" ? day : day.slice(0, 7));
    for (const tag of new Set(safeTags(row.tags_json))) {
      increment(tagCounts, tag);
    }

    if (row.media_work_id === null || row.media_type === null) {
      continue;
    }
    mediaLogCount += 1;
    increment(byMediaType, row.media_type);
    const title = row.media_title ?? row.media_work_id;
    const work = works.get(row.media_work_id) ?? {
      mediaWorkId: row.media_work_id,
      title,
      mediaType: row.media_type,
      logCount: 0,
      lastOccurredAt: row.occurred_at,
      averageScore: null,
      scoreTotal: 0,
      scoreCount: 0,
    };
    work.logCount += 1;
    if (row.occurred_at > work.lastOccurredAt) {
      work.lastOccurredAt = row.occurred_at;
    }
    if (row.score_100 !== null) {
      work.scoreTotal += row.score_100;
      work.scoreCount += 1;
      scoreTotal += row.score_100;
      scoreCount += 1;
      rated.push({
        entryId: row.id,
        mediaWorkId: row.media_work_id,
        title,
        mediaType: row.media_type,
        score: row.score_100 / 10,
        ratingScope: row.rating_scope,
        occurredAt: row.occurred_at,
      });
    }
    works.set(row.media_work_id, work);
  }

  const workList = [...works.values()]
    .sort(
      (a, b) =>
        b.logCount - a.logCount ||
        b.lastOccurredAt.localeCompare(a.lastOccurredAt),
    )
    .slice(0, options.workLimit ?? 30)
    .map(({ scoreTotal: total, scoreCount: count, ...work }) => ({
      ...work,
      averageScore: roundScore(total, count),
    }));

  return {
    range: { from: options.from, to: options.to, timezone: options.timezone },
    totalEntries: rows.length,
    truncated: options.truncated,
    activeDays: activeDays.size,
    byType: sortedBuckets(byType),
    byVisibility: sortedBuckets(byVisibility),
    timeline: {
      granularity,
      buckets: [...timeline.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    },
    topTags: sortedBuckets(tagCounts, options.topTagLimit ?? 20),
    media: {
      logCount: mediaLogCount,
      distinctWorks: works.size,
      scoredCount: scoreCount,
      averageScore: roundScore(scoreTotal, scoreCount),
      byMediaType: sortedBuckets(byMediaType),
      works: workList,
      topRated: rated
        .sort(
          (a, b) =>
            b.score - a.score || b.occurredAt.localeCompare(a.occurredAt),
        )
        .slice(0, options.topRatedLimit ?? 10),
    },
  };
}
