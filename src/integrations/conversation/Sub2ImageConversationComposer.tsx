import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { getActiveAgentRounds, loadComposerDraft, useStore } from '../../store'
import { formatImageRatio } from '../../lib/size'
import { collectAgentRoundOutputImageSlots } from '../../lib/agentImageReferences'
import { getAtImageQuery, getPromptMentionParts, getSelectedImageMentionLabel, imageMentionMatches, insertImageMentionAtVisibleRange, insertTextMentionAtVisibleRange, isCursorInSelectedImageMention, restoreImageMentionMarkers, stripImageMentionMarkers } from '../../lib/promptImageMentions'
import {
  ConversationAttachments,
  ConversationComposer,
  createConversationRuntime,
  type ComposerEditorHandle,
  type ComposerEditorPart,
  type ConversationAttachmentItem,
} from '../../features/conversationComposer'
import type { PromptProject, PromptStudioToolBundle } from '../../features/promptStudio'
import GallerySelectionActionBar from '../../components/GallerySelectionActionBar'
import { TuneIcon } from '../../components/icons'
import { AiLiquidButton } from '../../components/aiLiquidButton'
import { clearActiveComposerOwner, isComposerFocused, NEXT_COMPOSER_OWNER, setActiveComposerOwner } from './composerFocus'
import { conversationTools, SUB2_CHAT_TOOL_ID, SUB2_IMAGE_TOOL_ID } from './conversationTools'
import { registerSub2ImageMessageRenderers } from './conversationMessageRenderers'
import { addInputDropData, addInputImageFiles, MAX_INPUT_IMAGES, replaceInputImageFile } from './inputFiles'
import { loadSub2ImagePromptStudio } from './sub2ImagePromptTool'
import type { TaskParams } from '../../types'
import Sub2ImageAttachmentPreview from './Sub2ImageAttachmentPreview'
import Sub2ImageComposerSettings from './Sub2ImageComposerSettings'
import Sub2ImagePromptAgentCard from './Sub2ImagePromptAgentCard'

type AtOption =
  | { key: string; label: string; type: 'input'; imageIndex: number }
  | { key: string; label: string; type: 'agent-output'; insertText: string }

const PROMPT_CONVERSATION_ID = 'gallery'

function getPromptOutputSettings(params: Partial<TaskParams> = {}) {
  const sizeMatch = params.size?.match(/^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/)
  return {
    size: params.size ?? null,
    quality: params.quality ?? null,
    output_format: params.output_format ?? null,
    output_compression: params.output_compression ?? null,
    moderation: params.moderation ?? null,
    n: params.n ?? null,
    transparent_output: params.transparent_output ?? null,
    aspectRatio: sizeMatch ? formatImageRatio(Number(sizeMatch[1]), Number(sizeMatch[2])) : null,
  }
}

const PROMPT_OUTPUT_PARAM_KEYS = [
  'size',
  'quality',
  'output_format',
  'output_compression',
  'moderation',
  'n',
  'transparent_output',
] as const

function getPromptOutputParams(
  params: Record<string, string | number | boolean>,
  metadata: Record<string, string | number | boolean> = {},
) {
  return Object.fromEntries(PROMPT_OUTPUT_PARAM_KEYS.flatMap((key) => {
    // 设置元数据是最终提交来源，模型产物中的同名字段只能作为旧项目回退值。
    const value = metadata[`output.${key}`] ?? params[key]
    return value === undefined || value === null ? [] : [[key, value]]
  })) as Partial<TaskParams>
}

function outputSettingsKey(settings: Record<string, unknown>) {
  return JSON.stringify(Object.entries(settings)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([first], [second]) => first.localeCompare(second)))
}

function matchesPromptProjectInput(
  project: PromptProject,
  draft: ReturnType<typeof loadComposerDraft>,
  allowEmptyDraftResume: boolean,
) {
  const sourceText = draft.prompt.trim() || (draft.inputImages.length ? '请分析参考图片并确认创作需求' : '')
  if (!draft.prompt.trim() && !draft.inputImages.length) return allowEmptyDraftResume

  const storedSettings = Object.fromEntries(Object.entries(project.source.metadata ?? {})
    .filter(([key]) => key.startsWith('output.'))
    .map(([key, value]) => [key.slice('output.'.length), value]))
  if (outputSettingsKey(storedSettings) !== outputSettingsKey(getPromptOutputSettings(draft.params))) return false

  if ((project.source.text ?? '').trim() !== sourceText) return false

  const sourceIds = project.source.assets?.map((asset) => asset.id).join('\0') ?? ''
  const draftIds = draft.inputImages.map((image) => image.id).join('\0')
  return sourceIds === draftIds
}

