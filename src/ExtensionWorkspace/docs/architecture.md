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

原应用需要接入 Skill 云端能力时，由 `App` 通过 `skillCloud` 回调传入状态和操作。工作区只把这些参数转交给 `Skills` 公共组件，不导入云存储、鉴权或 Store 模块。

拓展工作区不包裹原应用 Header、Composer、画廊或 Agent，避免两个页面体系共享布局状态。
