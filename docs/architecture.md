# 架构与责任边界

## 部署单元

| 单元 | 公网 | 职责 | 数据权限 |
| --- | --- | --- | --- |
| `life-ledger-web` | 是；固定密码 + 签名会话保护管理路由 | React 静态资源、管理 REST API、公开只读 API、内容寻址图片 GET/HEAD、动态照片/视频上传与 Range 播放 | `CORE` RPC、媒体 R2（只写 `entry-media/` 前缀，其余只读） |
| `life-ledger-mcp` | 是；精确双栈 IP 白名单或 Access JWT | Streamable HTTP MCP、工具 schema、错误映射 | 只通过 `CORE` RPC |
| `life-ledger-core` | 否 | 领域规则、幂等、D1、修订、审计、公开投影、图片上传、导出与校验 | D1、备份 R2、媒体 R2、Workflow |

## 事实与投影

1. `entries.body_raw`、来源、时间、媒体日志、修订与审计构成不可丢失的事实层。
2. 作品标题、别名、评分范围和标签属于可人工修正的规范化层。
3. 摘要、统计、周报和未来 embedding 属于可重建派生层。
4. Public API 是字段白名单投影，不直接序列化数据库行。

## 状态机

```text
private ── prepare ──> publish_pending ── confirm ──> public
   ^          │                                  │
   └── cancel / timeout <──────────────── unpublish

active ── soft delete ──> deleted ── restore ──> active + private
```

发布扩大数据暴露面，必须双步骤确认；取消公开降低暴露面，可立即执行。

## 本地与生产差异

- 本地使用 Wrangler 的持久 D1 模拟器；schema 来自 `migrations/`，演示数据单独来自 `seed/dev.sql`。
- 生产已绑定 APAC D1 `life-ledger-prod`；新增环境时必须创建独立 D1 并替换对应 Wrangler 配置。
- 演示数据只在 Vite 开发模式启用；生产 API 不可用时明确报错，不显示伪造记录或伪造备份状态。
- `life-ledger-export` 每天 03:20 JST 生成增量 JSONL.gz；周日实例等待到 04:00 后生成完整 SQL.gz；月初同时生成含 SQL、JSONL、manifest 的 tar.gz。
- 产物写入 APAC 私有桶 `life-ledger-backups`。管理端下载与复核都通过已认证 Web Worker → Core RPC，不暴露 R2 对象键或公共桶。
- `exports` 保存实际行数、字节数、R2 key、SHA-256 和状态；复核结果另写 `audit_events`，不能仅凭界面文案认定备份健康。
- 动态里的照片和视频由已登录的 Web Worker 流式写入 `life-ledger-media/entry-media/{uuid}.{ext}`：
  上传前校验 MIME 白名单与 Content-Length（图片 ≤ 20 MB，视频 ≤ 95 MB，受 Worker
  请求体上限约束），写入后回读前 16 字节核对文件签名，不符即删除；随后由 Core
  登记 `entry_media` 元数据并在发布动态时挂到记录上。浏览器端会先把照片缩到长边
  2560px 的 JPEG（同时去掉 EXIF 定位）。这些对象只经需要会话的 `/media/entry-media/*`
  读取，支持 Range 以便视频拖动播放；永久清除记录时 Core 一并删除对象。
- MCP 有两条路：`upload_entry_media` 以 Base64（≤ 10 MB）交给 Core 校验后写入同一前缀；
  `create_entry_media_upload` 由 Core 签发 30 分钟、一次性的上传令牌（D1 只存哈希），
  Agent 用 `PUT /upload/entry-media/{token}` 直传 Web Worker，该路径不需要会话，
  令牌即凭证，领取后立即作废。
- 「补充」保存在 `entry_follow_ups`，原文不被改写；Web 与 MCP（`add_entry_follow_up`）都可追加。
- 图片经 MCP 鉴权后由 Core 校验并写入 `life-ledger-media`；Web 仅以
  `/public-media/{namespace}/{work}/{sha256}.{ext}` 公开读取受控命名空间，
  不开放任意 R2 key 或匿名写入。
