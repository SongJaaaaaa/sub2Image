# Tasks 模块

## 职责

以任务为云端保存单位，保存经过敏感字段清理的任务 JSON 和资源用途/顺序，并返回可供换设备恢复的完整元数据。

## 接口

- `GET /api/tasks`：返回当前账号任务列表。
- `PUT /api/tasks/:id`：幂等覆盖任务和资源关联。
- `DELETE /api/tasks/:id`：移出云端并回收零引用资源。

PUT body 为 `{task,assets:[{assetId,role,index}]}`。`task.id` 必须等于路径 ID。

## 数据结构

拥有 `cloud_tasks` 和 `cloud_task_assets`。任务按账号和前端任务 ID 唯一。关联保存服务端资源 UUID、本地资源 ID、role 和 position。

## 依赖

通过 `AssetService` 解析和锁定资源，不直接查询资源表。删除通过 `StorageCleanupService` 原子写文件删除 outbox。

## 错误处理

任务最大 2MB，每账号最多 500 个任务，任务与 Skill 合计同步元数据最多 20MB；路由为 JSON 包装保留额外 64KB，字段上限仍由 service 按 UTF-8 字节严格执行。每任务最多关联 100 个资源，同一 role/index 不允许重复。引用不存在或未完成资源返回 `409 ASSET_NOT_READY`。video role 必须引用视频，其余 role 必须引用图片。

保存前递归移除 JSON 中 `apiKey`、`accessToken`、`refreshToken` 及对应 snake_case、kebab-case 写法，以及 `authorization` 字段。

任务列表使用单条 tasks/links/assets `LEFT JOIN` 查询，依赖 PostgreSQL 单语句快照，避免并发覆盖或删除时返回旧任务 JSON 与新资源引用的混合结果。

## 删除行为

覆盖任务或删除任务时，先更新关联，再逐个检查被移除资源的剩余引用。仍被其他任务引用的资源保留；零引用资源的元数据和 outbox 在同一事务提交，文件随后删除。DELETE 对已不存在的任务幂等成功，浏览器本地副本不受影响。