export default function Sub2ImageConversationComposer() {
  const prompt = useStore((state) => state.prompt)
  const setPrompt = useStore((state) => state.setPrompt)
  const inputImages = useStore((state) => state.inputImages)
  const removeInputImage = useStore((state) => state.removeInputImage)
  const moveInputImage = useStore((state) => state.moveInputImage)
  const maskDraft = useStore((state) => state.maskDraft)
  const setMaskEditorImageId = useStore((state) => state.setMaskEditorImageId)
  const params = useStore((state) => state.params)
  const setParams = useStore((state) => state.setParams)
  const appMode = useStore((state) => state.appMode)
  const settings = useStore((state) => state.settings)
  const showToast = useStore((state) => state.showToast)
  const conversations = useStore((state) => state.agentConversations)
  const activeConversationId = useStore((state) => state.activeAgentConversationId)
  const tasks = useStore((state) => state.tasks)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)
  const replaceTargetRef = useRef<{ index: number; id: string } | null>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<ComposerEditorHandle>(null)
  const ignoredReadyProjectRef = useRef<string | null>(null)
  const [cursor, setCursor] = useState(0)
  const [atIndex, setAtIndex] = useState(0)
  const [atDismissed, setAtDismissed] = useState(false)
  const [promptBundle, setPromptBundle] = useState<PromptStudioToolBundle | null>(null)
  const [promptOpen, setPromptOpen] = useState(false)
  const [promptAgentSelected, setPromptAgentSelected] = useState(false)
  const [promptStarting, setPromptStarting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const promptDraftEditedRef = useRef(false)
  const [, refreshRuntime] = useReducer((value) => value + 1, 0)
  const runtime = useMemo(() => createConversationRuntime({
    tools: conversationTools,
    onToolLoaded: (_toolId, module) => registerSub2ImageMessageRenderers(module.messageRenderers),
  }), [])
  const toolId = appMode === 'agent' ? SUB2_CHAT_TOOL_ID : SUB2_IMAGE_TOOL_ID
  const conversationId = appMode === 'agent' ? activeConversationId ?? 'active-agent' : PROMPT_CONVERSATION_ID
  const scope = useMemo(() => ({ conversationId, toolId }), [conversationId, toolId])

  const updateClearance = useCallback(() => {
    const dock = dockRef.current
    if (!dock) return
    const clearance = Math.max(0, window.innerHeight - dock.getBoundingClientRect().top)
    document.documentElement.style.setProperty('--composer-stack-clearance', `${Math.ceil(clearance)}px`)
  }, [])

  useLayoutEffect(() => {
    const dock = dockRef.current
    if (!dock || showSettings) return
    let frame = 0
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateClearance)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(dock)
    const visualViewport = window.visualViewport
    window.addEventListener('resize', schedule)
    visualViewport?.addEventListener('resize', schedule)
    visualViewport?.addEventListener('scroll', schedule)
    schedule()
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      visualViewport?.removeEventListener('resize', schedule)
      visualViewport?.removeEventListener('scroll', schedule)
      document.documentElement.style.removeProperty('--composer-stack-clearance')
    }
  }, [promptOpen, showSettings, updateClearance])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      const dock = dockRef.current
      const active = document.activeElement
      if (!dock || !(active instanceof HTMLElement) || !dock.contains(active)) return
      if (e.target instanceof Node && !dock.contains(e.target)) active.blur()
    }
    document.addEventListener('mousedown', handleMouseDown, true)
    return () => document.removeEventListener('mousedown', handleMouseDown, true)
  }, [])

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isComposerFocused(NEXT_COMPOSER_OWNER)) return
      if (e.target instanceof Node && dockRef.current?.contains(e.target)) return
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith('image/'))
        .flatMap((item) => item.getAsFile() ? [item.getAsFile()!] : [])
      if (!files.length) return
      e.preventDefault()
      promptDraftEditedRef.current = true
      void addInputImageFiles(files)
    }
    const handleDragOver = (e: DragEvent) => {
      if (!isComposerFocused(NEXT_COMPOSER_OWNER)) return
      if (e.target instanceof Node && dockRef.current?.contains(e.target)) return
      const types = Array.from(e.dataTransfer?.types ?? [])
      if (!types.some((type) => type === 'Files' || type === 'text/plain')) return
      e.preventDefault()
    }
    const handleDrop = (e: DragEvent) => {
      if (!isComposerFocused(NEXT_COMPOSER_OWNER)) return
      if (e.target instanceof Node && dockRef.current?.contains(e.target)) return
      if (!e.dataTransfer) return
      e.preventDefault()
      e.stopPropagation()
      promptDraftEditedRef.current = true
      void addInputDropData(e.dataTransfer)
    }
    document.addEventListener('paste', handlePaste)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('paste', handlePaste)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop)
    }
  }, [])

  useEffect(() => {
    let current = true
    runtime.loadTool(toolId)
      .then(() => {
        if (current) refreshRuntime()
      })
      .catch((err) => {
        if (current) showToast(err instanceof Error ? err.message : String(err), 'error')
      })
    return () => {
      current = false
    }
  }, [runtime, showToast, toolId])

  useEffect(() => {
    if (!promptOpen || !promptBundle) return
    const applyReady = () => {
      const snapshot = promptBundle.store.getSnapshot(PROMPT_CONVERSATION_ID)
      if (!snapshot.project || snapshot.project.id === ignoredReadyProjectRef.current) return
      if (snapshot.project.phase !== 'ready' || !snapshot.editor) return
      setParams(getPromptOutputParams(snapshot.editor.params, snapshot.project.source.metadata))
      setPrompt(restoreImageMentionMarkers(snapshot.editor.prompt, useStore.getState().inputImages.length))
      ignoredReadyProjectRef.current = null
      setPromptOpen(false)
      setPromptAgentSelected(false)
      showToast('完整提示词已写入输入框', 'success')
    }
    applyReady()
    return promptBundle.store.subscribe(PROMPT_CONVERSATION_ID, applyReady)
  }, [promptBundle, promptOpen, setParams, setPrompt, showToast])

  useEffect(() => {
    if (appMode !== 'agent') return
    setPromptAgentSelected(false)
    if (promptOpen && promptBundle) promptBundle.store.pause(PROMPT_CONVERSATION_ID)
    if (promptOpen) setPromptOpen(false)
  }, [appMode, promptBundle, promptOpen])

  const submitInput = useMemo(() => ({
    text: prompt,
    attachments: inputImages.map((image, index) => ({ id: image.id, type: 'image', name: `参考图${index + 1}` })),
    params: { ...params },
  }), [inputImages, params, prompt])
  const composerState = runtime.getToolComposerState({ ...scope, input: submitInput })
  const promptProject = promptBundle?.store.getSnapshot(PROMPT_CONVERSATION_ID).project
  const promptAgentCanSubmit = composerState.canSubmit || Boolean(promptProject && promptProject.phase !== 'ready')
  const activeConversation = appMode === 'agent'
    ? conversations.find((item) => item.id === activeConversationId) ?? null
    : null

  const editorParts = useMemo<ComposerEditorPart[]>(() => getPromptMentionParts(prompt, inputImages).map((part) => (
    part.type === 'mention'
      ? { text: part.text, value: part.mentionText ?? getSelectedImageMentionLabel(part.imageIndex ?? 0) }
      : { text: part.text }
  )), [inputImages, prompt])
  const attachments = useMemo<ConversationAttachmentItem[]>(() => inputImages.map((image, index) => ({
    id: image.id,
    label: `参考图${index + 1}`,
    previewUrl: image.dataUrl,
    badge: image.id === maskDraft?.targetImageId ? '遮罩' : undefined,
  })), [inputImages, maskDraft?.targetImageId])
  const agentOptions = useMemo<AtOption[]>(() => {
    if (!activeConversation) return []
    return getActiveAgentRounds(activeConversation).flatMap((round) => (
      collectAgentRoundOutputImageSlots(round, tasks).flatMap((imageId, imageIndex) => {
        if (!imageId) return []
        const label = `@第${round.index}轮图${imageIndex + 1}`
        return [{ key: `agent:${round.id}:${imageIndex}:${imageId}`, label, type: 'agent-output' as const, insertText: label }]
      })
    ))
  }, [activeConversation, tasks])
  const atQuery = isCursorInSelectedImageMention(prompt, cursor)
    ? null
    : getAtImageQuery(stripImageMentionMarkers(prompt), cursor, { length: inputImages.length + agentOptions.length })
  const atOptions: AtOption[] = atQuery
    ? [
        ...inputImages.flatMap((image, imageIndex) => imageMentionMatches(atQuery.query, imageIndex)
          ? [{ key: `input:${image.id}:${imageIndex}`, label: `@图${imageIndex + 1}`, type: 'input' as const, imageIndex }]
          : []),
        ...agentOptions.filter((option) => {
          const query = atQuery.query.trim().toLocaleLowerCase()
          const label = option.label.toLocaleLowerCase()
          return !query || label.includes(query) || label.replace(/^@/, '').includes(query)
        }),
      ]
    : []
  const showAtMenu = !atDismissed && atOptions.length > 0

  const selectAtOption = (option: AtOption) => {
    if (!atQuery) return
    const next = option.type === 'input'
      ? insertImageMentionAtVisibleRange(prompt, atQuery.start, cursor, option.imageIndex)
      : insertTextMentionAtVisibleRange(prompt, atQuery.start, cursor, option.insertText)
    promptDraftEditedRef.current = true
    setPrompt(next.prompt)
    setAtDismissed(true)
    setAtIndex(0)
    window.requestAnimationFrame(() => editorRef.current?.focus(next.cursor))
  }

  const handleEditorKeyCommand = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!showAtMenu) return false
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAtIndex((index) => (index + 1) % atOptions.length)
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtIndex((index) => (index - 1 + atOptions.length) % atOptions.length)
      return true
    }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault()
      selectAtOption(atOptions[atIndex] ?? atOptions[0])
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setAtDismissed(true)
      return true
    }
    return false
  }

  const submit = async () => {
    const draft = loadComposerDraft()
    const state = useStore.getState()
    const requestScope = {
      conversationId: appMode === 'agent' ? state.activeAgentConversationId ?? state.createAgentConversation() : PROMPT_CONVERSATION_ID,
      toolId,
    }
    refreshRuntime()
    try {
      await runtime.submit({
        ...requestScope,
        input: {
          text: draft.prompt,
          attachments: draft.inputImages.map((image, index) => ({ id: image.id, type: 'image', name: `参考图${index + 1}` })),
          params: { ...draft.params },
          payload: { draft, editingRoundId: state.agentEditingRoundId },
        },
      })
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      refreshRuntime()
    }
  }

  const openPromptAgent = async () => {
    if (promptStarting) return
    setPromptStarting(true)
    try {
      const bundle = promptBundle ?? await loadSub2ImagePromptStudio()
      setPromptBundle(bundle)
      await bundle.store.load(PROMPT_CONVERSATION_ID)
      const snapshot = bundle.store.getSnapshot(PROMPT_CONVERSATION_ID)
      const draft = loadComposerDraft()
      if (snapshot.project && snapshot.project.phase !== 'ready' && matchesPromptProjectInput(snapshot.project, draft, !promptDraftEditedRef.current)) {
        const current = useStore.getState()
        if (!current.inputImages.length && snapshot.project.source.assets?.length) {
          const images = await Promise.all(snapshot.project.source.assets.map(async (asset) => ({
            id: asset.id,
            dataUrl: await bundle.store.resolveAsset(asset.id),
          })))
          current.setInputImages(images.flatMap((image) => image.dataUrl ? [{ id: image.id, dataUrl: image.dataUrl }] : []))
        } else {
          bundle.store.syncAttachments(PROMPT_CONVERSATION_ID, current.inputImages.map((image, index) => ({
            id: image.id,
            name: `参考图${index + 1}`,
          })))
        }
        ignoredReadyProjectRef.current = null
        promptDraftEditedRef.current = false
        setPrompt('')
        bundle.store.resume(PROMPT_CONVERSATION_ID)
        setPromptOpen(true)
        setPromptStarting(false)
        return
      }
      ignoredReadyProjectRef.current = snapshot.project?.id ?? null
      promptDraftEditedRef.current = false
      setPrompt('')
      setPromptOpen(true)
      const pending = bundle.store.start(PROMPT_CONVERSATION_ID, {
        text: draft.prompt,
        attachments: draft.inputImages.map((image, index) => ({ id: image.id, name: `参考图${index + 1}` })),
        outputSettings: getPromptOutputSettings(draft.params),
      })
      await Promise.resolve()
      setPromptStarting(false)
      void pending.catch((err) => showToast(err instanceof Error ? err.message : String(err), 'error'))
    } catch (err) {
      setPromptOpen(false)
      setPromptAgentSelected(false)
      setPromptStarting(false)
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const togglePromptAgent = async () => {
    if (promptAgentSelected) {
      setPromptAgentSelected(false)
      return
    }

    setPromptAgentSelected(true)
    window.requestAnimationFrame(() => editorRef.current?.focus())
    try {
      const bundle = promptBundle ?? await loadSub2ImagePromptStudio()
      await bundle.store.load(PROMPT_CONVERSATION_ID)
      setPromptBundle(bundle)
    } catch (err) {
      setPromptAgentSelected(false)
      showToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const handleFileInput = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) promptDraftEditedRef.current = true
    await addInputImageFiles(e.target.files ?? [])
    e.target.value = ''
  }
  const handleReplaceInput = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const target = replaceTargetRef.current
    e.target.value = ''
    replaceTargetRef.current = null
    if (file && target) {
      promptDraftEditedRef.current = true
      await replaceInputImageFile(target, file)
    }
  }
  const preview = previewIndex == null ? null : inputImages[previewIndex]

  return (
    <>
      {!showSettings && (
        <div
          ref={dockRef}
          data-conversation-composer-dock
          data-composer-owner={NEXT_COMPOSER_OWNER}
          onPointerDownCapture={() => setActiveComposerOwner(NEXT_COMPOSER_OWNER)}
          onFocusCapture={() => setActiveComposerOwner(NEXT_COMPOSER_OWNER)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) clearActiveComposerOwner(NEXT_COMPOSER_OWNER)
          }}
          className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] left-1/2 z-30 w-full max-w-4xl -translate-x-1/2 px-3 sm:px-4"
        >
          {appMode === 'gallery' && <GallerySelectionActionBar />}
          {promptOpen ? (
            <section className="cc-composer cc-composer--agent">
              {promptBundle && !promptStarting ? (
                <Sub2ImagePromptAgentCard
                  conversationId={PROMPT_CONVERSATION_ID}
                  bundle={promptBundle}
                  onClose={() => {
                    setPromptOpen(false)
                    setPromptAgentSelected(false)
                  }}
                  onOpenSettings={() => setShowSettings(true)}
                />
              ) : (
                <div className="flex min-h-32 items-center justify-center text-sm text-gray-500" role="status">正在启动图片提示词 Agent</div>
              )}
            </section>
          ) : (
            <ConversationComposer
              ownerId={NEXT_COMPOSER_OWNER}
              className={promptAgentSelected ? 'cc-composer--agent cc-composer--agent-ready' : undefined}
              value={prompt}
              editorParts={editorParts}
              editorRef={editorRef}
              editorOverlay={showAtMenu ? (
                <div className="z-40 mt-1 max-h-44 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-white/[0.1] dark:bg-gray-900">
                  {atOptions.map((option, index) => (
                    <button
                      key={option.key}
                      type="button"
                      aria-label={`选择 ${option.label}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectAtOption(option)}
                      onMouseEnter={() => setAtIndex(index)}
                      className={`block w-full rounded-md px-2 py-1.5 text-left text-xs ${index === atIndex ? 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : null}
              placeholder={composerState.placeholder}
              editorAriaLabel={appMode === 'agent' ? 'Agent 对话输入' : '图片提示词输入'}
              clearAriaLabel="清空输入"
              attachAriaLabel="添加图片"
              submitAriaLabel={appMode === 'agent'
                ? '发送 Agent 消息'
                : promptAgentSelected ? '发送到图片提示词 Agent' : '生成图片'}
              stopAriaLabel="停止"
              enterSubmit={settings.enterSubmit}
              canSubmit={promptAgentSelected ? promptAgentCanSubmit : composerState.canSubmit}
              submitEnabled={(promptAgentSelected ? promptAgentCanSubmit : composerState.canSubmit) || Boolean(composerState.validationError)}
              running={composerState.running}
              attachments={(
                <ConversationAttachments
                  items={attachments}
                  onPreview={(_id, index) => setPreviewIndex(index)}
                  onRemove={(_id, index) => {
                    promptDraftEditedRef.current = true
                    removeInputImage(index)
                  }}
                  onMove={(fromIndex, toIndex) => {
                    promptDraftEditedRef.current = true
                    moveInputImage(fromIndex, toIndex)
                  }}
                />
              )}
              toolSlot={appMode === 'gallery' ? (
                promptAgentSelected ? (
                  <AiLiquidButton
                    size="sm"
                    idleSpeed={0.35}
                    aria-pressed
                    className="!h-8 !min-w-0 !px-4 !text-[13px]"
                    onClick={() => { void togglePromptAgent() }}
                  >
                    Agent
                  </AiLiquidButton>
                ) : (
                  <button
                    type="button"
                    aria-pressed={false}
                    className="inline-flex h-8 min-w-0 items-center rounded-full bg-gray-100 px-4 text-[13px] text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-800 dark:bg-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.14] dark:hover:text-gray-100"
                    onClick={() => { void togglePromptAgent() }}
                  >
                    Agent
                  </button>
                )
              ) : undefined}
              paramsSlot={(
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-200 [&_svg]:h-[18px] [&_svg]:w-[18px]"
                  title="图片设置"
                  aria-label="图片设置"
                  onClick={() => setShowSettings(true)}
                >
                  <TuneIcon />
                </button>
              )}
              onChange={(value) => {
                promptDraftEditedRef.current = true
                setPrompt(value)
                setAtIndex(0)
                setAtDismissed(false)
              }}
              onCursorChange={setCursor}
              onEditorKeyCommand={handleEditorKeyCommand}
              onSubmit={() => {
                if (appMode === 'gallery' && promptAgentSelected) {
                  void openPromptAgent()
                  return
                }
                void submit()
              }}
              onStop={() => {
                runtime.stop(scope)
                refreshRuntime()
              }}
              onAttach={inputImages.length < MAX_INPUT_IMAGES ? () => fileInputRef.current?.click() : undefined}
              onPasteFiles={(files) => {
                promptDraftEditedRef.current = true
                void addInputImageFiles(files)
              }}
              onDropData={(data) => {
                promptDraftEditedRef.current = true
                void addInputDropData(data)
              }}
              canHandleDrop={() => isComposerFocused(NEXT_COMPOSER_OWNER)}
            />
          )}
          <input ref={fileInputRef} data-new-composer-file-input type="file" accept="image/*" multiple className="hidden" onChange={handleFileInput} />
          <input ref={replaceInputRef} data-new-composer-replace-input type="file" accept="image/*" className="hidden" onChange={handleReplaceInput} />
        </div>
      )}
      {showSettings && (
        <Sub2ImageComposerSettings
          onClose={() => setShowSettings(false)}
          onSaved={() => {
            if (!promptOpen) promptDraftEditedRef.current = true
            if (!promptBundle) return
            promptBundle.store.syncOutputSettings(PROMPT_CONVERSATION_ID, getPromptOutputSettings(useStore.getState().params))
          }}
        />
      )}
      {preview && previewIndex != null && (
        <Sub2ImageAttachmentPreview
          src={preview.dataUrl}
          label={`参考图${previewIndex + 1}`}
          onClose={() => setPreviewIndex(null)}
          onMask={() => {
            setPreviewIndex(null)
            setMaskEditorImageId(preview.id)
          }}
          onReplace={() => {
            replaceTargetRef.current = { id: preview.id, index: previewIndex }
            setPreviewIndex(null)
            replaceInputRef.current?.click()
          }}
        />
      )}
    </>
  )
}
