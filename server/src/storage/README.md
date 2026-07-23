# Storage

## 职责

`StorageDriver` 隔离业务与具体文件存储。当前 `LocalStorageDriver` 把 object key 写入固定根目录 `/data/cloud`，并支持读取、Range、删除和存在检查。

`StorageCleanupService` 管理 `cloud_storage_deletions` outbox，保证数据库元数据先提交删除，文件后删除并可重试。

## 数据结构

数据库只保存相对 object key。当前 key 形如：

```text
<accountId>/uploads/<uploadId>/<claimId>
<accountId>/objects/<kind>/<sha256>
```

驱动拒绝绝对路径和 `..` 越界路径。

## 依赖

本地驱动使用 Node.js 文件流、原子 rename 和 SHA-256。未来 OSS 驱动实现同一接口即可。

服务监听前会递归调用 `LocalStorageDriver.cleanupTempFiles()`，只删除严格匹配 `<业务文件名>.<v4 UUID>.tmp` 的普通文件。它不跟随符号链接，不删除普通 `.tmp`、UUID 版本不符或后面还有其他后缀的业务文件。

## 错误处理

写入过程按字节计数，超限立即中止并删除临时文件。最终 rename 前写入随机 `.tmp` 文件，避免暴露半成品。正常异常会即时删除；SIGKILL 等无法执行 catch 的残留由下次启动清扫。

## 删除行为

业务删除先调用 cleanup service 在数据库事务中 enqueue。提交后 `flushKeys` 锁定 outbox，再确认 object key 没有被新资源或未过期的 completion claim 引用，然后删除文件并清除 outbox；已被重新引用时只撤销 outbox。同 key 重传完成也会锁定并撤销旧 outbox，避免清理和复用并发。失败只增加 attempts 和错误摘要。应用启动时及运行期间每分钟调用 `flush` 重试历史记录。

启动清扫建立在当前 Compose 单 `cloud` 实例独占 `cloud-files` 写入权的边界上。多个实例不能共享同一目录直接运行该清扫，否则一个实例启动时可能删除另一个实例正在写的临时文件。
