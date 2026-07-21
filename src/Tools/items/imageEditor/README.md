# 图片编辑器

基于 `react-filerobot-image-editor` 的单图编辑 Tool。用户可以上传本地图片或从共享图片库选择图片，完成编辑后将结果作为新图片保存。

入口为 `/app/extensions/tools/image-editor`。原图不会被覆盖，编辑结果通过 `Tools/adapters/imageStorage.ts` 写入 IndexedDB，同时创建已完成的画廊任务。保存后结果会立即出现在画廊中，刷新页面后仍可恢复。

Filerobot 的本地调整、标注、滤镜、微调、尺寸和水印能力均已开放。界面使用本地中文词典，不请求上游翻译服务，并跟随应用深浅色主题。需要 Filerobot 云服务凭据的智能能力不在本地图片编辑 Tool 的范围内。

测试位于 `src/Tools/items/imageEditor/tests/`，修改编辑流程时同步更新本 README 和 Tools 文档。
