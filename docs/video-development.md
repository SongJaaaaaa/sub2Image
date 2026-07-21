# 视频生成功能开发文档

## 当前状态

- 状态：架构设计完成，功能尚未开始实现。
- 首个目标厂商：Grok Imagine Video。
- 后续目标厂商：Gemini/Veo、集梦，以及其他异步视频生成服务。
- 最后更新：2026-07-22。

本文件记录视频生成功能的整体架构、模块边界、公共协议、开发顺序和重要决策。每次开发或调整视频功能时，都必须同步更新本文件及对应厂商目录的 `README.md`。

## 1. 目标

1. Agent、输入框、任务系统和画廊只依赖统一的视频生成协议。
2. 每个厂商独立处理自己的认证、请求格式、任务 ID、轮询状态和响应格式。
3. 新增厂商时，主要改动限制在对应的 `providers/<provider>/` 目录、注册表和测试中。
4. 文生视频、图生视频和参考图生视频共用现有 Conversation Composer 与图片上传能力。
5. 异步任务支持停止本地轮询、页面刷新后恢复、临时结果及时下载和本地持久化。
6. 保持业务代码直接可读，不为尚未出现的差异提前设计复杂配置 DSL。

## 2. 非目标

第一阶段不包含：

- 视频编辑、视频延长和视频之间的串联工作流。
- 可由用户编写任意映射规则的通用视频 Provider Manifest。
- 跨厂商自动降级或自动重试到其他付费厂商。
- 服务端视频对象存储和 CDN 管理。
- 一次生成多个视频的并发批处理。

## 3. 目标目录

```text
src/
├── integrations/
│   ├── imageApi/
│   └── conversation/
│       ├── sub2VideoTool.ts
│       └── Sub2VideoToolControls.tsx
│
├── videoIntegrations/
│   ├── AGENTS.md
│   ├── README.md
│   ├── index.ts
│   ├── types.ts
│   ├── registry.ts
│   ├── runner.ts
│   ├── shared/
│   │   ├── http.ts
│   │   ├── polling.ts
│   │   └── errors.ts
│   └── providers/
│       ├── grok/
│       │   ├── README.md
│       │   ├── index.ts
│       │   ├── client.ts
│       │   ├── request.ts
│       │   ├── response.ts
│       │   ├── types.ts
│       │   └── grok.test.ts
│       ├── gemini/
│       │   └── ...
│       └── jimeng/
│           └── ...
│
└── features/
    └── video/
        ├── videoSubmit.ts
        ├── videoExecution.ts
        ├── videoRecovery.ts
        ├── videoStorage.ts
        ├── videoParams.ts
        └── components/
            └── VideoParamsPanel.tsx
```

目录按实际开发进度创建，不提前创建没有代码或文档内容的空文件。

## 4. 模块职责

### 4.1 Conversation Composer

Conversation Composer 是统一输入入口，只负责：

- 收集提示词和上传图片。
- 展示当前视频 Provider 支持的参数。
- 创建统一的 `VideoDraft`。
- 调用 `submitVideoTask()`。

Composer 不解析厂商响应，不直接调用 Grok、Gemini 或集梦接口，也不保存视频文件。

### 4.2 `features/video`

业务层负责视频任务生命周期：

- `videoSubmit.ts`：校验草稿、持久化输入图片、创建本地任务。
- `videoExecution.ts`：读取配置和输入文件、调用视频集成层、保存结果、更新任务。
- `videoRecovery.ts`：根据已保存的远程任务 ID 恢复轮询。
- `videoStorage.ts`：下载临时视频、读取元数据、生成封面并写入 IndexedDB。
- `videoParams.ts`：保存公共参数默认值及展示逻辑。

业务层只能处理统一类型，不能读取厂商原始 JSON。

### 4.3 `videoIntegrations`

集成层负责把不同厂商协议转换为统一协议：

