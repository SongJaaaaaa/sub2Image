# Tools Instructions

修改本目录前必须依次读取：

1. 仓库根目录 `AGENTS.md`
2. 仓库根目录 `拓展走向.md`
3. 本目录 `README.md`
4. `docs/architecture.md`
5. `docs/tool-contract.md`
6. `docs/adding-a-tool.md`
7. 目标 Tool 的 `README.md`

涉及图片库或存储时继续读取 `docs/data-boundaries.md`，涉及测试时读取 `docs/testing.md`。

强制约束：具体 Tool 只能通过 `Tools/adapters` 访问原项目能力；不得导入 Skills、原业务页面或 Store 内部实现。新增 Tool 必须同步注册表、README 和测试。
