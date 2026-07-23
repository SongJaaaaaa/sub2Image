# Cloud Server 开发约束

本目录是独立的云存储后端，继承根目录 `AGENTS.md`，并补充以下约束。

- 使用 Node.js 22、TypeScript、Fastify、PostgreSQL 和 npm。
- 代码保持 2 空格缩进、单引号、无分号，优先简单直接的 ES2020+ 写法。
- 所有 `/api/*` 业务接口必须从鉴权上下文获取 `accountId`，不能信任请求体或查询参数中的用户 ID。
- 不能读取 Sub2API 数据库、复制 JWT 密钥或持久化 access token；身份只通过生产 Sub2API 的 `/api/v1/auth/me` 校验。
- 模块只能通过明确 service 方法协作，不直接操作其他模块拥有的数据表。
- 新增或修改业务模块时同步更新模块 `README.md` 和 `docs/`。
- 数据库变更使用只追加的新迁移，不修改已经部署过的迁移。
- 文件业务只依赖 `StorageDriver`，数据库中不保存绝对文件路径。
- 日志不得记录 Authorization Header、token、API Key 或任务中的敏感字段。
- 修改后先运行 `npm run build`，再运行 `npm test`。
