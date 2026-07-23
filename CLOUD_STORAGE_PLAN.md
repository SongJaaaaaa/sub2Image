# 云端存储项目规划

本文档记录图片、视频、任务和用户 Skill 的云端保存方案。实施时以本文档为项目边界；方案发生变化时，先更新本文档，再修改代码。

## 1. 项目目标

- 保留当前 IndexedDB 和 localStorage，本地数据仍可离线使用。
- 用户可以在画廊勾选任务，主动保存到云端。
- 用户可以选择自动保存后续新生成的内容。
- 同一 Sub2API 用户换设备登录后，可以查看已保存的任务、图片、视频和用户 Skill。
- 第一版使用自有服务器磁盘，后续可切换到阿里云 OSS。

第一版不做全量实时双向同步，不同步 API Key、登录 token 等敏感配置，也不让本地删除自动删除云端数据。

## 2. 已确认的约束

- 不能修改 Sub2API，云端存储使用独立后端服务。
- 用户身份继续由现有 Sub2API 登录提供，不新增第二套账号系统。
- 生产 Sub2API 地址固定为 `https://api.sjiaa.cc.cd`。
- 云端后端通过 `GET /api/v1/auth/me` 校验 access token。
- 第一版文件保存在自有服务器，后续通过存储适配器接入阿里云 OSS。
- 后端代码要求模块清晰、可读，保持必要封装但避免过度设计。
- 每个新增业务模块必须有对应的 `README.md`，说明职责、接口、数据结构、依赖和删除行为。
- 普通运行参数使用代码默认值，不为每个参数增加环境变量；只有密码、密钥等秘密使用环境变量。

## 3. 当前项目基础

- 图片、视频、任务和 Agent 对话保存在 IndexedDB，入口位于 `src/lib/db.ts`。
- 用户导入的 Skill 以原始 Markdown 保存在 localStorage，入口位于 `src/Skills/registry.ts`。
- 画廊已有任务多选和批量操作栏，可直接增加“保存到云端”操作。
- 数据导入导出已经实现任务引用资源的收集，可复用 `src/features/dataManagement/dataTransfer.ts` 和 `src/lib/exportZip.ts` 的关联规则。
- 前端已经实现 Sub2API 登录、刷新 access token 和 Bearer 请求，入口位于 `src/lib/sub2api.ts`。

## 4. 总体架构

