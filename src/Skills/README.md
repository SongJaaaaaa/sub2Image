# Agent Skills

## 用途

`Skills` 管理用户在 Agent 对话中手动选择的指令包。每个 Skill 说明自己负责的工作，并在发送当前消息时为 Agent 增加对应指导。

Skill 不会自动检测或自动启用。没有手动选择 Skill 的消息保持原有 Agent 行为。

## 当前功能

- `AgentSkill` 公共契约和 Markdown frontmatter 解析。
- 自动读取 `builtins/*.md` 的平铺注册表。
- Skill 列表、来源、许可证和指令详情。
- 主输入框结构化 `@Skill` mention、实时筛选和选择弹框，每条消息最多一个；画廊选择后自动转为 Agent 消息。
- 请求级 Skill 指令注入。
- 消息和轮次持久化 Skill ID、名称及版本。

当前内置 Skill：电商产品图、角色一致性、图片编辑、海报与排版、分镜创作、视频生成提示词。均基于 Anthropic Skills 的开源视觉工作流改编，采用 Apache-2.0。

前五个 Skill 可直接指导现有图片生成 Agent；视频生成提示词 Skill 当前只产出视频提示词、关键帧与分镜，等待接入视频 API 后再调用视频工具。

## 非目标

- 不自动触发或自动推荐 Skill。
- 不执行 Skill 中的 JavaScript、HTML、Shell 或系统命令。
- 不让 Skill 绕过系统指令、工具策略或安全边界。
- 当前不实现外部 Skill 上传、在线市场或多 Skill 组合。

## 快速定位

- `types.ts`：Agent Skill 契约。
- `registry.ts`：Markdown 解析、自动注册和版本解析。
- `mentions.ts`：结构化 Skill mention 创建与提取。
- `builtins/*.md`：内置 Skill 单文件定义。
- `licenses/`：上游开源许可证。
- `components/SkillList.tsx`：平铺列表页。
- `components/SkillHost.tsx`：详情页。
- `docs/`：格式、接入、提示边界和测试规范。
