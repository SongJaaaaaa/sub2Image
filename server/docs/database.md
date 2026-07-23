# 数据库

数据库是 Cloud Server 独占的 PostgreSQL，不能与 Sub2API 共库或跨库查询。

## 表

### cloud_accounts

保存云账号内部 UUID、固定 provider、Sub2API 外部用户 ID、邮箱快照和时间。`provider + external_user_id` 唯一。邮箱仅展示，不参与授权。

### cloud_assets

保存账号、SHA-256、资源类型、MIME、字节数、object key、元数据和时间。`account_id + sha256 + kind` 唯一，实现账号内内容去重。只保存 object key，不保存 `/data/cloud` 绝对路径。

### cloud_asset_aliases

把前端本地 `source_asset_id` 映射到去重后的资源 UUID。主键是 `account_id + source_asset_id`，防止同一本地 ID 被静默改指向其他内容。

### cloud_uploads

保存上传声明、预期和实测大小/hash、临时/最终 object key、claim 及完成后的资源。状态为 `pending`、`uploading`、`uploaded`、`completing`、`complete`；`claim_id + claim_expires_at` 只在 I/O 状态使用。`account_id + source_asset_id` 唯一，使重试幂等。

资源删除会级联删除对应的完成上传记录；未完成上传没有资源外键。

### cloud_tasks

保存账号、前端任务 ID 和经过敏感字段清理的 JSON。`account_id + source_task_id` 唯一。

### cloud_task_assets

保存任务与资源的引用、前端本地资源 ID、用途和位置。主键 `task_id + role + position`。资源外键使用 `ON DELETE RESTRICT`，数据库层也会阻止误删被引用资源。

### cloud_skills

保存账号、Skill ID、版本、文件名和原始 Markdown。`account_id + source_skill_id` 唯一。

### cloud_storage_deletions

文件删除 outbox。资源或上传元数据删除和 outbox 写入处于同一事务；文件删除成功后移除记录，失败时记录次数和错误摘要，并在每分钟维护及下次启动重试。清理前会同时检查已完成资源和 active completion claim 是否仍引用 object key。

### cloud_media_jobs

保存字幕识别任务的账号、状态、原始文件名和 MIME、大小、请求/识别语言、时长、字幕 JSON、有限错误摘要及过期时间。数据库不保存绝对路径，scratch 路径固定由任务 UUID 推导。

同账号的 `queued`、`running` 任务通过部分唯一索引限制为一个；队列索引只包含已经完成流式上传的 `queued` 任务。任务结果和临时输入不参与 `cloud_assets` 容量统计。记录到期后删除，输入目录在成功、失败、取消和过期时清理。

### cloud_migrations

记录已应用迁移文件名。启动和 `npm run migrate` 都按文件名顺序只执行一次。

## 账号隔离

所有业务表都直接或通过外键归属 `cloud_accounts`。业务查询必须携带由鉴权钩子生成的 `accountId`。服务端不接受外部提交的账号 ID。

## 容量

已用容量是当前账号 `cloud_assets.byte_size` 之和，去重内容只计一次。新上传声明时，在账号行加锁，并同时计算已用容量和所有非 `complete` 上传的预留容量；complete 最终提交也先持有同一账号锁，再把 reservation 转为 asset，避免两次统计之间搬账而漏算。同一锁内还限制 100 个未完成上传和 5000 个 `cloud_asset_aliases + 未完成上传` 逻辑资源槽位。

非完成上传以 `updated_at` 计算固定 24 小时 TTL；未过期的 active claim 不清理。过期行的临时/最终 key 与行删除在同一事务登记，物理删除仍由 outbox 执行。

## 迁移

首版迁移为 `migrations/001_initial.sql`，`002_upload_claims.sql` 追加 claim 状态和索引，`003_media_jobs.sql` 新增临时字幕任务。发布新版本时新增递增编号 SQL 文件，不改已经部署的文件。迁移在单个数据库事务中执行。

## 备份

数据库和 `cloud-files` 文件卷必须作为同一备份周期处理。恢复时先恢复 PostgreSQL，再恢复 `/data/cloud`。outbox 中存在的 key 在服务启动后会继续清理。`media-jobs` 是短期处理目录，不进入云资源备份。
