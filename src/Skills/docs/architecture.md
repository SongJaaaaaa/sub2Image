# 架构

Skills 根模块提供契约、注册表、列表和详情宿主。内置 Skill 位于 `builtins/<skillName>/`，用户 Skill 在后续阶段通过独立导入和存储模块接入。

```text
SkillList / SkillHost
  -> registry
      -> builtins/*/definition

Skill runtime
  -> Skills/adapters
      -> 文本模型、图片生成、图片库公共能力
```

Skills 不依赖 Tools，具体 Skill 不直接调用模型或图片 API。
