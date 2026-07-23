# Sync 模块

## 职责

提供换设备启动所需的只读聚合接口，不实现实时双向同步或删除传播。

## 接口

`GET /api/sync/bootstrap` 返回：

```json
{"data":{"account":{},"tasks":[],"skills":[]}}
```

任务资源只包含元数据和 content URL，不内联图片或视频。role 为 `thumbnail` 的资源供客户端优先下载。

## 数据结构

本模块不拥有数据表。

账号级 20MB 任务/Skill 元数据、500 个任务、每任务 100 个资源引用和 100 个 Skill 上限保证第一版全量响应有固定边界。资源 metadata 只保留 `width`、`height`、`duration`、最长 300 字符的 `sourceId`，不会把任意 16KB 对象按任务引用重复展开，因此暂不分页。

## 依赖

通过 `AccountService`、`AssetService`、`TaskService` 和 `SkillService` 并行读取，不直接查询这些模块的数据表。

## 错误处理

任一依赖读取失败时返回对应统一错误。账号隔离由鉴权上下文和各 service 的 `accountId` 条件共同保证。

## 删除行为

本模块只读，没有删除行为，也不传播跨设备删除。
