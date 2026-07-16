# WP0 契约与行为基线

## 1. 基线信息

- 基线日期：2026-07-16
- 基线提交：`bb7da58`
- Node/npm：`v22.22.0` / `10.9.4`
- 初始自动化：22 个 Vitest 文件、252 个测试
- WP0 门禁：23 个 Vitest 文件、255 个测试；Playwright 桌面/移动端共 10 个测试
- 关键文件规模：`InputBar.tsx` 2292 行、`AgentWorkspace.tsx` 1246 行、`store.ts` 5635 行、`agentApi.ts` 1003 行、`db.ts` 345 行

本文记录 WP0 完成时必须保持的现有行为。它不引入 Composer 或 Tool 业务实现；后续工作包改变这些行为时，必须先更新对应契约和测试。

## 2. 冻结的 v1 契约

冻结定义以 `docs/prompt-studio-design.md` 为准：

1. `ConversationTool` 只包含 `id`、`label` 和懒加载 `load()`；模块提供 Controls、消息 renderer、校验、提交和可选停止。
2. `ConversationMessage` 固定包含 `id`、`role`、命名空间 `kind`、`content`、可选 `payload` 和 `createdAt`。
3. 当前版本只冻结 `TextModelPort` 与 `ImageModelPort`。视频端口属于未来范围，不创建未使用接口。
4. `PromptProject` 的首版持久化标识为 `schemaVersion: 1`；`PromptDomain` 是由注册表校验的开放字符串。
5. 运行时素材可以携带 `dataUrl`，持久化 `PromptStudioSourceSnapshot` 只保存素材 ID、类型、标签、角色和尺寸。
6. 同一次提交只进入一个主要 Tool；`AbortSignal` 必须到达真实请求，可选 `stop()` 不能影响其他 Tool。

## 3. 行为基线

| 行为 | 当前契约 | 既有证据 | WP0 新证据 |
|---|---|---|---|
| 画廊提交 | `InputBar` 调用 `submitTask()`；先创建 running TaskRecord，再执行图片请求 | `src/store.test.ts` 的提交、遮罩、参数和结果测试 | `tests/e2e/appBaseline.e2e.ts`：输入、提交、mock API、任务卡和实际图片显示 |
| Agent 文本 | 切换 Agent 后仍使用同一个 `InputBar`；首轮并发生成标题，正文走 Responses API | `src/lib/agentApi.test.ts` 与 `src/store.test.ts` | E2E：标题和正文请求各一次；请求包含用户文字与 tools；流式回复可见 |
| Agent 停止 | 运行时按钮变为“停止生成”；停止后轮次保留“已停止生成。”，空草稿下发送按钮恢复为禁用 | AbortSignal、fal 恢复和停止单测 | E2E：真实 pending 请求进入 `requestfailed`，停止消息和按钮状态正确 |
| 草稿切换 | 画廊、Agent、不同会话分别保存文字、附件、mention 和 mask；切换时清除编辑态 | `src/store.test.ts` 的 `agent draft lifecycle` | 全量 Vitest 继续作为门禁 |
| 编辑轮次 | 编辑已完成轮次后提交会创建 sibling，原轮次不变，附件进入新轮次 | 原有重新生成测试 | `agent round editing contract` 特征测试 |
| 图片 mention | `@图N` 使用稳定图片 ID 和隐藏选中标记；重排、删除后重新映射 | `promptImageMentions.test.ts`、`agentImageReferences.test.ts` | E2E：上传图片、打开 `@` 菜单并生成 mention 胶囊 |

## 4. 测试设施基线

- 默认 Vitest 环境保持 Node。
- React 组件测试在文件顶部使用 `// @vitest-environment jsdom`，不全局切换环境。
- `tests/ui/testInfrastructure.ui.test.tsx` 验证 React Testing Library、user-event、中文输入和 fake-indexeddb 事务。
- Playwright 使用 `1440x900` 与 `390x844` 两个项目；所有 API 由测试路由拦截，不访问真实模型服务；固定单 worker，避免 Windows 多浏览器并发造成截图和收尾超时。
- Windows 本地优先使用已安装的 Chrome；CI 执行 `playwright install --with-deps chromium` 后使用 Playwright Chromium。
- CI 无论成功或失败都上传 `output/playwright`，保留 HTML report、trace、截图和 metrics 供排查。

