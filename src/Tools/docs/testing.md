# 测试

至少覆盖：

- 注册表 ID 去重。
- Tool 懒加载和未知 ID。
- adapters 的输入输出转换。
- 保存结果创建新资源且不覆盖原图。
- 具体 Tool 的主要用户流程。
- Tools 不导入 Skills、原业务页面或 Store 内部实现的边界测试。

验证顺序：`npm run build`、相关 Vitest、`npm test`、阶段交付时运行 `npm run test:e2e`。
