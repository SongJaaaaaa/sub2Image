# 视频 Provider 集成层

本目录用于隔离 Grok、Gemini、集梦等视频生成厂商的协议差异，并向业务层提供统一的视频生成接口。

总体设计、公共类型和开发顺序见 [`docs/video-development.md`](../../docs/video-development.md)。修改本目录前同时阅读 [`AGENTS.md`](./AGENTS.md)。

## 当前状态

- 公共架构：已设计，未实现。
- Grok：协议调研完成，未实现。
- Gemini/Veo：待调研，未实现。
- 集梦：待确认具体 API 来源和认证方式，未实现。
- 最后更新：2026-07-22。

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

实现文件按开发进度创建。每个厂商目录至少包含 `README.md`，开始编码后再增加 `index.ts`、`client.ts`、`request.ts`、`response.ts`、`types.ts` 和测试。

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
