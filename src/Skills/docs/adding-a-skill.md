# 新增内置 Skill

1. 确认 Skill 与本产品的图像或视频创作链路有关，并且能在当前 Agent 能力范围内工作。当前仅有图片生成能力，视频 Skill 只能输出提示词和分镜。
2. 在 `builtins/` 新增一个 `<skill-id>.md`，按 `skill-format.md` 填写 frontmatter 和完整指令。
3. 删除自动触发、自动检测、强制调用其他 Skill 和不可用工具的要求。
4. 开源改编必须保留作者、仓库、许可证和修改声明；需要时在 `licenses/` 增加许可证文本。
5. 更新根 `README.md` 的内置 Skill 列表。
6. 在 `tests/registry.test.ts` 更新预期顺序，并为特殊格式或 mention 行为补测试。
7. 运行 `npm run build`、相关测试和 `npm test`。

满足上述要求后，Markdown 会自动出现在拓展工作区列表和 Agent `@` 菜单中，无需修改注册表代码。
