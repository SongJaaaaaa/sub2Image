import { useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { ConversationMessageProps, ConversationMessageRenderers } from '../../features/conversationComposer'
import { ConversationView, createMessageRendererRegistry, type MessageRendererRegistry } from '../../features/conversationView'
import { copyTextToClipboard, getClipboardFailureMessage } from '../../lib/clipboard'
import { getPromptMentionParts } from '../../lib/promptImageMentions'
import { editOutputs, removeTask, reuseConfig, useStore } from '../../store'
import MarkdownRenderer from '../../components/MarkdownRenderer'
import TaskCard from '../../components/TaskCard'
import { TrashIcon } from '../../components/icons'
import {
  AGENT_IMAGE_TASK_KIND,
  AGENT_WEB_SEARCH_KIND,
  CHAT_TEXT_KIND,
  type AgentConversationMessagePayload,
  type AgentImageTaskBlockPayload,
  type AgentTextBlockPayload,
  type AgentWebSearchBlockPayload,
} from './agentMessageBlocks'

export const IMAGE_GENERATION_RESULT_KIND = 'image-generation/result'

function AgentStreamingCursor() {
  return (
    <span
      aria-label="正在生成"
      className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500 align-baseline dark:bg-blue-400"
    />
  )
}

function AgentErrorMessage({ content }: { content: string }) {
  const pointerDown = useRef<{ x: number; y: number } | null>(null)
  const showToast = useStore((s) => s.showToast)
  const [mainErr, ...hints] = content.replace(/^请求失败：/, '').split('\n提示：')

  const copyError = async () => {
    try {
      await copyTextToClipboard(content)
      showToast('完整报错已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制完整报错失败', err), 'error')
    }
  }

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    pointerDown.current = { x: e.clientX, y: e.clientY }
  }

  const handleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const start = pointerDown.current
    pointerDown.current = null
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return

    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      const target = e.currentTarget
      if ((selection.anchorNode && target.contains(selection.anchorNode)) || (selection.focusNode && target.contains(selection.focusNode))) return
    }

    void copyError()
  }

  return (
    <div
      data-selectable-text
      className="-m-2 flex cursor-copy select-text flex-col rounded-xl p-2 transition-colors hover:bg-red-50/60 dark:hover:bg-red-500/5"
      title="点击复制完整报错"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      <div className="flex items-start gap-2 text-red-500 dark:text-red-400">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-[1.5px] h-[18px] w-[18px] shrink-0">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <div className="break-words whitespace-pre-wrap text-[14px] font-medium leading-relaxed">
          {mainErr}
        </div>
      </div>
      {hints.length > 0 && (
        <div className="mt-1.5 break-words whitespace-pre-wrap pl-[26px] text-[13px] leading-relaxed text-gray-500 opacity-90 dark:text-gray-400">
          <span className="font-medium">提示：</span>{hints.join('\n提示：')}
        </div>
      )}
    </div>
  )
}

function ChatTextMessage({ message }: ConversationMessageProps) {
  const payload = message.payload as AgentConversationMessagePayload | AgentTextBlockPayload | undefined
  if (payload?.type === 'agent-text') {
    return (
      <div className={payload.separated ? 'mt-3' : undefined}>
        <MarkdownRenderer content={message.content} streaming={payload.streaming} />
      </div>
    )
  }

  if (payload?.type !== 'agent-message') {
    return <MarkdownRenderer content={message.content} />
  }

  if (payload.error) return <AgentErrorMessage content={message.content} />

  if (message.role === 'assistant') {
    return (
      <div data-selectable-text className="text-[15px] leading-relaxed text-gray-800 dark:text-gray-100">
        {payload.blocks.length > 0
          ? <ConversationView messages={payload.blocks} registry={agentBlockRegistry} className="contents" />
          : payload.streaming ? <AgentStreamingCursor /> : null}
      </div>
    )
  }

  const inputImages = (payload.round?.inputImageIds ?? []).map((id) => ({ id, dataUrl: '' }))
  const parts = getPromptMentionParts(message.content, inputImages)
  return (
    <div data-selectable-text className="select-text text-[15px] leading-relaxed text-gray-800 dark:text-gray-100">
      {parts.some((part) => part.type === 'mention') ? (
        <div className="whitespace-pre-wrap break-words">
          {parts.map((part, index) => part.type === 'text'
            ? <span key={index}>{part.text}</span>
            : <span key={index} className="mx-0.5 inline-flex items-center rounded-md bg-blue-100/50 px-1.5 py-0.5 align-baseline text-xs font-medium text-blue-700 dark:bg-blue-500/30 dark:text-blue-300">{part.text}</span>,
          )}
        </div>
      ) : (
        <MarkdownRenderer content={parts[0]?.text ?? ''} />
      )}
    </div>
  )
}

