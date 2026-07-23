# 音色工具与字幕识别开发方案

## 目标

新增两个独立 Workspace Tool：

- 音色工具：使用 Edge TTS 将用户输入文字生成 MP3。
- 字幕识别：使用 Whisper 从视频人声生成可校对、可导出的字幕。

浏览器负责素材选择、参数编辑、试听和文件导出。Cloud Server 负责 Sub2API 鉴权、参数校验和识别任务状态；仅在 Docker 内网开放的 Python Speech Worker 负责 Edge TTS、FFmpeg 和 faster-whisper。

第一版不修改视频剪辑器，不识别画面硬字幕，不做说话人区分、翻译、字幕烧录，也不把 MP3、字幕或临时识别视频保存为云资源。

## 架构

```text
Browser
  -> /cloud-api/media/*
Cloud Server
  -> Sub2API /api/v1/auth/me
  -> PostgreSQL cloud_media_jobs
  -> /data/media-jobs 临时目录
  -> Speech Worker（Docker 内网）
       -> edge-tts
       -> FFmpeg
       -> faster-whisper small / CPU int8
```

Cloud Server 不执行 Python 模型代码，Speech Worker 不接收浏览器 token。Worker 使用独立模型缓存卷和媒体临时卷，不直接访问 PostgreSQL、Sub2API 或云资源表。

## 音色工具

### 用户流程

1. 输入最多 5000 个字符的文字。
2. 搜索音色，按语言和性别筛选，默认选择 `zh-CN-XiaoxiaoNeural`。
3. 调整语速、音调和音量。
4. 使用当前文字前 80 个字符试听，或生成完整 MP3。
5. 在页面中播放并下载结果。

页面在桌面端使用左右两栏，左侧为文字、参数和结果，右侧为音色库；移动端改为单列。没有文字时试听和生成按钮均不可用。新的音频结果替换旧结果时必须释放旧 Object URL，离开页面时取消请求并释放资源。

### API

```text
GET  /api/media/voices
POST /api/media/tts
```

音色列表成功响应：

```json
{"data":[{"name":"zh-CN-XiaoxiaoNeural","locale":"zh-CN","gender":"Female","displayName":"Xiaoxiao"}]}
```

TTS 请求：

```json
{"text":"你好","voice":"zh-CN-XiaoxiaoNeural","rate":0,"pitch":0,"volume":0}
```

成功直接返回 `audio/mpeg`。`rate`、`pitch`、`volume` 是整数百分比或 Hz 偏移，由 Cloud Server 转换为 Edge TTS 参数字符串。音色列表在 Cloud Server 内存缓存六小时。

## 字幕识别

### 用户流程

1. 上传 MP4、WebM、MOV，或从当前设备 IndexedDB 视频库选择视频。
2. 预览视频并选择自动检测、中文、英语、日语或韩语。
3. 上传并创建异步识别任务。
4. 轮询任务状态；刷新后使用本地记录的任务 ID 恢复。
5. 校对每段字幕的开始时间、结束时间和文字，点击字幕可定位视频。
6. 导出 UTF-8 SRT、VTT，或复制纯文本。

视频沿用 600MB 上限，时长最多两小时。每个账号同时只能有一个 `queued` 或 `running` 任务，Speech Worker 全局只运行一个识别任务。任务结果保留 24 小时，输入临时文件在成功、失败或取消后删除。

### API

```text
POST   /api/media/transcriptions
GET    /api/media/transcriptions/:id
DELETE /api/media/transcriptions/:id
```

创建接口使用 `multipart/form-data`，字段为 `file` 和可选 `language`。成功返回 HTTP 202：

```json
{"data":{"id":"uuid","status":"queued"}}
```

任务结果：

```json
{
  "data": {
    "id": "uuid",
    "status": "succeeded",
    "language": "zh",
    "duration": 12.4,
    "segments": [{"id":0,"start":0,"end":2.8,"text":"你好"}]
  }
}
```

状态固定为 `queued`、`running`、`succeeded`、`failed`、`canceled`。DELETE 对不存在或已取消任务幂等成功；运行中取消时写入取消标记，Worker 在段落之间检查并停止。

## 数据和清理

新增 `cloud_media_jobs`：

- `id`、`account_id`、`status`。
- 原始文件名、MIME、字节数、请求语言。
- 识别语言、时长、字幕 JSON、错误码和错误摘要。
- `created_at`、`updated_at`、`expires_at`。

数据库不保存绝对文件路径，临时目录由任务 ID 推导。任务结果不计入云资源容量，不增加 `audio` 或 `subtitle` 资源类型。每分钟维护和服务启动时清理过期任务、孤立临时目录和取消标记。

## Speech Worker

- Python 3.11、FastAPI、edge-tts、faster-whisper 和系统 FFmpeg。
- Whisper 固定使用 `small`、CPU、int8，启动时加载并复用模型。
- `/health` 用于 Compose 健康检查。
- `/voices` 返回标准化音色。
- `/tts` 返回 MP3。
- `/transcribe` 接收任务 ID、相对输入路径和语言，返回标准化段落。
- Worker 只接受 Cloud Server 所在 Docker 网络请求，不开放宿主机端口。

### 本地开发

项目根目录运行 `npm run dev:media`，在 `127.0.0.1:8081` 启动本地媒体接口，同时提供音色和字幕识别。`npm run dev:voice` 保留为同一命令的兼容入口。

本地字幕任务只保存在进程内存，上传文件写入系统临时目录并在成功、失败或取消后删除。Whisper `small` 模型在第一次识别时下载并加载，缓存同样位于系统临时目录。此入口只供单用户前端联调，不提供生产环境的账号隔离、持久任务恢复或 24 小时保留能力；生产仍使用 Cloud Server、PostgreSQL 和 Docker 内网 Speech Worker。

## 错误码

- `MEDIA_UNAVAILABLE`：Speech Worker 不可用。
- `INVALID_TTS_INPUT`：文字或音色参数无效。
- `TTS_FAILED`：语音生成失败。
- `TRANSCRIPTION_ACTIVE`：账号已有活动识别任务。
- `TRANSCRIPTION_NOT_FOUND`：任务不存在。
- `TRANSCRIPTION_FAILED`：识别失败。
- `VIDEO_TOO_LONG`：视频超过两小时。
- `UNSUPPORTED_MEDIA_TYPE`、`FILE_TOO_LARGE`：沿用云服务通用错误。

日志只记录任务 ID、阶段、HTTP 状态和错误摘要，不记录文字内容、字幕正文、Authorization Header 或 token。

## 验收

- 中文文字可以试听并下载可播放 MP3。
- 短中文视频可以识别、校对并导出有效 SRT/VTT。
- 刷新字幕页面后可以恢复未过期任务。
- 其他账号不能读取或取消当前账号任务。
- Worker 不可用时前端显示明确中文错误。
- 根项目和 `server/` 的 build、unit tests 全部通过，两个 Tool 的桌面和移动端布局无溢出。

## 实现位置

- 前端：`src/Tools/items/voiceGenerator/`、`src/Tools/items/subtitleRecognition/`。
- 前端边界：`src/Tools/adapters/mediaApi.ts`、`src/Tools/adapters/videoLibrary.ts`。
- Cloud Server：`server/src/modules/media/`、`server/migrations/003_media_jobs.sql`。
- Speech Worker：`speech-worker/`。
- 部署：`server/compose.yaml`、`deploy/compose.sub2api.yaml`。
