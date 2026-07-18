import { useEffect, useMemo, useState, useSyncExternalStore, type KeyboardEvent } from 'react'
import type { PromptQuestion, PromptScalar } from '../../features/promptStudio'
import type { PromptQuestionAnswer, PromptStudioToolBundle } from '../../features/promptStudio'
import { SettingsIcon } from '../../components/icons'

type Props = {
  conversationId: string
  bundle: PromptStudioToolBundle
  onClose: () => void
  onOpenSettings?: () => void
}

const sameValue = (a: PromptScalar, b: PromptScalar) => typeof a === typeof b && a === b

export default function Sub2ImagePromptAgentCard({ conversationId, bundle, onClose, onOpenSettings }: Props) {
  const subscribe = useMemo(
    () => (fn: () => void) => bundle.store.subscribe(conversationId, fn),
    [bundle.store, conversationId],
  )
  const getSnapshot = useMemo(
    () => () => bundle.store.getSnapshot(conversationId),
    [bundle.store, conversationId],
  )
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [custom, setCustom] = useState('')
  const [err, setErr] = useState('')
  const index = Math.max(0, snapshot.questions.findIndex((q) => q.id === snapshot.currentQuestionId))
  const question = snapshot.questions[index]

  useEffect(() => {
    void bundle.store.load(conversationId)
  }, [bundle.store, conversationId])

  useEffect(() => {
    if (snapshot.running || snapshot.project?.phase !== 'review') return
    run(() => bundle.store.generate(conversationId))
  }, [snapshot.project?.id, snapshot.project?.phase, snapshot.running])

  useEffect(() => {
    if (!question) {
      setCustom('')
      return
    }
    const answer = snapshot.answers[question.id]
    if (answer?.mode !== 'answer') {
      setCustom('')
      return
    }
    const values = Array.isArray(answer.value) ? answer.value : answer.value == null ? [] : [answer.value]
    setCustom(values
      .filter((value) => !question.options.some((option) => sameValue(option.value, value)))
      .map(String)
      .join('、'))
  }, [question?.id])

  const run = (action: () => Promise<void>) => {
    setErr('')
    void action().catch((error) => setErr(error instanceof Error ? error.message : String(error)))
  }

  const advance = (answer: PromptQuestionAnswer) => {
    if (!question) return
    bundle.store.setAnswer(conversationId, question.id, answer)
    const next = snapshot.questions[index + 1]
    if (next) {
      bundle.store.setCurrentQuestion(conversationId, next.id)
      return
    }
    run(() => bundle.store.submitAnswers(conversationId))
  }

  const submitCustom = () => {
    if (!question) return
    const current = snapshot.answers[question.id]
    const currentValues = current?.mode === 'answer'
      ? Array.isArray(current.value) ? current.value : current.value == null ? [] : [current.value]
      : []
    if (!custom.trim() && (question.input !== 'multiple' || !currentValues.length)) return
    const value = question.input === 'number' ? Number(custom) : custom.trim()
    if (question.input === 'number' && Number.isNaN(value)) return
    if (question.input !== 'multiple') {
      advance({ mode: 'answer', value })
      return
    }
    const options = currentValues.filter((item) => question.options.some((option) => sameValue(option.value, item)))
    advance({ mode: 'answer', value: custom.trim() ? [...options, custom.trim()] : options })
  }

  const close = () => {
    bundle.store.pause(conversationId)
    onClose()
  }

  return (
    <section className="ps-agent-card" data-prompt-agent-card>
      <header className="ps-agent-header">
        <span className="ps-agent-orbit" aria-hidden="true">AI</span>
        <div className="ps-agent-title">
          <strong>图片提示词 Agent</strong>
          <span>{snapshot.running ? '正在分析并生成下一步' : snapshot.project?.title || '正在建立项目'}</span>
        </div>
        {snapshot.running && (
          <button type="button" className="ps-agent-stop" onClick={() => bundle.store.stop(conversationId)}>停止</button>
        )}
        {onOpenSettings && (
          <button type="button" className="ps-agent-close" aria-label="图片设置" onClick={onOpenSettings}>
            <SettingsIcon className="h-4 w-4" />
          </button>
        )}
        <button type="button" className="ps-agent-close" aria-label="暂停并关闭提示词 Agent" onClick={close}>关闭</button>
      </header>

      <div className="ps-agent-body">
        {snapshot.loading || snapshot.running ? (
          <div className="ps-agent-loading" role="status">
            <span className="ps-liquid-loader" aria-hidden="true" />
            <span>{snapshot.project?.phase === 'generating' ? '正在生成完整提示词' : '正在整理创作需求'}</span>
          </div>
        ) : snapshot.project?.phase === 'error' ? (
          <div className="ps-agent-error" role="alert">
            <p>{snapshot.error || '请求已中断，当前进度已保留。'}</p>
            {err && <p>{err}</p>}
            <button type="button" className="ps-agent-retry" onClick={() => run(() => bundle.store.retry(conversationId))}>重试</button>
          </div>
        ) : question ? (
          <Question
            question={question}
            index={index}
            total={snapshot.questions.length}
            answer={snapshot.answers[question.id]}
            custom={custom}
            setCustom={setCustom}
            onAnswer={advance}
            onToggle={(value) => {
              const answer = snapshot.answers[question.id]
              const selected = answer?.mode === 'answer'
                ? Array.isArray(answer.value) ? answer.value : answer.value == null ? [] : [answer.value]
                : []
              const values = selected.some((item) => sameValue(item, value))
                ? selected.filter((item) => !sameValue(item, value))
                : [...selected, value]
              bundle.store.setAnswer(conversationId, question.id, values.length ? { mode: 'answer', value: values } : null)
            }}
            onSubmitCustom={submitCustom}
          />
        ) : (
          <div className="ps-agent-done" role="status"><p>需求已确认，正在准备完整提示词。</p></div>
        )}
        {err && question && <div className="ps-inline-error" role="alert">{err}</div>}
      </div>

      {question
        && !snapshot.running
        && snapshot.project?.phase !== 'error'
        && (
          <footer className="ps-agent-footer">
            <button
              type="button"
              className="ps-agent-back"
              disabled={index === 0}
              onClick={() => bundle.store.setCurrentQuestion(conversationId, snapshot.questions[index - 1]!.id)}
            >
              返回
            </button>
            <button
              type="button"
              className="ps-agent-skip"
              onClick={() => advance({ mode: question.required ? 'delegated' : 'not-applicable' })}
            >
              跳过
            </button>
          </footer>
        )}
    </section>
  )
}

