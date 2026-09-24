import {
  MOOD_PRESETS,
  MOOD_TAG_PREFIX,
  moodFromTags,
  type ArchiveSnapshot,
} from "@life-ledger/contracts";

/**
 * Turns a database snapshot into the text half of a local backup: the raw
 * data, a restore script, and Markdown that stays readable without this app.
 * Media bytes are listed separately and fetched one object at a time.
 */

export interface ArchiveTextFile {
  path: string;
  content: string;
}

export interface ArchiveMediaFile {
  path: string;
  key: string;
  size: number;
}

export interface ArchiveManifest {
  format: "life-ledger-archive";
  version: 1;
  generatedAt: string;
  files: ArchiveTextFile[];
  media: ArchiveMediaFile[];
  totalBytes: number;
}

type Row = Record<string, unknown>;

const MEDIA_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/u;

/** Keys the archive route may serve: plain relative paths, no traversal. */
export function isArchiveMediaKey(key: string): boolean {
  return key.length <= 512 && MEDIA_KEY_PATTERN.test(key) && !key.split("/").includes("..");
}

const TYPE_LABELS: Record<string, string> = {
  thought: "想法",
  idea: "点子",
  mood: "心情",
  note: "笔记",
  anime: "番剧",
  screen: "影视",
  game: "游戏",
  music: "音乐",
  photo: "照片",
};

const SOURCE_LABELS: Record<string, string> = {
  web: "网页",
  wechat: "微信",
  mcp: "MCP Agent",
  import: "导入",
};

const VISIBILITY_LABELS: Record<string, string> = {
  private: "仅自己可见",
  publish_pending: "待确认公开",
  public: "公开",
};

