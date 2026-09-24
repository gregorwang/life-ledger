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

共 34 个工具，`tools/list` 的标题和说明均为中文：

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
- 补充：`add_entry_follow_up`
- 导入：`import_dry_run`、`import_commit`
- 导出：`export_create`、`export_list`、`export_verify`
- 设置：`settings_get`、`settings_update`

危险操作有额外确认字段：

- 移入回收站：`confirmMoveToTrash=true`
- 永久删除：`confirmPermanentDelete=true`，且
  `confirmationEntryId === entryId`
- 提交导入：`confirmCommit=true`
- 游戏库软删除与恢复：`confirm=true`，并提供当前 `versionNo`
- 公开记录：必须先 `prepare_publish`，再提交短时确认码到
  `confirm_action`

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
