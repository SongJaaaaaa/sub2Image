# 架构

## 边界

Cloud Server 是独立服务，只接收浏览器已有的 Sub2API access token，并实时请求 `https://api.sjiaa.cc.cd/api/v1/auth/me`。成功响应中的 `data.id` 是唯一可信外部用户 ID。服务不共享 JWT 密钥，不直接访问 Sub2API 数据库，也不保存 token。

```text
Browser
  -> /cloud-api/*
Nginx
  -> cloud:8081/api/*
Fastify
  -> Sub2API /api/v1/auth/me
  -> PostgreSQL metadata
  -> StorageDriver -> /data/cloud
  -> MediaService -> /data/media-jobs
                  -> Speech Worker -> Edge TTS / FFmpeg / faster-whisper
```

## 请求流程

1. Fastify 对 `/api/*` 执行鉴权钩子。
2. Fastify 只信任直接代理一跳；`Sub2ApiAuthProvider` 转发 Bearer token、原始 User-Agent 和这一跳提供的客户端 IP。
3. `AccountService` 按 `sub2api + external_user_id` 幂等建立云账号。
4. 路由只把鉴权生成的 `accountId` 传给业务 service。
5. 所有查询和变更都包含 `account_id` 条件。

`/health` 是唯一不需要 Bearer token 的接口，并通过 `SELECT 1` 同时检查 PostgreSQL 连通性。

## 模块协作

- `auth`：只负责外部身份验证。
- `account`：只拥有云账号映射。
- `uploads`：管理上传声明、临时文件、校验和完成状态。
- `assets`：管理去重资源、本地 ID 别名、读取和删除。
- `tasks`：管理任务 JSON 和资源引用，通过 `AssetService` 解析资源。
- `skills`：管理用户上传的原始 Markdown。
- `sync`：组合 account、tasks、skills 的只读 bootstrap。
- `media`：管理音色代理、字幕任务、临时文件、队列和 Worker 调用。
- `storage`：隔离磁盘实现，并维护文件删除 outbox。

模块不直接操作其他模块的数据表。跨模块原子操作由 service 方法接收同一个事务对象完成。

`MediaService` 只通过 `MediaWorker` 接口调用 Python 服务。浏览器 token 不会转发给 Worker；Worker 也不访问 PostgreSQL。字幕输入通过两个容器共享的 `/data/media-jobs/<任务 UUID>/input` 读取，数据库只保存任务 UUID。Cloud Server 单进程全局只取一个任务运行，Worker 内部也用模型锁保证 Whisper 单并发。

`MetadataQuotaService` 是账号级配额边界，在账号行锁内统一统计任务 JSON 和 Skill Markdown。20MB 总量、500 个任务、每任务 100 个资源引用和 100 个 Skill 是固定上限。资源 metadata 只保留 `width`、`height`、`duration`、最长 300 字符的 `sourceId`，避免任意对象被每个任务引用重复展开。任务列表使用单条 tasks/links/assets `LEFT JOIN`，保证一次 PostgreSQL 语句快照内的 JSON 和引用一致。

## 上传一致性

上传分三步：声明、写内容、完成。

1. `POST /uploads` 在账号锁内校验类型、大小、hash、10GB 容量、100 个未完成上传和 5000 个逻辑资源 ID 上限，并预留容量。
2. `PUT /uploads/:id/content` 用短事务写入 `uploading + claim`，提交后才流式写 claim 独立临时对象并计算大小/hash，最后用另一个短事务确认 `uploaded`。
3. `POST /uploads/:id/complete` 用短事务写入 `completing + claim + final_object_key` 并撤销旧 outbox，事务外复制最大 600MB 内容，最后按账号行、上传行顺序加锁，用短事务创建资源/别名并登记临时对象删除。

因此数据库事务不跨文件流或文件复制。最终提交持有账号锁，使 reservation 转入已用容量时不能与新上传的 `used + reserved` 两次读取交错。active claim 防止同一上传并发覆盖；过期 claim 可以恢复，非完成上传 24 小时无更新后由每分钟维护任务删除。进程在最终文件写入后崩溃时，`final_object_key` 会先保护在途对象，TTL 到期后再通过 outbox 回收。

任务只能引用 `complete` 后存在的资源，因此不会出现任务指向半成品文件。

## 去重和本地 ID

`cloud_assets` 在账号内按 `sha256 + kind` 唯一。`cloud_asset_aliases` 把多个前端本地资源 ID 映射到同一份内容。任务关联同时保存本地 `assetId`，换设备恢复时仍能重建原 ID。

## 删除一致性

文件删除使用数据库 outbox：

1. 在同一个事务中删除资源/上传元数据并把最终或临时 object key 写入 `cloud_storage_deletions`。
2. 数据库提交成功后再删除文件。
3. 文件删除失败时保留 outbox，服务运行期间每分钟及下次启动自动重试。
4. 重试前锁定 outbox 并重新检查 object key；如果同 hash 内容已经被再次上传并引用，只撤销 outbox，不删除复用文件。
5. 同 key 上传完成也先锁定并撤销旧 outbox；active `completing` claim 同样算 key 引用，避免检查与物理删除之间再次发生复用竞态。

因此数据库提交失败时文件不会先被删除，也不会留下仍指向已删文件的元数据。文件删除失败最多产生不可见的暂时孤立文件。

覆盖或删除任务都会检查被移除资源是否还被其他任务引用，只回收引用数为零的资源。

所有 DELETE 在目标已不存在时幂等成功。上传仍有 active claim 时例外返回 409，避免删除检查早于在途 writer 的最终 rename 而遗留孤儿文件。

## 存储替换

业务层只依赖 `StorageDriver.put/open/delete/exists`。当前 `LocalStorageDriver` 使用 `/data/cloud`；后续 OSS 驱动可实现同一接口，任务和资源模块无需变化。

本地驱动先写 `<业务文件>.<v4 UUID>.tmp`，校验完成后原子 rename。SIGKILL 可能绕过进程内 catch，因此服务在监听前严格按该专属后缀递归删除残留，普通文件和相似后缀不受影响。该启动清扫以单个 `cloud` 实例独占本地卷为边界；未来多实例部署必须改用实例隔离临时目录或由对象存储处理未完成写入，不能让多个实例同时扫描共享写入目录。
