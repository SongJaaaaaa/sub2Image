# Generation Skills

## 用途

`Skills` 管理用于生成图片描述或提示词的文本指令包。Skill 可以提供规则、默认参数和示例，但不能执行代码或处理图片像素。

## 当前功能

- `GenerationSkill` 公共契约。
- Skill 注册表和 ID 去重。
- Skill 列表与详情宿主。

当前内置 Skill：无。后续阶段将先实现一个电商产品图 Skill。

## 非目标

- 不实现 Workspace Tool。
- 不执行 JavaScript、HTML、Shell 或系统命令。
- 不直接访问网络、API Key 或其他 Skill 数据。
- 第一阶段不实现外部 Skill 导入。

## 快速定位

- `types.ts`：Generation Skill 契约。
- `registry.ts`：内置 Skill 注册表。
- `components/SkillList.tsx`：列表页。
- `components/SkillHost.tsx`：详情宿主。
- `docs/`：格式、接入、安全边界和测试规范。
