# Grok 视频 Provider

## 当前状态

- 状态：文生视频已实现；图生视频等待真实接口字段确认。
- 计划模型：`grok-imagine-video`。
- 当前支持：文生视频。
- 最后更新：2026-07-22。

## 官方资料

- [Video Generation](https://docs.x.ai/developers/model-capabilities/video/generation)
- [Image-to-Video](https://docs.x.ai/developers/model-capabilities/video/image-to-video)
- [grok-imagine-video](https://docs.x.ai/developers/models/grok-imagine-video)

实现前应重新核对官方文档，因为模型名、参数范围、价格和能力可能变化。

## 已确认协议

### 提交任务

```text
POST /v1/videos/generations
Authorization: Bearer <api-key>
Content-Type: application/json
```

文生视频请求包含：

- `model`
- `prompt`
- `duration`
- `aspect_ratio`
- `resolution`

成功提交后返回 `request_id`。

### 查询任务

```text
GET /v1/videos/{request_id}
Authorization: Bearer <api-key>
```

已确认状态：

- `pending`
- `done`
- `expired`
- `failed`

成功结果位于 `video.url`。该 URL 是临时地址，业务层必须及时下载并保存，不能只持久化远程 URL。当前 Sub2API 实际返回过 `/v1/videos/{request_id}/content` 相对地址，业务层会通过配置的 `/sub2api-v1` Profile 地址下载并携带 Bearer Key。

### 当前能力

| 能力 | 状态 | 说明 |
|---|---|---|
| 文生视频 | 已实现 | 无输入图片 |
| 单图生视频 | 待确认 | 文档说明支持公网 URL、data URI 或 xAI file ID，但 REST 图片字段尚未获得真实请求确认 |
| 参考图生视频 | 后续评估 | 第一阶段不实现 |
| 视频编辑 | 后续评估 | 第一阶段不实现 |
| 视频延长 | 后续评估 | 第一阶段不实现 |

当前实现的生成参数：

- 时长：`4`、`6`、`8`、`10`、`12`、`15` 秒。
- 比例：`9:16`、`16:9`。
- 分辨率：`480p`、`720p`。
- 一次生成数量：`1-4`，由业务层创建多个独立任务，不向 Grok 请求体发送 `n`。
- `1080p` 的模型和模式限制需要在实现时再次核对，不作为第一阶段公共能力。

## 计划文件

```text
grok/
├── README.md
├── index.ts
├── client.ts
├── request.ts
├── response.ts
├── types.ts
└── grok.test.ts
```

## 转换规则

- `request_id` 转换为公共 `VideoJob.remoteId`。
- `pending` 转换为公共 `pending`。
- `done` 且存在 `video.url` 时转换为公共 `done`。
- `expired` 和 `failed` 转换为公共 `failed`，错误文案优先使用接口返回的 `error.message`。
- 原始状态名不得出现在 `features/video` 或 UI 中。

## 待确认

接入时必须用真实请求确认：

- 图生视频 REST 请求中图片字段的完整结构。
- 视频结果 URL 的浏览器跨域下载行为。
- 429、5xx 和临时网络错误的重试策略。
- 停止本地轮询后是否存在官方远程取消接口。
- 不同模型对 `1080p`、时长和图生视频的具体限制。

确认前不要增加猜测性兼容代码。请求或响应不符合文档时记录必要日志，让用户提供实际输出。

## 测试要求

- 文生视频请求体。
- 单图生视频请求体。
- Bearer Token 和端点。
- `request_id` 提取。
- `pending`、`done`、`expired`、`failed` 映射。
- 缺少 `request_id` 或 `video.url` 时的错误。
- AbortSignal 传递。

## 更新记录

### 2026-07-22

- 创建 Grok Provider 文档。
- 随视频集成模块迁移到 `src/videoIntegrations/providers/grok/`。
- 记录已确认的提交、轮询、状态和结果 URL 协议。
- 标记图生视频 REST 图片字段及跨域下载行为为待确认。
- 尚未开始代码实现或测试。

### 2026-07-22（文生视频接入）

- 新增 `client.ts`、`request.ts`、`response.ts`、`types.ts`、`index.ts` 和 `grok.test.ts`。
- 已实现 `POST /v1/videos/generations`、`GET /v1/videos/{request_id}`、Bearer Token 和 `AbortSignal` 传递。
- 已实现 `pending`、`done`、`expired`、`failed` 到公共状态的转换。
- `request_id` 和轮询间隔会在首次查询前持久化，页面刷新后只恢复查询，不重复创建任务。
- 图生视频仍未实现：请求字段未确认时不构造猜测性 JSON，带图输入会记录 `[Grok Video]` 日志并返回明确错误。
- 已通过 TypeScript 编译及 Grok Provider 定向 Vitest 测试。

### 2026-07-22（参数范围与批量生成）

- UI 能力固定为时长 `4/6/8/10/12/15` 秒和比例 `9:16/16:9`。
- 一次生成 `1-4` 个视频由业务层拆成独立请求，Grok 请求映射仍只包含已确认的 `model`、`prompt`、`duration`、`aspect_ratio`、`resolution`。
- 新增视频提示词 Agent 不改变 Grok Provider 协议或职责。
- 已通过生产构建、Grok Provider、批量任务和 Composer UI 定向测试。

### 2026-07-22（相对视频地址）

- 兼容完成响应返回的 `/v1/videos/{request_id}/content` 相对地址。
- 该地址会映射到当前视频 Profile 的代理路径，并保留 API 认证；绝对地址不附加 API Key。
- 修复任务轮询已完成但临时视频下载失败的问题。
