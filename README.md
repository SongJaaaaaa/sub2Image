# sub2Image

基于 React、Vite 和 TypeScript 构建的图片生成与管理前端，接入 Sub2API，实现用户登录、API Key 选择、模型加载、图片生成、图片编辑和本地画廊管理。

## 功能

- Sub2API 用户登录
- 读取用户 API Key 和所属分组，并通过用户 Key 获取可用模型
- 支持 `gpt-image-2` 等 OpenAI 兼容图片模型
- 文生图和图片编辑
- 多图上传、遮罩编辑和批量任务
- 图片画廊、收藏夹、搜索和筛选
- Agent 多轮对话
- 提示词库搜索、筛选、详情查看和一键填入
- 提示词分来源缓存到 IndexedDB
- 深色模式和移动端适配

## 技术栈

- React 19
- TypeScript
- Vite
- Zustand
- Tailwind CSS
- IndexedDB
- Docker
- Nginx

## 环境要求

本地开发：

- Node.js 20 或更高版本
- npm

服务器部署：

- Linux 服务器
- Docker
- Docker Compose
- 一个可以正常访问的 Sub2API
- 已解析到服务器的域名

## 本地开发

```bash
git clone https://github.com/SongJaaaaaa/sub2Image.git
cd sub2Image
npm install
npm run dev
```

生产构建：

```bash
npm run build
```

运行测试：

```bash
npm test
```

## Sub2API 配置

项目只需要配置一个 Sub2API 基础地址。用户登录后，模型列表由用户自己的 API Key 直接请求 Sub2API 的 `GET /v1/models` 获取，不需要管理员 API Key。

复制环境变量示例：

```bash
cp deploy/sub2api.env.example .env
```

编辑 `.env`：

```env
SUB2API_URL=https://api.sjiaa.cc.cd
APP_PORT=8080
```

配置说明：

| 配置 | 必填 | 说明 |
| --- | --- | --- |
| `SUB2API_URL` | 是 | Sub2API 基础地址，末尾不要添加 `/v1` |
| `APP_PORT` | 否 | 前端本地监听端口，默认 `8080` |

部署时唯一必需的 Sub2API 配置是 `SUB2API_URL=https://api.sjiaa.cc.cd`。用户账号只用于登录并读取分组；用户在 Agent 配置中分别选择文本与图像分组和模型，应用会在内部使用对应分组的用户 Key。

如果 `SUB2API_URL` 接入了 Cloudflare，请在 WAF 中放行图片站服务器出口 IP 对 `/api/v1/*` 和 `/v1/*` 的访问。Sub2API 开启 Turnstile 时，还需要把图片站正式域名加入对应 Site Key 的允许域名。

## Docker 部署

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml up -d --build
```

查看状态：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml ps
```

查看日志：

```bash
docker compose --env-file .env -f deploy/compose.sub2api.yaml logs -f --tail=200
```

健康检查：

```bash
curl -I http://127.0.0.1:8080
curl -H 'Authorization: Bearer <用户 API Key>' http://127.0.0.1:8080/sub2api-v1/models
```

模型接口正常时返回 OpenAI 兼容列表，例如：

```json
{"object":"list","data":[{"id":"gpt-image-2"}]}
```

完整的新服务器部署流程请查看：

- [新服务器接入 Sub2API 部署指南](docs/sub2api-deployment.md)

## 使用流程

1. 打开网站首页
2. 点击“开始创作”
3. 登录 Sub2API 用户账号
4. 进入“设置 → Agent 配置”，分别选择文本与图像使用的分组和模型
5. 保存配置并开始生成图片

用户 API Key 必须已经绑定分组，分组中需要存在状态正常、允许调度且额度充足的图片账号。

## 提示词库

点击画廊搜索框右侧的“提示词库”按钮即可使用。

提示词库支持：

- 标题、正文、标签和来源搜索
- 来源筛选和标签筛选
- 提示词详情与预览图
- 一键替换当前输入
- 手动刷新远程数据
- IndexedDB 分来源缓存

选择提示词只会填入输入框，不会自动生成图片。

## 数据存储

以下数据保存在用户浏览器本地：

- 图片任务
- 图片数据
- 输入记录
- 收藏夹
- Agent 对话
- 提示词缓存

清除浏览器站点数据可能导致本地记录丢失，重要图片请及时下载。

## 常见问题

### 提示 `Upstream service temporarily unavailable`

请求已经到达 Sub2API，但当前分组中的可用上游全部失败。请检查：

- 上游账号状态
- 是否允许调度
- 账号余额和额度
- 模型是否支持
- Sub2API 图片请求日志
- 上游返回的 403、502、524 等状态

### 登录成功但没有模型

请检查：

- 用户 API Key 是否绑定分组
- 分组中是否有可用账号
- 用户 API Key 请求 `GET /v1/models` 是否成功
- 账号是否返回支持的模型列表

### 提示词库加载失败

请检查浏览器网络是否能够访问提示词远程数据源。已有缓存时会继续显示旧数据，手动刷新失败不会清空缓存。

## 安全说明

- 不要提交 `.env`
- 不要在日志中输出密码和完整密钥
- 建议使用 SSH 密钥登录服务器
- 用户 API Key 泄露后应立即在 Sub2API 中禁用并更换

## 许可证

项目许可证见 [LICENSE](LICENSE)。
