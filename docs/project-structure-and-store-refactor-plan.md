# 项目结构整理与 Store 拆分方案

## 当前执行进度

本轮已经完成：

- 删除未使用的旧 `InputBar.tsx`。
- 将根 `store.ts` 从 5000+ 行收口为 62 行兼容出口。
- 提取 `state`、普通任务、Agent、收藏夹、数据管理和图片库模块。
- 将 Agent action 与单轮执行器拆为 `agentActions.ts` 和 `agentExecution.ts`。
- 将共享 UI 移到 `components/ui`，画廊、Agent、设置和图片编辑组件移入对应 Feature。
- 将图片 API 移到 `integrations/imageApi`，将 Agent Responses API 移到 `integrations/conversation`。
- 提取图片 API 共用 SSE 解析到 `integrations/imageApi/imageStream.ts`。
- 创建 Skill、Workflow、Tool 独立注册表和全局扩展侧边栏。
- 完成桌面窄栏、展开面板、移动抽屉、遮罩、`Esc`、键盘分类切换和本地状态恢复。
- 修复源码中已确认的中文乱码。

当前验证结果：

```text
npm run build  通过
npm test       55 个测试文件、491 个测试通过
npm run test:e2e  2 个通过、8 个失败，与重构前基线一致
```

下一批继续处理大文件内部拆分，不再改目录归属：

- `features/settings/components/SettingsModal.tsx`
- `features/gallery/components/DetailModal.tsx`
- `features/imageEditor/components/MaskEditorModal.tsx`
- `features/agent/components/AgentWorkspace.tsx`
- `integrations/imageApi/openaiCompatibleImageApi.ts`
- `integrations/conversation/agentApi.ts`

## 1. 背景

当前项目已经包含画廊、Agent、Prompt Studio、收藏夹、遮罩编辑、多供应商图片 API 和本地持久化等能力，但部分代码仍集中在少数大型文件中。

主要问题：

- `src/store.ts` 同时承担状态、持久化、任务执行、Agent 编排、收藏夹、导入导出和图片缓存等职责。
- `src/components/` 同时包含通用 UI 组件和完整业务组件，目录无法表达代码归属。
- `SettingsModal.tsx`、`DetailModal.tsx`、`MaskEditorModal.tsx`、`AgentWorkspace.tsx` 等组件同时包含状态控制、交互逻辑和大量 JSX。
- 图片 API、Responses API、自定义服务商、SSE 和异步轮询集中在少数 API 文件中。
- `InputBar.tsx` 体积较大，但当前运行时代码没有引用，可能是已被新 Composer 替代的遗留实现。

本次整理的目标不是重写项目，而是在保持现有功能和数据兼容的前提下，逐步明确模块边界并降低修改成本。

## 2. 重构目标

1. `src/store.ts` 最终只作为兼容出口，不再承载业务实现。
2. Zustand Store 只保存状态和同步 action，不直接承担网络请求和复杂业务编排。
3. 普通图片任务、Agent、收藏夹、设置和图片编辑分别拥有明确目录。
4. `src/components/` 只保留真正跨业务复用的 UI 组件。
5. `src/lib/` 只保存纯工具或通用基础能力，不依赖 Store、Feature 或业务组件。
6. 图片服务商实现统一放到 `src/integrations/imageApi/`。
7. Skill、Workflow、Tool 等扩展能力统一放到 `src/extensions/`。
8. 每个阶段保持构建、单元测试和 E2E 测试通过。

## 3. 非目标

本次重构不包含以下内容：

- 不修改 `AppMode`。
- 不增加或修改路由。
- 不修改 IndexedDB schema 和 `DB_VERSION`。
- 不修改 localStorage 已有 key 和持久化数据格式。
- 不修改导入导出文件格式。
- 不切换状态管理库。
- 不将当前单一 Zustand Store 改成多个互相同步的 Store。
- 不引入 Command Bus、Repository、事件总线等新架构。
- 不同时重做 UI 设计。

## 4. 目标目录结构