const SYSTEM_TAGS = new Set([
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

const SHELF_STATUS: Record<string, Record<string, string>> = {
  book: { in_progress: "在读", done: "读完", planned: "想读", dropped: "弃读" },
  music: { in_progress: "在循环", done: "听过", planned: "想听", dropped: "不听了" },
};

const PLACE_CATEGORY: Record<string, string> = {
  city: "城市",
  sight: "景点",
  food: "吃喝",
  stay: "住宿",
  nature: "自然",
  event: "活动",
  other: "其他",
};

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jsonArray(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringArray(value: unknown): string[] {
  return jsonArray(value).filter((item): item is string => typeof item === "string");
}

function active(rows: Row[]): Row[] {
  return rows.filter((row) => row.status === undefined || row.status === "active");
}

/** Keeps a quoted block intact even when the text has Markdown in it. */
function quote(body: string): string {
  return body
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

function localParts(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    time: `${get("hour")}:${get("minute")}`,
    weekday: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][
      ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"))
    ] ?? "",
  };
}

function moodText(mood: string): string {
  const label = MOOD_PRESETS.find((preset) => preset.emoji === mood)?.label;
  return label ? `${mood} ${label}` : mood;
}

function score(value: number | null, scale = 1): string {
  return value === null ? "" : ` ★${(value / scale).toFixed(1)}`;
}

function buildDiaryFiles(tables: Map<string, Row[]>, timeZone: string): ArchiveTextFile[] {
  const entries = active(tables.get("entries") ?? []).sort((left, right) =>
    text(left.occurred_at).localeCompare(text(right.occurred_at)),
  );
  const mediaByEntry = new Map<string, Row[]>();
  for (const row of tables.get("entry_media") ?? []) {
    const entryId = text(row.entry_id);
    if (!entryId) continue;
    mediaByEntry.set(entryId, [...(mediaByEntry.get(entryId) ?? []), row]);
  }
  const followUps = new Map<string, Row[]>();
  for (const row of tables.get("entry_follow_ups") ?? []) {
    const entryId = text(row.entry_id);
    followUps.set(entryId, [...(followUps.get(entryId) ?? []), row]);
  }
  const works = new Map((tables.get("media_works") ?? []).map((row) => [text(row.id), row]));
  const linkTitles = new Map<string, string>();
  for (const row of tables.get("shelf_items") ?? []) linkTitles.set(`shelf:${text(row.id)}`, `《${text(row.title)}》`);
  for (const row of tables.get("places") ?? []) linkTitles.set(`place:${text(row.id)}`, text(row.name));
  for (const row of tables.get("game_library_items") ?? []) linkTitles.set(`game:${text(row.id)}`, text(row.title));
  const linksByEntry = new Map<string, string[]>();
  for (const row of tables.get("entry_links") ?? []) {
    const title = linkTitles.get(`${text(row.target_kind)}:${text(row.target_id)}`);
    if (!title) continue;
    const entryId = text(row.entry_id);
    linksByEntry.set(entryId, [...(linksByEntry.get(entryId) ?? []), title]);
  }
  const logs = new Map((tables.get("media_logs") ?? []).map((row) => [text(row.entry_id), row]));

  const months = new Map<string, string[]>();
  let currentDay = "";
  for (const entry of entries) {
    const occurredAt = text(entry.occurred_at);
    const local = localParts(occurredAt, timeZone);
    const monthKey = `${local.year}/${local.month}`;
    const lines = months.get(monthKey) ?? [`# ${local.year} 年 ${Number(local.month)} 月`, ""];
    if (!months.has(monthKey)) {
      currentDay = "";
    }
    const dayKey = `${local.year}-${local.month}-${local.day}`;
    const precision = text(entry.date_precision);
    const heading =
      precision === "month" || precision === "year"
        ? `## 时间不确定（${precision === "year" ? "只知道年份" : "只知道月份"}）`
        : `## ${Number(local.month)} 月 ${Number(local.day)} 日 ${local.weekday}`;
    if (`${dayKey}|${heading}` !== currentDay) {
      lines.push(heading, "");
      currentDay = `${dayKey}|${heading}`;
    }

    const tags = stringArray(entry.tags_json);
    const mood = moodFromTags(tags);
    const title = [
      precision === "exact" || precision === "approximate" ? local.time : null,
      mood ? moodText(mood) : null,
      TYPE_LABELS[text(entry.type)] ?? text(entry.type),
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(`### ${title}`, "");

    const log = logs.get(text(entry.id));
    if (log) {
      const work = works.get(text(log.media_work_id));
      const detail = [text(log.season_label), text(log.episode_label)].filter(Boolean).join(" ");
      lines.push(
        `**《${text(work?.canonical_title) || "未知作品"}》**${detail ? ` ${detail}` : ""}${score(num(log.score_100), 10)}`,
        "",
      );
    }

    const linked = linksByEntry.get(text(entry.id));
    if (linked?.length) {
      lines.push(`关于：${linked.join("、")}`, "");
    }
    lines.push(quote(text(entry.body_raw)), "");

    const media = [...(mediaByEntry.get(text(entry.id)) ?? [])].sort(
      (left, right) => (num(left.position) ?? 0) - (num(right.position) ?? 0),
    );
    for (const item of media) {
      const path = `../../media/${text(item.object_key)}`;
      lines.push(item.kind === "video" ? `[视频](${path})` : `![](${path})`);
    }
    if (media.length) lines.push("");

    for (const followUp of followUps.get(text(entry.id)) ?? []) {
      const at = localParts(text(followUp.created_at), timeZone);
      lines.push(`补充（${at.year}-${at.month}-${at.day} ${at.time}）：`, quote(text(followUp.body_raw)), "");
    }

    const visibleTags = tags
      .filter((tag) => !SYSTEM_TAGS.has(tag) && !tag.startsWith(MOOD_TAG_PREFIX))
      .map((tag) => `#${tag}`);
    lines.push(
      [
        ...visibleTags,
        VISIBILITY_LABELS[text(entry.visibility)] ?? text(entry.visibility),
        `来自${SOURCE_LABELS[text(entry.source_channel)] ?? text(entry.source_channel)}`,
        `id: ${text(entry.id)}`,
      ].join(" · "),
      "",
    );
    months.set(monthKey, lines);
  }

  return [...months].map(([key, lines]) => ({
    path: `日常/${key.slice(0, 4)}/${key.slice(5)}月.md`,
    content: `${lines.join("\n").trimEnd()}\n`,
  }));
}

function buildShelfFile(rows: Row[], kind: "book" | "music"): ArchiveTextFile | null {
  const items = active(rows).filter((row) => row.kind === kind);
  if (!items.length) return null;
  const labels = SHELF_STATUS[kind]!;
  const lines = [`# ${kind === "book" ? "书架" : "音乐"}`, ""];
  for (const status of ["in_progress", "done", "planned", "dropped"]) {
    const group = items
      .filter((row) => row.shelf_status === status)
      .sort((left, right) =>
        text(right.finished_on ?? right.started_on ?? right.created_at).localeCompare(
          text(left.finished_on ?? left.started_on ?? left.created_at),
        ),
      );
    if (!group.length) continue;
    lines.push(`## ${labels[status]}（${group.length}）`, "");
    for (const row of group) {
      const dates = [
        row.started_on ? `${text(row.started_on)} 开始` : null,
        row.finished_on ? `${text(row.finished_on)} ${labels.done}` : null,
      ].filter(Boolean);
      lines.push(
        `### 《${text(row.title)}》${row.creator ? ` — ${text(row.creator)}` : ""}${score(num(row.rating))}`,
      );
      if (dates.length) lines.push("", dates.join(" · "));
      if (text(row.review)) lines.push("", quote(text(row.review)));
      for (const excerpt of jsonArray(row.excerpts_json)) {
        if (typeof excerpt !== "object" || excerpt === null) continue;
        const item = excerpt as Record<string, unknown>;
        lines.push("", `- 「${text(item.text)}」${item.location ? `（${text(item.location)}）` : ""}${item.note ? ` —— ${text(item.note)}` : ""}`);
      }
      const tags = stringArray(row.tags_json);
      if (tags.length) lines.push("", tags.map((tag) => `#${tag}`).join(" "));
      lines.push("");
    }
  }
  return { path: kind === "book" ? "书架.md" : "音乐.md", content: `${lines.join("\n").trimEnd()}\n` };
}

function buildGamesFile(rows: Row[]): ArchiveTextFile | null {
  const items = active(rows);
  if (!items.length) return null;
  const lines = ["# 游戏库", ""];
  for (const row of [...items].sort((left, right) => (num(right.rating) ?? 0) - (num(left.rating) ?? 0))) {
    lines.push(
      `## ${text(row.title)}${score(num(row.rating))}`,
      "",
      `${text(row.platform)} · ${text(row.play_time)} · 完成度 ${num(row.progress) ?? 0}% · 奖杯 ${num(row.achievements_current) ?? 0}/${num(row.achievements_total) ?? 0}`,
    );
    if (text(row.review)) lines.push("", quote(text(row.review)));
    lines.push("");
  }
  return { path: "游戏库.md", content: `${lines.join("\n").trimEnd()}\n` };
}

function buildWorksFile(tables: Map<string, Row[]>): ArchiveTextFile | null {
  const works = tables.get("media_works") ?? [];
  if (!works.length) return null;
  const logCounts = new Map<string, number>();
  for (const log of tables.get("media_logs") ?? []) {
    const id = text(log.media_work_id);
    logCounts.set(id, (logCounts.get(id) ?? 0) + 1);
  }
  const lines = ["# 动漫与影视", ""];
  for (const [type, title] of [
    ["anime", "动漫"],
    ["screen", "影视"],
  ] as const) {
    const group = works
      .filter((row) => row.media_type === type)
      .sort((left, right) => text(left.canonical_title).localeCompare(text(right.canonical_title), "zh-CN"));
    if (!group.length) continue;
    lines.push(`## ${title}（${group.length}）`, "");
    for (const row of group) {
      lines.push(
        `- 《${text(row.canonical_title)}》${score(num(row.overall_score_100), 10)} · ${logCounts.get(text(row.id)) ?? 0} 条记录`,
      );
    }
    lines.push("");
  }
  return { path: "动漫与影视.md", content: `${lines.join("\n").trimEnd()}\n` };
}

function buildPlacesFile(rows: Row[]): ArchiveTextFile | null {
  const places = active(rows).sort((left, right) => text(right.visited_on).localeCompare(text(left.visited_on)));
  if (!places.length) return null;
  const lines = ["# 足迹", ""];
  let year = "";
  for (const row of places) {
    const rowYear = text(row.visited_on).slice(0, 4);
    if (rowYear !== year) {
      lines.push(`## ${rowYear}`, "");
      year = rowYear;
    }
    const where = [text(row.city), text(row.country)].filter(Boolean).join("，");
    const dates = row.left_on ? `${text(row.visited_on)} ~ ${text(row.left_on)}` : text(row.visited_on);
    lines.push(
      `### ${text(row.name)}${score(num(row.rating))}`,
      "",
      [dates, where, PLACE_CATEGORY[text(row.category)], row.trip ? `旅行：${text(row.trip)}` : null]
        .filter(Boolean)
        .join(" · "),
    );
    if (num(row.latitude) !== null && num(row.longitude) !== null) {
      lines.push("", `坐标：${num(row.latitude)}, ${num(row.longitude)}`);
    }
    if (text(row.note)) lines.push("", quote(text(row.note)));
    lines.push("");
  }
  return { path: "足迹.md", content: `${lines.join("\n").trimEnd()}\n` };
}

function readme(snapshot: ArchiveSnapshot, mediaCount: number): string {
  return `# Life Ledger 完整备份

导出时间：${snapshot.generatedAt}（时区 ${snapshot.timezone}）

这个文件夹就是你的全部数据，不依赖 Life Ledger 本身也能打开和读懂。

## 目录

- \`日常/年/月.md\`：每条动态的原文、心情、补充、标签，照片和视频用相对路径引用 \`media/\`
- \`书架.md\`、\`音乐.md\`、\`游戏库.md\`、\`动漫与影视.md\`、\`足迹.md\`：各个库的清单、评分、摘抄
- \`media/\`：所有照片、视频、封面的原始文件（共 ${mediaCount} 个）
- \`data/ledger.json\`：数据库每一张表的完整数据（机器可读，包括已删除和修订历史）
- \`data/restore.sql\`：把数据库恢复到一个全新的 Cloudflare D1 / SQLite

Markdown 可以直接用 Obsidian、Typora、VS Code 或任何文本编辑器打开。

## 如何恢复

1. 新建一个空的 D1 数据库：\`wrangler d1 create life-ledger-restore\`
2. 导入：\`wrangler d1 execute life-ledger-restore --remote --file data/restore.sql\`
3. 把 \`media/\` 里的文件按相同路径上传回 R2 桶：
   \`node scripts/restore-media.mjs <这个文件夹> <R2 桶名>\`
4. 把 \`services/core/wrangler.jsonc\` 里的 database_id 指向新库，重新部署。

只想在本机查看数据库：\`sqlite3 ledger.db < data/restore.sql\`。
`;
}

export function buildArchiveTextFiles(
  snapshot: ArchiveSnapshot,
  mediaCount: number,
): ArchiveTextFile[] {
  const tables = new Map(snapshot.tables.map((table) => [table.name, table.rows as Row[]]));
  const ledger = {
    format: "life-ledger-archive",
    version: 1,
    generatedAt: snapshot.generatedAt,
    timezone: snapshot.timezone,
    tables: Object.fromEntries(snapshot.tables.map((table) => [table.name, table.rows])),
  };
  return [
    { path: "README.md", content: readme(snapshot, mediaCount) },
    { path: "data/ledger.json", content: `${JSON.stringify(ledger, null, 2)}\n` },
    { path: "data/restore.sql", content: snapshot.restoreSql },
    ...buildDiaryFiles(tables, snapshot.timezone),
    buildShelfFile(tables.get("shelf_items") ?? [], "book"),
    buildShelfFile(tables.get("shelf_items") ?? [], "music"),
    buildGamesFile(tables.get("game_library_items") ?? []),
    buildWorksFile(tables),
    buildPlacesFile(tables.get("places") ?? []),
  ].filter((file): file is ArchiveTextFile => file !== null);
}

export async function listArchiveMedia(bucket: R2Bucket): Promise<ArchiveMediaFile[]> {
  const files: ArchiveMediaFile[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
    for (const object of page.objects) {
      if (isArchiveMediaKey(object.key)) {
        files.push({ path: `media/${object.key}`, key: object.key, size: object.size });
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return files;
}
