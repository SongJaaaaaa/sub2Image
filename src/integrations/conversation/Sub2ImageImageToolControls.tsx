import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConversationToolControlsProps } from '../../features/conversationComposer'
import { useHintTooltip } from '../../hooks/useHintTooltip'
import { getActiveApiProfile, normalizeSettings } from '../../lib/apiProfiles'
import { DEFAULT_FAL_IMAGE_SIZE, getChangedParams, getOutputImageLimitForSettings, normalizeParamsForSettings } from '../../lib/paramCompatibility'
import { normalizeImageSize } from '../../lib/size'
import { useStore } from '../../store'
import { DEFAULT_PARAMS, type TaskParams } from '../../types'
import SizePickerModal from '../../components/SizePickerModal'
import InputParamsPanel from '../../components/input/inputParamsPanel'

const selectClass = 'px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] text-xs transition-all duration-200 shadow-sm'

export default function Sub2ImageImageToolControls(_props: ConversationToolControlsProps) {
  const params = useStore((state) => state.params)
  const setParams = useStore((state) => state.setParams)
  const inputImages = useStore((state) => state.inputImages)
  const settings = useStore((state) => state.settings)
  const reusedTaskApiProfileId = useStore((state) => state.reusedTaskApiProfileId)
  const [showSizePicker, setShowSizePicker] = useState(false)
  const [outputCompressionInput, setOutputCompressionInput] = useState(
    params.output_compression == null ? '' : String(params.output_compression),
  )
  const [nInput, setNInput] = useState(String(params.n))
  const [nInputFocused, setNInputFocused] = useState(false)

  const settingsProfile = useMemo(() => getActiveApiProfile(settings), [settings])
  const activeProfile = useMemo(() => (
    settings.reuseTaskApiProfileTemporarily && reusedTaskApiProfileId
      ? settings.profiles.find((profile) => profile.id === reusedTaskApiProfileId) ?? settingsProfile
      : settingsProfile
  ), [reusedTaskApiProfileId, settings.profiles, settings.reuseTaskApiProfileTemporarily, settingsProfile])
  const effectiveSettings = useMemo(() => (
    activeProfile.id === settingsProfile.id
      ? settings
      : normalizeSettings({ ...settings, activeProfileId: activeProfile.id })
  ), [activeProfile.id, settings, settingsProfile.id])
  const isFalProvider = activeProfile.provider === 'fal'
  const isFalTextToImage = isFalProvider && inputImages.length === 0
  const moderationDisabled = isFalProvider
  const showTransparentOutputControl = params.output_format === 'png'
  const compressionDisabled = params.output_format === 'png' || isFalProvider
  const outputImageLimit = getOutputImageLimitForSettings(effectiveSettings)
  const nDraftValue = Number(nInput)
  const effectiveNValue = Number.isNaN(nDraftValue) ? params.n : nDraftValue
  const streamConcurrentByN = activeProfile.provider === 'openai' && activeProfile.streamImages === true && effectiveNValue > 1
  const displaySize = isFalTextToImage && params.size === 'auto'
    ? DEFAULT_FAL_IMAGE_SIZE
    : normalizeImageSize(params.size) || DEFAULT_PARAMS.size
  const qualityOptions = isFalProvider
    ? [
        { label: 'low', value: 'low' },
        { label: 'medium', value: 'medium' },
        { label: 'high', value: 'high' },
      ]
    : [
        { label: 'auto', value: 'auto' },
        { label: 'low', value: 'low' },
        { label: 'medium', value: 'medium' },
        { label: 'high', value: 'high' },
      ]
  const transparentOutputHint = useHintTooltip()
  const compressionHint = useHintTooltip({ enabled: () => compressionDisabled })
  const moderationHint = useHintTooltip({ enabled: () => moderationDisabled })
  const sizeHint = useHintTooltip({ enabled: () => isFalTextToImage })
  const qualityHint = useHintTooltip({ enabled: () => activeProfile.codexCli || isFalProvider })
  const nLimitHint = useHintTooltip({ autoHideMs: 2000 })
  const streamConcurrentHint = useHintTooltip({ enabled: () => streamConcurrentByN })

  const setCompatibleParams = useCallback((patch: Partial<TaskParams>) => {
    const current = useStore.getState().params
    const next = normalizeParamsForSettings(
      { ...current, ...patch },
      effectiveSettings,
      { hasInputImages: useStore.getState().inputImages.length > 0 },
    )
    setParams(getChangedParams(current, next))
  }, [effectiveSettings, setParams])

  useEffect(() => {
    setOutputCompressionInput(params.output_compression == null ? '' : String(params.output_compression))
  }, [params.output_compression])

  useEffect(() => {
    setNInput(String(params.n))
  }, [params.n])

  useEffect(() => {
    const next = normalizeParamsForSettings(params, effectiveSettings, { hasInputImages: inputImages.length > 0 })
    const patch = getChangedParams(params, next)
    if (Object.keys(patch).length) setParams(patch)
  }, [effectiveSettings, inputImages.length, params, setParams])

  const commitOutputCompression = useCallback(() => {
    if (!outputCompressionInput.trim()) {
      setOutputCompressionInput('')
      setCompatibleParams({ output_compression: null })
      return
    }

    const value = Number(outputCompressionInput)
    if (Number.isNaN(value)) {
      setOutputCompressionInput(params.output_compression == null ? '' : String(params.output_compression))
      return
    }
    setOutputCompressionInput(String(value))
    setCompatibleParams({ output_compression: value })
  }, [outputCompressionInput, params.output_compression, setCompatibleParams])

  const commitN = useCallback(() => {
    nLimitHint.hide()
    const value = Number(nInput)
    const normalized = !nInput.trim() ? DEFAULT_PARAMS.n : Number.isNaN(value) ? params.n : value
    const next = Math.min(outputImageLimit, Math.max(1, normalized))
    setNInput(String(next))
    setCompatibleParams({ n: next })
  }, [nInput, nLimitHint, outputImageLimit, params.n, setCompatibleParams])

  const handleNInputChange = useCallback((value: string) => {
    setNInput(value)
    const next = Number(value)
    if (!Number.isNaN(next) && next > outputImageLimit) {
      nLimitHint.show()
      return
    }
    nLimitHint.hide()
  }, [nLimitHint, outputImageLimit])

  const handleNLimitIncreaseAttempt = useCallback((preventDefault: () => void) => {
    const value = Number(nInput)
    const current = Number.isNaN(value) ? params.n : value
    if (!nInputFocused || current < outputImageLimit) return
    preventDefault()
    nLimitHint.show()
  }, [nInput, nInputFocused, nLimitHint, outputImageLimit, params.n])

  return (
    <>
      <div data-new-composer-params>
        <InputParamsPanel
          cols="grid-cols-3 sm:grid-cols-6"
          params={params}
          setParams={setCompatibleParams}
          activeProfile={activeProfile}
          isFalProvider={isFalProvider}
          isFalTextToImage={isFalTextToImage}
          displaySize={displaySize}
          qualityOptions={qualityOptions}
          selectClass={selectClass}
          transparentOutputAvailable
          showTransparentOutputControl={showTransparentOutputControl}
          transparentOutputEnabled={showTransparentOutputControl && params.transparent_output}
          transparentOutputHint={transparentOutputHint}
          onTransparentOutputMenuOpenChange={(open) => {
            if (open) transparentOutputHint.hide()
          }}
          compressionHint={compressionHint}
          compressionDisabled={compressionDisabled}
          outputCompressionInput={outputCompressionInput}
          setOutputCompressionInput={setOutputCompressionInput}
          commitOutputCompression={commitOutputCompression}
          moderationHint={moderationHint}
          moderationDisabled={moderationDisabled}
          agentAutoImageCount={false}
          outputImageLimit={outputImageLimit}
          nInput={nInput}
          setNInputFocused={setNInputFocused}
          commitN={commitN}
          handleNInputChange={handleNInputChange}
          handleNLimitIncreaseAttempt={handleNLimitIncreaseAttempt}
          showAgentNHint={() => undefined}
          hideNLimitHint={nLimitHint.hide}
          startAgentNHintTouch={() => undefined}
          clearAgentNHintTouchTimer={nLimitHint.clearTimer}
          nLimitHint={nLimitHint}
          nLimitHintText={isFalProvider ? `fal.ai 最大请求数量为 ${outputImageLimit}` : `OpenAI 最大请求数量为 ${outputImageLimit}`}
          streamConcurrentByN={streamConcurrentByN}
          streamConcurrentHint={streamConcurrentHint}
          sizeHint={sizeHint}
          qualityHint={qualityHint}
          onOpenSizePicker={() => setShowSizePicker(true)}
        />
      </div>
      {showSizePicker && (
        <SizePickerModal
          currentSize={isFalTextToImage && params.size === 'auto' ? DEFAULT_FAL_IMAGE_SIZE : params.size}
          onSelect={(size) => setCompatibleParams({ size })}
          onClose={() => setShowSizePicker(false)}
          allowAuto={!isFalTextToImage}
        />
      )}
    </>
  )
}
