# Account 模块

## 职责

把可信 Sub2API 用户 ID 幂等映射为 Cloud Server 内部账号，并提供账号信息。邮箱只做展示快照，不参与授权。

## 接口

- `GET /api/account`：返回账号、已用容量和固定配额。
- `AccountService.ensure`：按 provider 和外部 ID 创建或更新最后访问时间。
- `AccountService.lock`：上传配额检查时锁定账号行。
- `MetadataQuotaService`：在同一账号锁内限制任务/Skill 数量及 20MB 同步元数据总量。

上传模块在同一账号锁内限制 10GB 文件配额、100 个未完成上传和 5000 个逻辑资源 ID，避免并发声明越过容量或数量边界。

## 数据结构

拥有 `cloud_accounts`。唯一键为 `provider + external_user_id`。业务表使用内部 UUID 外键。

## 依赖

依赖 auth 模块提供的 `AuthUser`。文件容量由路由通过 `AssetService.getUsage` 获取。元数据配额服务集中读取任务和 Skill 的可同步内容，业务模块不重复实现配额算法。

## 错误处理

内部账号不存在时返回 `404 ACCOUNT_NOT_FOUND`。客户端提交的用户 ID 不会参与查询。

## 删除行为

第一版不开放账号删除 API。数据库外键已定义账号删除时级联元数据；生产删除还必须配套文件清理流程，不能直接手工删账号行。
