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
    listCollectibles: failUnexpectedCall,
    listSeasons: failUnexpectedCall,
    createSeason: failUnexpectedCall,
    updateSeason: failUnexpectedCall,
    logMedia: failUnexpectedCall,
    preparePublish: failUnexpectedCall,
    confirmAction: failUnexpectedCall,
    unpublishEntry: failUnexpectedCall,
    createImportDryRun: failUnexpectedCall,
    commitImport: failUnexpectedCall,
    createExport: failUnexpectedCall,
    listExports: failUnexpectedCall,
    verifyExport: failUnexpectedCall,
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
  "list_collectibles",
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
    const listCollectibles = vi.fn(async () => []);
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
        listCollectibles,
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
          name: "list_collectibles",
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
    expect(listCollectibles).toHaveBeenCalledOnce();
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