- `registry.ts`：根据 Provider ID 返回对应适配器。
- `runner.ts`：执行通用的提交、轮询、超时和停止流程。
- `shared/http.ts`：通用 JSON 请求和错误正文读取。
- `shared/polling.ts`：可中止等待和通用轮询调度。
- `shared/errors.ts`：统一视频 API 错误类型。
- `providers/*`：厂商专属认证、请求和响应转换。

集成层不得导入 React 组件、Zustand Store 或 IndexedDB 封装。

## 5. 厂商目录职责

每个厂商使用相同的基础结构：

| 文件 | 职责 |
|---|---|
| `index.ts` | 组装并导出 `VideoProvider`，是目录唯一公开出口 |
| `client.ts` | 处理端点、headers、认证和 HTTP 调用 |
| `request.ts` | 将统一输入转换为厂商请求体 |
| `response.ts` | 将厂商响应转换为统一任务或结果 |
| `types.ts` | 保存厂商原始请求和响应类型，不向目录外导出 |
| `auth.ts` | 仅在厂商需要复杂签名时增加 |
| `<provider>.test.ts` | 覆盖请求映射、状态映射和错误响应 |
| `README.md` | 记录协议、能力、限制、决策和更新历史 |

其他模块禁止直接导入 `providers/<provider>/client.ts` 等内部文件，必须通过 `registry.ts` 使用 Provider。

## 6. 公共类型

计划在 `src/videoIntegrations/types.ts` 定义以下协议：

```ts
export type VideoProviderId = 'grok' | 'gemini' | 'jimeng'

export type VideoMode =
  | 'text-to-video'
  | 'image-to-video'
  | 'reference-to-video'

export interface VideoParams {
  duration: number
  aspectRatio: string
  resolution: string
}

export interface VideoInput {
  mode: VideoMode
  prompt: string
  images: string[]
  params: VideoParams
}

export interface VideoCapabilities {
  modes: VideoMode[]
  maxImages: number
  durations: number[]
  aspectRatios: string[]
  resolutions: string[]
}

export interface VideoJob {
  remoteId: string
  pollInterval: number
}

export interface VideoOutput {
  url: string
  duration?: number
  width?: number
  height?: number
  mimeType?: string
}

export type VideoPollResult =
  | { status: 'pending', progress?: number }
  | { status: 'done', output: VideoOutput }
  | { status: 'failed', error: string }

export interface VideoProvider {
  id: VideoProviderId
  getCapabilities: (profile: VideoProfile) => VideoCapabilities
  submit: (
    input: VideoInput,
    profile: VideoProfile,
    signal?: AbortSignal,
  ) => Promise<VideoJob>
  poll: (
    job: VideoJob,
    profile: VideoProfile,
    signal?: AbortSignal,
  ) => Promise<VideoPollResult>
}
```

`remoteId` 统一表示厂商远程任务标识。Grok 的 `request_id`、Gemini 的 operation name 和其他厂商的 task ID 不得泄漏到业务层。

## 7. Provider 配置

视频配置与现有图片自定义 Provider 分离。计划新增：

```ts
export interface VideoProfile {
  id: string
  name: string
  provider: VideoProviderId
  baseUrl: string
  apiKey: string
  model: string
  timeout: number
}
```

如果某个厂商确认需要额外认证字段，再将配置改为以 `provider` 区分的联合类型。不要在没有实际协议需求前加入任意 `Record<string, unknown>`。

## 8. 视频任务

长期目标是把图片任务和视频任务改为可辨识联合类型：

```ts
export type TaskRecord = ImageTaskRecord | VideoTaskRecord
```

视频任务至少记录：

- `kind: 'video'`
- Provider、配置 ID 和模型快照
- 视频参数和输入图片 ID
- 远程任务 ID
- 本地视频 ID 和封面图片 ID
- 状态、错误、创建时间和完成时间

旧任务没有 `kind` 时，在持久化恢复层规范化为 `kind: 'image'`，不得破坏已有 IndexedDB 数据。

## 9. 标准执行流程

