import type { PromptAmbiguityRule, PromptBrief, PromptDomainDefinition, PromptFieldDefinition } from '../types'
import { sharedAmbiguities, sharedFields } from './shared'

export const videoFields: PromptFieldDefinition[] = [
  ...sharedFields.filter((field) => !field.id.startsWith('output.')),
  { id: 'video.opening', label: '开场画面', group: '视频', required: true, dependsOn: ['subject.type', 'scene.environment'] },
  { id: 'video.subjectMotion', label: '主体运动', group: '视频', required: true, dependsOn: ['subject.action', 'subject.count'] },
  { id: 'video.cameraMotion', label: '镜头运动', group: '视频', required: true, dependsOn: ['video.opening', 'video.subjectMotion'] },
  { id: 'video.timeline', label: '时间线与动作顺序', group: '视频', required: true, dependsOn: ['video.opening', 'video.subjectMotion', 'video.cameraMotion'] },
  { id: 'video.ending', label: '结尾画面', group: '视频', required: true, dependsOn: ['video.timeline'] },
  { id: 'video.pacing', label: '节奏与转场', group: '视频', required: false, dependsOn: ['video.timeline'] },
  { id: 'video.audio', label: '声音要求', group: '视频', required: false, dependsOn: ['goal.purpose', 'video.timeline'] },
  { id: 'output.duration', label: '视频时长', group: '输出', required: true },
  { id: 'output.aspectRatio', label: '输出比例', group: '输出', required: true },
  { id: 'output.resolution', label: '清晰度', group: '输出', required: true },
  { id: 'output.n', label: '生成数量', group: '输出', required: true },
]

export const videoAmbiguities: PromptAmbiguityRule[] = [
  {
    terms: ['电影感', '电影级'],
    fields: ['video.cameraMotion', 'video.pacing', 'visual.color', 'visual.lighting'],
    question: '请明确镜头运动、剪辑节奏、光比和色彩分级中需要哪些具体的电影化特征。',
  },
  {
    terms: ['动起来', '有动感'],
    fields: ['video.subjectMotion', 'video.cameraMotion', 'video.timeline'],
    question: '你希望主体如何运动、镜头如何跟随，以及动作按什么顺序发生？',
  },
]

const getBriefJson = (brief: PromptBrief) => JSON.stringify(brief.fields, null, 2)

export const videoDomain: PromptDomainDefinition = {
  id: 'video',
  label: '视频提示词',
  fields: videoFields,
  ambiguities: [...sharedAmbiguities, ...videoAmbiguities],
  buildInstructions: (brief) => `你负责视频提示词访谈。
- 只依据来源和当前 Brief 提取事实，不把推测当成用户决定。
- 每一轮请一次性返回一组问题（通常 2～4 个），分别覆盖当前不同的缺失字段；缺口足够时不要每轮只问一个。仅当剩余缺口不足时才可少于 2 个；信息已经足够时不提问，直接进入 review。
- 视频时长、比例、清晰度和生成数量由请求中的视频设置决定；不要围绕这些配置项提问。
- 必须把静态画面描述转化为可执行的时间流程，确认开场、主体运动、镜头运动、动作顺序和结尾状态。
- 每个新问题必须使用 single 类型并提供 2～3 个简短、互斥、可直接采用的推荐答案；用户始终可以在界面中填写自定义答案。
- 用户已经明确回答的字段优先；模型不得覆盖用户答案，用户后续的新回答可以更新旧回答。
- “交给模型决定”记为 delegated，不适用记为 not-applicable，不得把跳过当成空值。
- “电影感”“有动感”等模糊词必须拆成可观察的镜头运动、主体运动、节奏、光线或色彩特征后继续询问。
- 用户修改上游要求后重新检查依赖字段；参考图需要分别确认用途和保留强度。
- 只有当适用的必需字段都是 answered、delegated 或 not-applicable 时，才进入需求确认；不要创建冲突确认问题。

当前 Brief：
${getBriefJson(brief)}`,
  buildArtifactInstructions: (brief) => `请把已确认的视频 Brief 写成可直接用于 Grok 文生视频的完整中文提示词。
- domain 固定返回 video，不得使用 video_generation 或其他别名。
- prompt 必须按时间顺序完整表达开场画面、主体与环境、连续动作、镜头运动、节奏、光线色彩、声音要求和结尾画面，不能只写静态画面描述。
- 在 prompt 中使用清晰的时间连接词说明动作先后，避免互相冲突的镜头指令。
- 引用参考图时必须使用当前来源中的准确标签，例如 @图1，不得改写编号。
- 画面文字必须逐字引用，Logo 必须保留确认的内容、外观和位置要求。
- negativePrompt 收纳禁止出现的内容。params 只使用 duration、aspectRatio、resolution、n，并保持请求中的视频设置。
- 不得改写锁定决定，不得把未确认的推测写成用户要求。

已确认 Brief：
${getBriefJson(brief)}`,
  canInheritFrom: [],
}
