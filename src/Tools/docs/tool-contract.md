# Tool 契约

每个 Tool 通过 `WorkspaceTool` 注册：

```ts
type WorkspaceTool = {
  id: string
  name: string
  description: string
  version: number
  load: () => Promise<{ default: React.ComponentType }>
}
```

要求：

- `id` 使用小写短横线并全局唯一。
- `version` 为正整数。
- `load` 必须动态导入 Tool 根组件。
- 元数据放在 Tool 自己的 `definition.ts`。
- Tool 保存结果时不得覆盖来源资源。
