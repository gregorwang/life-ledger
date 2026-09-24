import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  SignJWT,
  exportJWK,
  generateKeyPair,
} from "jose";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  authorizeRequest,
  createServer,
  handleRequest,
  isAllowlistedAgentIp,
  type McpCoreBinding,
} from "../src/index";

const failUnexpectedCall = async (): Promise<never> => {
  throw new Error("Unexpected Core call.");
};

function createCore(
  overrides: Partial<McpCoreBinding> = {},
): McpCoreBinding {
  const methods: Array<keyof McpCoreBinding> = [
    "listEntries", "getEntry", "captureEntry", "updateEntry", "deleteEntry", "restoreEntry",
    "listMediaWorks", "getMediaWork", "createMediaWork", "updateMediaWork", "uploadMediaImage",
    "getGameLibraryItem", "createGameLibraryItem", "updateGameLibraryItem",
    "deleteGameLibraryItem", "restoreGameLibraryItem",
    "getShelfItem", "createShelfItem", "updateShelfItem", "addShelfExcerpt",
    "deleteShelfItem", "restoreShelfItem",
    "getPlace", "createPlace", "updatePlace", "deletePlace", "restorePlace",
    "logMedia", "preparePublish", "confirmAction", "unpublishEntry",
    "addEntryFollowUp", "deleteFollowUpById", "uploadEntryMedia", "createEntryMediaUpload",
    "attachEntryMedia", "removeEntryMediaById", "searchAll", "listLinkedEntries",
    "getYearReview", "getStats", "listTags", "getOnThisDay", "getSettings", "updateSettings",
  ];
  return {
    ...(Object.fromEntries(methods.map((name) => [name, failUnexpectedCall])) as unknown as McpCoreBinding),
    ...overrides,
  };
}

