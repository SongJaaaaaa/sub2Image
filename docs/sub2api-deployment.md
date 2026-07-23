# 新服务器接入 Sub2API 部署指南

本文档用于把 `sub2Image` 部署到一台新的 Linux 服务器，并接入一个新的 Sub2API 服务。

> 云端图片、视频、任务和用户 Skill 不保存在 Sub2API，也不通过修改 Sub2API 实现。该功能使用独立 Cloud Server，并仅调用 Sub2API 的 `GET /api/v1/auth/me` 校验用户身份。完整方案见根目录 `CLOUD_STORAGE_PLAN.md`。

## 1. 部署结构

```text
用户浏览器
  ↓ HTTPS
你的图片站域名
  ↓ 反向代理
app（sub2Image 前端 + Nginx）
  ├─ /api-proxy/*    → Sub2API /v1/*
  ├─ /sub2api-auth/* → Sub2API /api/v1/*
  ├─ /sub2api-v1/*   → Sub2API /v1/*
  └─ /cloud-api/*    → cloud:8081/api/*
                           ├─ 身份校验 → 生产 Sub2API /api/v1/auth/me
                           ├─ 元数据   → cloud-db（独立 PostgreSQL）
                           └─ 文件     → cloud-files（Docker volume）
```

前端业务只需要配置一个 `SUB2API_URL`。用户登录后，前端读取该用户的分组；选择模型时在内部使用对应分组的用户 API Key 直接请求 `GET /v1/models`，不需要管理员 API Key 或额外的 Bridge 服务。

Cloud Server 是同一 Compose 项目中的独立服务，只接收自己的 `DATABASE_URL`。它不会连接、修改或复制 Sub2API 数据库，也不保存用户 token；每个云端请求都使用浏览器传入的 access token 调用生产 Sub2API 的 `GET /api/v1/auth/me` 校验身份。

## 2. 准备信息

部署前准备以下信息：

- 一台 Linux 服务器
- Docker 和 Docker Compose
- 一个已解析到服务器的图片站域名
- Sub2API 的 HTTPS 地址：`https://api.sjiaa.cc.cd`
- 足够保存云端图片和视频的磁盘空间

Sub2API 后台还需要提前准备：

- 用户和用户 API Key
- API Key 已绑定分组
- 分组中至少有一个状态正常且允许调度的图片账号
- 账号支持所需模型，例如 `gpt-image-2`
- 上游账号有可用额度

## 3. 安装 Docker

以下命令适用于常见的 Ubuntu/Debian 服务器：

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker --version
docker compose version
```

## 4. 拉取项目

```bash
git clone https://github.com/SongJaaaaaa/sub2Image.git
cd sub2Image
```

## 5. 创建环境变量

复制示例文件：

```bash
cp deploy/sub2api.env.example .env
openssl rand -hex 32
```

把第二条命令生成的随机值填入 `CLOUD_DB_PASSWORD`，然后编辑 `.env`：

```env
SUB2API_URL=https://api.sjiaa.cc.cd
APP_PORT=8080
CLOUD_DB_PASSWORD=替换为刚生成的随机值
```

### `SUB2API_URL`

填写 Sub2API 基础地址，末尾不要添加 `/v1`：

```env
SUB2API_URL=https://api.sjiaa.cc.cd
```

项目会自动请求：

```text
https://api.sjiaa.cc.cd/api/v1/auth/login
https://api.sjiaa.cc.cd/api/v1/keys
https://api.sjiaa.cc.cd/v1/models
https://api.sjiaa.cc.cd/v1/images/generations
https://api.sjiaa.cc.cd/v1/images/edits
https://api.sjiaa.cc.cd/v1/responses
```

`GET /v1/models` 使用用户在 Agent 配置中选择的 API Key 作为 Bearer Token。Key 绑定的分组决定返回哪些模型。

云端存储的身份校验固定使用生产 Sub2API。要启用云端存储，`SUB2API_URL` 应指向该生产实例；如果前端改接其他独立 Sub2API，其登录 token 不能用于生产实例的云端身份校验。

### `APP_PORT`

前端容器映射到服务器的本地端口，默认使用 `8080`：

```env
APP_PORT=8080
```

如果端口已被占用，可以改成其他未使用端口，例如 `18080`。

### `CLOUD_DB_PASSWORD`

独立云端 PostgreSQL 的 `cloud` 用户密码。首次启动前必须设置，建议只使用 `openssl rand -hex 32` 生成的十六进制值，避免连接 URL 中出现需要转义的字符：

```env
CLOUD_DB_PASSWORD=替换为openssl生成的64位十六进制值
```

该密码只用于 Compose 内网中的 `cloud` 与 `cloud-db`，不要提交 `.env`，也不要把它填入 Sub2API。数据库容器和 Cloud Server 均不映射宿主机端口。

## 6. 启动项目

先检查 Compose 配置，再构建并启动：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml config --quiet
docker compose --env-file .env -f deploy/compose.sub2api.yaml up -d --build
```

