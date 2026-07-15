import { useEffect, useMemo, useState } from 'react'
import type { AppSettings, Sub2Config } from '../../types'
import { useStore } from '../../store'
import {
  getSub2Token,
  getSub2User,
  listSub2KeyModels,
  listSub2Keys,
  logoutSub2,
  newSub2Config,
  OPEN_SUB2_CONNECT_EVENT,
  type Sub2Key,
  type Sub2User,
} from '../../lib/sub2api'
import { filterSub2Models, syncSub2Settings } from '../../lib/sub2Profiles'
import Select from '../Select'

interface Props {
  draft: AppSettings
  commitSettings: (nextDraft: AppSettings) => void
}

const inputClass = 'w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200'
const selectClass = 'w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200'

export default function Sub2ApiSettingsTab({ draft, commitSettings }: Props) {
  const [user, setUser] = useState<Sub2User | null>(() => getSub2User())
  const [keys, setKeys] = useState<Sub2Key[]>([])
  const [edit, setEdit] = useState<Sub2Config | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [modelLoading, setModelLoading] = useState(false)
  const [error, setError] = useState('')

  const activeKeys = useMemo(() => keys.filter((item) => item.status === 'active'), [keys])
  const keyMap = useMemo(() => new Map(keys.map((item) => [item.id, item.key])), [keys])
  const modelOptions = useMemo(() => edit ? filterSub2Models(models, edit.kind) : [], [models, edit?.kind])

  const loadKeys = async () => {
    setLoading(true)
    setError('')
    try {
      setKeys(await listSub2Keys())
    } catch (err) {
      console.error('[Sub2API] 获取用户密钥失败', err)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (getSub2Token()) void loadKeys()
  }, [])

  const logout = () => {
    logoutSub2()
    setUser(null)
    setKeys([])
    setEdit(null)
    setModels([])
    setError('')
  }

  const startAdd = (kind: Sub2Config['kind']) => {
    setEdit(newSub2Config(kind))
    setModels([])
    setError('')
  }

  const startEdit = (config: Sub2Config) => {
    setEdit({ ...config })
    setModels([config.model])
    setError('')
    if (keys.some((item) => item.id === config.keyId)) void selectKey(config.keyId, config)
  }

  const selectKey = async (keyId: number, current = edit) => {
    if (!current) return
    const key = keys.find((item) => item.id === keyId)
    setEdit({
      ...current,
      keyId,
      keyName: key?.name || '',
      groupId: Number(key?.group_id) || 0,
      groupName: key?.group?.name || '',
      platform: key?.group?.platform || '',
      model: '',
    })
    setModels([])
    setModelLoading(true)
    setError('')
    try {
      const data = await listSub2KeyModels(keyId)
      const nextModels = data.models.map((item) => item.id)
      setModels(nextModels)
      setEdit((value) => value && value.keyId === keyId ? {
        ...value,
        keyName: data.key.name,
        groupId: data.key.group_id,
        groupName: data.key.group_name,
        platform: data.key.platform,
      } : value)
      if (!filterSub2Models(nextModels, current.kind).length) {
        setError(`该 Key 所属分组没有可用的${current.kind === 'image' ? '生图' : '文本'}模型`)
      }
    } catch (err) {
      console.error('[Sub2API] 获取分组模型失败', { keyId, err })
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setModelLoading(false)
    }
  }

  const save = () => {
    if (!edit || !edit.keyId || !edit.model) return
    const configs = draft.sub2Configs.some((item) => item.id === edit.id)
      ? draft.sub2Configs.map((item) => item.id === edit.id ? edit : item)
      : [...draft.sub2Configs, edit]
    commitSettings(syncSub2Settings(draft, configs, keyMap))
    setEdit(null)
    setModels([])
  }

  const remove = (id: string) => {
    const configs = draft.sub2Configs.filter((item) => item.id !== id)
    commitSettings(syncSub2Settings(draft, configs, keyMap))
  }

  const setDefault = (profileId: string) => {
    commitSettings(syncSub2Settings(draft, draft.sub2Configs, keyMap, profileId))
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-800 dark:text-gray-100">登录 Sub2API</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">登录后读取当前账号的 API Key，并严格根据所选 Key 的分组获取模型。</p>
        </div>
        <button
          type="button"
          onClick={() => {
            useStore.getState().setShowSettings(false)
            window.dispatchEvent(new Event(OPEN_SUB2_CONNECT_EVENT))
          }}
          className="w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white"
        >
          登录我的贾维斯
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200/60 bg-white/50 px-3 py-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">已登录 Sub2API</div>
          <div className="truncate text-xs text-gray-500">{user.display_name || user.username || user.email || `用户 ${user.id || ''}`}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={loading} onClick={() => void loadKeys()} className="rounded-lg px-3 py-1.5 text-xs text-blue-500 hover:bg-blue-50 disabled:opacity-50 dark:hover:bg-blue-500/10">刷新 Key</button>
          <button type="button" onClick={logout} className="rounded-lg px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]">退出</button>
        </div>
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => startAdd('image')} className="flex-1 rounded-xl bg-blue-500 px-3 py-2.5 text-sm font-medium text-white">添加生图配置</button>
        <button type="button" onClick={() => startAdd('text')} className="flex-1 rounded-xl bg-gray-800 px-3 py-2.5 text-sm font-medium text-white dark:bg-gray-600">添加文本配置</button>
      </div>

      {!draft.sub2Configs.length && !edit && (
        <div className="rounded-xl bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">尚未配置 Sub2API。请添加至少一项生图配置；使用 Agent 时还需要添加文本配置。</div>
      )}

      {draft.sub2Configs.map((config) => (
        <div key={config.id} className="rounded-xl border border-gray-200/70 bg-white/50 p-3 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${config.kind === 'image' ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300' : 'bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300'}`}>{config.kind === 'image' ? '生图' : '文本'}</span>
                <span className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{config.name}</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">{config.keyName} · {config.groupName || `分组 ${config.groupId}`} · {config.model}</div>
            </div>
            <div className="flex shrink-0 gap-1">
              {config.kind === 'image' && draft.activeProfileId !== config.profileId && <button type="button" onClick={() => setDefault(config.profileId)} className="rounded-lg px-2 py-1 text-xs text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10">设为默认</button>}
              {config.kind === 'image' && draft.activeProfileId === config.profileId && <span className="rounded-lg px-2 py-1 text-xs text-green-600">默认生图</span>}
              <button type="button" onClick={() => startEdit(config)} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-white/[0.06]">编辑</button>
              <button type="button" onClick={() => remove(config.id)} className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">删除</button>
            </div>
          </div>
        </div>
      ))}

      {edit && (
        <div className="space-y-3 rounded-2xl border border-blue-200/70 bg-blue-50/40 p-4 dark:border-blue-500/20 dark:bg-blue-500/[0.05]">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{draft.sub2Configs.some((item) => item.id === edit.id) ? '编辑' : '添加'}{edit.kind === 'image' ? '生图' : '文本'}配置</div>
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-600 dark:text-gray-300">配置名称</span>
            <input className={inputClass} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-600 dark:text-gray-300">API Key</span>
            <Select value={edit.keyId ? String(edit.keyId) : ''} onChange={(value) => void selectKey(Number(value))} options={activeKeys.map((item) => ({
              label: `${item.name}${item.group?.name ? ` · ${item.group.name}` : ''}`,
              value: String(item.id),
            }))} className={selectClass} />
            {!activeKeys.length && <div className="mt-1.5 text-xs text-amber-600">当前账号没有有效 API Key。</div>}
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-gray-600 dark:text-gray-300">模型</span>
            <Select value={edit.model} onChange={(value) => setEdit({ ...edit, model: String(value) })} options={modelOptions.map((id) => ({ label: id, value: id }))} className={selectClass} />
          </label>
          {modelLoading && <div className="text-xs text-gray-500">正在根据 Key 分组获取模型…</div>}
          {error && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
          <div className="flex gap-2">
            <button type="button" disabled={!edit.name.trim() || !edit.keyId || !edit.model || modelLoading} onClick={save} className="flex-1 rounded-xl bg-blue-500 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50">保存配置</button>
            <button type="button" onClick={() => { setEdit(null); setModels([]); setError('') }} className="rounded-xl bg-white px-4 py-2.5 text-sm text-gray-600 shadow-sm dark:bg-white/[0.06] dark:text-gray-300">取消</button>
          </div>
        </div>
      )}

      {loading && <div className="text-xs text-gray-500">正在读取 Sub2API 数据…</div>}
      {error && !edit && <div className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-300">{error}</div>}
    </div>
  )
}
