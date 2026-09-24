# Anime UI 资源与适配地图

Life Ledger 的前端视觉以 Pro UI 中的动漫站源码和真实资产为母体。整体世界取自 Mono 的分层全景与章节叙事，再把 Kakekoi、Chiramune、Bocchi 和 Emilia 的字体节奏、角色场景、动效语法与交互隐喻重新编排成私人记录产品。

| Life Ledger 场景 | Pro UI 来源 | 提取的“魂魄” | 项目内资源 / 落点 |
| --- | --- | --- | --- |
| 全局视觉世界 / 时间线首屏 | `mono-weekend-photo-clone` | 分层环形全景、独立人物层、章节推进、故事卡堆叠 | `anime-ui/mono-panorama.webp`、`mono-characters.webp`、`TimelinePage` |
| 全局桌面框架 | `kakekoi-home-clone` | 固定白色编辑侧栏、细黑导航、主画面与侧栏并置、竖排标题 | `Sidebar`、各页 `PageHeader`、`anime-theme.css` |
| 次级柔焦页面场景 | `kakekoi-home-clone` | 冷色角色 KV、大片留白、诗性纵向排版 | `anime-ui/kakekoi-kv.jpg`、作品详情与登录页 |
| 动漫库主视觉 | `chiramune-clone` | 高饱和天空蓝、橙色强调、群像 KV、透明气泡 | `anime-ui/chiramune-kv02.webp`、`bubble-*.png` |
| 游戏库 | `mono-weekend-photo-clone` + `chiramune-clone` + `kakekoi-home-clone` + `bocchi-rocks-clone` | Mono 的明亮世界场景、Chiramune 气泡、Kakekoi 纸面纹理与 Bocchi 粉/橙硬标签；游戏封面本身承担主视觉，不再另起深色主机后台 | `anime-ui/mono-introduction.webp`、`bubble-*.png`、`kakekoi-noise-v1.webp`、`GameLibraryPage` |
| 操作与状态反馈 | `bocchi-rocks-clone` | 黑色舞台、荧光粉、斜切标签、硬朗 condensed typography | `anime-ui/bocchi-stage.jpg`、按钮、状态徽章、分数标签 |
| 快速记录弹窗 | `kakekoi-clone` special | 手机聊天窗口、消息气泡、深青标题栏、背景宣言文字 | `QuickCaptureDialog`、`anime-ui/chat-ink.png` |
| 冷色氛围与线稿 | `emilia-domain` | 冰蓝粒子、线稿叠层、轻微漂浮与薄雾 | 登录页、空状态、低频背景动画 |
| 作品角色层 | `kakekoi-home-clone` | 角色立绘与文字卡并置、叠层而非普通 SaaS 卡片网格 | `anime-ui/kakekoi-character-*.png`、作品详情 |
| 拉丁展示字体 | `kakekoi-home-clone/site/local-fonts` | Cormorant Garamond + Jost 的文艺标题/功能标签组合 | `anime-ui/fonts/*.woff2` |

## 视觉原则

- 主色是清透蓝、深夜蓝、荧光粉和橙色，不再使用米黄 + 绿色作为全站基调。
- 信息区保持可读，但避免统一圆角白卡：使用角色画面裁切、竖排字、细线、斜切角和重叠层次区分页面。
- 动漫素材承担页面构图，不只是缩略图；时间线、动漫库、弹窗和登录页各自有明确的来源语法。
- 功能逻辑仍然遵循 Life Ledger 的隐私、修订、发布确认、导入和备份规则。
- 移动端把桌面编辑侧栏收成顶栏/抽屉，并保留大图、气泡和纵向标题的识别度。

完整 token 与动效定义见 `anime-design-dna.json`。
