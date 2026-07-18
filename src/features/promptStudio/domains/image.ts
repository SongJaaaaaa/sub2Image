import type { PromptAmbiguityRule, PromptBrief, PromptDomainDefinition, PromptFieldCondition, PromptFieldDefinition } from '../types'
import { sharedAmbiguities, sharedFields } from './shared'

const PHOTO_CONDITION: PromptFieldCondition = {
  any: [
    { field: 'visual.medium', op: 'includes', value: '摄影' },
    { field: 'visual.medium', op: 'includes', value: '照片' },
  ],
}

export const imageFields: PromptFieldDefinition[] = [
  { id: 'composition.shot', label: '景别', group: '构图', required: true, dependsOn: ['subject.type', 'subject.count', 'subject.action'] },
  { id: 'composition.angle', label: '视角与机位', group: '构图', required: false, dependsOn: ['composition.shot', 'subject.action'] },
  { id: 'composition.placement', label: '主体位置与画面重心', group: '构图', required: false, dependsOn: ['subject.count', 'subject.action', 'composition.shot'] },
  { id: 'composition.negativeSpace', label: '留白', group: '构图', required: false, dependsOn: ['goal.purpose', 'text.enabled', 'logo.enabled', 'composition.placement'] },
  { id: 'composition.focus', label: '视觉焦点', group: '构图', required: true, dependsOn: ['subject.type', 'subject.count', 'composition.placement'] },
  { id: 'camera.lens', label: '镜头焦段', group: '摄影', required: false, appliesWhen: PHOTO_CONDITION, dependsOn: ['visual.medium', 'composition.shot'] },
  { id: 'camera.depthOfField', label: '景深', group: '摄影', required: false, appliesWhen: PHOTO_CONDITION, dependsOn: ['visual.medium', 'camera.lens', 'composition.focus'] },
]

export const imageAmbiguities: PromptAmbiguityRule[] = [
  {
    terms: ['电影感', '电影级'],
    fields: ['composition.shot', 'composition.angle', 'camera.lens', 'camera.depthOfField', 'visual.color', 'visual.lighting'],
    question: '请明确画幅与景别、镜头焦段、光比、色彩分级和景深中需要哪些具体的电影化特征。',
  },
  {
    terms: ['震撼', '更震撼'],
    fields: ['composition.shot', 'composition.angle', 'composition.focus', 'subject.count'],
    question: '你希望通过大景别、低机位、尺度对比还是更强的主体动作来呈现震撼感？',
  },
]

const getBriefJson = (brief: PromptBrief) => JSON.stringify(brief.fields, null, 2)

export const imageDomain: PromptDomainDefinition = {
  id: 'image',
  label: '图片提示词',
  fields: [...sharedFields, ...imageFields],
  ambiguities: [...sharedAmbiguities, ...imageAmbiguities],
  buildInstructions: (brief) => `你负责图片提示词访谈。
- 只依据来源和当前 Brief 提取事实，不把推测当成用户决定。
- 每轮按需询问主题相关的精确问题，不设固定题数；优先补齐当前适用的必需字段，信息已经足够时可以不提问，直接进入 review。
- 输出比例、尺寸和质量由请求中的图片设置决定；不要围绕这些配置项提问，设置为自动时直接由模型选择。
- 每个新问题必须使用 single 类型并提供 2～3 个简短、互斥、可直接采用的推荐答案；用户始终可以在界面中填写自定义答案。
- 用户已经明确回答的字段优先；模型不得覆盖用户答案，用户后续的新回答可以更新旧回答。
- “交给模型决定”记为 delegated，不适用记为 not-applicable，不得把跳过当成空值。
- “高级感”“电影感”等模糊词必须拆成可观察的构图、色彩、光线、材质或镜头特征后继续询问。
- 用户修改上游要求后重新检查依赖字段；参考图需要分别确认用途和保留强度。
- 只有当适用的必需字段都是 answered、delegated 或 not-applicable 时，才进入需求确认；不要创建冲突确认问题。

当前 Brief：
${getBriefJson(brief)}`,
  buildArtifactInstructions: (brief) => `请把已确认的图片 Brief 写成可直接用于图片生成的完整中文提示词。
- domain 固定返回 image，不得使用 image_generation 或其他别名。
- prompt 必须完整表达用途、主体、场景、构图、风格、色彩、光线、材质、参考关系和输出要求。
- 引用参考图时必须使用当前来源中的准确标签，例如 @图1，不得改写编号。
- 画面文字必须逐字引用，Logo 必须保留确认的内容、外观和位置要求。
- negativePrompt 收纳禁止出现的内容。params 写入比例、尺寸和其他已确认参数，但只使用 size、quality、output_format、output_compression、moderation、n、transparent_output；比例必须换算后写入 size，不得输出 ratio 或 aspectRatio。
- 不得改写锁定决定，不得把未确认的推测写成用户要求。

已确认 Brief：
${getBriefJson(brief)}`,
  canInheritFrom: [],
}
