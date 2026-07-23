# Assets 模块

## 职责

管理已完成资源、账号内内容去重、本地资源 ID 别名、按需下载和显式删除。

## 接口

- `GET /api/assets/:id/content`：按服务端资源 UUID 下载，支持单段 Range；返回给浏览器的地址为 `/cloud-api/assets/:id/content`。
- `DELETE /api/assets/:id`：删除未被任务引用的资源。
- `AssetService.resolveSources`：把当前账号本地 `assetId` 解析为资源。

## 数据结构

拥有 `cloud_assets` 和 `cloud_asset_aliases`。资源按 `account_id + sha256 + kind` 唯一；别名按 `account_id + source_asset_id` 唯一。任务保存本地 ID，内容只存一份。

## 依赖

内容读写依赖 `StorageDriver`。删除路由通过 `TaskService.hasAssetRefs` 检查引用，通过 `StorageCleanupService` 写删除 outbox。

## 错误处理

下载跨账号或不存在的资源统一返回 `404 ASSET_NOT_FOUND`，避免泄露资源是否属于其他账号。UUID 在进入 PostgreSQL 前校验，无效 Range 返回 416。文件响应带 `X-Content-Type-Options: nosniff`。仍有任务引用时返回 `409 ASSET_IN_USE`。

## 删除行为

删除先在数据库事务中写 outbox 并删除资源元数据，提交后才删文件。文件删除失败不会恢复已删除元数据，而是保留重试记录；启动时继续清理。数据库 `ON DELETE RESTRICT` 也会阻止误删任务仍引用的资源。DELETE 对当前账号已不存在的资源幂等成功。