首次启动时，`cloud-db` 会自动创建独立的 `cloud` 数据库和用户；数据库健康后，`cloud` 会自动执行 `server/migrations/` 中尚未执行的迁移，随后 `app` 才会启动。现有部署升级时也使用相同流程，不需要手动执行 SQL。

查看容器状态：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml ps
```

`cloud-db` 和 `cloud` 应显示为 `healthy`，`app` 应显示为 `running`。确认云端数据库已建表：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml exec -T cloud-db psql -U cloud -d cloud -c '\dt'
```

查看日志：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml logs -f --tail=200
```

Cloud Server 日志中不应出现 access token、Authorization Header 或数据库密码。

## 7. 本机验证

假设 `APP_PORT=8080`：

```bash
curl -I http://127.0.0.1:8080
curl -H 'Authorization: Bearer <用户 API Key>' http://127.0.0.1:8080/sub2api-v1/models
docker compose --env-file .env -f deploy/compose.sub2api.yaml exec -T cloud node -e "fetch('http://127.0.0.1:8081/health').then(async (res) => { console.log(await res.text()); process.exit(res.ok ? 0 : 1) }).catch((err) => { console.error(err); process.exit(1) })"
```

模型接口正常时返回 OpenAI 兼容列表，例如：

```json
{"object":"list","data":[{"id":"gpt-image-2"}]}
```

Cloud Server 健康接口正常时返回：

```json
{"data":{"status":"ok"}}
```

还可以使用登录获得的 Sub2API access token 验证完整的同源代理和身份校验链路。它与用于模型请求的用户 API Key 不是同一种凭据：

```bash
curl -H 'Authorization: Bearer <Sub2API access token>' http://127.0.0.1:8080/cloud-api/account
```

如果模型列表请求失败，查看应用日志：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml logs --tail=200 app
docker compose --env-file .env -f deploy/compose.sub2api.yaml logs --tail=200 cloud cloud-db
```

常见原因：

- `SUB2API_URL` 填写错误
- 用户 API Key 无效或已禁用
- 用户 API Key 尚未绑定分组
- 分组没有配置可用模型
- 新服务器无法访问 Sub2API
- Sub2API HTTPS 证书或反向代理异常

如果模型接口正常但云端接口失败，检查 `cloud` 和 `cloud-db` 是否健康、服务器能否访问生产 Sub2API、登录 access token 是否过期，以及云端文件卷是否有足够空间；以 `cloud` 日志中的实际错误为准，不要猜测后增加前端兼容判断。

## 8. 配置网站域名

推荐使用 Caddy 或 Nginx 将域名反向代理到 `127.0.0.1:${APP_PORT}`。

### Caddy 示例

```caddyfile
image.example.com {
  reverse_proxy 127.0.0.1:8080
}
```

重载 Caddy：

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

### Nginx 示例

```nginx
server {
    listen 80;
    server_name image.example.com;
    client_max_body_size 600m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # 覆盖客户端提交的同名 Header，避免伪造 Cloud Server 转发给身份服务的来源 IP。
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
```

配置 HTTPS 后，访问：

```text
https://image.example.com
```

## 9. 首次使用检查

打开网站后依次检查：

1. 进入“设置 → Sub2API”
2. 登录新的 Sub2API 用户账号
3. 确认能读取账号的可用分组
4. 进入“设置 → Agent 配置”
5. 分别选择文本与图像使用的分组和模型
6. 使用短提示词生成一张测试图片
7. 打开“提示词库”，确认提示词列表可以加载
8. 将测试任务保存到云端，确认任务显示云端状态
9. 打开“仅看云端”，刷新页面后确认任务和缩略图仍可加载

如果登录成功但没有模型，检查：

- 用户 API Key 是否绑定分组
- 分组内是否有可调度账号
- 账号是否支持对应模型
- 用户 API Key 请求 `GET /v1/models` 是否成功

如果生成图片提示 `Upstream service temporarily unavailable`，说明请求已经到达 Sub2API，但可用上游全部失败。应检查 Sub2API 图片请求日志、账号额度、账号状态和上游响应，不要先修改前端判断。

## 10. 备份和恢复

云端数据由 `cloud-db` 中的元数据和 `cloud-files` 中的文件共同组成，必须成对备份。备份目录放在项目目录之外，避免被 Git 或 Docker 构建上下文收集。以下流程会在受限权限下写入归档，任一命令失败就停止，并在退出时恢复服务：

