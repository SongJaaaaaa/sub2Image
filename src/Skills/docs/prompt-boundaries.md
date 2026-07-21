# 提示词边界

Skill 指令只在用户手动选择的当前 Agent 消息中生效。运行时使用独立的 `<skill_instructions>` 边界追加到 Agent instructions，并明确其优先级低于系统、安全和工具策略。

必须区分：

- 原有 Agent 系统指令和工具协议。
- 用户手动选择的 Skill 指令。
- 用户消息正文。
- 图片引用和模型输出。

Skill mention 从消息正文中移除，用户消息只保存干净文本；选择结果以 ID、名称和版本单独持久化。不得把 API Key、浏览器存储、其他 Skill 数据或未选择的 Skill 指令拼入请求。

普通文本中的 `@名称` 不代表选择。只有 Composer 创建的结构化 atom 才能激活 Skill。
