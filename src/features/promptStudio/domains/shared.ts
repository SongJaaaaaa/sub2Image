import type { PromptAmbiguityRule, PromptFieldCondition, PromptFieldDefinition } from '../types'

const PERSON_CONDITION: PromptFieldCondition = {
  any: [
    { field: 'subject.type', op: 'includes', value: '人物' },
    { field: 'subject.type', op: 'includes', value: '人像' },
    { field: 'subject.type', op: 'includes', value: '角色' },
  ],
}

const OUTDOOR_CONDITION: PromptFieldCondition = {
  any: [
    { field: 'scene.type', op: 'includes', value: '户外' },
    { field: 'scene.type', op: 'includes', value: '室外' },
  ],
}

const HAS_REFERENCE_CONDITION: PromptFieldCondition = {
  field: 'reference.hasImages',
  op: 'equals',
  value: true,
}

const HAS_TEXT_CONDITION: PromptFieldCondition = {
  field: 'text.enabled',
  op: 'equals',
  value: true,
}

const HAS_LOGO_CONDITION: PromptFieldCondition = {
  field: 'logo.enabled',
  op: 'equals',
  value: true,
}

export const sharedFields: PromptFieldDefinition[] = [
  { id: 'goal.purpose', label: '用途', group: '目标', required: true },
  { id: 'goal.intent', label: '表达目标', group: '目标', required: true, dependsOn: ['goal.purpose'] },
  { id: 'goal.audience', label: '目标受众', group: '目标', required: false, dependsOn: ['goal.purpose'] },
  { id: 'subject.type', label: '主体类型', group: '主体', required: true },
  { id: 'subject.count', label: '主体数量', group: '主体', required: true, dependsOn: ['subject.type'] },
  { id: 'subject.identity', label: '主体身份', group: '主体', required: false, dependsOn: ['subject.type'] },
  { id: 'subject.appearance', label: '外观与关键特征', group: '主体', required: true, dependsOn: ['subject.type', 'subject.identity'] },
  { id: 'subject.clothing', label: '服装与配饰', group: '主体', required: false, appliesWhen: PERSON_CONDITION, dependsOn: ['subject.type', 'subject.identity'] },
  { id: 'subject.action', label: '动作与姿态', group: '主体', required: false, dependsOn: ['subject.type', 'subject.count'] },
  { id: 'subject.expression', label: '表情与视线', group: '主体', required: false, appliesWhen: PERSON_CONDITION, dependsOn: ['subject.type', 'subject.identity', 'subject.action'] },
  { id: 'scene.type', label: '场景类型', group: '场景', required: true },
  { id: 'scene.environment', label: '地点与环境', group: '场景', required: true, dependsOn: ['scene.type'] },
  { id: 'scene.era', label: '时代', group: '场景', required: false, dependsOn: ['scene.type', 'scene.environment'] },
  { id: 'scene.time', label: '时间', group: '场景', required: false, dependsOn: ['scene.type', 'scene.environment'] },
  { id: 'scene.weather', label: '天气', group: '场景', required: false, appliesWhen: OUTDOOR_CONDITION, dependsOn: ['scene.type', 'scene.environment', 'scene.time'] },
  { id: 'visual.style', label: '视觉风格', group: '视觉', required: true },
  { id: 'visual.medium', label: '媒介与表现形式', group: '视觉', required: true },
  { id: 'visual.realism', label: '真实程度', group: '视觉', required: false, dependsOn: ['visual.style', 'visual.medium'] },
  { id: 'visual.color', label: '色彩与色调', group: '视觉', required: false, dependsOn: ['visual.style'] },
  { id: 'visual.lighting', label: '光线', group: '视觉', required: false, dependsOn: ['scene.time', 'scene.weather', 'visual.style'] },
  { id: 'visual.material', label: '材质表现', group: '视觉', required: false, dependsOn: ['subject.type', 'subject.appearance', 'visual.medium'] },
  { id: 'reference.hasImages', label: '是否有参考图片', group: '参考', required: false },
  { id: 'reference.roles', label: '每张参考图的用途', group: '参考', required: true, appliesWhen: HAS_REFERENCE_CONDITION, dependsOn: ['reference.hasImages'] },
  { id: 'reference.strength', label: '参考保留强度', group: '参考', required: true, appliesWhen: HAS_REFERENCE_CONDITION, dependsOn: ['reference.hasImages', 'reference.roles'] },
  { id: 'text.enabled', label: '是否包含画面文字', group: '文字', required: true },
  { id: 'text.content', label: '准确文案', group: '文字', required: true, appliesWhen: HAS_TEXT_CONDITION, dependsOn: ['text.enabled'] },
  { id: 'text.language', label: '文字语言', group: '文字', required: true, appliesWhen: HAS_TEXT_CONDITION, dependsOn: ['text.enabled', 'text.content'] },
  { id: 'text.layout', label: '文字排版', group: '文字', required: false, appliesWhen: HAS_TEXT_CONDITION, dependsOn: ['text.enabled', 'text.content'] },
  { id: 'logo.enabled', label: '是否包含 Logo', group: '品牌', required: true },
  { id: 'logo.description', label: 'Logo 内容与保留要求', group: '品牌', required: true, appliesWhen: HAS_LOGO_CONDITION, dependsOn: ['logo.enabled'] },
  { id: 'logo.placement', label: 'Logo 位置', group: '品牌', required: false, appliesWhen: HAS_LOGO_CONDITION, dependsOn: ['logo.enabled', 'logo.description'] },
  { id: 'output.aspectRatio', label: '输出比例', group: '输出', required: true },
  { id: 'output.size', label: '输出尺寸', group: '输出', required: true, dependsOn: ['output.aspectRatio'] },
  { id: 'output.quality', label: '质量目标', group: '输出', required: false, dependsOn: ['output.size', 'visual.medium'] },
  { id: 'constraints.mustKeep', label: '必须保留的内容', group: '约束', required: false },
  { id: 'constraints.exclude', label: '禁止出现的内容', group: '约束', required: false },
]

export const sharedAmbiguities: PromptAmbiguityRule[] = [
  {
    terms: ['高级感', '高端', '有质感'],
    fields: ['visual.style', 'visual.color', 'visual.lighting', 'visual.material'],
    question: '你期望通过哪些可观察特征呈现高级感，例如极简留白、低饱和配色、特定材质或奢侈品广告布光？',
  },
  {
    terms: ['氛围感', '更有氛围'],
    fields: ['scene.time', 'scene.weather', 'visual.color', 'visual.lighting'],
    question: '请明确时间、天气、光源、色温或环境密度中哪些变化用来营造氛围。',
  },
  {
    terms: ['自然一点', '自然感'],
    fields: ['subject.action', 'subject.expression', 'visual.realism', 'visual.lighting'],
    question: '你想让姿态、表情、肤质、光线或画面真实程度如何变得更自然？',
  },
]
