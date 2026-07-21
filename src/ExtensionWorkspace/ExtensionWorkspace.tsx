import { useEffect, useState } from 'react'
import { agentSkills, SkillHost, SkillList } from '../Skills'
import { ToolHost, ToolList, workspaceToolCards, workspaceTools } from '../Tools'
import ExtensionHeader from './components/ExtensionHeader'
import ExtensionSidebar from './ExtensionSidebar'
import {
  leaveExtensionWorkspace,
  navigateToExtensionWorkspace,
  parseExtensionRoute,
  type ExtensionSection,
} from './extensionRoutes'

export default function ExtensionWorkspace() {
  const [pathname, setPathname] = useState(window.location.pathname)
  const route = parseExtensionRoute(pathname) || { type: 'not-found' as const }
  const activeSection: ExtensionSection = route.type === 'not-found' ? 'tools' : route.section
  const item = route.type === 'item'
    ? route.section === 'tools'
      ? workspaceTools.find((tool) => tool.id === route.itemId)
      : agentSkills.find((skill) => skill.id === route.itemId)
    : null
  const title = route.type === 'not-found'
    ? '未找到页面'
    : route.section === 'tools'
      ? route.type === 'item' ? item?.name ?? '工具' : '工具'
      : route.type === 'item' ? item?.name ?? '技能' : '技能'
  const onBack = route.type === 'item'
    ? () => navigateToExtensionWorkspace(route.section)
    : undefined

  useEffect(() => {
    const update = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', update)
    return () => window.removeEventListener('popstate', update)
  }, [])

  return (
    <div data-extension-workspace className="min-h-svh bg-background text-foreground md:flex">
      <ExtensionSidebar
        activeSection={activeSection}
        onSelect={(section) => navigateToExtensionWorkspace(section)}
        onExit={leaveExtensionWorkspace}
      />
      <div className="min-w-0 flex-1">
        <ExtensionHeader title={title} onExit={leaveExtensionWorkspace} onBack={onBack} />
        <main className={`w-full p-4 md:p-6 ${route.type === 'item' && route.section === 'tools' ? '' : 'mx-auto max-w-7xl'}`}>
          {route.type === 'not-found' ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">该拓展页面不存在</h2>
              <button type="button" onClick={() => navigateToExtensionWorkspace('tools')} className="mt-5 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">返回工具列表</button>
            </div>
          ) : route.section === 'tools' ? (
            route.type === 'list'
              ? <ToolList tools={workspaceToolCards} onSelect={(id) => navigateToExtensionWorkspace('tools', id)} />
              : <ToolHost toolId={route.itemId} onBack={() => navigateToExtensionWorkspace('tools')} />
          ) : route.type === 'list' ? (
            <SkillList skills={agentSkills} onSelect={(id) => navigateToExtensionWorkspace('skills', id)} />
          ) : (
            <SkillHost skillId={route.itemId} onBack={() => navigateToExtensionWorkspace('skills')} />
          )}
        </main>
      </div>
    </div>
  )
}