## 5. 性能与持久化基线

### 5.1 初始构建

`npm run build` 的 WP0 初始结果：590 个模块；主入口 JS 933.08 kB，gzip 272.00 kB；主 CSS 125.00 kB，gzip 25.28 kB。Vite 报告主入口超过 500 kB，该警告留给后续动态 Tool 拆包处理。

### 5.2 输入渲染范围

当前尚无 `ConversationComposer`。输入事件调用 `setPrompt()`，`InputBar` 直接订阅 `prompt`，因此每次输入都会重渲染整个 `InputBar`。`Workspace`、`TaskGrid` 没有订阅 `prompt`，不会因这次 selector 更新直接重渲染。

`InputBar` 同时订阅 tasks、收藏夹和 `agentConversations`；`Header` 与 `AgentWorkspace` 也订阅 Agent 会话。每个 Agent 文本 delta 都替换 `agentConversations` 引用，因此三者都进入当前流式更新渲染范围。WP1 先移除批量业务订阅，WP11 再执行结构性渲染次数验收。

### 5.3 Agent 流式 IndexedDB 写入

当前 `store.ts` 在 `agentConversations` 引用变化时调用整库 `replaceAgentConversations()`，并发事务只做一次 queued 合并。Playwright 对 3 个连续文本 delta 的实测结果：

| 视口 | `agentConversations` readwrite 事务 |
|---|---:|
| desktop `1440x900` | 2 |
| mobile `390x844` | 2 |

测试会等待标题更新，并确认所有 `agentConversations` 写事务完成后再读取计数，避免在持久化队列排空前过早取值。单独运行 Agent 用例时两个视口均观测到 4 次；最终全量运行如上，两个视口均为 2 次。因此当前基线是：3 个文本 delta 会触发 2～4 次整库写入，具体次数受事务期间的更新合并影响。冻结证据位于 `docs/assets/prompt-studio-wp0/*-agent-metrics.json`，每次运行的临时证据位于 `output/playwright/baselines/`。

## 6. 视觉证据

- `docs/assets/prompt-studio-wp0/desktop-gallery.png`
- `docs/assets/prompt-studio-wp0/desktop-agent.png`
- `docs/assets/prompt-studio-wp0/mobile-gallery.png`
- `docs/assets/prompt-studio-wp0/mobile-agent.png`

四张截图均由真实浏览器生成并已人工检查。输入框在视口内，页面没有横向溢出；移动端 Agent 图保留了头部隐藏状态下持续显示的“下拉展示顶栏”入口。测试运行仍把最新截图写入 `output/playwright/baselines/`，冻结图片不做跨 Windows/Linux 的像素级 CI 比较。

## 7. 完成验证

2026-07-16 在 Node `v22.22.0`、npm `10.9.4` 和本机 Chrome 上完成：

| 命令 | 结果 |
|---|---|
| `npm run build` | 通过；590 modules；主入口 JS 933.08 kB（gzip 272.00 kB）；主 CSS 125.00 kB（gzip 25.28 kB） |
| `npm test` | 通过；23 个文件、255 个测试 |
| `npm run test:ui` | 通过；1 个文件、2 个测试 |
| `npm run test:e2e` | 通过；desktop 5/5、mobile 5/5，共 10/10 |
| `npm run test:ci` | 通过；按 build -> Vitest -> E2E 顺序完成 |
| `git diff --check` | 通过；无空白错误，仅显示仓库现有的 LF/CRLF 转换提示 |

E2E 使用后台 Vite `http://127.0.0.1:4173/app`，启动 PID `45940`，监听进程 PID `45128`；stdout 为 `output/playwright/vite-wp0.log`，stderr 为 `output/playwright/vite-wp0.err.log`。冻结截图和 metrics 位于 `docs/assets/prompt-studio-wp0/`。

## 8. 回滚点

WP0 只增加文档、测试依赖、测试脚本、CI 门禁和基线测试。回滚时不需要修改 `InputBar`、store 运行逻辑或 IndexedDB schema。
