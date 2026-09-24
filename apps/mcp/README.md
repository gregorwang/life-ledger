# Life Ledger MCP

Life Ledger 的远程 MCP 入口。它使用 Cloudflare Workers 上的 Streamable
HTTP `/mcp` 端点，把 Agent 操作映射到私有 `life-ledger-core` Service
Binding；不会直接访问 D1，也不会返回 R2 对象键。

## 认证模型

任一条件成立即可访问：

1. `Cf-Access-Jwt-Assertion` 是合法的 Cloudflare Access 应用 JWT；
2. Cloudflare 边缘写入的客户端 IP 命中 `AGENT_IP_ALLOWLIST`。

Access JWT 会校验 RS256 签名、issuer 和应用 audience。需要配置：

- `TEAM_DOMAIN=https://<team>.cloudflareaccess.com`
- `POLICY_AUD=<Access Application AUD>`

IP 白名单支持 IPv4 / IPv6 精确地址，以及可选的 IPv6 `/64` CIDR。
生产配置刻意只放行两个精确地址：

- `96.9.210.39`
- `2402:a7c0:8100:a017::1c5:a`

代码优先检查 `CF-Connecting-IP`。若账户启用了 Pseudo IPv4 的
`Overwrite Headers`，再检查 Cloudflare 保留真实地址的
`CF-Connecting-IPv6`。`X-Forwarded-For` 和 `X-Real-IP` 永远不参与认证。

> IP 认证依赖请求直达 Cloudflare 边缘。不要把该 Worker 放在允许调用方
> 自行写入 `CF-Connecting-IP` 的同区 Worker 子请求之后。

## 工具面

共 42 个工具，`tools/list` 的标题和说明均为中文：

- 服务：`health`
- 记录：`get_entry`、`search_entries`、`get_recent_entries`、
  `capture_entry`、`update_entry`、`delete_entry`、`restore_entry`、
  `purge_entry`
- 媒体：`list_media_works`、`get_media_work`、`create_media_work`、
  `update_media_work`、`upload_media_image`、`list_seasons`、
  `create_season`、`update_season`、`log_media`
- PlayStation 游戏库：`list_game_library`、`create_game_library_item`、
  `update_game_library_item`、`delete_game_library_item`、
  `restore_game_library_item`
- 公开：`prepare_publish`、`confirm_action`、`unpublish_entry`
- 动态照片/视频：`upload_entry_media`、`create_entry_media_upload`、
  `attach_entry_media`、`remove_entry_media`
- 补充：`add_entry_follow_up`、`delete_entry_follow_up`
- 导入：`import_dry_run`、`import_commit`
- 导出：`export_create`、`export_list`、`export_verify`
- 设置：`settings_get`、`settings_update`
- 回顾（只读）：`get_stats`、`list_tags`、`on_this_day`

`search_entries` 与 `get_recent_entries` 支持 `occurredFrom`（含）/
`occurredTo`（不含）时间范围和 `tag` 精确标签筛选，可直接回答“上个月做了什么”。
`get_stats` 汇总 `[from, to)` 区间：总数、活跃天数、类型与可见性分布、
按天（≤62 天）或按月的时间分布、高频标签、媒体作品与评分排行，
日期按个人设置时区切分。

## 资源与提示词

只读资源（`resources/list`），便于 Agent 开场即获得上下文：

- `life-ledger://settings`：个人设置与时区
- `life-ledger://tags`：标签词表（写入前复用，避免同义标签分裂）
- `life-ledger://media/in-progress`：观看状态为 `watching` 的作品
- `life-ledger://digest/last-7-days`：最近 7 天统计
- `life-ledger://on-this-day`：那年今日

提示词（`prompts/list`）：`weekly_review` 与 `monthly_recap`（可选参数
`month=YYYY-MM`），只引导调用只读工具生成私人回顾。

危险操作有额外确认字段：

- 移入回收站：`confirmMoveToTrash=true`
- 永久删除：`confirmPermanentDelete=true`，且
  `confirmationEntryId === entryId`
- 提交导入：`confirmCommit=true`
- 游戏库软删除与恢复：`confirm=true`，并提供当前 `versionNo`
- 公开记录：必须先 `prepare_publish`，再提交短时确认码到
  `confirm_action`
- 移除动态里的照片/视频：`confirmRemove=true`（文件会从存储中删除）
- 删除补充：`confirmDelete=true`

## 给动态附照片和视频

网页「今日与时间线」里的每条动态最多 9 个照片/视频。Agent 先上传拿到
`mediaId`，再把它放进 `capture_entry` / `log_media` 的 `mediaIds`：

1. **小照片（解码后 ≤ 10 MB）**：`upload_entry_media`，传
   `fileName`、`mimeType`、不带 `data:` 前缀的 `base64Data`，可选
   `width`/`height`。直接返回 `{ id, url, ... }`，`id` 就是 `mediaId`。
2. **视频或大文件（视频 ≤ 95 MB，照片 ≤ 20 MB）**：`create_entry_media_upload`
   只传 `mimeType`（可选 `sizeBytes`、`width`、`height`、`durationMs`），
   返回 `mediaId`、30 分钟内有效且只能用一次的 `uploadUrl` 和 `curlExample`。
   用 PUT 上传原始字节，文件内容不经过对话上下文：

   ```bash
   curl -sS -X PUT -H 'Content-Type: video/mp4' --data-binary @clip.mp4 '<uploadUrl>'
   ```

   返回 201 后 `mediaId` 即可使用；同一地址再次 PUT 会得到 409，过期是 410，
   `Content-Type` 与申请时不一致是 415。
3. **发动态**：`capture_entry` / `log_media` 加上
   `"mediaIds": ["media_…", "media_…"]`（按顺序展示）。若文字已经先发了，
   用 `attach_entry_media` 把照片追加到那条记录上。

支持 JPEG、PNG、WebP、GIF、MP4、MOV、WebM；服务端会核对文件头，内容与
`mimeType` 不符会被拒绝。照片和视频都是私密的，只能在登录后的网页里看到，
公开接口不会输出它们。`upload_media_image` 仍只用于作品封面这类公开图片。

工具成功和失败都返回 JSON 文本。失败格式稳定为：

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "可读错误信息",
    "retryable": false
  }
}
```

## 本地验证

```powershell
pnpm --filter @life-ledger/mcp typecheck
pnpm --filter @life-ledger/mcp test
pnpm --filter @life-ledger/mcp exec wrangler deploy --dry-run
```

单元测试覆盖双栈精确地址、IPv6 `/64`、Pseudo IPv4 的 IPv6 回退、
伪造转发头、Access JWT 签名和完整工具清单。

Streamable HTTP 兼容性需在 workerd 中验证。启动时可临时覆盖本地白名单：

```powershell
pnpm --filter @life-ledger/mcp exec wrangler dev --local --port 8791 --var AGENT_IP_ALLOWLIST:127.0.0.1,::1
```

向 `/mcp` 发送 `initialize` 且
`params.protocolVersion="2024-11-05"`，应返回 HTTP 200，并在
`result.protocolVersion` 原样确认 `2024-11-05`。

参考：

- [Cloudflare MCP Streamable HTTP](https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/)
- [Cloudflare Access JWT 验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Cloudflare 客户端 IP 请求头](https://developers.cloudflare.com/fundamentals/reference/http-headers/#cf-connecting-ip)
