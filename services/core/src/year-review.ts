import {
  MOOD_TAG_PREFIX,
  moodFromTags,
  type CountBucket,
  type EntryType,
  type MediaType,
  type YearReview,
  type YearReviewWork,
} from "@life-ledger/contracts";

import { localDateKey } from "./stats";

export interface YearReviewEntryRow {
  id: string;
  type: EntryType;
  occurred_at: string;
  date_precision: string;
  tags_json: string;
  excerpt: string;
}

export interface YearReviewMediaRow {
  media_work_id: string;
  title: string;
  media_type: MediaType;
  cover_url: string | null;
  occurred_at: string;
  score_100: number | null;
}

const HIDDEN_TAGS = new Set([
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

function parseTags(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function ranked(counts: Map<string, number>, limit: number): CountBucket[] {
  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
}

function longestStreak(sortedDays: string[]): number {
  let best = 0;
  let current = 0;
  let previous: number | null = null;
  for (const day of sortedDays) {
    const time = Date.parse(`${day}T00:00:00Z`);
    current = previous !== null && time - previous === 86_400_000 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = time;
  }
  return best;
}

/**
 * Aggregates one local calendar year. Rows may come from a slightly wider
 * UTC window; anything whose local date is outside the year is ignored.
 */
export function buildYearReview(input: {
  year: number;
  timezone: string;
  years: number[];
  entries: YearReviewEntryRow[];
  media: YearReviewMediaRow[];
  books: YearReview["books"];
  music: YearReview["music"];
  places: YearReview["places"];
}): YearReview {
  const prefix = `${input.year}-`;
  const entries = input.entries
    .map((row) => ({ row, date: localDateKey(row.occurred_at, input.timezone) }))
    .filter(({ date }) => date.startsWith(prefix))
    .sort((left, right) => left.row.occurred_at.localeCompare(right.row.occurred_at));

  const byType = new Map<string, number>();
  const tags = new Map<string, number>();
  const moods = new Map<string, number>();
  const moodByDay = new Map<string, string>();
  const perDay = new Map<string, number>();
  const byMonth = Array.from({ length: 12 }, () => 0);

  for (const { row, date } of entries) {
    byType.set(row.type, (byType.get(row.type) ?? 0) + 1);
    byMonth[Number(date.slice(5, 7)) - 1]! += 1;
    const dayKnown = row.date_precision === "exact" || row.date_precision === "approximate";
    if (dayKnown) {
      perDay.set(date, (perDay.get(date) ?? 0) + 1);
    }
    const entryTags = parseTags(row.tags_json);
    const mood = moodFromTags(entryTags);
    if (mood) {
      moods.set(mood, (moods.get(mood) ?? 0) + 1);
      if (dayKnown) {
        moodByDay.set(date, mood);
      }
    }
    for (const tag of entryTags) {
      if (!HIDDEN_TAGS.has(tag) && !tag.startsWith(MOOD_TAG_PREFIX)) {
        tags.set(tag, (tags.get(tag) ?? 0) + 1);
      }
    }
  }

  const works = new Map<string, YearReviewWork>();
  for (const row of [...input.media].sort((left, right) =>
    left.occurred_at.localeCompare(right.occurred_at),
  )) {
    if (!localDateKey(row.occurred_at, input.timezone).startsWith(prefix)) {
      continue;
    }
    const current = works.get(row.media_work_id) ?? {
      mediaWorkId: row.media_work_id,
      title: row.title,
      mediaType: row.media_type,
      coverUrl: row.cover_url,
      logCount: 0,
      score: null,
    };
    current.logCount += 1;
    if (row.score_100 !== null) {
      current.score = row.score_100 / 10;
    }
    works.set(row.media_work_id, current);
  }

  const days = [...perDay.keys()].sort();
  const first = entries[0];
  return {
    year: input.year,
    timezone: input.timezone,
    years: input.years,
    entries: {
      total: entries.length,
      activeDays: days.length,
      longestStreak: longestStreak(days),
      byType: ranked(byType, 20) as Array<CountBucket<EntryType>>,
      byMonth,
    },
    moods: {
      counts: ranked(moods, 20),
      days: [...moodByDay].sort().map(([date, mood]) => ({ date, mood })),
    },
    days: days.map((date) => ({ date, count: perDay.get(date)! })),
    topTags: ranked(tags, 12),
    firstEntry: first
      ? { id: first.row.id, occurredAt: first.row.occurred_at, excerpt: first.row.excerpt }
      : null,
    works: [...works.values()]
      .sort(
        (left, right) =>
          (right.score ?? -1) - (left.score ?? -1) || right.logCount - left.logCount,
      )
      .slice(0, 12),
    books: input.books,
    music: input.music,
    places: input.places,
  };
}
