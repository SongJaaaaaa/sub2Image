# 按钮样式索引

以后按下面的中文名称指定按钮样式即可。

| 中文名称 | 组件 | 来源 | 特征 |
| --- | --- | --- | --- |
| 3D 金属 | `Metal3DButton` | `3Dbuttons` | 深色金属层次、鼠标追光、按压下沉 |
| AI 液态 | `AiLiquidButton` | `Aibutton` | 实时液态金属 Shader、悬停变速、点击波纹 |

弹框等大面积内容容器使用 `metal-3d-surface` 外框，不要把内容区直接改成按钮样式。

## 3D 金属

```tsx
import { Metal3DButton } from './components/metal3DButton'

<Metal3DButton>开始生成</Metal3DButton>

<Metal3DButton iconOnly aria-label="发送">
  <SendIcon />
</Metal3DButton>
```

## AI 液态

```tsx
import { AiLiquidButton } from './components/aiLiquidButton'

<AiLiquidButton>开始生成</AiLiquidButton>

<AiLiquidButton iconOnly aria-label="AI 创作">
  <SparklesIcon />
</AiLiquidButton>
```

两者都支持 `sm`、`md`、`lg` 尺寸，以及原生按钮的 `onClick`、`disabled`、`aria-label` 等属性，并会跟随项目的白天/黑夜主题自动调整对比度。
