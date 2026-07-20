# 集成边界

允许：

- 从 `Tools/index.ts` 导入 Tool 列表和宿主。
- 从 `Skills/index.ts` 导入 Skill 列表和宿主。
- 复用通用 UI 图标和基础样式。

禁止：

- 导入 `Tools/items`、`Skills/builtins` 等内部目录。
- 导入画廊、Agent、Composer 或设置页组件。
- 直接读取全局 Store 的业务状态。
- 直接调用图片 API、文本模型、IndexedDB。
- 在工作区内重新定义 Tool 或 Skill 注册表。

边界由 `tests/boundary.test.ts` 的源码扫描测试保护。