```text
src/
├── components/
│   └── ui/
│       ├── Checkbox.tsx
│       ├── ConfirmDialog.tsx
│       ├── Select.tsx
│       ├── Toast.tsx
│       ├── TooltipButton.tsx
│       └── icons.tsx
│
├── state/
│   ├── appStore.ts
│   ├── initAppState.ts
│   └── persistence.ts
│
├── features/
│   ├── tasks/
│   │   ├── taskActions.ts
│   │   ├── taskExecution.ts
│   │   ├── taskRecovery.ts
│   │   ├── taskSelectors.ts
│   │   └── index.ts
│   ├── agent/
│   │   ├── components/
│   │   ├── agentActions.ts
│   │   ├── agentRecovery.ts
│   │   ├── agentRounds.ts
│   │   └── index.ts
│   ├── gallery/
│   │   └── components/
│   ├── favorites/
│   │   ├── components/
│   │   ├── favoriteActions.ts
│   │   ├── favoriteSelectors.ts
│   │   └── index.ts
│   ├── settings/
│   │   ├── components/
│   │   └── index.ts
│   ├── imageLibrary/
│   │   ├── imageCache.ts
│   │   ├── imageThumbnails.ts
│   │   ├── inputImages.ts
│   │   └── index.ts
│   ├── imageEditor/
│   │   ├── components/
│   │   └── index.ts
│   ├── dataManagement/
│   │   ├── dataTransfer.ts
│   │   └── index.ts
│   ├── conversationComposer/
│   ├── conversationView/
│   └── promptStudio/
│
├── integrations/
│   ├── imageApi/
│   │   ├── callImageApi.ts
│   │   ├── customProviderApi.ts
│   │   ├── falImageApi.ts
│   │   ├── imageStream.ts
│   │   ├── openaiImagesApi.ts
│   │   ├── openaiResponsesImageApi.ts
│   │   ├── shared.ts
│   │   └── index.ts
│   └── conversation/
│
├── extensions/
│   ├── shared/
│   ├── skills/
│   ├── workflows/
│   ├── tools/
│   └── index.ts
│
├── hooks/
├── lib/
├── store.ts
└── types.ts
```

该目录是最终方向，不要求在同一个提交中一次性创建所有目录。没有实际内容的目录暂不创建。

## 5. 模块依赖规则

```text
components/ui  -> 不依赖业务模块
lib            -> 不依赖 state、features、integrations、components
state          -> 可以依赖 lib 和纯业务函数，不依赖业务组件
features       -> 可以依赖 state、lib 和 integrations
integrations   -> 不依赖业务组件
extensions     -> 只通过 Feature 公共出口接入核心业务
```

额外约束：

- `tasks` 不依赖 `agent`。
- `agent` 可以调用 `tasks` 提供的公共 action。
- 通用 `conversationComposer` 和 `conversationView` 不依赖当前应用 Store。
- Feature 内部文件不通过自身 `index.ts` 相互引用，避免循环依赖。
- 只有需要被其他模块使用的成员才从 Feature 的 `index.ts` 导出。

## 6. Store 拆分设计

### 6.1 最终职责

`src/state/appStore.ts` 只负责：

- `AppState` 状态定义。
- Zustand Store 创建。
- 简单同步 setter。
- 纯状态切换。
- `persist` middleware 配置入口。

以下逻辑全部移出 Store：

- 网络请求。
- IndexedDB 读写流程。
- 图片任务执行和恢复。
- Agent 多轮编排。
- 导入导出。
- 图片文件读取。
- 复杂收藏夹操作。
- 图片缓存调度。

### 6.2 代码迁移映射

