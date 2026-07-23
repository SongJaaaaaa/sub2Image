# Skill 格式

每个内置 Skill 是 `builtins/` 下的一个 Markdown 文件。注册表使用 `import.meta.glob` 自动读取，新文件不需要 `definition.ts` 或手动注册。用户导入及从云端恢复的 `.md` 使用相同格式，并校验 256 KB 大小上限、UTF-8、字段长度和 HTTP/HTTPS 来源。云端保存的是原始 Markdown、文件名、ID 和版本，恢复后仍走同一注册表校验。

```md
---
id: product-photography
name: 电商产品图
description: 为商品生成专业摄影提示词
version: 1
author: Anthropic
source: https://github.com/anthropics/skills
license: Apache-2.0
order: 10
---
# 电商产品图

Skill instructions...
```

## 字段

- `id`：必填，小写短横线形式，全局唯一。
- `name`：必填，列表和 `@` mention 显示名称。
- `description`：必填，一句话说明负责什么；不承担自动触发规则。
- `version`：必填，正整数；改变指令行为时递增。
- `author`、`source`、`license`：必填，用于开源归属和详情展示。
- `order`：可选，数字越小越靠前，默认 `999`。
- 正文：必填，发送请求时注入的实际指令。

frontmatter 当前只支持单行 `key: value`，不支持数组、嵌套对象或多行 YAML。该限制保持格式直观，并避免为可信内置文件引入额外解析依赖。
