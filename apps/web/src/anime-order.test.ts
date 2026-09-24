import { describe, expect, it } from "vitest";

import { sortAnimeWorks, type AnimeLibrarySort } from "./anime-order";

const works = [
  {
    id: "haihara",
    title: "灰原君的青春二周目",
    lastLoggedAt: "2026-04-02T16:28:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
  },
  {
    id: "hyouka",
    title: "冰菓",
    lastLoggedAt: "2026-07-04T15:00:00.000Z",
    updatedAt: "2026-07-05T01:00:00.000Z",
  },
  {
    id: "seirei",
    title: "精灵幻想记 第1季",
    lastLoggedAt: "2026-06-30T15:00:00.000Z",
    updatedAt: "2026-07-01T01:00:00.000Z",
  },
  {
    id: "kokoro",
    title: "恋爱随意链接",
    lastLoggedAt: "2026-06-29T15:00:00.000Z",
    updatedAt: "2026-06-30T01:00:00.000Z",
  },
  {
    id: "madoka",
    title: "魔法少女小圆",
    lastLoggedAt: "2026-02-14T15:00:00.000Z",
    updatedAt: "2026-07-27T03:00:00.000Z",
  },
  {
    id: "no-date",
    title: "未记录作品",
    lastLoggedAt: null,
    updatedAt: "2026-07-28T00:00:00.000Z",
  },
] as const;

function ids(sort: AnimeLibrarySort): string[] {
  return sortAnimeWorks(works, sort).map((work) => work.id);
}

describe("anime library ordering", () => {
  it("uses actual watch time instead of July import/update time", () => {
    expect(ids("recent_desc")).toEqual([
      "hyouka",
      "seirei",
      "kokoro",
      "haihara",
      "madoka",
      "no-date",
    ]);
  });

  it("supports earliest, updated and title sorts while keeping null dates last", () => {
    expect(ids("recent_asc")).toEqual([
      "madoka",
      "haihara",
      "kokoro",
      "seirei",
      "hyouka",
      "no-date",
    ]);
    expect(ids("updated_desc").at(-1)).toBe("no-date");
    expect(ids("title_asc").at(-1)).toBe("no-date");
  });
});