```bash
set -euo pipefail
umask 077

dc() {
  docker compose --env-file .env -f deploy/compose.sub2api.yaml "$@"
}

BACKUP_DIR="../sub2image-backups/cloud-$(date +%F-%H%M%S)"
mkdir -p "$BACKUP_DIR"

resume() {
  dc up -d
}
trap resume EXIT

dc stop app cloud
dc exec -T cloud-db pg_dump -U cloud -d cloud -Fc > "$BACKUP_DIR/cloud-db.dump"
dc run --rm --no-deps -T cloud tar -C /data/cloud -czf - . > "$BACKUP_DIR/cloud-files.tar.gz"
dc exec -T cloud-db pg_restore --list < "$BACKUP_DIR/cloud-db.dump" > /dev/null
dc run --rm --no-deps -T cloud tar -tzf - < "$BACKUP_DIR/cloud-files.tar.gz" > /dev/null

(
  cd "$BACKUP_DIR"
  sha256sum cloud-db.dump cloud-files.tar.gz > SHA256SUMS
)

dc up -d
trap - EXIT
dc ps
```

确认服务恢复健康，并把整个备份目录和 `.env` 分开加密保存到服务器之外。恢复会替换当前数据库和文件，执行前先为当前数据再做一份备份。恢复前会先验证校验和及两个归档，再重建 `cloud` 数据库，确保旧备份中不存在的新版数据库对象不会残留：

```bash
set -euo pipefail

dc() {
  docker compose --env-file .env -f deploy/compose.sub2api.yaml "$@"
}

RESTORE_DIR=../sub2image-backups/cloud-2026-01-01-120000

(
  cd "$RESTORE_DIR"
  sha256sum -c SHA256SUMS
)
dc exec -T cloud-db pg_restore --list < "$RESTORE_DIR/cloud-db.dump" > /dev/null
dc run --rm --no-deps -T cloud tar -tzf - < "$RESTORE_DIR/cloud-files.tar.gz" > /dev/null

dc stop app cloud
dc exec -T cloud-db psql -v ON_ERROR_STOP=1 -U cloud -d postgres -c 'DROP DATABASE IF EXISTS cloud WITH (FORCE)'
dc exec -T cloud-db psql -v ON_ERROR_STOP=1 -U cloud -d postgres -c 'CREATE DATABASE cloud OWNER cloud'
dc exec -T cloud-db pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -U cloud -d cloud < "$RESTORE_DIR/cloud-db.dump"
dc run --rm --no-deps -T cloud sh -c 'find /data/cloud -mindepth 1 -delete && tar -C /data/cloud -xzf -' < "$RESTORE_DIR/cloud-files.tar.gz"

dc up -d
dc ps
```

恢复流程在替换数据后失败时会保持 `app` 和 `cloud` 停止。根据终端中的实际错误修复后重新执行恢复，不要启动只恢复了一半的服务。

## 11. 更新和回滚

先按上一节完成备份，再记录当前版本、拉取代码并重建。Cloud Server 会在启动时自动执行新增迁移：

```bash
cd sub2Image
mkdir -p ../sub2image-backups
git rev-parse HEAD > ../sub2image-backups/pre-upgrade-revision.txt
git pull --ff-only
docker compose --env-file .env -f deploy/compose.sub2api.yaml config --quiet
docker compose --env-file .env -f deploy/compose.sub2api.yaml up -d --build
docker compose --env-file .env -f deploy/compose.sub2api.yaml ps
docker compose --env-file .env -f deploy/compose.sub2api.yaml logs --since=10m
```

如果新版本异常，先切回升级前的代码并重建：

```bash
git switch --detach "$(cat ../sub2image-backups/pre-upgrade-revision.txt)"
docker compose --env-file .env -f deploy/compose.sub2api.yaml up -d --build
```

代码回滚不会自动撤销已执行的数据库迁移。如果旧版本与新结构不兼容，按上一节同时恢复升级前的数据库和文件备份，再检查三个服务的状态与健康接口。

## 12. 停止和删除容器

停止容器：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml stop
```

停止并删除项目容器：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml down
```

该命令不会删除 `cloud-db` 和 `cloud-files` 两个持久卷，也不会删除外部 Sub2API 的数据库、Redis、用户或账号数据。不要在没有完整备份时执行带 `--volumes` 或 `-v` 的 `down`，否则会删除本机全部云端元数据和文件。

## 13. 安全要求

- `.env` 不要提交到 Git
- `CLOUD_DB_PASSWORD` 使用独立随机值，不要复用 Sub2API 或系统登录密码
- 云端备份包含用户生成内容，应限制文件权限并保存到受控位置
- 不要把用户 API Key 写入源码或部署文档
- 不要在浏览器控制台或服务器日志中输出完整用户 API Key
- 建议使用 SSH 密钥登录服务器
- 防火墙只公开 `22`、`80`、`443`
- `APP_PORT` 建议只通过 `127.0.0.1` 或防火墙限制访问
- `cloud` 和 `cloud-db` 只通过 Compose 内网访问，不要单独映射公网端口
- 用户 API Key 泄露后立即在 Sub2API 中禁用并更换
