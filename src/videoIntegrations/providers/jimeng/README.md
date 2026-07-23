# 集梦视频 Provider

## 当前状态

- 状态：文生视频已实现。
- API 来源：[`iptag/jimeng-api`](https://github.com/iptag/jimeng-api)。
- 接入方式：Sub2API 使用 Grok 平台、API Key 账号，将请求转发到集梦代理的 `/v1` Base URL。
- 当前支持：JSON 文生视频。
- 最后更新：2026-07-23。

## Sub2API 配置

```text
平台：Grok
账号类型：API Key
Base URL：https://jimeng-api-us.songjiaaa.ccwu.cc/v1
API Key：集梦 sessionid
```

前端仍请求当前视频 Profile 的 `/videos/generations`。模型名以 `jimeng-video-` 开头时，注册表选择集梦 Provider；Sub2API 平台字段仍保持 Grok，不需要增加 Sub2API 平台类型。

## 请求协议

```http
POST /v1/videos/generations
Authorization: Bearer <Sub2API Key>
Content-Type: application/json
```

```json
{
  "model": "jimeng-video-3.5-pro",
  "prompt": "海边日落，镜头缓慢向前推进",
  "ratio": "16:9",
  "resolution": "720p",
  "duration": 5
}
```

集梦使用 `ratio`，不同于 Grok 的 `aspect_ratio`。一次生成数量仍由业务层拆成多个独立请求，不发送 `n`。

## 响应协议

`jimeng-api` 在服务端内部完成任务提交和轮询，请求会一直等待到视频完成，然后返回 OpenAI 风格结果：

```json
{
  "created": 1750000000,
  "data": [
    {
      "url": "https://example.com/video.mp4",
      "revised_prompt": "海边日落，镜头缓慢向前推进"
    }
  ]
}
```

Provider 直接把 `data[0].url` 转为公共 `VideoOutput`，不创建远程任务，也不调用轮询接口。

## 能力

- `jimeng-video-3.5-pro`：`5`、`10`、`12` 秒。
- `jimeng-video-sora2`：`4`、`8`、`12` 秒。
- `jimeng-video-veo3` / `veo3.1`：固定 `8` 秒。
- `jimeng-video-seedance-2.0` / `seedance-2.0-fast`：`4-15` 秒整数。
- 其他集梦视频模型：`5`、`10` 秒。
- 产品当前展示比例：`9:16`、`16:9`。
- `jimeng-video-3.0` 和 `jimeng-video-3.0-fast` 展示 `720p`、`1080p`；其他模型固定展示 `720p`，代理可能忽略该字段。

## 当前限制

- 同步请求尚未返回时刷新页面，前端没有可保存的任务 ID，无法恢复，只能重新提交。
- `jimeng-api` 支持图片上传，但 multipart 请求经过 Sub2API Grok 视频路由的实际透传行为尚未验证。本次不猜测字段，带图请求会明确提示暂不支持。
- 集梦代理内部生成最长可能等待较久，Sub2API 和浏览器连接需要保持可用。

## 更新记录

### 2026-07-23（首次接入）

- 新增集梦文生视频 Provider、模型识别、请求映射和同步结果解析。
- 公共 runner 支持 Provider 提交后直接返回视频结果，同时保持 Grok、Gemini 的异步任务流程。
- 增加模型能力、Bearer 认证、请求端点、响应缺失和同步 runner 测试。
- 图生视频等待 Sub2API multipart 真实请求验证。
