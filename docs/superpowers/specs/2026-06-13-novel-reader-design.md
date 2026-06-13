 # 小说浏览器 — 设计文档
 
 **日期**: 2026-06-13
 **状态**: 设计稿
 
 ---
 
 ## 1. 概述
 
 一款纯个人使用的手机端小说阅读器（PWA）。通过在 iPhone 浏览器上搜索盗版小说网站来获取内容，支持书架管理、阅读进度记录、换源、书签、缓存预加载和 TTS 听书功能。
 
 **核心原则**: 零费用运营，只服务于个人，数据全量存储在浏览器本地。
 
 ---
 
 ## 2. 架构
 
 ### 2.1 整体架构
 
 ```
 ┌──────────────────────────────────────┐
 │  iPhone Safari + PWA（前端 SPA）     │
 │  ┌─────────┐  ┌───────────────────┐  │
 │  │ 阅读器UI │  │ IndexedDB 持久层  │  │
 │  │         │  │ 书架/书签/进度/缓存│  │
 │  └────┬────┘  └───────────────────┘  │
 └───────┼──────────────────────────────┘
         │ HTTPS / REST
         ▼
 ┌──────────────────────────────┐
 │  FastAPI 后端（Fly.io 免费）   │
 │  搜书 · 抓目录 · 抓内容·清洗  │
 └──────────────────────────────┘
 ```
 
 - **前端**: 纯静态 SPA（HTML + CSS + JS），部署在 Fly.io 或 Vercel
 - **后端**: Python FastAPI，无状态，只处理搜索和内容抓取
 - **存储**: 浏览器 IndexedDB，无服务端数据库
 - **PWA**: Service Worker + manifest.json，支持添加到主屏幕获得类原生体验
 
 ### 2.2 用户数据流
 
 ```
 搜索 → 选书 → 选源 → 加入书架 → 阅读
                                      ↓
                             IndexedDB 自动缓存后50章
                                      ↓
                             阅读进度/书签实时写入本地
 ```
 
 ---
 
 ## 3. 功能规格
 
 ### 3.1 搜索
 
 - 用户输入小说名，向后端 `/api/search` 发起请求
 - 后端并行调用多个盗版网站爬虫，聚合结果
 - 返回格式：`[{title, author, description, sources: [{siteName, siteUrl, status}]}]`
 - 前端以列表形式展示结果，每个结果下列出该小说在每个站点可用性
 - 用户选择站点进入阅读，或直接加入书架（默认使用第一个可用站点）
 
 ### 3.2 换源
 
 - 书架存储的小说实体不绑定具体源
 - 阅读进度以"第 X 章"为基准，与源无关
 - 阅读中任意时刻可触发换源：
   - 重新请求后端该小说所有可用源
   - 显示每个源的状态（在线/失效）
   - 用户选中新源 → 后端获取新源目录 → 跳转到当前章节位置
   - 若新源无对应章节号，提示章节范围差异
 
 ### 3.3 书架
 
 - 紧凑列表布局，每本书占三行：
   - 第一行：小说名（深色、加粗、最显眼）
   - 第二行：`读到：第X章·章节标题`
   - 第三行：`最新：第X章·章节标题`
 - 底部进度条显示阅读百分比
 - 点击任意行 → 进入阅读器并跳转到上次进度
 - 左滑 → 出现"删除"按钮（iOS 熟悉的交互）
 - 顶部搜索入口 → 点击进入搜索页
 
 ### 3.4 阅读器
 
 #### 布局
 
 - **沉浸式全屏阅读**：默认顶栏和底栏隐藏
 - 单击屏幕 → 顶栏和底栏同时浮现（半透明浮层），数秒无操作后自动淡出
 - **翻页模式**：点左半屏 → 上一页，点右半屏 → 下一页（顶底栏隐藏时有效）；点中间区域 → 唤出顶底栏
 - **滚动模式**：手指自然上下滑动
 
 #### 底部设置面板（从下向上滑出）
 
 - 日间/夜间模式切换
 - 字体大小调节（滑动条 A⁻ ~ A⁺）
 - 阅读方式：翻页 / 滚动（单选）
 - 听书模式入口按钮
 
 #### 侧边栏（从左向右滑出）
 
 - 目录树：显示所有章节，已读章节前方有 ✓ 标记，当前章节有 ▶ 标记
 - 书签列表：显示每个书签的文本摘要和位置
 - 当前小说首页会显示"换源"功能按钮
 
 #### 底栏进度条
 
 - 显示当前章节/总章节
 - 可拖动的进度条，在全书维度调整阅读位置
 
 ### 3.5 书签
 
 - 长按/选中段落 → 弹出菜单 → "添加书签"
 - 书签存储：小说ID、章节索引、章节标题、选中文本片段、所处章节百分比位置
 - 在侧边栏书签列表中展示，点击跳转到对应位置
 - 支持删除书签
 
 ### 3.6 缓存
 
 - 阅读第 N 章时，后台自动预加载 N+1 到 N+50 章内容
 - 缓存存储在 IndexedDB 的 `reading_cache` 表中
 - 字段：`novelId_chapterIndex`（主键）、章标题、纯文本内容、缓存时间戳
 - 缓存超限时采用 LRU 淘汰策略，但保护区域（已读章节 + 当前章节前后 50 章）不被淘汰
 - PWA Service Worker 同步配合，实现在线/离线无缝切换
 
 ### 3.7 听书模式
 
 - 基于 Web Speech API（SpeechSynthesis），零额外费用
 - 触发方式：
   1. 选中段落文本 → 弹出"从此处开始朗读"
   2. 底部设置面板 → "听书模式" → 从当前页首开始朗读
 - 控制：暂停、继续、停止
 - 可调节语速（慢/正常/快）
 - 朗读时高亮当前朗读位置的文字
 - 朗读状态和进度在底栏显示
 
 ### 3.8 日间/夜间模式
 
 - 使用 CSS 自定义变量（`--bg-color`, `--text-color` 等）定义两套主题
 - 日间：白底黑字
 - 夜间：深灰底暖白字（类 Kindle 阅读体验）
 - 用户偏好保存在 localStorage 中
 
 ---
 
 ## 4. 后端 API 设计
 
 | 端点 | 方法 | 参数 | 返回 |
 |------|------|------|------|
 | `/api/search?q={keyword}` | GET | q: 搜索关键词 | `[{title, author, description, sources: [{siteName, siteUrl, status}]}]` |
 | `/api/novel/{novel_id}/sources` | GET | novel_id: 小说唯一标识 | `[{siteName, siteUrl, status}]` |
 | `/api/novel/{novel_id}/chapters?source={source_url}` | GET | source: 所选站点的小说页面 URL | `[{index, title, url}]` |
 | `/api/chapter/content?url={chapter_url}` | GET | url: 章节页面 URL | `{title, content(纯文本)}` |
 
 ### 4.1 爬虫架构
 
 ```
 crawlers/
 ├── base.py         # CrawlerBase 抽象类
 │   - search(keyword) → List[SearchResult]
 │   - get_chapters(novel_url) → List[Chapter]
 │   - get_content(chapter_url) → ChapterContent
 ├── biquge.py       # 笔趣阁族站点
 ├── fanqie.py       # 番茄免费站
 └── ...
 ```
 
 - 每个站点继承 `CrawlerBase`，实现三个接口方法
 - 新增站点：只需新增爬虫文件，注册到爬虫管理器
 - 搜索时所有爬虫并行执行
 - 一个站点崩溃不影响其他站点
 
 ### 4.2 内容清洗
 
 - 抓取到 HTML 后，移除广告、导航、页脚、script 标签等无关元素
 - 保留正文段落和章节标题
 - 统一编码为 UTF-8 纯文本返回
 
 ---
 
 ## 5. 前端存储设计（IndexedDB）
 
 | 对象仓库 | 键 | 字段 |
 |---------|----|------|
 | `bookshelf` | `id` (自增) | title, author, currentChapterIndex, currentChapterTitle, totalChapters, progress, currentSource, lastReadAt, latestChapterTitle |
 | `bookmarks` | `id` (自增) | novelId, chapterIndex, chapterTitle, textSnippet, positionPercent, createdAt |
 | `reading_cache` | `novelId_chapterIndex` | novelId, chapterIndex, title, content, cachedAt |
 
 ---
 
 ## 6. 部署架构
 
 ### 前端
 
 - 纯静态文件，打包后部署到 Fly.io（或 Vercel）
 - fly.toml 配置 static serving 或使用 nginx 容器
 
 ### 后端
 
 - Docker 容器化部署到 Fly.io（免费计划：3 台 256MB VM，3GB 持久存储）
 - 启动命令：`uvicorn main:app --host 0.0.0.0 --port 8080`
 - CORS 配置允许前端域名访问
 
 ### 域名
 
 - Fly.io 免费赠送 `*.fly.dev` 子域名
 - 如需自有域名，绑定到 DNS
 
 ---
 
 ## 7. 预排和边界情况
 
 - **搜索无结果**：提示"未找到相关小说"，建议更换关键词
 - **站点失效**：尝试请求时标记为失效，下次换源列表直接显示不可用
 - **章节获取失败**：当前章节内容请求失败后自动尝试换源
 - **缓存满**：LRU 淘汰，不低于最近使用阈值
 - **IndexedDB 限额超**：提示用户清理缓存或删除不读的书架项
 - **浏览器不支持 SpeechSynthesis**：隐藏听书模式入口，提示浏览器不支持
 - **PWA 未安装**：引导用户添加到主屏幕以获得更好体验
 - **网络离线**：Service Worker 拦截请求，从缓存读取已缓存章节
 - **空间不足**：IndexedDB 存储失败时提示清理
 
 ---
 
 ## 8. 暂不实现（未来可能）
 
 - 多设备同步（方案二预留存储抽象层，后续可扩展）
 - 用户系统
 - 书单分享
 - 自定义主题色
 - 桌面端适配
