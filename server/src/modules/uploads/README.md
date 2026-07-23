# Uploads 模块

## 职责

管理资源上传三阶段状态机：声明、写入内容、完成。负责类型、大小、SHA-256、配额、账号归属、并发 claim、过期回收和重试幂等。

## 接口

- `POST /api/uploads`：声明 `{assetId,kind,mimeType,size,sha256,metadata}`。
- `PUT /api/uploads/:id/content`：上传原始二进制。
- `POST /api/uploads/:id/complete`：提交为 CloudAsset。
- `DELETE /api/uploads/:id`：取消未完成上传。

成功 JSON 使用 `{data: ...}`。Fastify 全局上限允许 600MB，POST 声明单独收紧到 2MB；PUT content 允许最大 600MB，并由存储驱动按声明大小再次流式限制。

## 数据结构

拥有 `cloud_uploads`。账号和本地资源 ID 唯一；对外稳定状态为 `pending`、`uploaded`、`complete`，内部 I/O 状态为 `uploading`、`completing`。`claim_id` 和 `claim_expires_at` 防止同一上传被并发写入，`final_object_key` 让文件清理器保护仍在完成中的最终对象。

## 依赖

- `AccountService`：串行化账号配额预留。
- `AssetService`：查找 hash 去重、创建资源和本地 ID 别名。
- `StorageDriver`：写临时对象和最终对象。
- `StorageCleanupService`：原子登记并重试临时对象、失败最终对象的删除。

通过 service 调用协作，不直接操作 account 或 asset 表。

## 错误处理

拒绝不支持 MIME、超限文件、无效 hash、容量不足、声明与实际内容不一致。相同 `assetId` 带不同文件信息返回冲突，不静默覆盖。每账号最多 100 个未完成上传和 5000 个逻辑资源 ID；活跃 claim 重入或取消返回 `409 UPLOAD_IN_PROGRESS`。

claim 和最终数据库确认都是短事务。complete 最终确认先锁账号行、再锁上传行，使 reservation 转为 asset 与新声明的 `used + reserved` 检查互斥，避免搬账期间漏算配额。最大 600MB 的请求流、临时对象写入及临时到最终对象的复制均在 PostgreSQL 事务外执行，不占用连接池事务。

## 删除行为

取消上传会在删除上传行的同一事务中把临时/未确认最终对象写入 outbox，提交后再尝试删文件；删除失败保留重试记录。DELETE 对已不存在的上传幂等成功，完成上传不能取消。非完成上传超过 24 小时未更新且没有活跃 claim 时自动过期，并通过同一 outbox 回收文件。
