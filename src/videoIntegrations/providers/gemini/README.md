# Gemini/Veo 视频 Provider

## 当前状态

- 状态：代码接入完成，真实 Sub2API/Veo 付费任务待验证。
- 已实现能力：文生视频、单张起始图生视频、异步 operation 轮询、视频下载。
- 协议来源：Gemini Developer API 官方 Veo REST 文档，最后核对日期为 2026-07-22。
- 最后更新：2026-07-22。

## 文件结构

```text
gemini/
├── README.md
├── index.ts
├── client.ts
├── request.ts
├── response.ts
├── types.ts
└── gemini.test.ts
```

## 端点与认证

Google 官方 Gemini API：

```text
POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning
GET  https://generativelanguage.googleapis.com/v1beta/{operation-name}
```

认证头为：

```text
x-goog-api-key: <GEMINI_API_KEY>
```

项目当前配置使用 Sub2API Profile：

```text
POST /sub2api-v1/models/{model}:predictLongRunning
GET  /sub2api-v1/{operation-name}
```

Sub2API 入口使用用户 Key：

```text
Authorization: Bearer <SUB2_API_KEY>
```

## 请求映射

文生视频请求：

```json
{
  "instances": [
    {
      "prompt": "视频提示词"
    }
  ],
  "parameters": {
    "aspectRatio": "16:9",
    "durationSeconds": 6,
    "numberOfVideos": 1,
    "resolution": "720p"
  }
}
```

单图生视频在同一个 instance 中增加起始图：

```json
{
  "image": {
    "inlineData": {
      "mimeType": "image/png",
      "data": "<base64>"
    }
  }
}
```

业务层的 `n` 不进入 Gemini 请求。每个本地任务固定发送 `numberOfVideos: 1`。

## 模型能力

| 模型系列 | 时长 | 分辨率 | 比例 |
|---|---|---|---|
| Veo 3.1 / Fast | 4、6、8 秒 | 720p、1080p、4k | 16:9、9:16 |
| Veo 3.1 Lite | 4、6、8 秒 | 720p、1080p | 16:9、9:16 |
| Veo 3.0 / Fast | 8 秒 | 720p、1080p | 16:9、9:16 |
| Veo 2.0 | 5、6、8 秒 | UI 固定为 720p，请求不发送 `resolution` | 16:9、9:16 |

官方限制：1080p 和 4k 必须使用 8 秒；Veo 3.0 的 1080p 仅支持 16:9。当前公共模式只接入一张起始图，不包含最后一帧、参考图、视频扩展或视频编辑。

## operation 映射

- 提交响应的 `name` 转换为 `VideoJob.remoteId`。
- `done` 不为 `true` 时转换为公共 `pending`。
- `error.message` 或 `error.status` 转换为公共 `failed`。
- 成功视频读取 `response.generateVideoResponse.generatedSamples[0].video.uri`。
- 没有视频但返回 `raiMediaFilteredReasons` 时，原因转换为公共失败信息。

默认轮询间隔为 10 秒，与官方示例保持一致。页面刷新后直接使用已保存的 operation name 恢复轮询，不重复提交。

## 视频下载

- Google 官方 Profile：保留官方文件 URI，下载时携带 `x-goog-api-key`。
- Sub2API Profile：把 `generativelanguage.googleapis.com/v1beta/files/...` 映射到 `/sub2api-v1/files/...`，下载时携带 Bearer Key。
- 非 Google 的绝对 CDN URL 不附带认证头。

## 测试覆盖

- 文生视频请求映射。
- 单图 `inlineData` 映射。
- Veo 2、3.0、3.1 能力映射。
- operation name、等待、完成、错误和安全过滤映射。
- Sub2API 文件 URI 改写。
- Bearer 与 `x-goog-api-key` 认证。
- 提交和轮询的 `AbortSignal` 传递。

## 待真实接口确认

1. Sub2API 当前部署是否完整透传 `predictLongRunning`、operation 查询和 `files/:download`。
2. Sub2API 的真实完成响应是否保持官方 `generateVideoResponse.generatedSamples` 结构。
3. 视频下载重定向、保存期限、计费、内容审核和限流行为。

遇到真实响应与本文不一致时，应保留任务中的原始错误正文并根据实际日志修改本 Provider，不增加猜测性兼容分支。

## 更新记录

### 2026-07-22

- 创建 Gemini/Veo Provider 文档模板。
- 随视频集成模块迁移到 `src/videoIntegrations/providers/gemini/`。
- 当前没有写入未经验证的 API 字段。
- 尚未开始协议调研、代码实现或测试。

### 2026-07-22（首次接入）

- 按 Gemini Developer API 官方 REST 文档实现 `predictLongRunning` 和 operation 轮询。
- 实现文生视频、单图生视频、能力映射、错误状态和视频下载地址转换。
- 项目 Sub2API 入口使用 Bearer Key，同时保留 Google 官方 `x-goog-api-key` 路径。
- 已通过生产构建和完整 Vitest（75 个测试文件、562 项测试）。
- 尚未使用真实 Veo Key 发起付费任务，真实 Sub2API 响应与下载链路待验证。