| 当前职责 | 当前大致位置 | 目标文件 |
|---|---:|---|
| 图片运行时缓存 | `store.ts` 69-359 | `features/imageLibrary/imageCache.ts` |
| 缩略图调度 | `store.ts` 189-359 | `features/imageLibrary/imageThumbnails.ts` |
| 持久化迁移和合并 | `store.ts` 423-829 | `state/persistence.ts` |
| `AppState` 和 Store 创建 | `store.ts` 832-1606 | `state/appStore.ts` |
| Composer 草稿同步 | `store.ts` 994-1155、1612-1650 | `integrations/conversation/composerDraft.ts` |
| 任务查询和过滤 | `store.ts` 1800 附近 | `features/tasks/taskSelectors.ts` |
| Store 初始化 | `store.ts` 2158 附近 | `state/initAppState.ts` |
| 普通任务提交 | `store.ts` 2390 附近 | `features/tasks/taskActions.ts` |
| Agent 轮次和分支计算 | `store.ts` 2537 之后 | `features/agent/agentRounds.ts` |
| Agent 提交和重新生成 | `store.ts` 3559 之后 | `features/agent/agentActions.ts` |
| Agent 中断和恢复 | Agent 编排相关区域 | `features/agent/agentRecovery.ts` |
| 图片任务 API 执行 | `store.ts` 4920 附近 | `features/tasks/taskExecution.ts` |
| fal、自定义任务恢复 | 任务恢复相关区域 | `features/tasks/taskRecovery.ts` |
| 收藏夹操作 | `store.ts` 5181 之后 | `features/favorites/favoriteActions.ts` |
| 重试、复用、编辑、删除任务 | `store.ts` 5366 之后 | `features/tasks/taskActions.ts` |
| 清空、导入、导出 | `store.ts` 5586 之后 | `features/dataManagement/dataTransfer.ts` |
| 文件和 URL 图片输入 | `store.ts` 5902 之后 | `features/imageLibrary/inputImages.ts` |

行号只用于定位当前职责，实际迁移时以函数边界为准。

### 6.3 任务模块调用关系

```text
UI
  -> taskActions
      -> taskExecution
          -> integrations/imageApi
          -> lib/db
          -> imageCache

      -> taskRecovery
          -> integrations/imageApi
          -> state/appStore
```

职责说明：

- `taskActions.ts`：创建任务、重试、删除、复用配置、编辑输出。
- `taskExecution.ts`：读取输入图片、调用 API、存储输出、更新完成状态。
- `taskRecovery.ts`：恢复 fal 和异步自定义服务商任务。
- `taskSelectors.ts`：搜索、过滤、输出错误判断等纯函数。

### 6.4 Agent 模块调用关系

```text
Agent UI
  -> agentActions
      -> agentRounds
      -> agentRecovery
      -> taskActions
      -> integrations/conversation
```

职责说明：

- `agentRounds.ts`：轮次路径、兄弟分支、引用重映射等纯函数。
- `agentActions.ts`：提交消息、直接生成图片、重新生成回复。
- `agentRecovery.ts`：恢复工具调用、中断状态和未完成任务。

`tasks` 不能导入 `agent`，避免形成循环依赖。

## 7. 兼容迁移策略

迁移期间保留根 `src/store.ts`，使现有组件不需要同时修改。

示例：

```ts
export { useStore } from './state/appStore'
export { initStore } from './state/initAppState'

export {
  editOutputs,
  removeTask,
  retryTask,
  reuseConfig,
  submitTask,
} from './features/tasks'

export {
  getActiveAgentRounds,
  stopAgentResponse,
  submitAgentMessage,
} from './features/agent'
```

迁移规则：

1. 先移动实现并从 `store.ts` 重新导出。
2. 确认测试通过。
3. 再逐个修改调用方导入路径。
4. 所有调用方迁移完成后删除兼容导出。

不要在同一个提交中同时移动函数、修改参数和改变业务行为。

## 8. 组件目录整理

### 8.1 共享 UI

以下组件可以移动到 `src/components/ui/`：

- `Checkbox.tsx`
- `ConfirmDialog.tsx`
- `Select.tsx`
- `Toast.tsx`
- `TooltipButton.tsx`
- `ViewportTooltip.tsx`
- `icons.tsx`

### 8.2 画廊

移动到 `src/features/gallery/components/`：

- `TaskGrid.tsx`
- `TaskCard.tsx`
- `DetailModal.tsx`
- `Lightbox.tsx`
- `SearchBar.tsx`
- `HistoryModal.tsx`
- `GallerySelectionActionBar.tsx`
- `ImageContextMenu.tsx`

### 8.3 Agent

将 `AgentWorkspace.tsx` 拆成：