function AgentWebSearchMessage({ message }: ConversationMessageProps) {
  const payload = message.payload as AgentWebSearchBlockPayload | undefined
  const status = payload?.type === 'agent-web-search'
    ? payload.status
    : { text: message.content, completed: true }
  const content = (
    <span className="inline-flex text-sm font-medium text-gray-500 dark:text-gray-400">
      <span className={status.completed ? undefined : 'agent-web-search-running-text'}>{status.text}</span>
    </span>
  )

  if (payload?.variant === 'batch') return <div className={payload.separated ? 'mt-3' : undefined}>{content}</div>
  return <div className="mb-2">{content}</div>
}

function AgentImageTaskMessage({ message }: ConversationMessageProps) {
  const payload = message.payload as AgentImageTaskBlockPayload | undefined
  const task = payload?.type === 'agent-image-task' ? payload.task : null
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)

  if (!task) {
    return (
      <div className="mt-4 flex min-h-[120px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-4 text-gray-400 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-500" onClick={(e) => e.stopPropagation()}>
        <TrashIcon className="mb-2 h-6 w-6 opacity-50" />
        <span className="text-xs">[Image Removed]</span>
      </div>
    )
  }

  return (
    <div className="mt-4 w-full px-1" onClick={(e) => e.stopPropagation()}>
      <TaskCard
        task={task}
        disableSwipe
        naturalAspect
        onClick={() => setDetailTaskId(task.id)}
        onReuse={() => {
          void reuseConfig(task)
          useStore.getState().showToast('提示词与配置已放入输入框', 'success')
        }}
        onEditOutputs={() => editOutputs(task)}
        onDelete={() => setConfirmDialog({ title: '删除任务', message: '确定要删除这个任务吗？', action: () => removeTask(task) })}
      />
    </div>
  )
}

export const agentMessageRenderers: ConversationMessageRenderers = {
  [CHAT_TEXT_KIND]: ChatTextMessage,
  [AGENT_WEB_SEARCH_KIND]: AgentWebSearchMessage,
  [AGENT_IMAGE_TASK_KIND]: AgentImageTaskMessage,
}

export const imageGenerationMessageRenderers: ConversationMessageRenderers = {
  [IMAGE_GENERATION_RESULT_KIND]: AgentImageTaskMessage,
}

const agentBlockRegistry = createMessageRendererRegistry(agentMessageRenderers)

export function createSub2ImageMessageRendererRegistry() {
  const registry = createMessageRendererRegistry()
  registry.registerAll(agentMessageRenderers)
  registry.registerAll(imageGenerationMessageRenderers)
  return registry
}

export const sub2ImageMessageRendererRegistry = createSub2ImageMessageRendererRegistry()

export function registerSub2ImageMessageRenderers(renderers: ConversationMessageRenderers, registry: MessageRendererRegistry = sub2ImageMessageRendererRegistry) {
  for (const [kind, Renderer] of Object.entries(renderers)) {
    const current = registry.get(kind)
    if (current === Renderer) continue
    registry.register(kind, Renderer)
  }
}
