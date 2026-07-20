# ExtensionWorkspace Instructions

修改本目录前必须依次读取：

1. 仓库根目录 `AGENTS.md`
2. 仓库根目录 `拓展走向.md`
3. 本目录 `README.md`
4. `docs/architecture.md`
5. `docs/navigation.md`
6. `docs/integration-boundaries.md`

强制约束：

- 只能从 `../Tools` 和 `../Skills` 的公共出口导入模块能力。
- pathname 解析只放在 `extensionRoutes.ts`。
- 不直接访问图片库、模型 API、IndexedDB 或原业务页面组件。
- 不新增 Workflow 一级分类。
- 修改路由或模块边界时同步更新文档和测试。
- 完成后运行 `npm run build`、相关测试和 `npm test`。
