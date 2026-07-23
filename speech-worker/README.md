# Speech Worker

Speech Worker 是只在 Docker 内网运行的 Python 媒体处理服务，为 Cloud Server 提供 Edge TTS 音色、MP3 生成和 faster-whisper 字幕识别能力。

浏览器不能直接访问 Worker。Worker 不接收 Sub2API token、不访问 PostgreSQL，也不保存云端资源。字幕输入位于共享 `/data/media-jobs/<job-id>/input`，任务完成后由 Cloud Server 负责清理。

## 接口

- `GET /health`：模型加载完成后返回健康状态。
- `GET /voices`：返回标准化 Edge TTS 音色。
- `POST /tts`：接收文字和音色参数，返回完整 MP3。
- `POST /transcribe`：按任务 UUID 读取共享输入，返回句级时间戳。

Whisper 固定使用 `small`、CPU、int8。模型缓存目录为 `/models`，首次启动需要下载模型；后续由 Docker volume 复用。

TTS 会在拿到完整 MP3 后再返回成功。Edge 暂时未返回音频时最多重试四次并逐步延迟，仍无音频则返回 `502`，避免浏览器把空响应显示成正在播放。

## 本地运行

开发音色和字幕工具时，可以在项目根目录启动本地媒体接口：

```bash
npm run dev:media
```

`npm run dev:voice` 是同一入口的兼容命令。服务只监听 `127.0.0.1:8081`，提供真实音色、MP3 和本地异步字幕任务。字幕任务状态仅保存在进程内存，视频和 Whisper 模型缓存位于系统临时目录；首次识别会下载 `small` 模型。这个入口不替代生产环境的 Cloud Server 鉴权、PostgreSQL 任务隔离和 Docker 内网 Worker。

完整 Worker 使用以下命令运行：

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8090
```

测试使用 `python -m unittest discover -s tests`。测试通过 mock 隔离网络和模型下载。
