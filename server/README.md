# Cloud Server

独立的图片、视频、任务和用户 Skill 云存储服务。它使用 Sub2API access token 验证用户身份，但拥有独立 PostgreSQL 数据库和文件目录，不读取或修改 Sub2API 数据库。

## 运行条件

- Node.js 22
- PostgreSQL 15+
- 可写的 `/data/cloud` 和 `/data/media-jobs`
- Docker 内网可访问的 Speech Worker
- `DATABASE_URL` 环境变量

## 本地命令

```bash
npm install
npm run migrate
npm run dev
npm run build
npm test
```

服务固定监听 `0.0.0.0:8081`。启动入口会自动执行未应用的迁移，并在监听前清理本地驱动因异常退出残留的专属随机 `.tmp` 文件。`GET /health` 会执行轻量数据库查询，可用于检查 API 和 PostgreSQL 是否同时可用。

## Docker Compose

```bash
cp .env.example .env
docker compose --env-file .env up -d --build
```

Compose 中 API 服务名为 `cloud`，只映射到宿主机 `127.0.0.1:8081`。生产环境通过 Nginx 将浏览器的 `/cloud-api/*` 转发到 `http://cloud:8081/api/*`。

Compose 同时启动不映射宿主机端口的 `speech-worker`。它使用 Edge TTS、系统 FFmpeg 和常驻内存的 `faster-whisper small` CPU int8 模型；`media-jobs` 是两个服务共享的临时任务卷，`speech-models` 保存模型缓存。

## 固定限制

- 图片：50MB，支持 PNG、JPEG、WebP、GIF、AVIF
- 视频：600MB，支持 MP4、WebM、QuickTime
- 音色文字：最多 5000 字符，音色列表缓存 6 小时
- 字幕识别：视频最长 2 小时，每账号最多 1 个活动任务，结果保留 24 小时
- 用户 Skill：256KB UTF-8 Markdown
- 任务 JSON：2MB
- 单资源 metadata：16KB，且只保留 `width`、`height`、`duration`、`sourceId`
- 单任务最多关联 100 个资源
- 同步元数据总量：每账号 20MB
- 数量：每账号最多 500 个任务、100 个用户 Skill
- 上传：每账号最多 100 个未完成上传，24 小时未更新自动过期
- 资源：每账号最多 5000 个本地资源 ID（包括去重别名）
- 每账号容量：10GB

普通参数集中在 `src/config.ts`。第一版只有数据库连接使用环境变量。

## 目录

- `migrations/`：PostgreSQL 迁移
- `src/modules/`：auth、account、uploads、assets、tasks、skills、sync、media
- `src/storage/`：存储驱动和文件删除重试队列
- `docs/`：架构、API、数据库和部署说明

详细说明见 [architecture.md](docs/architecture.md)、[api.md](docs/api.md)、[database.md](docs/database.md) 和 [deployment.md](docs/deployment.md)。
