# Life Ledger

Life Ledger 是一个默认私有、保留原文、可修订、可撤回、可选择性公开的个人事件账本。首个完整场景是动漫观看记录：微信 / Hermes Agent 将自然语言转换为工具调用，Core Worker 负责幂等、业务规则、D1 写入、修订和审计，管理端用于快速校对，公开 API 只输出白名单字段。

## 当前交付

- React + Vite + Cloudflare Workers Static Assets 管理端
- 响应式「日常」动态（可自定义头像、背景、名字与签名，带表情与心情选择）、动漫库、游戏库、作品详情、记录详情、搜索、导入、导出、设置和回收站
- 私人 / 待确认 / 公开状态机，以及发布预览 + 文本确认
- 软删除、恢复为私人、永久清除文本确认
- D1 schema migration、独立开发 seed、Core WorkerEntrypoint RPC
- 无状态 Remote MCP Worker 与 42 个记录、动态照片/视频与补充、媒体、游戏库、检索、统计回顾、修订、上传、发布和导出工具，外加上下文资源与周/月回顾提示词
- 公开 `/public/v1/anime` 与 `/public/v1/timeline` 白名单投影
- 可直接移植到现有个人网站的 `@life-ledger/public-adapter`，远端异常或字段校验失败时回退静态数据
- Cloudflare Workflow 定时/手动导出、私有 R2 归档，以及内容寻址的 R2 图片上传与公开只读加载
- 严格 TypeScript 与领域 / 契约测试

当前版本已经完成 Cloudflare 生产部署。Web 管理端使用单用户固定密码和 12 小时签名会话，密码与会话密钥只存放在 Cloudflare Secrets；MCP 仍按独立 Cloudflare Access Service Token 设计，必须配置 `TEAM_DOMAIN` 与 `POLICY_AUD` 后才会开放。仓库不包含任何真实凭证。

## 架构

```text
React SPA + Web Worker ── Service Binding / RPC ── Core Worker ── D1
          │                                           │
          ├── /public/v1/*                            ├── private R2 backups
          └── /public-media/* ←── R2 media            ├── R2 media
                                                      └── Export Workflow

Hermes ── Streamable HTTP /mcp ── MCP Worker ── Service Binding / RPC ── Core
```

`life-ledger-core` 没有生产公网 route。Web 与 MCP 只通过 Service Binding 调用 Core；公开 API 由 Web Worker 组装白名单投影。

现有个人网站接入时使用 `packages/public-adapter`。适配器会严格校验
public v1 契约；网络失败、非 2xx 或响应夹带未声明字段时自动返回调用方提供的
静态数据，并标记 `degraded: true`，不会把新服务故障传导成主站白屏。

## 本地运行

需要 Node.js 22+ 与 pnpm。

```bash
pnpm install
pnpm db:prepare:dev
pnpm dev
```

先创建 `apps/web/.dev.vars`（此文件已被忽略，不要提交）：

```dotenv
ENVIRONMENT=development
AUTH_PASSWORD=仅用于本机的密码
AUTH_SESSION_SECRET=至少32字节的本机随机值
```

再打开 `http://127.0.0.1:5173`。Cloudflare Vite 插件会同时运行 Web Worker、React 客户端和辅助 Core Worker。

常用检查：

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Cloudflare 部署

当前生产资源：

- Web：`https://life-ledger-web.ishallnotwant123.workers.dev`
- Core：`life-ledger-core`，无公网 route
- D1：`life-ledger-prod`（APAC）
- R2：`life-ledger-backups`（私有备份）与 `life-ledger-media`（Worker 受控读取）
- Workflow：`life-ledger-export`（每天 03:20 JST；周日补完整 SQL，月初补长期归档）
- MCP：`life-ledger-mcp`，默认 fail-closed，使用 Hermes VPS 精确双栈 IP 白名单或 Cloudflare Access JWT

重新部署时先迁移 D1，再依次部署 Core、MCP、Web。`seed/dev.sql` 仅供本地演示，生产只应用 `migrations/`。

