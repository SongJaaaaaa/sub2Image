# 新服务器接入 Sub2API 部署指南

本文档用于把 `sub2Image` 部署到一台新的 Linux 服务器，并接入一个新的 Sub2API 服务。

## 1. 部署结构

```text
用户浏览器
  ↓ HTTPS
你的图片站域名
  ↓ 反向代理
sub2Image 前端容器
  ├─ /api-proxy/*    → Sub2API /v1/*
  ├─ /sub2api-v1/*   → Sub2API /v1/*
  └─ /sub2-bridge/*  → 容器内 Sub2 Bridge
                            ↓
                       Sub2API 管理接口
```

Sub2API 的普通接口和管理接口使用同一个基础地址，因此只配置一个 `SUB2API_URL`。

## 2. 准备信息

部署前准备以下信息：

- 一台 Linux 服务器
- Docker 和 Docker Compose
- 一个已解析到服务器的图片站域名
- 新 Sub2API 的 HTTPS 地址，例如 `https://api.example.com`
- 新 Sub2API 的管理员 API Key

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
```

编辑 `.env`：

```env
SUB2API_URL=https://api.example.com
SUB2API_ADMIN_KEY=admin-replace-me
APP_PORT=8080
```

### `SUB2API_URL`

填写 Sub2API 基础地址，末尾不要添加 `/v1`：

```env
SUB2API_URL=https://api.example.com
```

项目会自动请求：

```text
https://api.example.com/v1/images/generations
https://api.example.com/v1/images/edits
https://api.example.com/v1/responses
https://api.example.com/api/v1/admin/accounts
```

### `SUB2API_ADMIN_KEY`

填写 Sub2API 管理员 API Key。这个 Key 只保存在服务器端，用于查询用户 Key 所属分组、分组账号和模型，不会发送给浏览器。

不要把真实 Key 写进源码、Dockerfile、部署文档或提交到 GitHub。

### `APP_PORT`

前端容器映射到服务器的本地端口，默认使用 `8080`：

```env
APP_PORT=8080
```

如果端口已被占用，可以改成其他未使用端口，例如 `18080`。

## 6. 启动项目

在项目根目录执行：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml up -d --build
```

查看容器状态：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml ps
```

查看日志：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml logs -f --tail=200
```

## 7. 本机验证

假设 `APP_PORT=8080`：

```bash
curl -I http://127.0.0.1:8080
curl http://127.0.0.1:8080/sub2-bridge/health
```

健康接口正常时返回：

```json
{"ok":true}
```

如果 Bridge 启动失败，查看日志：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml logs --tail=200 sub2-bridge
```

常见原因：

- `SUB2API_URL` 填写错误
- `SUB2API_ADMIN_KEY` 无效
- 新服务器无法访问 Sub2API
- Sub2API HTTPS 证书或反向代理异常

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

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
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
3. 选择用户自己的 API Key
4. 确认能读取 Key 所属分组和模型
5. 选择 `gpt-image-2` 或新 Sub2API 实际支持的模型
6. 使用短提示词生成一张测试图片
7. 打开“提示词库”，确认提示词列表可以加载

如果登录成功但没有模型，检查：

- 用户 API Key 是否绑定分组
- 分组内是否有可调度账号
- 账号是否支持对应模型
- 管理员 API Key 是否有权读取账号和模型

如果生成图片提示 `Upstream service temporarily unavailable`，说明请求已经到达 Sub2API，但可用上游全部失败。应检查 Sub2API 图片请求日志、账号额度、账号状态和上游响应，不要先修改前端判断。

## 10. 更新项目

```bash
cd sub2Image
git pull
docker compose --env-file .env -f deploy/compose.sub2api.yaml up -d --build
```

只查看最近日志：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml logs --since=10m
```

## 11. 停止和删除容器

停止容器：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml stop
```

停止并删除项目容器：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml down
```

该命令不会删除外部 Sub2API 的数据库、Redis、用户或账号数据。

## 12. 安全要求

- `.env` 不要提交到 Git
- 不要把管理员 Key 写入前端代码
- 不要在浏览器控制台输出管理员 Key
- 建议使用 SSH 密钥登录服务器
- 防火墙只公开 `22`、`80`、`443`
- `APP_PORT` 建议只通过 `127.0.0.1` 或防火墙限制访问
- 管理员 Key 泄露后立即在 Sub2API 中更换
