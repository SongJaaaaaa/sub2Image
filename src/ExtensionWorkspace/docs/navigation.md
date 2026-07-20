# 导航

## 路径规则

- `/app/extensions` 默认展示 Tools。
- `/app/extensions/tools` 展示 Tool 列表。
- `/app/extensions/tools/:toolId` 展示 Tool 宿主。
- `/app/extensions/skills` 展示 Skill 列表。
- `/app/extensions/skills/:skillId` 展示 Skill 详情。
- 其他 `/app/extensions/*` 路径展示工作区内的未找到状态。

所有路径生成、解析和 History API 操作集中在 `extensionRoutes.ts`。Tool 和 Skill 子模块通过回调接收选中 ID，不直接修改浏览器地址。

返回原应用统一进入 `/app`。导航使用 `pushState` 并派发 `popstate`，保证 App 与拓展工作区在同一条浏览器历史中同步。