```bash
pnpm deploy:core
pnpm deploy:mcp
pnpm deploy:web
```

### 通过 Git 连接自动构建（Workers Builds）

这是 pnpm monorepo，仓库根目录没有 Wrangler 配置；在根目录执行
`npx wrangler deploy` 会报 “application detection logic has been run in the root of a
workspace”。每个 Worker 要在 Cloudflare 控制台 **Settings → Build** 里单独设置
**Root directory**，构建和部署命令保持默认即可：

| Worker | Root directory | Build command | Deploy command |
| --- | --- | --- | --- |
| `life-ledger-core` | `services/core` | `pnpm run build` | `npx wrangler d1 migrations apply life-ledger-prod --remote && npx wrangler deploy` |
| `life-ledger-mcp` | `apps/mcp` | `pnpm run build` | `npx wrangler deploy` |
| `life-ledger-web` | `apps/web` | `pnpm run build` | `npx wrangler deploy` |

- 依赖仍由根目录的 `pnpm-lock.yaml` 安装，子目录里执行 `pnpm install` 会安装整个 workspace。
- Web 的 `vite build` 会写出 `apps/web/.wrangler/deploy/config.json`，让
  `npx wrangler deploy` 自动使用构建产物 `dist/life_ledger_web/wrangler.json`；它只部署
  Web 本身，Core 需要由自己的 Worker 构建部署。
- Core 的部署命令先迁移 D1；若构建令牌没有 D1 编辑权限，就把这一步改为本地执行
  `pnpm db:migrate:remote`，部署命令只保留 `npx wrangler deploy`。
- Web 的 `AUTH_PASSWORD`、`AUTH_SESSION_SECRET` 在 Worker 的 Secrets 里配置；构建日志里的
  “Missing required secrets” 警告不影响部署。

## 数据安全规则

- 新记录永远默认 `private`
- `body_raw` 只通过新 revision 修改，不由 AI 摘要覆盖
- 相同 `source_message_id` + 相同请求返回既有记录；内容冲突返回 409
- 发布必须 `prepare` 后再用短码 `confirm`
- 取消公开立即执行，不要求二次确认
- 删除默认软删除；恢复后重置为 `private`
- Public API 使用字段白名单，不返回来源、修订、审计、私有标签或对象键
- Public API 对缺失或损坏的公开快照 fail-closed，并使用 `Cache-Control: no-store` 保证撤回不受旧共享缓存影响
- 备份对象不开放 `r2.dev`；只能在已登录管理端经 Core 受控读取
- MCP 图片写入保持鉴权；公开 `/public-media/*` 只允许三个内容寻址图片命名空间的 GET/HEAD
- 每日增量保留 30 天、每周完整备份保留 90 天、月度归档长期保留

## UI 资源来源

视觉不是机械照搬某一个模板，而是从同一工作区的动漫站资源中提炼并重新编排：`mono-weekend-photo-clone` 提供分层全景、人物群像和滚动叙事；`chiramune-clone` 提供动漫库 KV 与气泡；`kakekoi-home-clone` 提供作品详情的信息节奏；`kakekoi-clone` Special 提供玻璃手机式快速记录；`bocchi-rocks-clone` 与 `emilia-domain` 提供局部舞台、贴纸和线稿气氛。具体资源、来源和适配用途见 [docs/ui-resource-map.md](./docs/ui-resource-map.md)。

## 已验证

```bash
pnpm typecheck
pnpm test
pnpm build
# 另开终端启动 pnpm dev 后：
python tests/browser_smoke.py
```

浏览器冒烟测试覆盖 D1 bootstrap、默认私有与幂等写入、永久删除、发布预览 / 取消 / 确认 / 撤回、公开时间线字段白名单与 ETag、回收站恢复、命令面板以及 390px 移动导航。

当前按私人、单用户、非商业站点的范围复用工作区素材；如果未来改变为公开商业用途，再统一替换或核验资源授权。

MCP 图片上传的完整契约、安全限制和部署说明见
[docs/mcp-media-upload.md](./docs/mcp-media-upload.md)。