```text
features/agent/components/
├── AgentWorkspace.tsx
├── AgentConversationDrawer.tsx
├── AgentMessageList.tsx
├── AgentMobileHeader.tsx
└── ChatImageThumb.tsx

features/agent/
├── useAgentConversationActions.ts
└── useAgentScroll.ts
```

拆分边界：

- 对话搜索、改名和删除放在 `AgentConversationDrawer`。
- 消息分支和消息渲染放在 `AgentMessageList`。
- 滚动、触摸下拉和自动滚底放入 `useAgentScroll`。
- `AgentWorkspace` 只负责组合这些模块。

### 8.4 设置

将 `SettingsModal.tsx` 拆成：

```text
features/settings/components/
├── SettingsModal.tsx
├── SettingsNav.tsx
├── ApiSettingsTab.tsx
├── DataSettingsTab.tsx
├── GeneralSettingsTab.tsx
├── AgentSettingsTab.tsx
├── Sub2ApiSettingsTab.tsx
├── CustomProviderDialog.tsx
└── ZipDownloadSettingsDialog.tsx
```

自定义服务商 LLM 提示词和示例 JSON 移到独立模块，例如：

```text
features/settings/customProviderPrompt.ts
```

### 8.5 图片编辑

将 `MaskEditorModal.tsx` 拆成：

```text
features/imageEditor/
├── components/
│   ├── MaskEditorModal.tsx
│   ├── MaskEditorCanvas.tsx
│   └── MaskEditorToolbar.tsx
├── useMaskEditorCanvas.ts
└── maskCanvas.ts
```

Canvas 像素计算和坐标转换放到纯函数中，React hook 只处理指针状态、历史记录和渲染调度。

## 9. 图片 API 拆分

目标结构：

```text
integrations/imageApi/
├── callImageApi.ts
├── openaiImagesApi.ts
├── openaiResponsesImageApi.ts
├── falImageApi.ts
├── customProviderApi.ts
├── imageStream.ts
├── shared.ts
└── index.ts
```

拆分原则：

- `callImageApi.ts` 只负责选择供应商。
- `openaiImagesApi.ts` 只处理 `/images/generations` 和 `/images/edits`。
- `openaiResponsesImageApi.ts` 只处理 Responses API 图片工具。
- `customProviderApi.ts` 处理请求模板、结果路径和异步轮询。
- `imageStream.ts` 处理 SSE 解析和中间图片。
- `shared.ts` 保存错误解析、图片结果标准化等共享逻辑。

`agentApi.ts` 与图片 API 重复的 SSE 逻辑后续可以复用 `imageStream.ts`，但不要和协议拆分放在同一个提交中。

## 10. 类型迁移

第一阶段保留根 `src/types.ts`，避免大量导入路径同时变化。

Store 和组件稳定后，再按领域移动：

```text
features/tasks/types.ts
features/agent/types.ts
features/settings/types.ts
features/imageLibrary/types.ts
integrations/imageApi/types.ts
```

根 `types.ts` 在迁移期重新导出这些类型。所有调用方迁移完成后，再决定是否保留公共类型出口。

## 11. 分阶段实施计划

### 阶段 0：建立基线

- 运行完整构建、单测和 E2E。
- 记录失败项和现有行为。
- 确认 `InputBar.tsx` 没有静态或动态运行时引用。
- 暂停与重构无关的大规模格式调整。

验收：

```bash
npm run build
npm test
npm run test:e2e
```

### 阶段 1：清理遗留代码

- 删除未使用的 `InputBar.tsx`。
- 删除仅针对旧 InputBar 的测试。
- 清理旧 InputBar 专用 CSS。
- 不修改当前 Composer 行为。

### 阶段 2：提取基础设施

- 提取图片缓存。
- 提取缩略图调度。
- 提取持久化迁移。
- 提取 Store 初始化。
- 保持 `store.ts` 原导出不变。

### 阶段 3：拆普通图片任务

- 提取任务 selector。
- 提取任务执行。
- 提取任务恢复。
- 提取提交、重试、删除和复用配置。
- 拆分对应的 `store.test.ts` 测试。

### 阶段 4：拆 Agent

