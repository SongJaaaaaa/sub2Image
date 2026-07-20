# 新增内置 Skill

1. 创建 `builtins/<skillName>/README.md` 和 `SKILL.md`。
2. 在 `definition.ts` 定义元数据和指令。
3. 在 `registry.ts` 注册 definition。
4. 更新根 `README.md` 的内置 Skill 列表。
5. 添加指令结构和注册表测试。
6. 运行 `npm run build`、相关测试和 `npm test`。

尚未完成完整运行流程的 Skill 不注册为可用项。