async function withClient<T>(
  core: McpCoreBinding,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const server = createServer(core);
  const client = new Client({
    name: "life-ledger-mcp-test",
    version: "1.0.0",
  });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    return await operation(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function responseText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  if (!("content" in result)) {
    throw new Error("Tool result has no content.");
  }
  const text = result.content.find(
    (item): item is { type: "text"; text: string } =>
      item.type === "text" && "text" in item,
  );
  if (!text) {
    throw new Error("Tool result has no text content.");
  }
  return text.text;
}

const expectedToolNames = [
  "capture_entry",
  "log_media",
  "save_shelf_item",
  "save_place",
  "save_game",
  "save_media_work",
  "add_follow_up",
  "update_entry",
  "upload_photo",
  "create_upload_url",
  "attach_media",
  "search_all",
  "search_entries",
  "get_item",
  "get_stats",
  "get_year_review",
  "on_this_day",
  "list_tags",
  "delete_item",
  "restore_item",
  "publish_entry",
  "unpublish_entry",
  "settings",
];

describe("Life Ledger MCP 工具契约", () => {
  it("公开完整工具清单、中文说明和危险操作确认字段", async () => {
    await withClient(createCore(), async (client) => {
      const response = await client.listTools();
      expect(response.tools.map((tool) => tool.name)).toEqual(
        expectedToolNames,
      );
      for (const tool of response.tools) {
        expect(tool.description).toMatch(/[\u3400-\u9fff]/u);
      }

      expect(response.tools.length).toBeLessThanOrEqual(25);
      const required = (name: string) =>
        response.tools.find((tool) => tool.name === name)?.inputSchema
          .required ?? [];
      // Small models only have to supply the text; keys and versions are optional.
      expect(required("capture_entry")).toEqual(["rawText"]);
      expect(required("save_shelf_item")).toEqual([]);
      expect(required("delete_item")).toEqual(["id", "confirm"]);
      expect(required("upload_photo")).toEqual(
        expect.arrayContaining(["base64Data", "mimeType"]),
      );
    });
  });

  it("把来源映射到 Core，并以结构化错误返回失败", async () => {
    const captureEntry = vi.fn(
      async (
        _input: Parameters<McpCoreBinding["captureEntry"]>[0],
      ): Promise<never> => {
        throw Object.assign(new Error("CORE_WRITE_REJECTED: 写入被拒绝。"), {
          code: "CORE_WRITE_REJECTED",
          status: 409,
        });
      },
    );

    await withClient(createCore({ captureEntry }), async (client) => {
      const result = await client.callTool({
        name: "capture_entry",
        arguments: {
          rawText: "记一下：完成 MCP 合约测试。",
          type: "note",
          occurredAt: "2026-07-26T13:00:00+09:00",
          timezone: "Asia/Tokyo",
          sourceChannel: "wechat",
          idempotencyKey: "wx-message-001",
          conversationId: "wx-conversation-001",
        },
      });

      expect(captureEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          source: {
            channel: "wechat",
            messageId: "wx-message-001",
            conversationId: "wx-conversation-001",
          },
          visibility: "private",
        }),
      );
      expect("isError" in result && result.isError).toBe(true);
      expect(JSON.parse(responseText(result))).toEqual({
        ok: false,
        error: {
          code: "CORE_WRITE_REJECTED",
          message: "CORE_WRITE_REJECTED: 写入被拒绝。",
          retryable: false,
        },
      });
    });
  });

  it("save_shelf_item 新建、追加摘抄并发一条关联动态", async () => {
    const book = { id: "book_1", kind: "book", title: "三体", versionNo: 1 };
    const createShelfItem = vi.fn(async () => book as never);
    const addShelfExcerpt = vi.fn(async () => ({ ...book, versionNo: 2 }) as never);
    const captureEntry = vi.fn(async () => ({ entryId: "ent_9" }) as never);
    await withClient(createCore({ createShelfItem, addShelfExcerpt, captureEntry }), async (client) => {
      const result = await client.callTool({
        name: "save_shelf_item",
        arguments: {
          kind: "book",
          title: "三体",
          creator: "刘慈欣",
          status: "done",
          rating: 9.5,
          addExcerpt: { text: "弱小和无知不是生存的障碍，傲慢才是。", location: "p.120" },
          postToFeed: "读完了三体，后劲很大。",
        },
      });
      expect(JSON.parse(responseText(result)).ok).toBe(true);

      const rejected = await client.callTool({
        name: "save_shelf_item",
        arguments: { kind: "music", title: "晴天", format: "paper" },
      });
      expect("isError" in rejected && rejected.isError).toBe(true);
      const missing = await client.callTool({ name: "save_shelf_item", arguments: { title: "没说类型" } });
      expect(JSON.parse(responseText(missing)).error.code).toBe("MISSING_FIELDS");
    });
    expect(createShelfItem).toHaveBeenCalledOnce();
    expect(createShelfItem).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "book", title: "三体", shelfStatus: "done", rating: 9.5 }),
    );
    expect(addShelfExcerpt).toHaveBeenCalledWith("book_1", {
      versionNo: 1,
      excerpt: { text: "弱小和无知不是生存的障碍，傲慢才是。", location: "p.120", note: null },
    });
    expect(captureEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText: "读完了三体，后劲很大。",
        links: [{ kind: "shelf", id: "book_1" }],
        tags: ["读书"],
      }),
    );
  });

  it("修改时自动补上 versionNo，只发送传入的字段", async () => {
    const getShelfItem = vi.fn(async () => ({ id: "music_1", kind: "music", versionNo: 7 }) as never);
    const updateShelfItem = vi.fn(async () => ({ id: "music_1", kind: "music", versionNo: 8 }) as never);
    const getPlace = vi.fn(async () => ({ id: "place_1", versionNo: 3 }) as never);
    const updatePlace = vi.fn(async () => ({ id: "place_1", versionNo: 4 }) as never);
    await withClient(createCore({ getShelfItem, updateShelfItem, getPlace, updatePlace }), async (client) => {
      await client.callTool({ name: "save_shelf_item", arguments: { id: "music_1", rating: 9 } });
      await client.callTool({ name: "save_place", arguments: { id: "place_1", note: "又去了一次" } });
    });
    expect(updateShelfItem).toHaveBeenCalledWith("music_1", { versionNo: 7, rating: 9 });
    expect(updatePlace).toHaveBeenCalledWith("place_1", { versionNo: 3, note: "又去了一次" });
  });

  it("capture_entry 不传幂等键时自动去重，aboutId 变成关联", async () => {
    const captureEntry = vi.fn(async (): Promise<never> => {
      throw Object.assign(new Error("IDEMPOTENCY_CONFLICT: exists"), { code: "IDEMPOTENCY_CONFLICT" });
    });
    await withClient(createCore({ captureEntry }), async (client) => {
      const result = await client.callTool({
        name: "capture_entry",
        arguments: { rawText: "今天去了奈良 🦌", aboutId: "place_1" },
      });
      expect(JSON.parse(responseText(result)).data.duplicate).toBe(true);
      const bad = await client.callTool({
        name: "capture_entry",
        arguments: { rawText: "x", aboutId: "ent_1" },
      });
      expect(JSON.parse(responseText(bad)).error.code).toBe("INVALID_ABOUT_ID");
      await client.callTool({
        name: "capture_entry",
        arguments: { rawText: "最后一集哭死", aboutId: "work_1", mood: "感动" },
      });
    });
    expect(captureEntry).toHaveBeenCalledWith(
      expect.objectContaining({ links: [{ kind: "work", id: "work_1" }], mood: "🥲" }),
    );
    expect(captureEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        links: [{ kind: "place", id: "place_1" }],
        source: expect.objectContaining({ channel: "mcp", messageId: expect.stringMatching(/^auto:/u) }),
      }),
    );
  });

  it("search_all、get_item、delete_item、restore_item 按 id 前缀分发", async () => {
    const searchAll = vi.fn(async () => []);
    const getShelfItem = vi.fn(async () => ({ id: "book_1", versionNo: 2 }) as never);
    const listLinkedEntries = vi.fn(async () => []);
    const deleteShelfItem = vi.fn(async () => ({}) as never);
    const deleteEntry = vi.fn(async () => ({}) as never);
    const deleteFollowUpById = vi.fn(async () => ({}) as never);
    const restorePlace = vi.fn(async () => ({}) as never);
    const getPlace = vi.fn(async () => ({ id: "place_1", versionNo: 5 }) as never);
    await withClient(
      createCore({ searchAll, getShelfItem, listLinkedEntries, deleteShelfItem, deleteEntry, deleteFollowUpById, restorePlace, getPlace }),
      async (client) => {
        await client.callTool({ name: "search_all", arguments: { query: "杭州", kinds: ["place"] } });
        const item = await client.callTool({ name: "get_item", arguments: { id: "book_1" } });
        expect(JSON.parse(responseText(item)).data).toEqual({
          item: { id: "book_1", versionNo: 2 },
          relatedEntries: [],
        });
        const refused = await client.callTool({ name: "delete_item", arguments: { id: "book_1" } });
        expect("isError" in refused && refused.isError).toBe(true);
        await client.callTool({ name: "delete_item", arguments: { id: "book_1", confirm: true } });
        await client.callTool({ name: "delete_item", arguments: { id: "ent_1", confirm: true } });
        await client.callTool({ name: "delete_item", arguments: { id: "followup_1", confirm: true } });
        await client.callTool({ name: "restore_item", arguments: { id: "place_1" } });
        const unknown = await client.callTool({ name: "get_item", arguments: { id: "xyz" } });
        expect(JSON.parse(responseText(unknown)).error.code).toBe("UNKNOWN_ID");
      },
    );
    expect(searchAll).toHaveBeenCalledWith({ query: "杭州", kinds: ["place"], limit: 10 });
    expect(listLinkedEntries).toHaveBeenCalledWith("shelf", "book_1");
    expect(deleteShelfItem).toHaveBeenCalledWith("book_1", 2);
    expect(deleteEntry).toHaveBeenCalledWith("ent_1");
    expect(deleteFollowUpById).toHaveBeenCalledWith("followup_1");
    expect(restorePlace).toHaveBeenCalledWith("place_1", 5);
  });

  it("检索工具把时间范围与标签透传到 Core", async () => {
    const listEntries = vi.fn(async () => []);

    await withClient(createCore({ listEntries }), async (client) => {
      await client.callTool({
        name: "search_entries",
        arguments: {
          query: "芙莉莲",
          occurredFrom: "2026-09-01T00:00:00+09:00",
          occurredTo: "2026-10-01T00:00:00+09:00",
          tag: "周末",
        },
      });
      await client.callTool({
        name: "search_entries",
        arguments: { type: "mood", occurredFrom: "2026-09-17T00:00:00Z" },
      });
    });

    expect(listEntries).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        query: "芙莉莲",
        occurredFrom: "2026-09-01T00:00:00+09:00",
        occurredTo: "2026-10-01T00:00:00+09:00",
        tag: "周末",
      }),
    );
    expect(listEntries).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        query: "",
        type: "mood",
        occurredFrom: "2026-09-17T00:00:00Z",
        occurredTo: null,
        tag: null,
      }),
    );
  });

  it("统计、标签与那年今日走只读 Core 调用，并校验区间", async () => {
    const getStats = vi.fn(async () => ({ totalEntries: 3 }) as never);
    const listTags = vi.fn(async () => [
      { tag: "动画", count: 4, lastUsedAt: "2026-09-20T00:00:00.000Z" },
    ]);
    const getOnThisDay = vi.fn(
      async () =>
        ({ date: "2026-09-24", timezone: "Asia/Tokyo", entries: [] }) as never,
    );

    await withClient(
      createCore({ getStats, listTags, getOnThisDay }),
      async (client) => {
        const stats = await client.callTool({
          name: "get_stats",
          arguments: {
            from: "2026-09-01T00:00:00+09:00",
            to: "2026-10-01T00:00:00+09:00",
          },
        });
        expect(JSON.parse(responseText(stats))).toEqual({
          ok: true,
          data: { totalEntries: 3 },
        });

        const reversed = await client.callTool({
          name: "get_stats",
          arguments: {
            from: "2026-10-01T00:00:00+09:00",
            to: "2026-09-01T00:00:00+09:00",
          },
        });
        expect("isError" in reversed && reversed.isError).toBe(true);

        await client.callTool({ name: "list_tags", arguments: {} });
        await client.callTool({
          name: "on_this_day",
          arguments: { date: "2026-09-24" },
        });

        const tools = await client.listTools();
        for (const name of ["get_stats", "list_tags", "on_this_day"]) {
          expect(
            tools.tools.find((tool) => tool.name === name)?.annotations
              ?.readOnlyHint,
          ).toBe(true);
        }
      },
    );

    expect(getStats).toHaveBeenCalledTimes(1);
    expect(getStats).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "2026-09-01T00:00:00+09:00",
        timezone: null,
      }),
    );
    expect(listTags).toHaveBeenCalledWith({ limit: 200 });
    expect(getOnThisDay).toHaveBeenCalledWith(
      expect.objectContaining({ date: "2026-09-24", limit: 50 }),
    );
  });

  it("暴露只读上下文资源与回顾提示词", async () => {
    const getSettings = vi.fn(async () => ({ timezone: "Asia/Tokyo" }) as never);
    const getStats = vi.fn(async () => ({ totalEntries: 0 }) as never);
    const listMediaWorks = vi.fn(async () => []);

    await withClient(
      createCore({ getSettings, getStats, listMediaWorks }),
      async (client) => {
        const resources = await client.listResources();
        expect(resources.resources.map((resource) => resource.uri)).toEqual([
          "life-ledger://settings",
          "life-ledger://tags",
          "life-ledger://media/in-progress",
          "life-ledger://digest/last-7-days",
          "life-ledger://on-this-day",
        ]);

        const settings = await client.readResource({
          uri: "life-ledger://settings",
        });
        const first = settings.contents[0];
        expect(first && "text" in first ? JSON.parse(first.text) : null).toEqual({
          ok: true,
          data: { timezone: "Asia/Tokyo" },
        });

        await client.readResource({ uri: "life-ledger://media/in-progress" });
        expect(listMediaWorks).toHaveBeenCalledWith(
          expect.objectContaining({ watchStatus: "watching" }),
        );

        await client.readResource({ uri: "life-ledger://digest/last-7-days" });
        const range = getStats.mock.calls[0]?.[0] as
          | { from: string; to: string }
          | undefined;
        expect(
          range ? Date.parse(range.to) - Date.parse(range.from) : 0,
        ).toBe(7 * 86_400_000);

        const prompts = await client.listPrompts();
        expect(prompts.prompts.map((prompt) => prompt.name)).toEqual([
          "weekly_review",
          "monthly_recap",
        ]);
        const recap = await client.getPrompt({
          name: "monthly_recap",
          arguments: { month: "2026-08" },
        });
        const message = recap.messages[0]?.content;
        expect(message && "text" in message ? message.text : "").toContain(
          "2026-08",
        );
      },
    );
  });

  it("单次影视日志调用会把电影或电视剧分类透传到 Core", async () => {
    const logMedia = vi.fn(
      async (
        _input: Parameters<McpCoreBinding["logMedia"]>[0],
      ): Promise<never> => {
        throw new Error("LOG_CAPTURED");
      },
    );

    await withClient(createCore({ logMedia }), async (client) => {
      await client.callTool({
        name: "log_media",
        arguments: {
          rawText: "看完《沙丘2》，记为电影。",
          mediaType: "screen",
          mediaKind: "movie",
          title: "沙丘2",
          ratingScope: "work",
          score: 8.8,
          occurredAt: "2026-07-26T20:00:00+09:00",
          timezone: "Asia/Tokyo",
          sourceChannel: "mcp",
          idempotencyKey: "mcp-screen-movie-001",
          mood: "[流泪]",
        },
      });
    });

    expect(logMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: "screen",
        mediaKind: "movie",
        title: "沙丘2",
        mood: "😢",
        source: {
          channel: "mcp",
          messageId: "mcp-screen-movie-001",
          conversationId: null,
        },
      }),
    );
  });

  it("年度回顾返回精简结构，设置支持只改一个字段", async () => {
    const getYearReview = vi.fn(async () => ({
      year: 2026,
      timezone: "Asia/Tokyo",
      years: [2026],
      entries: { total: 3, activeDays: 2, longestStreak: 2, byType: [], byMonth: [] },
      moods: { counts: [{ key: "😌", count: 2 }], days: [{ date: "2026-01-01", mood: "😌" }] },
      days: [{ date: "2026-01-01", count: 1 }],
      topTags: [],
      firstEntry: null,
      works: [],
      books: [{ id: "book_1", title: "三体", creator: "刘慈欣", rating: 9, finishedOn: "2026-09-01", excerpts: [{}] }],
      music: [],
      places: [],
    }) as never);
    const getSettings = vi.fn(async () => ({
      timezone: "Asia/Tokyo",
      captureMode: "safe",
      publicPreview: true,
      sensitiveWarning: true,
      weeklyReview: false,
      retentionDaily: 30,
      retentionWeekly: 12,
    }) as never);
    const updateSettings = vi.fn(async (value: unknown) => value as never);
    await withClient(createCore({ getYearReview, getSettings, updateSettings }), async (client) => {
      const review = await client.callTool({ name: "get_year_review", arguments: { year: 2026 } });
      const data = JSON.parse(responseText(review)).data;
      expect(data.moods).toEqual([{ key: "😌", count: 2 }]);
      expect(data).not.toHaveProperty("days");
      expect(data.books).toEqual([
        { id: "book_1", title: "三体", creator: "刘慈欣", rating: 9, finishedOn: "2026-09-01", excerpts: 1 },
      ]);
      await client.callTool({ name: "settings", arguments: {} });
      await client.callTool({ name: "settings", arguments: { timezone: "Asia/Shanghai" } });
    });
    expect(getYearReview).toHaveBeenCalledWith(2026);
    expect(updateSettings).toHaveBeenCalledOnce();
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "Asia/Shanghai", retentionDaily: 30 }),
    );
  });

  it("通过 MCP 上传照片/视频并把 mediaId 挂到动态上", async () => {
    const uploadEntryMedia = vi.fn(async () => ({
      id: "media_abc_0123abcd",
      kind: "image" as const,
      mimeType: "image/jpeg" as const,
      url: "/media/entry-media/0b8f6a2e-5c1d-4f7a-9e3b-2d6c8a1f4e70.jpg",
      sizeBytes: 4,
      width: null,
      height: null,
      durationMs: null,
      createdAt: "2026-09-24T03:00:00.000Z",
    }));
    const createEntryMediaUpload = vi.fn(async () => ({
      mediaId: "media_def_4567cdef",
      uploadUrl: "https://ledger.example.test/upload/entry-media/token",
      method: "PUT" as const,
      headers: { "Content-Type": "video/mp4" as const },
      maxBytes: 95 * 1024 * 1024,
      expiresAt: "2026-09-24T03:30:00.000Z",
      curlExample: "curl -X PUT ...",
    }));
    const captureEntry = vi.fn(async (): Promise<never> => {
      throw new Error("CAPTURE_STOP");
    });
    const attachEntryMedia = vi.fn(async (): Promise<never> => {
      throw new Error("ATTACH_STOP");
    });
    const removeEntryMediaById = vi.fn(async (): Promise<never> => {
      throw new Error("REMOVE_STOP");
    });

    await withClient(
      createCore({ uploadEntryMedia, createEntryMediaUpload, captureEntry, attachEntryMedia, removeEntryMediaById }),
      async (client) => {
        const upload = await client.callTool({
          name: "upload_photo",
          arguments: { fileName: "IMG_0001.jpg", mimeType: "image/jpeg", base64Data: "/9j/4A==" },
        });
        expect(JSON.parse(responseText(upload)).data).toEqual({
          mediaId: "media_abc_0123abcd",
          url: "/media/entry-media/0b8f6a2e-5c1d-4f7a-9e3b-2d6c8a1f4e70.jpg",
          kind: "image",
        });
        const ticket = await client.callTool({
          name: "create_upload_url",
          arguments: { mimeType: "video/mp4", sizeBytes: 30_000_000 },
        });
        expect(JSON.parse(responseText(ticket)).data.uploadUrl).toContain("/upload/entry-media/");
        await client.callTool({
          name: "capture_entry",
          arguments: {
            rawText: "周末去海边，拍了照片和一段视频。",
            sourceChannel: "wechat",
            idempotencyKey: "wx-media-001",
            mediaIds: ["media_abc_0123abcd", "media_def_4567cdef"],
          },
        });
        await client.callTool({
          name: "attach_media",
          arguments: { entryId: "ent_1", mediaIds: ["media_abc_0123abcd"] },
        });
        await client.callTool({
          name: "delete_item",
          arguments: { id: "media_abc_0123abcd", confirm: true },
        });
      },
    );

    expect(uploadEntryMedia).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: "IMG_0001.jpg", mimeType: "image/jpeg" }),
    );
    expect(createEntryMediaUpload).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "video/mp4", sizeBytes: 30_000_000 }),
    );
    expect(captureEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaIds: ["media_abc_0123abcd", "media_def_4567cdef"],
        source: { channel: "wechat", messageId: "wx-media-001", conversationId: null },
      }),
    );
    expect(attachEntryMedia).toHaveBeenCalledWith("ent_1", ["media_abc_0123abcd"]);
    expect(removeEntryMediaById).toHaveBeenCalledWith("media_abc_0123abcd");
  });

  it("save_game 新建时补默认值，修改时自动补 versionNo", async () => {
    const createGameLibraryItem = vi.fn(async () => ({ id: "game_1", versionNo: 1 }) as never);
    const getGameLibraryItem = vi.fn(async () => ({ id: "game_ps_001", versionNo: 4 }) as never);
    const updateGameLibraryItem = vi.fn(async () => ({ id: "game_ps_001", versionNo: 5 }) as never);
    await withClient(
      createCore({ createGameLibraryItem, getGameLibraryItem, updateGameLibraryItem }),
      async (client) => {
        await client.callTool({
          name: "save_game",
          arguments: { title: "测试游戏", platform: "PS5", rating: 8.5 },
        });
        await client.callTool({
          name: "save_game",
          arguments: { id: "game_ps_001", playTime: "20h", progress: 50 },
        });
      },
    );
    expect(createGameLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "PS5",
        title: "测试游戏",
        playTime: "0h",
        progress: 0,
        coverUrl: "",
        trophies: { platinum: 0, gold: 0, silver: 0, bronze: 0 },
      }),
    );
    expect(updateGameLibraryItem).toHaveBeenCalledWith("game_ps_001", {
      versionNo: 4,
      playTime: "20h",
      progress: 50,
    });
  });

  it("封面上传返回公开 URL，再交给作品修改工具", async () => {
    const base64Data =
      "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==";
    const publicUrl =
      `https://ledger.example.test/public-media/other-images/unassigned/${"a".repeat(64)}.webp`;
    const uploadMediaImage = vi.fn(async () => ({
      objectKey: `other-images/unassigned/${"a".repeat(64)}.webp`,
      publicUrl,
      mimeType: "image/webp" as const,
      sizeBytes: 46,
      width: 1,
      height: 1,
      sha256: "a".repeat(64),
      etag: "etag-test",
      createdAt: "2026-07-26T00:00:00.000Z",
    }));
    const updateMediaWork = vi.fn(async () => ({ id: "work_001", coverUrl: publicUrl }) as never);

    await withClient(createCore({ uploadMediaImage, updateMediaWork }), async (client) => {
      const uploadResult = await client.callTool({
        name: "upload_photo",
        arguments: { fileName: "cover.webp", mimeType: "image/webp", base64Data, purpose: "cover" },
      });
      expect(JSON.parse(responseText(uploadResult)).data).toEqual({ url: publicUrl, width: 1, height: 1 });
      const gif = await client.callTool({
        name: "upload_photo",
        arguments: { mimeType: "image/gif", base64Data, purpose: "cover" },
      });
      expect(JSON.parse(responseText(gif)).error.code).toBe("UNSUPPORTED_COVER");
      await client.callTool({
        name: "save_media_work",
        arguments: { id: "work_001", coverUrl: publicUrl },
      });
    });

    expect(uploadMediaImage).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "cover.webp",
        mimeType: "image/webp",
        base64Data,
        purpose: "other",
        idempotencyKey: expect.stringMatching(/^cover:[0-9a-f]{40}$/u),
      }),
    );
    expect(updateMediaWork).toHaveBeenCalledWith("work_001", { coverUrl: publicUrl });
  });
});

