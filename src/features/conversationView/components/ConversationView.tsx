import { Fragment, useSyncExternalStore, type ReactNode } from 'react'
import type { ConversationMessage, ConversationMessageProps } from '../../conversationComposer'
import type { MessageRendererRegistry } from '../runtime/messageRendererRegistry'

type ConversationViewProps = {
  messages: readonly ConversationMessage[]
  registry: MessageRendererRegistry
  className?: string
  empty?: ReactNode
  renderMessage?: (message: ConversationMessage, content: ReactNode, index: number) => ReactNode
}

function UnknownMessage({ message }: ConversationMessageProps) {
  if (message.content) return <div className="whitespace-pre-wrap break-words">{message.content}</div>
  return <div role="alert">无法显示消息：{message.kind}</div>
}

export default function ConversationView({ messages, registry, className, empty = null, renderMessage }: ConversationViewProps) {
  useSyncExternalStore(registry.subscribe, registry.getVersion, registry.getVersion)
  if (messages.length === 0) return <>{empty}</>

  return (
    <div data-conversation-view className={className}>
      {messages.map((message, index) => {
        const Renderer = registry.get(message.kind) ?? UnknownMessage
        const content = <Renderer message={message} />
        return (
          <Fragment key={message.id}>
            {renderMessage ? renderMessage(message, content, index) : content}
          </Fragment>
        )
      })}
    </div>
  )
}
