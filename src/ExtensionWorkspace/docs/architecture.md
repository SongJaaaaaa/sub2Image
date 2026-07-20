# 架构

拓展工作区位于原应用路由之外，是 Tools 与 Skills 的页面宿主。

依赖方向：

```text
App
  -> ExtensionWorkspace
      -> Tools/index.ts
      -> Skills/index.ts
```

`ExtensionWorkspace.tsx` 根据集中解析后的路由选择列表页或详情宿主。侧边栏只处理一级导航，不保存业务状态。当前路径是唯一导航状态，浏览器前进和后退通过 `popstate` 同步。

拓展工作区不包裹原应用 Header、Composer、画廊或 Agent，避免两个页面体系共享布局状态。
