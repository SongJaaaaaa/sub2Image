# Video Integrations Instructions

修改本目录前必须依次读取：

1. 仓库根目录 `AGENTS.md`
2. `docs/video-development.md`
3. 本目录 `README.md`
4. 目标厂商目录的 `README.md`

## 强制边界

- Provider 只能处理厂商认证、请求构造、HTTP 调用和响应转换。
- Provider 不得导入 React、Zustand Store、业务组件或 IndexedDB 封装。
- Feature、组件和 Agent 工具不得直接导入 `providers/<provider>/` 内部文件，统一通过 `registry.ts` 使用 Provider。
- 厂商原始请求和响应类型保留在对应厂商的 `types.ts`，不得泄漏到业务层。
- 不在 UI、任务执行或 Store 中散落厂商判断。
- 未取得真实接口文档或响应时，不猜测字段；保留日志并让用户提供实际输出。

## 文档同步

每次开发或调整视频功能时必须：

1. 更新 `docs/video-development.md` 中受影响的设计、状态或公共协议。
2. 更新本目录 `README.md` 中的实现状态和文件索引。
3. 更新所有受影响厂商目录的 `README.md`。
4. 在对应 README 的“更新记录”中添加日期、变更摘要和验证结果。
5. 新增 Provider 时同时创建目录 README、实现文件、注册项和测试。

如果只修改单个厂商的内部协议且公共接口没有变化，总开发文档可以只更新当前状态和更新记录，不重复粘贴厂商请求字段。

## 验证

代码变更完成后优先运行：

```text
npm run build
npm test
```

测试失败时在对应厂商 README 的更新记录中写明失败项和原因，不把未验证功能标记为已完成。
