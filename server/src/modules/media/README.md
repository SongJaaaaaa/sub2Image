# Media 模块

Media 模块为音色工具和字幕识别提供经过 Sub2API 鉴权的 Cloud Server 接口。模块拥有 `cloud_media_jobs`，负责临时视频写入、任务状态、Worker 调度、取消和过期清理。

## 接口

- `GET /api/media/voices`：获取 Edge TTS 音色。
- `POST /api/media/tts`：生成并流式返回 MP3。
- `POST /api/media/transcriptions`：先检查 Worker 健康状态，再流式上传视频并创建字幕任务。
- `GET /api/media/transcriptions/:id`：查询当前账号任务，响应使用 `Cache-Control: no-store`，避免轮询复用旧状态。
- `DELETE /api/media/transcriptions/:id`：取消当前账号任务，目标不存在时幂等成功。

## 数据

`cloud_media_jobs` 保存任务状态、有限文件信息、识别语言、时长、字幕 JSON 和错误摘要。数据库不保存绝对文件路径；输入固定为 `/data/media-jobs/<job-id>/input`，取消标记固定为同目录 `cancel`。

## 依赖

模块只依赖数据库和 `MediaWorker` 接口，不直接实现 Edge TTS、FFmpeg 或 Whisper。生产实现通过 Docker 内网调用 Speech Worker，测试使用内存 mock。

## 错误和删除

Worker 在上传前不可用时接口返回 `503 MEDIA_UNAVAILABLE`；处理期间不可用时任务标记为失败。输入文件在成功、失败、取消后删除；任务记录和字幕结果在 24 小时后删除。DELETE 不删除任何云资源，因为第一版媒体输出不进入 `cloud_assets`。

修改接口、状态或清理行为时必须同步更新本 README、`server/docs/`、`docs/audio-subtitle-development.md` 和对应测试。
