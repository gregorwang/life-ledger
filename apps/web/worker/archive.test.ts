import { describe, expect, it } from "vitest";

import { buildArchiveTextFiles, isArchiveMediaKey } from "./archive";

const snapshot = {
  generatedAt: "2026-09-24T06:00:00.000Z",
  timezone: "Asia/Tokyo",
  restoreSql: "PRAGMA defer_foreign_keys = true;\n",
  tables: [
    {
      name: "entries",
      rows: [
        {
          id: "ent_1",
          type: "mood",
          body_raw: "下雨天在家听歌 ☕\n# 不是标题",
          occurred_at: "2026-09-24T06:11:00.000Z",
          date_precision: "exact",
          visibility: "private",
          status: "active",
          source_channel: "web",
          tags_json: '["mood","mood:😌","散步"]',
        },
        {
          id: "ent_gone",
          type: "thought",
          body_raw: "已经删掉的",
          occurred_at: "2026-09-24T07:00:00.000Z",
          date_precision: "exact",
          visibility: "private",
          status: "deleted",
          source_channel: "web",
          tags_json: "[]",
        },
      ],
    },
    {
      name: "entry_media",
      rows: [
        {
          id: "m1",
          entry_id: "ent_1",
          position: 0,
          kind: "image",
          object_key: "entry-media/0f8fad5b-d9cb-469f-a165-70867728950e.jpg",
        },
      ],
    },
    {
      name: "entry_follow_ups",
      rows: [{ id: "f1", entry_id: "ent_1", body_raw: "后来雨停了", created_at: "2026-09-24T08:00:00.000Z" }],
    },
    {
      name: "shelf_items",
      rows: [
        {
          id: "book_1",
          kind: "book",
          title: "三体",
          creator: "刘慈欣",
          shelf_status: "done",
          rating: 9.5,
          review: "",
          finished_on: "2026-09-01",
          excerpts_json: '[{"text":"弱小和无知不是生存的障碍","location":"p.120","note":null}]',
          tags_json: "[]",
          status: "active",
        },
      ],
    },
    {
      name: "entry_links",
      rows: [{ entry_id: "ent_1", target_kind: "shelf", target_id: "book_1" }],
    },
    {
      name: "places",
      rows: [
        {
          id: "place_1",
          name: "伏见稻荷大社",
          city: "京都",
          country: "日本",
          category: "sight",
          trip: "关西之旅",
          visited_on: "2026-04-02",
          left_on: null,
          rating: 9,
          note: "千本鸟居",
          status: "active",
        },
      ],
    },
  ],
};

describe("local archive", () => {
  const files = buildArchiveTextFiles(snapshot, 1);
  const byPath = new Map(files.map((file) => [file.path, file.content]));

  it("writes the raw data, restore script and readme", () => {
    expect(byPath.get("data/restore.sql")).toContain("defer_foreign_keys");
    const ledger = JSON.parse(byPath.get("data/ledger.json")!);
    expect(ledger.tables.entries).toHaveLength(2);
    expect(byPath.get("README.md")).toContain("如何恢复");
  });

  it("writes readable monthly diaries with mood, media, follow-ups and tags", () => {
    const diary = byPath.get("日常/2026/09月.md")!;
    expect(diary).toContain("# 2026 年 9 月");
    expect(diary).toContain("## 9 月 24 日 周四");
    expect(diary).toContain("### 15:11 · 😌 平静 · 心情");
    expect(diary).toContain("> 下雨天在家听歌 ☕\n> # 不是标题");
    expect(diary).toContain("![](../../media/entry-media/0f8fad5b-d9cb-469f-a165-70867728950e.jpg)");
    expect(diary).toContain("> 后来雨停了");
    expect(diary).toContain("#散步 · 仅自己可见 · 来自网页");
    expect(diary).toContain("关于：《三体》");
    expect(diary).not.toContain("已经删掉的");
  });

  it("writes the shelf and places", () => {
    expect(byPath.get("书架.md")).toContain("### 《三体》 — 刘慈欣 ★9.5");
    expect(byPath.get("书架.md")).toContain("「弱小和无知不是生存的障碍」（p.120）");
    expect(byPath.get("足迹.md")).toContain("2026-04-02 · 京都，日本 · 景点 · 旅行：关西之旅");
  });

  it("only serves plain relative media keys", () => {
    expect(isArchiveMediaKey("entry-media/0f8fad5b.jpg")).toBe(true);
    expect(isArchiveMediaKey("covers/game/game-009-v1.webp")).toBe(true);
    for (const key of ["../secret", "a/../b", "/abs", "a//b", "", "a/.hidden", "a\\b"]) {
      expect(isArchiveMediaKey(key), key).toBe(false);
    }
  });
});
