# Gemini/Veo 视频 Provider

## 当前状态

- 状态：待调研，尚未实现。
- 目标能力：文生视频、图生视频。
- 具体模型、端点、认证和参数：待官方文档及真实响应确认。
- 最后更新：2026-07-22。

## 接入原则

- Gemini/Veo 的原始 operation、状态和响应类型只保留在本目录。
- long-running operation 标识统一转换为 `VideoJob.remoteId`。
- 业务层不识别 Gemini operation name 或厂商状态值。
- 临时视频结果由公共 `videoStorage` 下载并保存。

## 计划文件

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

## 接入前必须确认

1. 使用 Gemini Developer API、Vertex AI，还是项目已有中转服务。
2. API Key、OAuth 或服务账号认证方式。
3. 文生视频和图生视频的模型名称及端点。
4. long-running operation 的查询方式和最终状态。
5. 图片输入格式、数量和大小限制。
6. 时长、比例、分辨率和音频能力。
7. 视频结果的保存期限和下载权限。
8. 限流、计费、内容审核和失败错误结构。

上述内容未确认前，不在公共协议或代码中加入 Gemini 专属推测字段。

## 预期转换

- operation name 转换为 `VideoJob.remoteId`。
- 未完成 operation 转换为公共 `pending`。
- 成功结果转换为包含视频 URL 的公共 `done`。
- operation 错误转换为公共 `failed`。

具体字段以开发时的官方文档和真实响应为准。

## 测试要求

开始实现后至少覆盖：

- 认证和端点。
- 文生视频、图生视频请求映射。
- operation 标识提取。
- 等待、成功和失败状态映射。
- 视频 URL 提取。
- AbortSignal 传递。

## 更新记录

### 2026-07-22

- 创建 Gemini/Veo Provider 文档模板。
- 随视频集成模块迁移到 `src/videoIntegrations/providers/gemini/`。
- 当前没有写入未经验证的 API 字段。
- 尚未开始协议调研、代码实现或测试。
