# 部署

## Docker Compose

要求 Docker 和 Docker Compose。

```bash
cd server
cp .env.example .env
openssl rand -hex 32
```

将第二条命令生成的十六进制随机值填入 `.env` 的 `CLOUD_DB_PASSWORD`，避免数据库连接 URL 出现需要额外转义的字符，然后运行：

```bash
docker compose --env-file .env up -d --build
docker compose --env-file .env ps
docker compose --env-file .env logs -f --tail=200 cloud
docker compose --env-file .env logs -f --tail=200 speech-worker
```

API 服务名固定为 `cloud`，数据库服务名为 `cloud-db`，媒体服务名为 `speech-worker`。Cloud 容器使用 Node 22，以非 root 的 `node` 用户运行；Worker 使用 Python 3.11 和非 root 的 `speech` 用户。

`speech-worker` 不映射宿主机端口，只能通过 Docker 网络的 `http://speech-worker:8090` 访问。首次启动会下载 `faster-whisper small` 模型，时间取决于网络和磁盘；模型保存在 `speech-models` 卷。Cloud 与 Worker 共享 `media-jobs` 临时卷，Cloud 负责最终清理。

服务启动时自动执行 PostgreSQL 迁移，并在监听前清理 `cloud-files` 中严格匹配驱动随机后缀的残留 `.tmp` 文件。当前部署边界是单个 `cloud` 实例独占该卷；不要让多个实例同时写入并扫描同一个本地卷。只有 `DATABASE_URL` 进入 API 容器；密码不要提交仓库。

## Nginx

Cloud API 建议只在 Docker 网络或 `127.0.0.1:8081` 暴露。浏览器通过同源 `/cloud-api/` 访问：

```nginx
location /cloud-api/ {
    proxy_pass http://cloud:8081/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;
    proxy_request_buffering off;
    proxy_read_timeout 900s;
    proxy_send_timeout 900s;
    client_max_body_size 600m;
}
```

面向浏览器的最外层 Nginx 必须用 `$remote_addr` 覆盖浏览器传入的 `X-Forwarded-For`，不能 append。Cloud Server 的 Fastify 只信任直接相连代理一跳；如果还有内层应用 Nginx，它只能原样传递外层已清洗的 `$http_x_forwarded_for`，不能再次追加地址。

如果 Nginx 在宿主机运行，将 upstream 改为 `127.0.0.1:8081`。

## 验证

```bash
curl http://127.0.0.1:8081/health
curl -H 'Authorization: Bearer <Sub2API access token>' \
  http://127.0.0.1:8081/api/account
```

健康响应应为 `{"data":{"status":"ok"}}`，该接口会执行 `SELECT 1`，数据库不可用时返回 500。账号接口会实时访问生产 Sub2API；失败时先查看 Cloud Server 日志和到 `https://api.sjiaa.cc.cd/api/v1/auth/me` 的网络连通性。

## 持久化和备份

- `cloud-db`：PostgreSQL named volume
- `cloud-files`：映射到容器 `/data/cloud`
- `speech-models`：Whisper 模型缓存，应保留以避免重启后重复下载
- `media-jobs`：字幕识别临时输入，不需要备份

停止容器但保留数据：

```bash
docker compose --env-file .env down
```

不要使用 `down -v`，除非明确要删除全部云端数据库和文件。

生产备份需同时包含 PostgreSQL dump 和 `cloud-files` 卷。`media-jobs` 不属于用户云资源，恢复时不应还原。文件清理失败会保留在 `cloud_storage_deletions`，服务每分钟及重启后自动重试。

## 安全

- 只公开 22、80、443；8081 仅本机或 Docker 网络可访问。
- 不公开 Speech Worker 的 8090 端口。
- `.env` 不提交 Git。
- 不记录 Authorization Header、access token、API Key。
- 不配置 Sub2API 数据库连接或 JWT secret。
- `/data/cloud` 和数据库备份按用户私有数据保护。
