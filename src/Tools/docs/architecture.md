# 架构

Tools 根模块提供契约、注册表、列表和宿主。具体 Tool 位于 `items/<toolName>/`，通过 definition 注册，通过动态 import 加载。

```text
ToolList / ToolHost
  -> registry
      -> items/*/definition

items/*
  -> Tools/adapters
      -> 原项目公共图片能力
```

注册表只组合元数据，不包含 Tool 业务逻辑。Tool 不互相读取内部状态。
