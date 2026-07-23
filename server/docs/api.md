# API

生产浏览器路径以 `/cloud-api` 开头，Nginx 转发到服务内部 `/api`。以下文档使用内部路径。

## 通用格式

除文件内容外，成功响应为：

```json
{"data": {}}
```

错误响应为：

```json
{"error":{"code":"UNAUTHORIZED","message":"请先登录"}}
```

所有 `/api/*` 请求必须包含：

```text
Authorization: Bearer <Sub2API access token>
```

客户端不能提交 `userId` 决定数据归属。

所有服务端 UUID 路径参数会在查询 PostgreSQL 前校验。非法 JSON、请求体过大和不支持的 Content-Type 分别保留 HTTP 400、413、415，不会转换为 500。DELETE 对当前账号内已经不存在的目标统一返回 `{"data":{"deleted":true}}`，便于丢失首次响应后安全重试。

## Health

`GET /health` 不需要鉴权，成功返回 `{"data":{"status":"ok"}}`。该检查会执行一次轻量 PostgreSQL 查询，数据库不可用时返回 500。

## Account

`GET /api/account`

```json
{
  "data": {
    "id": "cloud-account-uuid",
    "provider": "sub2api",
    "externalUserId": "42",
    "email": "user@example.com",
    "usedBytes": 1024,
    "quotaBytes": 10737418240,
    "createdAt": "2026-07-23T00:00:00.000Z",
    "lastSeenAt": "2026-07-23T00:00:00.000Z"
  }
}
```

## Uploads

`POST /api/uploads`

```json
{
  "assetId": "local-image-id",
  "kind": "image",
  "mimeType": "image/png",
  "size": 12345,
  "sha256": "64位小写十六进制",
  "metadata": {"width":1024,"height":1024,"sourceId":"可选原图ID"}
}
```

metadata 只接受 `width`、`height`、`duration`、`sourceId`，其中 `sourceId` 最长 300 字符；额外字段会被拒绝。序列化后仍有 16KB 总上限。

响应：

```json
{
  "data": {
    "id": "upload-uuid",
    "assetId": "local-image-id",
    "status": "pending",
    "uploadRequired": true
  }
}
```

如果账号内已经有相同 hash，响应直接为 `complete`、`uploadRequired: false` 并包含 `asset`。同一 `assetId` 重试不会生成重复上传；相同 ID 携带不同 hash 返回 `409 UPLOAD_CONFLICT`。

每账号最多同时保留 100 个未完成上传和 5000 个逻辑资源 ID（包括内容去重后的本地 ID 别名）。非完成上传超过 24 小时未更新且没有活跃文件 claim 时自动过期。

`PUT /api/uploads/:id/content`

- body 是原始二进制，不使用 multipart。
- `Content-Type` 必须和声明一致。
- 建议发送 `Content-Length`；存在时必须和声明大小一致。
- 服务端流式计算大小和 SHA-256。
- 路由限制为 600MB，具体图片/视频上限仍按声明类型执行。
- 文件流写入期间不持有 PostgreSQL 事务；并发 PUT 或 active claim 取消返回 `409 UPLOAD_IN_PROGRESS`。

`POST /api/uploads/:id/complete`

完成操作可重复调用，返回：

```json
{
  "data": {
    "id": "server-asset-uuid",
    "assetId": "local-image-id",
    "kind": "image",
    "mimeType": "image/png",
    "size": 12345,
    "sha256": "...",
    "metadata": {},
    "contentUrl": "/cloud-api/assets/server-asset-uuid/content",
    "createdAt": "2026-07-23T00:00:00.000Z"
  }
}
```

`DELETE /api/uploads/:id` 取消未完成上传并通过删除 outbox 清理临时文件。已完成上传返回 `409 UPLOAD_COMPLETE`；正在执行 PUT/complete 的 active claim 返回 `409 UPLOAD_IN_PROGRESS`。

## Tasks

`GET /api/tasks` 返回 `{"data": CloudTask[]}`，按更新时间倒序。

`PUT /api/tasks/:id`

```json
{
  "task": {"id":"task-1","prompt":"..."},
  "assets": [
    {"assetId":"local-image-id","role":"output","index":0},
    {"assetId":"local-image-id:thumbnail","role":"thumbnail","index":0}
  ]
}
```

- `task.id` 必须与路径 `:id` 一致。
- `assetId` 是前端本地资源 ID，不是服务端 UUID。
- role：`input`、`output`、`mask`、`original`、`video`、`poster`、`thumbnail`。
- `video` 必须引用视频资源，其余 role 必须引用图片资源。
- 同账号同任务 ID 使用覆盖式幂等保存。
- `apiKey`、`accessToken`、`refreshToken`、`authorization` 字段会从任务 JSON 中移除。
- 上述 key/token 字段的 snake_case 和 kebab-case 写法也会递归移除。

CloudTask 的 `assets` 包含资源元数据、`contentUrl`、role 和 index，不内联二进制。

覆盖任务会回收新版本不再引用且没有其他任务引用的旧资源。`DELETE /api/tasks/:id` 删除云端任务，并按同一规则回收资源。它们都不删除浏览器本地副本。

## Assets

`GET /api/assets/:id/content` 使用服务端资源 UUID。支持单段 `Range` 请求，视频响应包含 `Accept-Ranges: bytes`，所有文件响应包含 `X-Content-Type-Options: nosniff`。返回给浏览器的 `contentUrl` 固定使用同源代理路径 `/cloud-api/assets/:id/content`。

