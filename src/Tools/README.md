# Workspace Tools

## 用途

`Tools` 管理拓展工作区中的独立功能应用。Tool 拥有自己的页面、状态和操作流程，通过 adapters 访问共享图片、视频和媒体接口能力。

## 当前功能

- `WorkspaceTool` 公共契约。
- Tool 注册表和 ID 去重。
- Tool 列表。
- 支持动态 import 的 Tool 宿主。

当前已注册 Tool：

- `image-editor`：基于 Filerobot 的单图编辑器，支持上传、本地图片库选择和新资源保存。
- `background-remover`：本地 AI 自动抠图，支持完整精度模型、边缘优化、背景替换、PNG 下载和继续编辑。
- `video-editor`：基于 `@xzdarcy/react-timeline-editor` 和 `ffmpeg.wasm` 的本地视频剪辑器，支持单轨裁剪、分割、排序、原声与背景音乐处理及 MP4 导出。
- `voice-generator`：通过 Cloud Server 和 Edge TTS 筛选音色、试听并生成 MP3，结果只保留在当前页面。
- `subtitle-recognition`：上传本地或 IndexedDB 视频，通过 Whisper 识别人声，支持校对和导出 SRT/VTT。

当前计划中的 Tool：

- `video-resizer`：调整视频画布比例和分辨率，目前只展示“开发中”入口。

## 非目标

- 不实现 Agent Skill。
- 不导入原画廊、Agent 或 Composer 页面。
- 不把具体 Tool 状态放进全局 Store。
- 不提前建设通用插件市场或事件总线。

## 快速定位

- `types.ts`：Workspace Tool 契约。
- `registry.ts`：注册表。
- `components/ToolList.tsx`：列表页。
- `components/ToolHost.tsx`：懒加载宿主。
- `docs/`：契约、接入、数据边界和测试规范。
