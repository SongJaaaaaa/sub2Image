# 测试

至少覆盖：

- 注册表 ID 去重。
- Skill 元数据和支持模式。
- 详情页未知 ID。
- 指令组装和模型适配器边界。
- 外部导入格式、大小和路径安全。
- Skills 不导入 Tools 或原业务内部实现的边界测试。

验证顺序：`npm run build`、相关 Vitest、`npm test`、阶段交付时运行 `npm run test:e2e`。
