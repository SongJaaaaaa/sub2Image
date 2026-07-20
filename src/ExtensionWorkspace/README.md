# 拓展工作区

## 用途

`ExtensionWorkspace` 是 Tools 与 Skills 的独立页面外壳，负责路径解析、一级导航、响应式布局和返回原应用。

入口路径：

- `/app/extensions`
- `/app/extensions/tools`
- `/app/extensions/tools/:toolId`
- `/app/extensions/skills`
- `/app/extensions/skills/:skillId`

## 当前功能

- 独立于画廊和 Agent 的页面布局。
- Tools、Skills 两个一级入口。
- 桌面侧边栏与移动端横向导航。
- Tool、Skill 列表和详情宿主。
- 集中的 pathname 解析与 History API 导航。

## 非目标

- 不实现具体 Tool 或 Skill。
- 不直接访问图片库、模型 API 或持久化数据。
- 不导入 Tool、Skill 的内部文件。
- 不维护 Workflow 分类。

## 快速定位

- `ExtensionWorkspace.tsx`：页面入口和内容分发。
- `ExtensionSidebar.tsx`：一级导航。
- `extensionRoutes.ts`：路径解析和导航。
- `components/ExtensionHeader.tsx`：内容区头部。
- `docs/`：架构、导航与集成边界。
- `tests/`：路由、UI 和边界测试。
