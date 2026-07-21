# 测试

至少覆盖：

- Markdown frontmatter 解析和必填字段。
- 六个内置 Skill 的注册顺序和 ID 去重。
- 结构化 mention 的显示名称、内部 ID、光标映射和正文提取。
- 一条消息只选择一个 Skill，普通 `@文字` 不会激活。
- 画廊和 Agent 输入框都能弹出选择框，继续输入会逐步收紧结果。
- Agent 请求只注入手动选择的 Skill，正文不包含内部 token。
- Skill ID、名称和版本随轮次、消息写入并从持久化数据恢复。
- 编辑与重新生成沿用原轮次 Skill。
- Skills 不依赖 Tools 或具体业务页面。
- 图片编辑、分镜和视频 Skill 不会在没有对应视频工具时虚构执行结果。

验证顺序：`npm run build`、相关 Vitest、`npm test`、涉及 Composer 行为时运行对应 Playwright E2E。
