# Skills Instructions

修改本目录前必须依次读取：

1. 仓库根目录 `AGENTS.md`
2. 仓库根目录 `拓展走向.md`
3. 本目录 `README.md`
4. `docs/architecture.md`
5. `docs/skill-format.md`
6. `docs/adding-a-skill.md`
7. 目标内置 Skill 的 `builtins/<skill-id>.md`

涉及用户导入时继续读取 `docs/import-security.md`，涉及文本模型提示边界时读取 `docs/prompt-boundaries.md`，涉及测试时读取 `docs/testing.md`。

强制约束：Skill 只能由用户在 Agent 对话中手动 `@`；不得自动选择，不得依赖具体 Tool，不得执行用户代码或读取敏感配置。
