# 导入安全

当前不支持用户导入。后续若开放外部 Skill，首选与内置格式一致的单个 Markdown，不先引入 zip、脚本或资源目录。

外部 Markdown 属于不可信输入，至少校验：

- 文件大小和 UTF-8 文本格式。
- frontmatter 必填字段、ID 格式、版本和 ID 冲突。
- `source` 使用允许的 HTTP/HTTPS URL，许可证信息明确。
- 正文长度受限，并清楚标记为用户提供的任务指导。
- 不执行或渲染其中的 JavaScript、HTML、Shell 和可执行内容。
- 不允许覆盖系统指令、Agent Function Tool 策略或读取敏感配置。

外部 Skill 只能在用户手动选择后注入当前请求，不得自动启用或直接访问网络。
