# MCP 图片上传

> 0.5.0 起 Agent 通过 `upload_photo`（`purpose=cover`）调用这里描述的公开图片上传，
> 再用 `save_media_work` 写入 `coverUrl`；底层契约不变。

`upload_media_image` 接收 Agent 已压缩的位图，完成字节级校验、SHA-256
内容寻址、R2 去重和 D1 审计，并返回可直接写入 `coverUrl` 的公开 HTTPS
URL。上传本身不会修改作品。

生产 MCP：

```yaml
mcp_servers:
  life_ledger:
    url: "https://life-ledger-mcp.ishallnotwant123.workers.dev/mcp"
    enabled: true
    connect_timeout: 30
    timeout: 60
    supports_parallel_tool_calls: false
    tools:
      prompts: false
      resources: false
```

## 最终工具契约

输入：

```json
{
  "fileName": "cover.webp",
  "mimeType": "image/webp",
  "base64Data": "<不带 data URL 前缀的标准 Base64>",
  "purpose": "media_cover",
  "mediaWorkId": "work_xxx",
  "idempotencyKey": "agent-upload-20260726-001"
}
```

- `fileName`：1–160 字符；禁止 `..`、`/`、`\` 和控制字符。
- `mimeType`：`image/webp`、`image/jpeg`、`image/png`。
- `base64Data`：纯 Base64，最大解码后 1 MiB。
- `purpose`：`media_cover`、`entry_image`、`other`；默认
  `media_cover`。
- `mediaWorkId`：可选；用于路径组织和审计，不触发作品更新。
- `idempotencyKey`：1–256 字符；同键同请求返回同一结果，同键不同请求
  返回 `IDEMPOTENCY_CONFLICT`。
- schema 为 strict object，额外字段会被拒绝。

成功响应：

```json
{
  "ok": true,
  "data": {
    "objectKey": "media-covers/work_xxx/<sha256>.webp",
    "publicUrl": "https://life-ledger-web.ishallnotwant123.workers.dev/public-media/media-covers/work_xxx/<sha256>.webp",
    "mimeType": "image/webp",
    "sizeBytes": 76276,
    "width": 460,
    "height": 647,
    "sha256": "<64 位十六进制>",
    "etag": "<R2 ETag>",
    "createdAt": "<ISO 8601>"
  }
}
```

然后由 Agent 显式调用：

```json
{
  "mediaWorkId": "work_xxx",
  "coverUrl": "<upload_media_image 返回的 publicUrl>"
}
```

即 `update_media_work`。两步职责分离可避免普通上传静默修改作品。

## 安全边界

- 不接受 URL，不发起服务端远程抓取，因此没有 SSRF 入口。
- 扩展名不可信；服务端检查 Base64、magic bytes、MIME 与格式内尺寸。
- 最大宽高为 8192×8192，总像素上限 25,000,000。
- SVG、HTML、PDF、脚本和损坏的位图均在 R2 写入前拒绝。
- object key 只由固定命名空间、可选安全作品段、内容 SHA-256 和真实格式
  扩展名组成。
- `media_assets` 以 `(user_id, sha256)` 去重；`media_upload_requests` 保存
  每次幂等请求、用途、作品 ID 和来源。
- Base64 正文不会进入 D1、R2 metadata、审计或错误日志。
- MCP 写入口继续使用现有精确 IPv4/IPv6 白名单或 Cloudflare Access JWT
  鉴权。`/public-media/*` 只有 `GET`/`HEAD`，并且只允许内容寻址的三个图片
  命名空间。

## Cloudflare 配置

项目复用现有 `life-ledger-media` 桶和 `MEDIA` 命名：

```jsonc
{
  "vars": {
    "MEDIA_PUBLIC_BASE_URL": "https://life-ledger-web.ishallnotwant123.workers.dev/public-media"
  },
  "r2_buckets": [
    {
      "binding": "BACKUPS",
      "bucket_name": "life-ledger-backups"
    },
    {
      "binding": "MEDIA",
      "bucket_name": "life-ledger-media"
    }
  ]
}
```

`MEDIA_PUBLIC_BASE_URL` 是非密钥配置；不要放查询参数或凭据。生产必须使用
HTTPS。Web Worker 代理只公开上传命名空间，因此不需要把整个 R2 bucket
开放为 `r2.dev`。

如果以后为 R2 配置 Cloudflare 自定义域名，可把
`MEDIA_PUBLIC_BASE_URL` 改为该 HTTPS 根地址，同时让该域名只暴露受控图片
前缀。改配置后运行：

```bash
pnpm cf:types
```

本地开发可以继续使用生产格式的 HTTPS 测试基址；R2 与 D1 由 Wrangler
本地持久化模拟。不要提交 `.dev.vars` 或任何 Access 凭据。

## 迁移、验证和部署

```bash
pnpm db:migrate:local
pnpm typecheck
pnpm test
pnpm build

pnpm db:migrate:remote
pnpm deploy:core
pnpm deploy:web
pnpm deploy:mcp
```

迁移 `0007_media_image_uploads.sql` 新增：

- `media_assets`
- `media_upload_requests`

完整与增量导出均包含这两张表。部署顺序必须是 D1 → Core → Web → MCP，
避免新工具先于存储表或公开读取路由上线。