function Question({
  question,
  index,
  total,
  answer,
  custom,
  setCustom,
  onAnswer,
  onToggle,
  onSubmitCustom,
}: {
  question: PromptQuestion
  index: number
  total: number
  answer?: PromptQuestionAnswer
  custom: string
  setCustom: (value: string) => void
  onAnswer: (answer: PromptQuestionAnswer) => void
  onToggle: (value: PromptScalar) => void
  onSubmitCustom: () => void
}) {
  const selected = answer?.mode === 'answer'
    ? Array.isArray(answer.value) ? answer.value : answer.value == null ? [] : [answer.value]
    : []
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== 'ArrowRight') return
    e.preventDefault()
    onSubmitCustom()
  }

  return (
    <div className="ps-agent-question">
      <span className="ps-agent-question-count">问题 {index + 1} / {total}</span>
      <h3>{question.text}</h3>
      {question.options.length > 0 && (
        <div className="ps-agent-options">
          {question.options.map((option, optionIndex) => {
            const active = selected.some((item) => sameValue(item, option.value))
            return (
              <button
                key={`${question.id}-${String(option.value)}`}
                type="button"
                className={`ps-agent-option${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => question.input === 'multiple'
                  ? onToggle(option.value)
                  : onAnswer({ mode: 'answer', value: option.value })}
              >
                <span className="ps-agent-option-index" aria-hidden="true">{optionIndex + 1}</span>
                <span>{option.label}</span>
                <span aria-hidden="true">→</span>
              </button>
            )
          })}
        </div>
      )}
      <div className="ps-agent-custom">
        <input
          type={question.input === 'number' ? 'number' : 'text'}
          aria-label="自定义答案"
          placeholder="自定义答案"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="ps-agent-next"
          aria-label="提交自定义答案"
          disabled={!custom.trim() && !(question.input === 'multiple' && selected.length)}
          onClick={onSubmitCustom}
        >
          →
        </button>
      </div>
    </div>
  )
}
