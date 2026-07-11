# sub2Image

基于 React、Vite 和 TypeScript 构建的图片生成与管理前端，接入 Sub2API，实现用户登录、API Key 选择、模型加载、图片生成、图片编辑和本地画廊管理。

## 功能

- Sub2API 用户登录
- 读取用户 API Key、所属分组和可用模型
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
- Sub2API 管理员 API Key
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

项目只使用一个 Sub2API 基础地址。普通接口和管理接口不需要分别配置。

复制环境变量示例：

```bash
cp deploy/sub2api.env.example .env
```

编辑 `.env`：

```env
SUB2API_URL=https://api.example.com
SUB2API_ADMIN_KEY=admin-replace-me
APP_PORT=8080
```

配置说明：

| 配置 | 必填 | 说明 |
| --- | --- | --- |
| `SUB2API_URL` | 是 | Sub2API 基础地址，末尾不要添加 `/v1` |
| `SUB2API_ADMIN_KEY` | 是 | 管理员 API Key，只保存在服务器端 |
| `APP_PORT` | 否 | 前端本地监听端口，默认 `8080` |

管理员 API Key 不会发送给浏览器，只用于服务器端 Bridge 查询用户 Key 所属分组、分组账号和模型。

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
curl http://127.0.0.1:8080/sub2-bridge/health
```

Bridge 正常时返回：

```json
{"ok":true}
```

完整的新服务器部署流程请查看：

- [新服务器接入 Sub2API 部署指南](docs/sub2api-deployment.md)

## 使用流程

1. 打开网站
2. 进入“设置 → Sub2API”
3. 登录 Sub2API 用户账号
4. 选择用户自己的 API Key
5. 加载 Key 所属分组和支持的模型
6. 选择图片模型
7. 输入提示词并生成图片

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
- 管理员 API Key 是否有效
- 账号是否返回支持的模型列表

### 提示词库加载失败

请检查浏览器网络是否能够访问提示词远程数据源。已有缓存时会继续显示旧数据，手动刷新失败不会清空缓存。

## 安全说明

- 不要提交 `.env`
- 不要把管理员 API Key 写入前端代码
- 不要在浏览器中保存管理员 API Key
- 不要在日志中输出密码和完整密钥
- 建议使用 SSH 密钥登录服务器
- 管理员 Key 泄露后应立即更换

## 许可证

项目许可证见 [LICENSE](LICENSE)。
