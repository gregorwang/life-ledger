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

共 23 个工具（0.5.0 起从 53 个合并而来，名字和说明都是中文）。设计目标是让
能力一般的模型也能选对：每个库一个 `save_*`（不传 id 新建、传 id 修改），
一个全局搜索，一个按 id 查看，一个按 id 删除 / 恢复。`versionNo` 和幂等键都
可以不传，由服务端补上。

| 场景 | 工具 |
| --- | --- |
| 记一句话、想法、心情、照片 | `capture_entry`（`mood` 传表情，`aboutId` 关联书/歌/地点/游戏） |
| 看番、看剧、看电影 | `log_media`（作品不存在自动创建） |
| 书、专辑、单曲、歌单 | `save_shelf_item`（`addExcerpt` 追加摘抄/歌词） |
| 去过的地方 | `save_place` |
| 游戏 | `save_game` |
| 作品封面、观看状态、总评分 | `save_media_work` |
| 给动态补一句 / 改原文 | `add_follow_up` / `update_entry` |
| 照片、视频 | `upload_photo`（≤ 10 MB，`purpose=post` 或 `cover`）/ `create_upload_url`（大文件）/ `attach_media` |
| 找东西、查重 | `search_all`（动态、书、音乐、地点、游戏、番剧、影视一起搜） |
| 按时间翻动态 | `search_entries` |
| 看完整内容 | `get_item`（按 id 前缀自动判断；书/地点/游戏会带上相关动态） |
| 回顾 | `get_stats`、`get_year_review`、`on_this_day`、`list_tags` |
| 删除 / 恢复 | `delete_item`（必须 `confirm=true`）/ `restore_item` |
| 公开 | `publish_entry`（第一次拿预览和确认码，用户同意后带上确认码再调一次）/ `unpublish_entry` |
| 设置 | `settings`（不传参数就是读取，传哪个字段改哪个） |

`save_shelf_item`、`save_place`、`save_game` 都支持 `postToFeed`：同时在「日常」
发一条仅自己可见的动态并关联到这个条目，网页上显示成带封面的卡片，条目详情里
也能看到所有相关动态。重复调用同一段 `postToFeed` 不会重复发。

`capture_entry` 不传 `idempotencyKey` 时，同一天完全相同的原文只会记一次。

id 前缀：`ent_` 动态、`book_` 书、`music_` 音乐、`place_` 地点、`game_` 游戏、
`work_` 番剧/影视、`followup_` 补充、`media_` 照片视频。

永久删除、导入、导出和作品季度管理只在网页里做，不再暴露给 Agent。

## 资源与提示词

只读资源（`resources/list`），便于 Agent 开场即获得上下文：

- `life-ledger://settings`：个人设置与时区
- `life-ledger://tags`：标签词表（写入前复用，避免同义标签分裂）
- `life-ledger://media/in-progress`：观看状态为 `watching` 的作品
- `life-ledger://digest/last-7-days`：最近 7 天统计
- `life-ledger://on-this-day`：那年今日

提示词（`prompts/list`）：`weekly_review` 与 `monthly_recap`（可选参数
`month=YYYY-MM`），只引导调用只读工具生成私人回顾，包括读了、听了、去了什么。

服务端还带一段 `instructions`（选工具的速查表），支持的客户端会自动放进系统提示。

## 表情与心情

正文、补充、标签和评价都是 UTF-8 原样保存，emoji（包括 👨‍👩‍👧 这类组合表情）
不会被过滤或转码。上限按 JavaScript 字符串长度计算：正文与补充 50,000，
标签 80；一个 emoji 通常占 2 个长度单位，组合表情会更多。

记心情时给 `capture_entry` 传 `mood`（一个表情，≤ 16 个长度单位），例如
`"mood": "😌"`。`type` 省略时会自动记为 `mood`，网页在这条动态的名字旁显示
「😌 平静」。它以 `mood:😌` 标签的形式存储，所以 `update_entry` 改 `tags`
也能换心情；网页也可以直接点动态上的心情重新选择。

## 给动态附照片和视频

网页「日常」里的每条动态最多 9 个照片/视频。Agent 先上传拿到
`mediaId`，再把它放进 `capture_entry` / `log_media` 的 `mediaIds`：

1. **小照片（解码后 ≤ 10 MB）**：`upload_photo`，传 `mimeType`、不带
   `data:` 前缀的 `base64Data`，可选 `fileName`、`width`/`height`。直接返回
   `{ mediaId, url, kind }`。
2. **视频或大文件（视频 ≤ 95 MB，照片 ≤ 20 MB）**：`create_upload_url`
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
   用 `attach_media` 把照片追加到那条记录上。

支持 JPEG、PNG、WebP、GIF、MP4、MOV、WebM；服务端会核对文件头，内容与
`mimeType` 不符会被拒绝。照片和视频都是私密的，只能在登录后的网页里看到，
公开接口不会输出它们。作品封面这类公开图片用 `upload_photo` 的 `purpose=cover`。

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
