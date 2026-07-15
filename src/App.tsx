import { useEffect, useState } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { activateFirstImportedProfile, buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { isDefaultConfigOnlyEnabled, mergeImportedSettings } from './lib/apiProfiles'
import { getCustomProviderConfigUrl, loadCustomProviderSettingsFromUrl } from './lib/customProviderConfigUrl'
import { OPEN_SUB2_CONNECT_EVENT } from './lib/sub2api'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import type { AppSettings } from './types'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import AgentWorkspace from './components/AgentWorkspace'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import SupportPromptModal from './components/SupportPromptModal'
import LandingPage from './components/LandingPage'
import JwsConnectModal from './components/JwsConnectModal'
import { FavoriteCollectionPickerModal, FavoriteCollectionsView, ManageCollectionsModal } from './components/FavoriteCollections'
import { useGlobalClickSuppression } from './lib/clickSuppression'

let customProviderConfigUrlImportStarted = false

export default function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  if (path !== '/app' && path !== '/app/') {
    return (
      <LandingPage
        onEnter={() => {
          window.history.pushState(null, '', '/app?connect=jws')
          setPath('/app')
        }}
      />
    )
  }

  return <Workspace />
}

function Workspace() {
  const setSettings = useStore((s) => s.setSettings)
  const appMode = useStore((s) => s.appMode)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const [showJwsConnect, setShowJwsConnect] = useState(() => new URLSearchParams(window.location.search).get('connect') === 'jws')
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    const open = () => {
      setShowJwsConnect(true)
      const params = new URLSearchParams(window.location.search)
      params.set('connect', 'jws')
      window.history.replaceState(null, '', `${window.location.pathname}?${params}${window.location.hash}`)
    }
    window.addEventListener(OPEN_SUB2_CONNECT_EVENT, open)
    return () => window.removeEventListener(OPEN_SUB2_CONNECT_EVENT, open)
  }, [])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const customProviderConfigUrl = getCustomProviderConfigUrl()
    const defaultConfigOnly = isDefaultConfigOnlyEnabled()

    const applyUrlSettings = (baseSettings: Partial<AppSettings>) => {
      const nextSettings = buildSettingsFromUrlParams(baseSettings, searchParams)
      return Object.keys(nextSettings).length ? nextSettings : baseSettings
    }

    const clearAppliedUrlSettings = () => {
      if (!hasUrlSettingParams(searchParams)) return

      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    if (customProviderConfigUrl && defaultConfigOnly && !customProviderConfigUrlImportStarted) {
      customProviderConfigUrlImportStarted = true
      void loadCustomProviderSettingsFromUrl(customProviderConfigUrl)
        .then((importedSettings) => {
          const state = useStore.getState()
          const baseSettings = importedSettings
            ? activateFirstImportedProfile(mergeImportedSettings(state.settings, importedSettings), importedSettings)
            : state.settings
          state.setSettings(applyUrlSettings(baseSettings))
          clearAppliedUrlSettings()
        })
        .catch((error) => {
          console.warn('Failed to import custom provider config URL:', error)
          const state = useStore.getState()
          state.setSettings(applyUrlSettings(state.settings))
          clearAppliedUrlSettings()
        })

      initStore()
      return
    }

    const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)

    setSettings(nextSettings)

    clearAppliedUrlSettings()

    if (customProviderConfigUrl && !customProviderConfigUrlImportStarted) {
      customProviderConfigUrlImportStarted = true
      void loadCustomProviderSettingsFromUrl(customProviderConfigUrl)
        .then((importedSettings) => {
          if (!importedSettings) return
          const state = useStore.getState()
          state.setSettings(mergeImportedSettings(state.settings, importedSettings))
        })
        .catch((error) => {
          console.warn('Failed to import custom provider config URL:', error)
        })
    }

    initStore()
  }, [setSettings])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  return (
    <>
      <Header />
      {appMode === 'agent' ? (
        <AgentWorkspace />
      ) : (
        <main data-home-main data-drag-select-surface className="pb-48">
          <div className="safe-area-x max-w-7xl mx-auto">
            <SearchBar />
            {filterFavorite && !activeFavoriteCollectionId ? <FavoriteCollectionsView /> : <TaskGrid />}
          </div>
        </main>
      )}
      <InputBar />
      <DetailModal />
      <Lightbox />
      {showJwsConnect && (
        <JwsConnectModal
          onClose={() => {
            setShowJwsConnect(false)
            const params = new URLSearchParams(window.location.search)
            params.delete('connect')
            const search = params.toString()
            window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`)
          }}
        />
      )}
      <SettingsModal />
      <ConfirmDialog />
      <SupportPromptModal />
      <FavoriteCollectionPickerModal />
      <ManageCollectionsModal />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
    </>
  )
}
