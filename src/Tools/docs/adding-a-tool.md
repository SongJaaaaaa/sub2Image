# 新增 Tool

1. 创建 `items/<toolName>/README.md`。
2. 创建 `definition.ts` 和 Tool 根组件。
3. 需要共享能力时先扩充 `adapters`，不要直接导入原业务内部文件。
4. 在 `registry.ts` 注册 definition。
5. 更新根 `README.md` 的已注册 Tool 列表。
6. 添加单元测试和必要 UI 测试。
7. 运行 `npm run build`、相关测试和 `npm test`。

不要创建不可点击的占位条目。尚未实现的 Tool 不进入注册表。
