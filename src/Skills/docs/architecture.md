# 架构

Skills 根模块提供 Markdown 解析、自动注册、列表、详情和结构化 mention。Agent 通过 `Skills/index.ts` 公共出口解析用户手动选择的 Skill，并把对应指令注入当前请求。

```text
builtins/*.md
  -> registry
      -> SkillList / SkillHost
      -> mentions
          -> Agent Composer
              -> AgentRound.skill / AgentMessage.skill
                  -> Agent request instructions
```

## 边界

- Skill 只在用户从主输入框的 `@` 菜单明确选择后生效，不根据消息内容自动匹配；画廊输入框选择 Skill 后转到 Agent 对话提交。
- `@` 后继续输入时，弹框按名称、ID 和职责描述实时过滤；无结果时保留弹框并显示空状态。
- 一条消息最多选择一个 Skill，避免指令冲突。
- mention atom 内部保存 Skill ID，界面显示中文名称；普通 `@文字` 不会激活 Skill。
- 消息正文不保存 atom，DB 中由 `skill: { id, name, version }` 单独记录选择。
- 请求时只解析与持久化版本一致的内置 Skill；版本不匹配时记录警告且不注入旧指令。
- Skill 指令是当前请求的任务指导，不能覆盖 Agent 系统规则和工具策略。
- 当前 Skill 不直接调用模型、图片 API、Tool 或原业务页面。
