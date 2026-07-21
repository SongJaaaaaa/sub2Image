# Grok 视频 Provider

## 当前状态

- 状态：协议调研完成，尚未实现。
- 计划模型：`grok-imagine-video`。
- 计划支持：文生视频、单图生视频。
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

成功结果位于 `video.url`。该 URL 是临时地址，业务层必须及时下载并保存，不能只持久化远程 URL。

### 当前能力

| 能力 | 状态 | 说明 |
|---|---|---|
| 文生视频 | 计划支持 | 无输入图片 |
| 单图生视频 | 计划支持 | 支持公网 URL、data URI 或 xAI file ID |
| 参考图生视频 | 后续评估 | 第一阶段不实现 |
| 视频编辑 | 后续评估 | 第一阶段不实现 |
| 视频延长 | 后续评估 | 第一阶段不实现 |

当前确认的生成参数：

- 时长：1-15 秒。
- 比例：`1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`。
- 分辨率：`480p`、`720p`。
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