`DELETE /api/assets/:id` 只允许删除当前账号资源；仍被任务引用时返回 `409 ASSET_IN_USE`。成功返回 `{"data":{"deleted":true}}`。

## Skills

`GET /api/skills` 返回 `{"data": CloudSkill[]}`。

`PUT /api/skills/:id`

```json
{"version":1,"fileName":"SKILL.md","markdown":"原始 UTF-8 Markdown"}
```

同账号同 Skill ID 幂等覆盖。ID 使用小写 kebab-case，版本为正整数，文件名必须以 `.md` 结尾，Markdown 最大 256KB。

每账号最多保存 100 个用户 Skill；任务最多 500 个，每任务最多关联 100 个资源。任务 JSON 与 Skill Markdown 合计最大 20MB，同 ID 覆盖只按新旧内容差额计费。

`DELETE /api/skills/:id` 返回 `{"data":{"deleted":true}}`。

## Sync

`GET /api/sync/bootstrap`

```json
{"data":{"account":{},"tasks":[],"skills":[]}}
```

bootstrap 只返回元数据。缩略图是 role 为 `thumbnail` 的图片资源，客户端可优先按需下载；原图和视频仍通过 assets content 接口获取。

## Media

媒体接口不创建 `cloud_assets`，MP3 直接返回浏览器，字幕任务只临时保留 24 小时。

`GET /api/media/voices` 返回 Edge TTS 音色列表：

```json
{"data":[{"name":"zh-CN-XiaoxiaoNeural","locale":"zh-CN","gender":"Female","displayName":"Xiaoxiao"}]}
```

列表在 Cloud Server 内存缓存 6 小时。Worker 不可用时返回 `503 MEDIA_UNAVAILABLE`。

`POST /api/media/tts`

```json
{"text":"你好","voice":"zh-CN-XiaoxiaoNeural","rate":0,"pitch":0,"volume":0}
```

- `text` 长度为 1 至 5000 字符。
- `rate` 为 -50 至 100，`pitch` 为 -50 至 50，`volume` 为 -50 至 100，均为整数。
- `voice` 必须存在于当前 Edge TTS 音色列表。
- 成功响应为 `audio/mpeg`，不使用通用 JSON 包装。

`POST /api/media/transcriptions` 使用 `multipart/form-data`。可选 `language` 字段应先于 `file`，值为 `zh`、`en`、`ja` 或 `ko`；不传表示自动检测。`file` 支持 MP4、WebM、QuickTime，最大 600MB。接口先检查 Worker，再把文件流写入独立 scratch 目录，成功返回 HTTP 202：

```json
{"data":{"id":"任务 UUID","status":"queued"}}
```

同账号已有 `queued` 或 `running` 任务时返回 `409 TRANSCRIPTION_ACTIVE`。

`GET /api/media/transcriptions/:id` 只查询当前账号任务：

```json
{
  "data": {
    "id": "任务 UUID",
    "status": "succeeded",
    "language": "zh",
    "duration": 12.4,
    "segments": [{"id":0,"start":0,"end":2.8,"text":"你好"}]
  }
}
```

状态为 `queued`、`running`、`succeeded`、`failed` 或 `canceled`。视频最长两小时。处理期间 Worker 不可用、视频过长或识别失败会将任务标记为 `failed`，并返回有限错误摘要。

`DELETE /api/media/transcriptions/:id` 取消活动任务。运行中任务会写入取消标记；目标不存在或已经结束时仍幂等返回 `{"data":{"deleted":true}}`。

## 常用错误码

- `UNAUTHORIZED`：缺少 token 或 Sub2API 拒绝 token
- `AUTH_UPSTREAM_ERROR` / `AUTH_TIMEOUT`：身份服务异常
- `VALIDATION_ERROR`：JSON 结构错误
- `QUOTA_EXCEEDED`：账号容量不足
- `UNSUPPORTED_MEDIA_TYPE` / `FILE_TOO_LARGE`：类型或大小不允许
- `FILE_SIZE_MISMATCH` / `FILE_CHECKSUM_MISMATCH`：文件校验失败
- `UPLOAD_IN_PROGRESS`：同一上传正在写内容或完成
- `UPLOAD_LIMIT_EXCEEDED` / `ASSET_LIMIT_EXCEEDED`：账号上传或资源数量达到上限
- `ASSET_NOT_READY`：任务引用尚未完成的资源
- `ASSET_IN_USE`：资源仍被任务引用
- `TASK_ID_MISMATCH`：路径 ID 与任务 JSON ID 不一致
- `TASK_LIMIT_EXCEEDED` / `SKILL_LIMIT_EXCEEDED`：账号条目数达到上限
- `METADATA_QUOTA_EXCEEDED`：任务和 Skill 元数据总量达到上限
- `MEDIA_UNAVAILABLE`：Speech Worker 当前不可用
- `INVALID_TTS_INPUT` / `TTS_FAILED`：音色输入无效或生成失败
- `TRANSCRIPTION_ACTIVE`：当前账号已有活动字幕任务
- `TRANSCRIPTION_NOT_FOUND` / `TRANSCRIPTION_FAILED`：字幕任务不存在或识别失败
- `VIDEO_TOO_LONG`：视频超过两小时