```text
Composer 创建 VideoDraft
          ↓
videoSubmit 创建 running 任务
          ↓
videoExecution 读取图片和 VideoProfile
          ↓
registry 获取 Provider
          ↓
Provider submit 返回 remoteId
          ↓
任务立即持久化 remoteId
          ↓
runner 周期性调用 Provider poll
          ↓
完成后下载临时视频 URL
          ↓
生成封面并保存视频 Blob
          ↓
更新任务为 done
```

用户停止任务时，应立即停止本地请求和轮询。如果厂商没有取消远程任务接口，UI 必须明确停止操作不代表远程任务已取消，也不保证停止计费。

## 10. 能力驱动 UI

视频参数组件通过 `getCapabilities()` 获取能力，不根据厂商 ID 编写条件分支。

首期公共参数：

- 模式：文生视频、图生视频、参考图生视频。
- 时长。
- 画面比例。
- 分辨率。

不支持的选项不展示。厂商独有参数只有在出现明确业务需求后才增加类型和对应组件，不使用无类型的 `extraParams` 提前兜底。

## 11. Agent 接入

在现有 `conversationTools` 中注册一个统一的视频工具。工具只调用 `submitVideoTask()`，不直接访问具体 Provider。

如果后续允许 Agent 自主调用视频生成，只提供一个 `generate_video` 工具。工具输出本地视频任务 ID，由现有消息渲染和任务系统展示进度。

禁止增加 `generate_grok_video`、`generate_gemini_video` 等厂商专属 Agent 工具。

## 12. 测试要求

每个 Provider 至少覆盖：

1. 文生视频请求映射。
2. 图生视频请求映射。
3. 远程任务 ID 提取。
4. 等待、成功和失败状态映射。
5. 厂商错误正文提取。
6. 中止信号传递。

公共模块至少覆盖：

- Provider 注册和未知 Provider 错误。
- 轮询间隔和停止。
- 页面恢复后继续查询。
- 临时视频下载和 IndexedDB 保存。
- 旧图片任务的数据兼容。

完成代码修改后依次运行：

```text
npm run build
npm test
```

## 13. 文档维护规则

每次视频功能开发或调整必须同步完成：

1. 更新本文件的当前状态、架构或公共协议。
2. 更新 `src/videoIntegrations/README.md` 的实现状态和文件索引。
3. 更新受影响厂商目录的 `README.md`。
4. 在对应 README 的“更新记录”中添加日期、变更和验证结果。
5. 接口协议来自实际响应时，记录已确认的请求和响应字段；未确认内容必须明确标为“待确认”。
6. Provider 新增、删除或改名时同步更新注册表、类型、测试和文档。

纯格式调整且不改变行为时，可以只记录在受影响范围最小的 README 中。

## 14. 开发顺序

### 第一阶段：公共骨架和 Grok

- 建立视频公共类型、注册表和 runner。
- 建立视频 Profile 和任务类型。
- 接入 Grok 文生视频与单图生视频。
- 完成轮询恢复、下载、封面和本地保存。
- 在通用 Conversation Composer 中增加视频工具。

### 第二阶段：Gemini/Veo

- 根据官方 API 和真实响应补充 Gemini Provider 文档。
- 实现 long-running operation 到统一 `remoteId` 的映射。
- 验证图片上传方式、视频下载和错误状态。

### 第三阶段：集梦

- 确认使用的官方接口或中转服务协议。
- 根据实际认证方式决定是否增加 `auth.ts`。
- 实现请求签名、任务查询和结果转换。

### 第四阶段：扩展能力

- 参考图生视频。
- 视频编辑和视频延长。
- Agent 自主视频工具调用。
- 根据前三个 Provider 的真实差异评估是否需要自定义视频 Provider Manifest。

## 15. 更新记录

### 2026-07-22

- 创建视频生成功能总体开发文档。
- 确定公共任务生命周期与 Provider 适配器边界。
- 确定每个厂商使用独立目录和细分文件。
- 确定代码变更必须同步更新模块与厂商文档。
- 将视频集成根目录调整为 `src/videoIntegrations/`。
