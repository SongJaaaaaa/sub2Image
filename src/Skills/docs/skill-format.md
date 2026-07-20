# Skill 格式

`GenerationSkill` 包含 ID、名称、描述、版本、指令、支持模式和可选默认参数。

外部 Skill 包的目标结构：

```text
<name>.skill/
├── skill.json
├── SKILL.md
├── cover.webp
└── examples/
```

当前阶段只注册可信的内置 Skill，不解析外部包。后续导入实现必须把 `skill.json` 和 `SKILL.md` 当作不可信输入处理。
