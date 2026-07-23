# 视频 Provider 集成层

本目录用于隔离 Grok、Gemini、集梦等视频生成厂商的协议差异，并向业务层提供统一的视频生成接口。

总体设计、公共类型和开发顺序见 [`docs/video-development.md`](../../docs/video-development.md)。修改本目录前同时阅读 [`AGENTS.md`](./AGENTS.md)。

## 当前状态

- 公共架构：已实现类型、注册表、HTTP、轮询和 runner。
- Grok：文生视频已实现并覆盖请求、状态映射与中止信号测试。
- Gemini/Veo：文生视频、单图生视频、operation 轮询和视频下载已实现，真实 Sub2API 任务待验证。
- 集梦：已通过 Sub2API Grok 路由接入 JSON 文生视频；`jimeng-api` 同步返回最终视频 URL。
- 业务层：支持一次创建 `1-4` 个独立视频任务；数量不进入 Provider 请求。
- 提示词：视频 Prompt Studio 使用独立的 `gallery-video` 项目。
- 最后更新：2026-07-23。

## 目录结构

```text
videoIntegrations/
├── AGENTS.md
├── README.md
├── index.ts
├── types.ts
├── registry.ts
├── runner.ts
├── shared/
│   ├── http.ts
│   ├── polling.ts
│   └── errors.ts
└── providers/
    ├── grok/
    ├── gemini/
    └── jimeng/
```

当前实现文件：

```text
videoIntegrations/
├── index.ts
├── types.ts
├── registry.ts
├── runner.ts
├── shared/
│   ├── errors.ts
│   ├── http.ts
│   └── polling.ts
└── providers/
    ├── grok/
    │   ├── index.ts
    │   ├── client.ts
    │   ├── request.ts
    │   ├── response.ts
    │   ├── types.ts
    │   └── grok.test.ts
    ├── gemini/
        ├── index.ts
        ├── client.ts
        ├── request.ts
        ├── response.ts
        ├── types.ts
        └── gemini.test.ts
    └── jimeng/
        ├── README.md
        ├── index.ts
        ├── client.ts
        ├── request.ts
        ├── response.ts
        ├── types.ts
        └── jimeng.test.ts
```

## 对外出口

业务模块只能从本目录 `index.ts` 导入：

```ts
import { getVideoProvider, runVideoGeneration } from '../../videoIntegrations'
```

禁止从业务模块直接导入：

```ts
import { submit } from '../../videoIntegrations/providers/grok/client'
```

## 文件职责

| 文件 | 职责 |
|---|---|
| `types.ts` | Provider 公共输入、能力、任务和结果类型 |
| `registry.ts` | Provider 注册和查找 |
| `runner.ts` | 通用提交、轮询、停止和超时 |
| `shared/http.ts` | 通用 HTTP 请求与错误正文读取 |
| `shared/polling.ts` | 可中止等待和轮询调度 |
| `shared/errors.ts` | 视频 API 公共错误类型 |
| `providers/*` | 厂商专属协议适配 |

## Provider 内部结构

```text
providers/<provider>/
├── README.md
├── index.ts
├── client.ts
├── request.ts
├── response.ts
├── types.ts
└── <provider>.test.ts
```

- `index.ts` 是厂商目录唯一公开出口。
- `client.ts` 负责认证、端点和 HTTP 调用。
- `request.ts` 负责统一输入到厂商请求的转换。
- `response.ts` 负责厂商响应到统一结果的转换。
- `types.ts` 只描述厂商原始协议。
- 复杂签名按需增加 `auth.ts`，不要求所有厂商保持形式上的空文件一致。

## 依赖方向

```text
features/video
      ↓
videoIntegrations/index.ts
      ↓
registry.ts → providers/<provider>/index.ts
                              ↓
                         client.ts
                         ↙       ↘
                   request.ts  response.ts
```

Provider 可以使用 `shared/`，但 `shared/` 不得反向依赖任何 Provider。

## 更新记录

### 2026-07-22

- 创建视频集成层文档和目标目录结构。
- 确定 Provider 目录的文件职责和唯一出口规则。
- 将视频集成根目录调整为 `src/videoIntegrations/`。
- 当前仅创建文档，尚未创建实现文件。

### 2026-07-22（Grok 首次接入）

- 实现公共 Provider 契约、注册表、JSON 请求错误处理、可中止轮询和超时 runner。
- 实现 Grok 文生视频适配器；业务层只通过本目录 `index.ts` 调用。
- 远程任务 ID 与轮询间隔会在开始查询前持久化，刷新页面后直接继续轮询，不重复提交。
- 画廊的图片 / 视频切换位于统一生成设置弹层中，不修改 Agent 对话工作区状态。
- 图生视频字段尚未确认，Provider 显式拒绝带图请求并记录 `[Grok Video]` 日志。
- 已通过 TypeScript 编译及对应 Vitest 测试。

### 2026-07-22（视频提示词与批量生成）

- 视频参数增加业务层生成数量 `n`，范围为 `1-4`。
- 批量生成拆成多个单视频任务，Provider 公共提交和轮询协议保持不变。
- Grok UI 能力收紧为时长 `4/6/8/10/12/15` 秒、比例 `9:16/16:9`。
- 视频提示词 Agent 使用独立 Prompt Studio 领域和项目，不改变 Provider 依赖方向。
- 已通过生产构建和视频相关定向测试。

### 2026-07-22（内容下载地址修复）

- Provider 会将完成响应中的相对视频地址还原到当前 Profile 的 API Base URL。
- 同源相对地址下载时携带 Bearer Key，绝对 CDN 地址不附带认证头。
- 已覆盖 `/v1/videos/{request_id}/content` 到 `/sub2api-v1/videos/{request_id}/content` 的转换。

### 2026-07-22（Gemini/Veo 接入）

- 注册 Gemini Provider，并根据视频 Key 平台或 `veo-*` 模型选择 Provider。
- 实现 Gemini Developer API `predictLongRunning` 提交、operation 轮询、单图 `inlineData` 和安全过滤原因映射。
- Sub2API 入口使用 Bearer Key；Google 官方入口和文件下载使用 `x-goog-api-key`。
- Google 文件 URI 在 Sub2API 模式下会映射回当前 Profile，避免浏览器直接访问需要上游 Key 的地址。
- 已通过生产构建和完整 Vitest（75 个测试文件、562 项测试）；真实 Sub2API/Veo 任务仍待有效 Key 验证。

### 2026-07-23（集梦接入）

- 参考 `iptag/jimeng-api` 接入集梦 JSON 文生视频，请求字段使用 `ratio`、`resolution` 和 `duration`。
- Sub2API 账号继续配置为 Grok 平台；注册表根据 `jimeng-video-*` 模型选择集梦 Provider。
- 公共提交协议支持异步任务和同步完成结果；集梦直接解析 `data[0].url`，不执行前端轮询。
- 当前仅开放已经确认的文生视频；图片 multipart 经 Sub2API 的透传等待真实请求验证。