```text
浏览器
  |- IndexedDB / localStorage（本地数据和缓存）
  |- /sub2api-auth/* -> Sub2API（登录和用户身份）
  `- /cloud-api/*    -> Cloud Server
                           |- PostgreSQL（元数据）
                           |- 本机磁盘（第一版文件）
                           `- 阿里云 OSS（后续替换）
```

Cloud Server 使用独立数据库和文件空间，不直接读取或修改 Sub2API 数据库。

## 5. 登录校验方案

线上 `https://api.sjiaa.cc.cd` 已确认：

- 当前公开版本为 `0.1.163`。
- `GET /api/v1/settings/public` 正常返回 `200`。
- `GET /api/v1/auth/me` 在无 token 时返回 `401` 和 `UNAUTHORIZED`。

Sub2API 当前使用 HS256 JWT，但它的完整鉴权还会检查用户状态、`token_version` 和可选的 IP/User-Agent 会话绑定。因此 Cloud Server 不共享 `JWT_SECRET`，也不自行复刻 Sub2API 鉴权。

认证流程：

1. 前端调用 `/cloud-api/*` 时携带现有 `Authorization: Bearer <access_token>`。
2. Cloud Server 将 token 发送到 `https://api.sjiaa.cc.cd/api/v1/auth/me`。
3. 返回成功后，只使用响应中的 `data.id` 作为可信外部用户 ID。
4. Cloud Server 不接受前端传入的 `user_id` 作为数据归属依据。
5. Sub2API 返回 `401` 或 `403` 时，Cloud Server 拒绝当前请求。
6. Cloud Server 不持久化 access token，日志中不得记录 Authorization Header。
7. 第一版每次请求实时校验；确有性能需要时，可使用 token 的 SHA-256 作为 key 缓存最多 30 秒，不能缓存原始 token。

如生产环境启用了 IP/User-Agent 会话绑定，Cloud Server 必须转发原始 User-Agent 和由可信 Nginx 得到的客户端 IP。不得信任浏览器直接提交的 `X-Forwarded-For`。

后端认证模块对业务层只暴露简单身份：

```ts
type AuthUser = {
  id: string
  email?: string
}

interface AuthProvider {
  verify(req: AuthRequest): Promise<AuthUser>
}
```

具体实现为 `Sub2ApiAuthProvider`，任务、资源和 Skill 模块不直接调用 Sub2API。

## 6. 保存单位和范围

画廊以“任务”为云端保存单位，避免换设备后只剩文件而没有提示词和生成记录。

保存一条任务时包含：

- 任务元数据、提示词和生成参数。
- 输入图片、输出图片和遮罩图片。
- 视频文件和视频封面。
- 透明背景处理前的原图。
- 收藏状态以及任务使用的收藏夹信息。

默认不上传：

- API Key、access token、refresh token。
- 流式生成的调试中间图。
- 原始错误响应和仅用于排错的大段响应数据。
- 未被用户选择的其他任务和资源。

用户导入的 Skill 保存原始 UTF-8 Markdown、文件名、Skill ID 和版本。内置 Skill 随前端发布，不重复上传。

## 7. 前端交互

### 7.1 手动保存

- 复用画廊现有任务多选。
- 批量操作栏增加“保存到云端”。
- 上传期间显示总进度和当前状态。
- 上传完成的任务卡显示云端状态图标。
- 失败任务保留本地数据，并允许用户重试。

### 7.2 自动保存

- 数据设置页增加“自动保存新生成内容”开关。
- 未登录 Sub2API 时不能开启，并引导用户登录。
- 开启后只影响新完成的任务，不自动上传全部历史数据。

### 7.3 Skill

- 用户导入的 Skill 提供“保存到云端”和“移出云端”。
- 开启自动保存时，新导入的 Skill 自动保存到云端。
- 同 ID 的本地 Skill 和云端 Skill 内容冲突时，不静默覆盖，第一版提示用户选择保留版本。

### 7.4 换设备恢复

- 登录后先拉取云端任务元数据、Skill 和缩略图。
- 画廊先显示缩略图，原图和视频在打开或下载时按需获取。
- 已下载的资源写入 IndexedDB 作为本机缓存。
- 不在首次登录时自动下载所有视频。

## 8. 删除规则

- 删除本地任务不自动删除云端数据。
- “移出云端”是独立操作，必须明确确认。
- 删除云端数据不自动删除当前设备的本地副本。
- 服务端删除资源前检查引用，仍被其他云端任务引用的资源不能删除。
- 第一版不传播跨设备删除，也不做复杂冲突合并。

## 9. 后端技术和目录

后端已使用 TypeScript、Fastify 和 PostgreSQL 实现，放在独立的 `server/` 目录：

```text
server/
  AGENTS.md
  README.md
  docs/
    architecture.md
    api.md
    database.md
    deployment.md
  src/
    app.ts
    config.ts
    database/
    modules/
      account/README.md
      auth/README.md
      uploads/README.md
      assets/README.md
      tasks/README.md
      skills/README.md
      sync/README.md
    storage/
      README.md
      storageDriver.ts
      localStorageDriver.ts
```

模块只通过明确的 service 接口协作，不跨模块直接操作对方的数据表。简单的一次性逻辑保持内联，不为形式上的分层增加空包装。

## 10. 存储适配

业务层只依赖统一存储接口：

```ts
interface StorageDriver {
  put(input: PutObjectInput): Promise<StoredObject>
  open(key: string): Promise<ReadableStream>
  delete(key: string): Promise<void>
  exists(key: string): Promise<boolean>
}
```

- 第一版实现 `LocalStorageDriver`，文件目录固定为 `/data/cloud`。
- 数据库只保存 `objectKey`，不保存服务器绝对路径。
- 后续增加 `OssStorageDriver`，任务和资源业务逻辑不随存储供应商变化。
- 图片使用现有内容 hash 去重；视频在上传前计算 SHA-256，用于用户范围内去重。
- 上传顺序为“资源成功后提交任务元数据”，保证任务不会引用未完成文件。
- 大文件写入使用短事务 claim，文件流和临时文件到最终文件的复制不占用 PostgreSQL 事务。
- 已完成资源、临时上传对象和未确认最终对象都通过数据库 outbox 补偿删除；失败会保留记录并周期重试。
- 本地驱动原子写入产生的 `<业务文件>.<v4 UUID>.tmp` 不属于业务 object key：正常异常会即时删除，SIGKILL 残留由单实例在监听前按专属文件名递归清扫。

## 11. 配置原则

固定业务参数集中在一个后端配置模块中，不拆成大量环境变量：

```ts
export const config = {
  sub2ApiUrl: 'https://api.sjiaa.cc.cd',
  authMePath: '/api/v1/auth/me',
  authTimeout: 5000,
  uploadTtl: 24 * 60 * 60 * 1000,
  port: 8081,
  dataDir: '/data/cloud',
  maxImageSize: 50 * 1024 * 1024,
  maxVideoSize: 600 * 1024 * 1024,
  maxTaskSize: 2 * 1024 * 1024,
  maxSkillSize: 256 * 1024,
  maxMetadataSize: 20 * 1024 * 1024,
  maxTaskCount: 500,
  maxSkillCount: 100,
  maxUploadCount: 100,
  maxAssetCount: 5000,
  quotaBytes: 10 * 1024 * 1024 * 1024,
}
```

第一版只为真正的秘密或部署凭据使用环境变量，例如：

```env
DATABASE_URL=postgresql://...
```

后续启用阿里云 OSS 时再增加 Access Key 等秘密。普通 URL、接口路径、超时时间、端口和文件大小不要求用户逐项配置。

## 12. 数据模型

### cloud_accounts

- `id`：云服务内部 ID。
- `provider`：固定为 `sub2api`。
- `external_user_id`：`/auth/me` 返回的用户 ID。
- `email_snapshot`：仅用于展示和排查，不用于授权。
- `created_at`、`last_seen_at`。
- `provider + external_user_id` 唯一。

### cloud_assets

- 所属账号、SHA-256、类型、MIME、字节数、受限 metadata。
- `object_key` 和创建时间。
- 同一账号内 `SHA-256 + 类型` 唯一。

### cloud_asset_aliases

- 把前端本地资源 ID 映射到去重后的资源 UUID。
- 同一账号内本地资源 ID 唯一，避免静默改指向其他内容。

### cloud_uploads

- 保存上传声明、大小/hash 校验值、临时和最终 object key、claim 与完成后的资源 ID。
- 对外状态为 pending、uploaded、complete；内部 I/O 状态为 uploading、completing。
- 非完成上传 24 小时未更新且没有 active claim 时自动过期。

### cloud_tasks

- 所属账号、原任务 ID、任务 JSON、创建和更新时间。
- 同一账号内原任务 ID 唯一。

### cloud_task_assets

- 任务、资源、用途和顺序。
- 用途包括 input、output、mask、original、video、poster、thumbnail。

### cloud_skills

- 所属账号、Skill ID、版本、文件名、原始 Markdown、更新时间。
- 同一账号内 Skill ID 唯一。

### cloud_storage_deletions

- 保存待删除 object key、重试次数和错误摘要。
- 业务元数据删除与 outbox 入队在同一事务提交，物理文件随后删除。

### cloud_migrations

- 按文件名记录已应用迁移，服务启动时只执行一次。

## 13. API 契约

生产浏览器访问 `/cloud-api/*`，Nginx 转发为下列内部 `/api/*` 路径。除文件内容外，成功响应统一为 `{"data": ...}`，错误响应统一为 `{"error":{"code":"...","message":"..."}}`。

```text
GET    /api/account
POST   /api/uploads
PUT    /api/uploads/:id/content
POST   /api/uploads/:id/complete
DELETE /api/uploads/:id
GET    /api/tasks
PUT    /api/tasks/:id
DELETE /api/tasks/:id
GET    /api/assets/:id/content
DELETE /api/assets/:id
GET    /api/skills
PUT    /api/skills/:id
DELETE /api/skills/:id
GET    /api/sync/bootstrap
GET    /api/media/voices
POST   /api/media/tts
POST   /api/media/transcriptions
GET    /api/media/transcriptions/:id
DELETE /api/media/transcriptions/:id
```

上传固定为三步：先声明大小、MIME 和 SHA-256，再流式上传原始二进制，最后完成资源。任务只能引用完成后的本地 `assetId`；`PUT /api/tasks/:id` 要求路径 ID 与 `task.id` 一致。返回资源的浏览器地址使用 `/cloud-api/assets/:id/content`。

写接口可重试：同一任务、Skill、资源 ID 或文件不会生成重复业务记录；DELETE 对当前账号下已经不存在的目标也返回成功。已完成上传不能取消，仍有 active claim 的上传返回 `409 UPLOAD_IN_PROGRESS`。

第一版固定边界：

- 每账号文件容量 10GB；图片 50MB，视频 600MB。
- 每账号最多 500 个任务、100 个用户 Skill、100 个未完成上传。
- 每账号已完成资源别名与未完成上传合计最多 5000 个逻辑资源 ID。
- 单任务 JSON 2MB、最多 100 个资源引用；单 Skill 256KB。
- 任务 JSON 与 Skill Markdown 合计 20MB。
- 资源 metadata 只接受 `width`、`height`、`duration`、`sourceId`，序列化后最多 16KB。

## 14. 实施阶段

### 第一阶段：服务端基础（已完成）

- 创建 `server/`、后端 `AGENTS.md` 和模块文档。
- 完成 Sub2API `/auth/me` 身份适配。
- 建立 PostgreSQL schema 和迁移。
- 完成本地磁盘存储、资源上传、读取和删除。
- 增加配额、文件类型和文件大小限制。

### 第二阶段：前端闭环（已完成）

- 增加画廊批量保存、状态展示和失败重试。
- 保存任务引用的图片、视频和元数据。
- 登录后加载云端任务和缩略图，原文件按需缓存。
- 增加用户 Skill 保存和恢复。

### 第三阶段：体验完善（已完成）

- 增加自动保存开关。
- 增加云端作品筛选和容量管理。
- 完善移出云端、冲突提示和上传恢复。

### 后续阶段

- 增加阿里云 OSS 存储驱动。
- 评估 Agent 对话和提示词项目同步。
- 根据真实使用情况评估短时鉴权缓存和分片上传。

### 媒体处理阶段（已实现）

- 增加音色工具和字幕识别两个独立 Workspace Tool。
- Cloud Server 增加 `media` 模块，只负责鉴权、校验、临时任务和 Worker 调度。
- Python Speech Worker 使用 Edge TTS、FFmpeg 和 faster-whisper，不接收用户 token，也不访问云存储数据库。
- MP3、字幕和识别输入第一版都是临时数据，不写入 `cloud_assets`，不参与 10GB 云资源容量统计。
- 字幕任务元数据和结果最多保留 24 小时，输入文件在任务结束后删除。
- 详细设计以 `docs/audio-subtitle-development.md` 为准。
- 本地开发使用仅监听 `127.0.0.1:8081` 的轻量媒体接口：任务状态保存在进程内存，上传视频写入系统临时目录，首次识别时懒加载 `faster-whisper small`。该接口只用于前端联调，不替代生产 Cloud Server 的 Sub2API 鉴权、PostgreSQL 任务隔离和 24 小时清理。

## 15. 文档和验收要求

每个后端模块合入前必须同时具备：

- 模块 `README.md`。
- 对外接口和错误码说明。
- 数据库变更及迁移说明。
- 单元测试；涉及 HTTP 或存储时增加集成测试。
- 对应部署变化和环境变量说明。
- 本文档的阶段状态更新。

第一版验收标准：同一 Sub2API 用户在设备 A 勾选并保存任务和 Skill 后，设备 B 登录可以看到任务缩略图和 Skill，并能按需打开原图、播放视频；其他用户无法查询或下载这些数据。

## 16. 第一版边界和验证状态

- 本地 IndexedDB 和 localStorage 继续沿用当前浏览器数据，不按 Sub2API 账号拆分；切换账号只重置云端运行时状态，不删除本地副本。
- 不做全量实时双向同步。已保存任务后续发生的收藏等本地变更，需要再次执行保存才会覆盖云端快照。
- 自动保存只处理后续新完成任务和新导入 Skill，不扫描历史数据。
- 本地删除不触发云端删除；移出云端前先确保当前设备已缓存任务引用文件，并保留明确确认。
- 未完成上传在 24 小时无更新后回收；第一版不做分片上传和断点续传。
- 当前本地卷只允许一个 Cloud Server 实例写入；多实例部署前必须改为实例隔离临时目录或对象存储，不能并发扫描同一共享目录中的驱动 `.tmp` 文件。
- Speech Worker 第一版固定单实例、单识别并发；`/data/media-jobs` 是临时处理目录，不属于云资源备份范围。
- 自动化测试覆盖账号隔离、上传/任务/Skill/bootstrap 闭环、按需缓存、账号切换竞态、删除补偿和过期回收。
- 当前开发机没有 Docker、Docker Compose 和 Nginx CLI，因此未执行 `docker compose config`、容器镜像构建和 `nginx -t`。生产发布前必须按 `docs/sub2api-deployment.md` 完成 Compose、健康检查、备份恢复及真实代理 IP 链验证。