describe("Life Ledger MCP 双栈认证", () => {
  const exactAllowlist =
    "96.9.210.39,2402:a7c0:8100:a017::1c5:a";

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("允许配置中的精确 IPv4", async () => {
    const result = await authorizeRequest(
      new Request("https://ledger.example/mcp", {
        headers: { "cf-connecting-ip": "96.9.210.39" },
      }),
      { AGENT_IP_ALLOWLIST: exactAllowlist },
    );
    expect(result).toEqual({ authorized: true, method: "agent_ip" });
  });

  it("允许等价写法的精确 IPv6", async () => {
    const result = await authorizeRequest(
      new Request("https://ledger.example/mcp", {
        headers: {
          "cf-connecting-ip":
            "2402:A7C0:8100:A017:0000:0000:01C5:000A",
        },
      }),
      { AGENT_IP_ALLOWLIST: exactAllowlist },
    );
    expect(result).toEqual({ authorized: true, method: "agent_ip" });
  });

  it("在 Pseudo IPv4 覆盖时检查 Cloudflare 保留的真实 IPv6", async () => {
    const result = await authorizeRequest(
      new Request("https://ledger.example/mcp", {
        headers: {
          "cf-connecting-ip": "240.0.0.42",
          "cf-connecting-ipv6": "2402:a7c0:8100:a017::1c5:a",
        },
      }),
      { AGENT_IP_ALLOWLIST: exactAllowlist },
    );
    expect(result).toEqual({ authorized: true, method: "agent_ip" });
  });

  it("支持可选 IPv6 /64 规则，但生产精确规则不会放宽整段", async () => {
    expect(
      isAllowlistedAgentIp(
        "2402:a7c0:8100:a017:1234:5678:9abc:def0",
        "2402:a7c0:8100:a017::/64",
      ),
    ).toBe(true);
    expect(
      isAllowlistedAgentIp(
        "2402:a7c0:8100:a018::1",
        "2402:a7c0:8100:a017::/64",
      ),
    ).toBe(false);
    expect(
      isAllowlistedAgentIp(
        "2402:a7c0:8100:a017::99",
        exactAllowlist,
      ),
    ).toBe(false);
  });

  it("忽略伪造的 X-Forwarded-For 与 X-Real-IP", async () => {
    const result = await authorizeRequest(
      new Request("https://ledger.example/mcp", {
        headers: {
          "cf-connecting-ip": "203.0.113.9",
          "x-forwarded-for": "96.9.210.39",
          "x-real-ip": "2402:a7c0:8100:a017::1c5:a",
        },
      }),
      { AGENT_IP_ALLOWLIST: exactAllowlist },
    );
    expect(result.authorized).toBe(false);
  });

  it("未授权请求无法抵达任何上传工具", async () => {
    const response = await handleRequest(
      new Request("https://ledger.example/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "upload_photo",
            arguments: {},
          },
        }),
      }),
      {
        AGENT_IP_ALLOWLIST:
          "96.9.210.39,2402:a7c0:8100:a017::1c5:a",
        CORE: createCore(),
        ENVIRONMENT: "test",
      },
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "ACCESS_DENIED" },
    });
  });

  it("验证合法 Cloudflare Access JWT 后放行", async () => {
    const issuer = "https://unit-test.cloudflareaccess.com";
    const audience = "life-ledger-test-aud";
    const { publicKey, privateKey } = await generateKeyPair("RS256", {
      extractable: true,
    });
    const jwk = await exportJWK(publicKey);
    Object.assign(jwk, {
      alg: "RS256",
      kid: "test-key",
      use: "sig",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ keys: [jwk] })),
    );
    const token = await new SignJWT({ email: "owner@example.test" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    const result = await authorizeRequest(
      new Request("https://ledger.example/mcp", {
        headers: { "cf-access-jwt-assertion": token },
      }),
      {
        AGENT_IP_ALLOWLIST: exactAllowlist,
        TEAM_DOMAIN: issuer,
        POLICY_AUD: audience,
      },
    );
    expect(result).toEqual({
      authorized: true,
      method: "access_jwt",
    });
  });
});
