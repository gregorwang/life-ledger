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
  return {
    health: failUnexpectedCall,
    listEntries: failUnexpectedCall,
    getEntry: failUnexpectedCall,
    captureEntry: failUnexpectedCall,
    updateEntry: failUnexpectedCall,
    deleteEntry: failUnexpectedCall,
    restoreEntry: failUnexpectedCall,
    purgeEntry: failUnexpectedCall,
    listMediaWorks: failUnexpectedCall,
    getMediaWork: failUnexpectedCall,
    createMediaWork: failUnexpectedCall,
    updateMediaWork: failUnexpectedCall,
    uploadMediaImage: failUnexpectedCall,
    listGameLibrary: failUnexpectedCall,
    createGameLibraryItem: failUnexpectedCall,
    updateGameLibraryItem: failUnexpectedCall,
    deleteGameLibraryItem: failUnexpectedCall,
    restoreGameLibraryItem: failUnexpectedCall,
    listShelfItems: failUnexpectedCall,
    createShelfItem: failUnexpectedCall,
    updateShelfItem: failUnexpectedCall,
    addShelfExcerpt: failUnexpectedCall,
    deleteShelfItem: failUnexpectedCall,
    restoreShelfItem: failUnexpectedCall,
    listPlaces: failUnexpectedCall,
    createPlace: failUnexpectedCall,
    updatePlace: failUnexpectedCall,
    deletePlace: failUnexpectedCall,
    restorePlace: failUnexpectedCall,
    listSeasons: failUnexpectedCall,
    createSeason: failUnexpectedCall,
    updateSeason: failUnexpectedCall,
    logMedia: failUnexpectedCall,
    preparePublish: failUnexpectedCall,
    confirmAction: failUnexpectedCall,
    unpublishEntry: failUnexpectedCall,
    addEntryFollowUp: failUnexpectedCall,
    deleteEntryFollowUp: failUnexpectedCall,
    uploadEntryMedia: failUnexpectedCall,
    createEntryMediaUpload: failUnexpectedCall,
    attachEntryMedia: failUnexpectedCall,
    deleteEntryMedia: failUnexpectedCall,
    createImportDryRun: failUnexpectedCall,
    commitImport: failUnexpectedCall,
    createExport: failUnexpectedCall,
    listExports: failUnexpectedCall,
    verifyExport: failUnexpectedCall,
    getStats: failUnexpectedCall,
    listTags: failUnexpectedCall,
    getOnThisDay: failUnexpectedCall,
    getSettings: failUnexpectedCall,
    updateSettings: failUnexpectedCall,
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
  "health",
  "get_entry",
  "search_entries",
  "get_recent_entries",
  "get_stats",
  "list_tags",
  "on_this_day",
  "capture_entry",
  "update_entry",
  "delete_entry",
  "restore_entry",
  "purge_entry",
  "list_media_works",
  "get_media_work",
  "list_game_library",
  "create_game_library_item",
  "update_game_library_item",
  "delete_game_library_item",
  "restore_game_library_item",
  "list_shelf_items",
  "create_shelf_item",
  "update_shelf_item",
  "add_shelf_excerpt",
  "delete_shelf_item",
  "restore_shelf_item",
  "list_places",
  "create_place",
  "update_place",
  "delete_place",
  "restore_place",
  "create_media_work",
  "update_media_work",
  "upload_media_image",
  "list_seasons",
  "create_season",
  "update_season",
  "log_media",
  "prepare_publish",
  "confirm_action",
  "unpublish_entry",
  "upload_entry_media",
  "create_entry_media_upload",
  "attach_entry_media",
  "remove_entry_media",
  "add_entry_follow_up",
  "delete_entry_follow_up",
  "import_dry_run",
  "import_commit",
  "export_create",
  "export_list",
  "export_verify",
  "settings_get",
  "settings_update",
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

      const required = (name: string) =>
        response.tools.find((tool) => tool.name === name)?.inputSchema
          .required;
      expect(required("capture_entry")).toEqual(
        expect.arrayContaining(["sourceChannel", "idempotencyKey"]),
      );
      expect(required("log_media")).toEqual(
        expect.arrayContaining(["sourceChannel", "idempotencyKey"]),
      );
      expect(required("upload_media_image")).toEqual(
        expect.arrayContaining([
          "fileName",
          "mimeType",
          "base64Data",
          "idempotencyKey",
        ]),
      );
      const uploadSchema = response.tools.find(
        (tool) => tool.name === "upload_media_image",
      )?.inputSchema;
      expect(uploadSchema?.additionalProperties).toBe(false);
      expect(
        (
          uploadSchema?.properties?.mimeType as {
            enum?: string[];
          }
        ).enum,
      ).toEqual(["image/webp", "image/jpeg", "image/png"]);
      expect(required("delete_entry")).toContain("confirmMoveToTrash");
      expect(required("purge_entry")).toEqual(
        expect.arrayContaining([
          "confirmationEntryId",
          "confirmPermanentDelete",
        ]),
      );
      expect(required("import_commit")).toContain("confirmCommit");
      expect(required("remove_entry_media")).toContain("confirmRemove");
      expect(required("delete_entry_follow_up")).toContain("confirmDelete");
      expect(required("upload_entry_media")).toEqual(
        expect.arrayContaining(["fileName", "mimeType", "base64Data"]),
      );
      expect(required("create_entry_media_upload")).toContain("mimeType");
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

  it("书架工具把书和摘抄交给 Core，并拒绝不属于该类型的格式", async () => {
    const createShelfItem = vi.fn(async (input: unknown) => ({ id: "book_1", ...(input as object) }) as never);
    const addShelfExcerpt = vi.fn(async () => ({ id: "book_1" }) as never);
    await withClient(createCore({ createShelfItem, addShelfExcerpt }), async (client) => {
      await client.callTool({
        name: "create_shelf_item",
        arguments: {
          kind: "book",
          title: "三体",
          creator: "刘慈欣",
          format: "paper",
          rating: 9.5,
          finishedOn: "2026-09-01",
        },
      });
      expect(createShelfItem).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "book",
          title: "三体",
          shelfStatus: "done",
          excerpts: [],
        }),
      );

      const rejected = await client.callTool({
        name: "create_shelf_item",
        arguments: { kind: "music", title: "晴天", format: "paper" },
      });
      expect("isError" in rejected && rejected.isError).toBe(true);
      expect(createShelfItem).toHaveBeenCalledOnce();

      await client.callTool({
        name: "add_shelf_excerpt",
        arguments: {
          shelfItemId: "book_1",
          versionNo: 2,
          excerpt: { text: "弱小和无知不是生存的障碍，傲慢才是。", location: "p.120" },
        },
      });
      expect(addShelfExcerpt).toHaveBeenCalledWith("book_1", {
        versionNo: 2,
        excerpt: {
          text: "弱小和无知不是生存的障碍，傲慢才是。",
          location: "p.120",
          note: null,
        },
      });
    });
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
        name: "get_recent_entries",
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
        },
      });
    });

    expect(logMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: "screen",
        mediaKind: "movie",
        title: "沙丘2",
        source: {
          channel: "mcp",
          messageId: "mcp-screen-movie-001",
          conversationId: null,
        },
      }),
    );
  });

  it("正确路由媒体、季度、导入、导出与设置操作", async () => {
    const listMediaWorks = vi.fn(async () => []);
    const listGameLibrary = vi.fn(async () => []);
    const createSeason = vi.fn(
      async (): Promise<never> => {
        throw new Error("SEASON_STOP");
      },
    );
    const commitImport = vi.fn(
      async (): Promise<never> => {
        throw new Error("IMPORT_STOP");
      },
    );
    const verifyExport = vi.fn(
      async (): Promise<never> => {
        throw new Error("VERIFY_STOP");
      },
    );
    const getSettings = vi.fn(
      async (): Promise<never> => {
        throw new Error("SETTINGS_STOP");
      },
    );

    await withClient(
      createCore({
        listMediaWorks,
        listGameLibrary,
        createSeason,
        commitImport,
        verifyExport,
        getSettings,
      }),
      async (client) => {
        await client.callTool({
          name: "list_media_works",
          arguments: {
            mediaType: "screen",
            query: "攻壳",
            watchStatus: "watching",
            limit: 12,
          },
        });
        await client.callTool({
          name: "list_game_library",
          arguments: {},
        });
        await client.callTool({
          name: "create_season",
          arguments: {
            mediaWorkId: "work_001",
            label: "SAC",
            seasonNumber: 1,
            title: "Stand Alone Complex",
            watchStatus: "watching",
          },
        });
        await client.callTool({
          name: "import_commit",
          arguments: {
            batchId: "import_001",
            confirmCommit: true,
          },
        });
        await client.callTool({
          name: "export_verify",
          arguments: { exportId: "export_001" },
        });
        await client.callTool({
          name: "settings_get",
          arguments: {},
        });
      },
    );

    expect(listMediaWorks).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaType: "screen",
        query: "攻壳",
        watchStatus: "watching",
        limit: 12,
      }),
    );
    expect(listGameLibrary).toHaveBeenCalledOnce();
    expect(createSeason).toHaveBeenCalledWith(
      "work_001",
      expect.objectContaining({
        label: "SAC",
        seasonNumber: 1,
      }),
    );
    expect(commitImport).toHaveBeenCalledWith("import_001");
    expect(verifyExport).toHaveBeenCalledWith("export_001");
    expect(getSettings).toHaveBeenCalledOnce();
  });

  it("通过 MCP 上传照片/视频并把 mediaId 挂到动态上", async () => {
    const uploadedMedia = {
      id: "media_abc_0123abcd",
      kind: "image" as const,
      mimeType: "image/jpeg" as const,
      url: "/media/entry-media/0b8f6a2e-5c1d-4f7a-9e3b-2d6c8a1f4e70.jpg",
      sizeBytes: 4,
      width: null,
      height: null,
      durationMs: null,
      createdAt: "2026-09-24T03:00:00.000Z",
    };
    const uploadEntryMedia = vi.fn(async () => uploadedMedia);
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
    const deleteEntryMedia = vi.fn(async (): Promise<never> => {
      throw new Error("REMOVE_STOP");
    });
    const deleteEntryFollowUp = vi.fn(async (): Promise<never> => {
      throw new Error("FOLLOW_UP_STOP");
    });

    await withClient(
      createCore({
        uploadEntryMedia,
        createEntryMediaUpload,
        captureEntry,
        attachEntryMedia,
        deleteEntryMedia,
        deleteEntryFollowUp,
      }),
      async (client) => {
        const upload = await client.callTool({
          name: "upload_entry_media",
          arguments: {
            fileName: "IMG_0001.jpg",
            mimeType: "image/jpeg",
            base64Data: "/9j/4A==",
          },
        });
        expect(JSON.parse(responseText(upload))).toEqual({
          ok: true,
          data: uploadedMedia,
        });

        const ticket = await client.callTool({
          name: "create_entry_media_upload",
          arguments: { mimeType: "video/mp4", sizeBytes: 30_000_000 },
        });
        expect(JSON.parse(responseText(ticket)).data.uploadUrl).toContain(
          "/upload/entry-media/",
        );

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
          name: "attach_entry_media",
          arguments: { entryId: "ent_1", mediaIds: ["media_abc_0123abcd"] },
        });
        const refused = await client.callTool({
          name: "remove_entry_media",
          arguments: { entryId: "ent_1", mediaId: "media_abc_0123abcd" },
        });
        expect("isError" in refused && refused.isError).toBe(true);
        await client.callTool({
          name: "remove_entry_media",
          arguments: {
            entryId: "ent_1",
            mediaId: "media_abc_0123abcd",
            confirmRemove: true,
          },
        });
        await client.callTool({
          name: "delete_entry_follow_up",
          arguments: {
            entryId: "ent_1",
            followUpId: "followup_1",
            confirmDelete: true,
          },
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
      }),
    );
    expect(attachEntryMedia).toHaveBeenCalledWith("ent_1", ["media_abc_0123abcd"]);
    expect(deleteEntryMedia).toHaveBeenCalledOnce();
    expect(deleteEntryMedia).toHaveBeenCalledWith("ent_1", "media_abc_0123abcd");
    expect(deleteEntryFollowUp).toHaveBeenCalledWith("ent_1", "followup_1");
  });

  it("通过专用工具创建、更新、删除和恢复 PlayStation 游戏", async () => {
    const createGameLibraryItem = vi.fn(
      async (): Promise<never> => {
        throw new Error("CREATE_GAME_STOP");
      },
    );
    const updateGameLibraryItem = vi.fn(
      async (): Promise<never> => {
        throw new Error("UPDATE_GAME_STOP");
      },
    );
    const deleteGameLibraryItem = vi.fn(
      async (): Promise<never> => {
        throw new Error("DELETE_GAME_STOP");
      },
    );
    const restoreGameLibraryItem = vi.fn(
      async (): Promise<never> => {
        throw new Error("RESTORE_GAME_STOP");
      },
    );

    await withClient(
      createCore({
        createGameLibraryItem,
        updateGameLibraryItem,
        deleteGameLibraryItem,
        restoreGameLibraryItem,
      }),
      async (client) => {
        await client.callTool({
          name: "create_game_library_item",
          arguments: {
            platform: "PS5",
            title: "测试游戏",
            playTime: "12h",
            progress: 30,
            trophies: { platinum: 0, gold: 1, silver: 2, bronze: 3 },
            achievementsCurrent: 6,
            achievementsTotal: 20,
            rating: 8.5,
            review: "中文评价",
            tags: ["RPG"],
            coverUrl: "/cover.webp",
            sourceUrl: "https://example.com/game",
          },
        });
        await client.callTool({
          name: "update_game_library_item",
          arguments: {
            gameLibraryItemId: "game_ps_001",
            versionNo: 4,
            playTime: "20h",
            progress: 50,
          },
        });
        await client.callTool({
          name: "delete_game_library_item",
          arguments: {
            gameLibraryItemId: "game_ps_001",
            versionNo: 5,
            confirm: true,
          },
        });
        await client.callTool({
          name: "restore_game_library_item",
          arguments: {
            gameLibraryItemId: "game_ps_001",
            versionNo: 6,
            confirm: true,
          },
        });
      },
    );

    expect(createGameLibraryItem).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "PS5", title: "测试游戏" }),
    );
    expect(updateGameLibraryItem).toHaveBeenCalledWith(
      "game_ps_001",
      expect.objectContaining({ versionNo: 4, playTime: "20h" }),
    );
    expect(deleteGameLibraryItem).toHaveBeenCalledWith("game_ps_001", 5);
    expect(restoreGameLibraryItem).toHaveBeenCalledWith("game_ps_001", 6);
  });

  it("通过真实 MCP 客户端上传图片，并把公开 URL 传给作品更新工具", async () => {
    const base64Data =
      "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==";
    const publicUrl =
      `https://ledger.example.test/public-media/media-covers/work_001/${"a".repeat(64)}.webp`;
    const uploadMediaImage = vi.fn(async () => ({
      objectKey: `media-covers/work_001/${"a".repeat(64)}.webp`,
      publicUrl,
      mimeType: "image/webp" as const,
      sizeBytes: 46,
      width: 1,
      height: 1,
      sha256: "a".repeat(64),
      etag: "etag-test",
      createdAt: "2026-07-26T00:00:00.000Z",
    }));
    const updateMediaWork = vi.fn(async () => ({
      id: "work_001",
      mediaType: "anime" as const,
      mediaKind: null,
      title: "封面测试",
      aliases: [],
      coverUrl: publicUrl,
      watchStatus: "planned" as const,
      overallScore: null,
      seasonCount: 0,
      logCount: 0,
      publicLogCount: 0,
      lastLoggedAt: null,
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-26T00:00:00.000Z",
      seasons: [],
      logs: [],
    }));

    await withClient(
      createCore({ uploadMediaImage, updateMediaWork }),
      async (client) => {
        const uploadResult = await client.callTool({
          name: "upload_media_image",
          arguments: {
            fileName: "cover.webp",
            mimeType: "image/webp",
            base64Data,
            purpose: "media_cover",
            mediaWorkId: "work_001",
            idempotencyKey: "mcp-real-client-upload-001",
          },
        });
        expect(JSON.parse(responseText(uploadResult))).toMatchObject({
          ok: true,
          data: {
            publicUrl,
            sizeBytes: 46,
            width: 1,
            height: 1,
          },
        });

        const updateResult = await client.callTool({
          name: "update_media_work",
          arguments: {
            mediaWorkId: "work_001",
            coverUrl: publicUrl,
          },
        });
        expect(JSON.parse(responseText(updateResult))).toMatchObject({
          ok: true,
          data: { id: "work_001", coverUrl: publicUrl },
        });
      },
    );

    expect(uploadMediaImage).toHaveBeenCalledWith({
      fileName: "cover.webp",
      mimeType: "image/webp",
      base64Data,
      purpose: "media_cover",
      mediaWorkId: "work_001",
      idempotencyKey: "mcp-real-client-upload-001",
    });
    expect(updateMediaWork).toHaveBeenCalledWith(
      "work_001",
      { coverUrl: publicUrl },
    );
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
            name: "upload_media_image",
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
