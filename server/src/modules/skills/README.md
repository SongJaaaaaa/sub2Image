# Skills 模块

## 职责

保存用户导入 Skill 的原始 UTF-8 Markdown、文件名、Skill ID 和整数版本。内置 Skill 不上传。

## 接口

- `GET /api/skills`：当前账号 Skill 列表。
- `PUT /api/skills/:id`：幂等保存 `{version,fileName,markdown}`。
- `DELETE /api/skills/:id`：移出云端。

## 数据结构

拥有 `cloud_skills`。`account_id + source_skill_id` 唯一，更新保留创建时间并刷新更新时间。

## 依赖

只依赖数据库和鉴权钩子提供的 `accountId`，不依赖文件存储。

## 错误处理

ID 必须是小写 kebab-case，版本必须是正整数，文件名必须以 `.md` 结尾。Markdown 最大 256KB，按 UTF-8 字节数计算；路由会为 JSON 转义和包装保留空间。每账号最多 100 个用户 Skill，任务与 Skill 合计同步元数据最多 20MB。

## 删除行为

删除只影响当前账号云端 Skill，不删除浏览器 localStorage 副本，也不传播到其他设备本地数据。DELETE 对已不存在的 Skill 幂等成功。