- 先提取轮次和分支纯函数。
- 再提取 Agent action。
- 最后提取恢复和中断流程。
- 保持 Agent 输出、轮次和持久化数据结构不变。

### 阶段 5：拆其他业务

- 提取收藏夹 action 和 selector。
- 提取数据导入导出。
- 提取图片文件输入。
- 将相关测试移动到对应 Feature。

### 阶段 6：移动和拆分组件

- 先移动共享 UI。
- 再移动画廊、Agent、设置和图片编辑组件。
- 每次只处理一个 Feature。
- 移动后再拆组件，不在同一个提交中完成两类修改。

### 阶段 7：拆图片 API

- 分离 OpenAI Images、Responses、fal 和自定义服务商。
- 保留原 `callImageApi` 调用契约。
- 最后提取共享 SSE 逻辑。

### 阶段 8：接入扩展体系

- 创建 `src/extensions`。
- 接入扩展侧边栏和 `WorkspaceShell`。
- 扩展只能调用 Feature 公共出口。
- 第一阶段只注册空的 Skill、Workflow、Tool 列表。

## 12. 建议的提交拆分

建议至少拆成以下独立提交或 PR：

1. 删除遗留 InputBar。
2. 提取图片缓存和缩略图。
3. 提取持久化和初始化。
4. 提取普通任务模块。
5. 提取 Agent 轮次纯函数。
6. 提取 Agent action 和恢复。
7. 提取收藏夹和数据管理。
8. 整理共享 UI 和画廊目录。
9. 拆 SettingsModal。
10. 拆 AgentWorkspace 和 MaskEditorModal。
11. 拆图片 API。
12. 创建扩展目录和侧边栏。

每个提交只处理一个明确职责，避免产生难以审查的大型重构提交。

## 13. 测试策略

### 13.1 单元测试

将 `store.test.ts` 按功能移动：

```text
state/persistence.test.ts
features/tasks/taskActions.test.ts
features/tasks/taskRecovery.test.ts
features/tasks/taskSelectors.test.ts
features/agent/agentRounds.test.ts
features/agent/agentActions.test.ts
features/favorites/favoriteActions.test.ts
features/dataManagement/dataTransfer.test.ts
features/imageLibrary/imageCache.test.ts
```

### 13.2 边界测试

沿用项目现有源码扫描测试，增加以下规则：

- `lib` 不得导入 `store`、`features`、`integrations` 和业务组件。
- `tasks` 不得导入 `agent`。
- 通用 Composer 和 Conversation View 不得导入应用 Store。
- `extensions` 不得导入 Feature 内部文件。
- 业务组件不得从根 `store.ts` 导入已经迁移完成的 action。

### 13.3 E2E 测试

每个阶段至少覆盖：

- 画廊提交图片任务。
- 带参考图的编辑任务。
- 遮罩编辑任务。
- Agent 对话和图片生成。
- 任务重试、删除和复用配置。
- 收藏夹操作。
- 数据导入导出。

## 14. 完成标准

- 根 `store.ts` 小于约 100 行，只提供兼容导出。
- `state/appStore.ts` 不直接调用网络 API。
- `state/appStore.ts` 不执行复杂 IndexedDB 工作流。
- 普通任务模块不依赖 Agent。
- `src/components/` 只保留共享 UI。
- `SettingsModal`、`AgentWorkspace`、`DetailModal` 和 `MaskEditorModal` 不再是单文件完整子系统。
- 图片服务商实现集中在 `integrations/imageApi`。
- `extensions` 通过公共 Feature API 接入。
- 没有新增循环依赖。
- IndexedDB、localStorage 和导入导出格式保持兼容。
- `npm run build`、`npm test`、`npm run test:e2e` 全部通过。

## 15. 实施原则

- 优先删除无用代码，再拆仍在使用的代码。
- 优先提取纯函数，再移动带状态和副作用的逻辑。
- 优先保持函数签名不变，再逐步整理调用方。
- 一个提交只处理一个模块边界。
- 不以文件行数作为唯一拆分依据，以职责和依赖方向为准。
- 重构期间不顺便修改业务规则和 UI 交互。
- 遇到无法确认的历史逻辑时先补日志或测试，不根据猜测增加兼容判断。
