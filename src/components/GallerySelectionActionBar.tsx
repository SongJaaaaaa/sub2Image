import { useCallback, useMemo } from 'react'

import {
  ALL_FAVORITES_COLLECTION_ID,
  deleteFavoriteCollection,
  getTaskFavoriteCollectionIds,
  removeMultipleTasks,
  taskMatchesFilterStatus,
  taskMatchesSearchQuery,
  useStore,
} from '../store'
import { downloadImageEntriesAsZip, downloadImageIds, formatExportFileTime, getTaskOutputImageZipEntries } from '../lib/downloadImages'
import { getCollectionTasks } from './favorites/favoriteUtils'
import InputBatchBars from './input/inputBatchBars'

export default function GallerySelectionActionBar() {
  const selectedTaskIds = useStore((s) => s.selectedTaskIds)
  const setSelectedTaskIds = useStore((s) => s.setSelectedTaskIds)
  const clearSelection = useStore((s) => s.clearSelection)
  const selectedFavoriteCollectionIds = useStore((s) => s.selectedFavoriteCollectionIds)
  const setSelectedFavoriteCollectionIds = useStore((s) => s.setSelectedFavoriteCollectionIds)
  const clearFavoriteCollectionSelection = useStore((s) => s.clearFavoriteCollectionSelection)
  const tasks = useStore((s) => s.tasks)
  const favoriteCollections = useStore((s) => s.favoriteCollections)
  const filterStatus = useStore((s) => s.filterStatus)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const activeFavoriteCollectionId = useStore((s) => s.activeFavoriteCollectionId)
  const openFavoritePicker = useStore((s) => s.openFavoritePicker)
  const searchQuery = useStore((s) => s.searchQuery)
  const zipDownloadRoutes = useStore((s) => s.settings.zipDownloadRoutes)
  const showToast = useStore((s) => s.showToast)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)

  const filteredTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt)
    const q = searchQuery.trim().toLowerCase()

    return sorted.filter((task) => {
      if (filterFavorite) {
        if (!task.isFavorite) return false
        if (activeFavoriteCollectionId && activeFavoriteCollectionId !== ALL_FAVORITES_COLLECTION_ID && !getTaskFavoriteCollectionIds(task).includes(activeFavoriteCollectionId)) return false
      }
      if (!taskMatchesFilterStatus(task, filterStatus)) return false
      return taskMatchesSearchQuery(task, q)
    })
  }, [activeFavoriteCollectionId, filterFavorite, filterStatus, searchQuery, tasks])

  const favoriteCollectionCards = useMemo(() => [
    {
      id: ALL_FAVORITES_COLLECTION_ID,
      name: '全部',
      tasks: getCollectionTasks(ALL_FAVORITES_COLLECTION_ID, tasks),
    },
    ...favoriteCollections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      collection,
      tasks: getCollectionTasks(collection.id, tasks),
    })),
  ], [favoriteCollections, tasks])

  const filteredFavoriteCollectionCards = useMemo(() => {
    if (!searchQuery.trim()) return favoriteCollectionCards
    const q = searchQuery.toLowerCase()
    return favoriteCollectionCards.filter((collection) => collection.name.toLowerCase().includes(q))
  }, [favoriteCollectionCards, searchQuery])

  const handleSelectAllVisibleTasks = useCallback(() => {
    setSelectedTaskIds(filteredTasks.map((task) => task.id))
  }, [filteredTasks, setSelectedTaskIds])

  const handleInvertVisibleTasks = useCallback(() => {
    const visibleIds = new Set(filteredTasks.map((task) => task.id))
    setSelectedTaskIds((current) => {
      const currentSet = new Set(current)
      const next = current.filter((id) => !visibleIds.has(id))
      filteredTasks.forEach((task) => {
        if (!currentSet.has(task.id)) next.push(task.id)
      })
      return next
    })
  }, [filteredTasks, setSelectedTaskIds])

  const handleSelectAllVisibleFavoriteCollections = useCallback(() => {
    setSelectedFavoriteCollectionIds(filteredFavoriteCollectionCards.map((collection) => collection.id))
  }, [filteredFavoriteCollectionCards, setSelectedFavoriteCollectionIds])

  const handleInvertVisibleFavoriteCollections = useCallback(() => {
    const visibleIds = new Set(filteredFavoriteCollectionCards.map((collection) => collection.id))
    setSelectedFavoriteCollectionIds((current) => {
      const currentSet = new Set(current)
      const next = current.filter((id) => !visibleIds.has(id))
      filteredFavoriteCollectionCards.forEach((collection) => {
        if (!currentSet.has(collection.id)) next.push(collection.id)
      })
      return next
    })
  }, [filteredFavoriteCollectionCards, setSelectedFavoriteCollectionIds])

  const handleDeleteSelected = useCallback(() => {
    setConfirmDialog({
      title: '批量删除',
      message: `确定要删除选中的 ${selectedTaskIds.length} 个任务吗？`,
      action: () => {
        removeMultipleTasks(selectedTaskIds)
      },
    })
  }, [selectedTaskIds, setConfirmDialog])

  const handleDownloadSelected = useCallback(async () => {
    const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id))
    const imageIds = selectedTasks.flatMap((task) => task.outputImages || [])
    if (imageIds.length === 0) {
      showToast('选中的任务没有图片', 'info')
      return
    }

    try {
      const time = formatExportFileTime(new Date())
      const name = `batch-${time}`
      const { successCount, failCount } = zipDownloadRoutes.includes('task-selection')
        ? await downloadImageEntriesAsZip(getTaskOutputImageZipEntries(selectedTasks), name)
        : await downloadImageIds(imageIds, name)

      if (successCount === 0) {
        showToast('下载失败', 'error')
      } else if (failCount > 0) {
        showToast(`部分下载失败：成功 ${successCount}，失败 ${failCount}`, 'error')
      } else {
        showToast(successCount > 1 ? `下载成功：${successCount} 张图片` : '下载成功', 'success')
      }
    } catch (err) {
      console.error(err)
      showToast('下载失败', 'error')
    }
    clearSelection()
  }, [clearSelection, selectedTaskIds, showToast, tasks, zipDownloadRoutes])

  const handleDownloadSelectedFavoriteCollections = useCallback(async () => {
    const selectedIds = new Set(selectedFavoriteCollectionIds)
    const selectedCollections = favoriteCollectionCards.filter((collection) => selectedIds.has(collection.id))
    if (selectedCollections.length === 0) return

    let successCount = 0
    let failCount = 0
    let downloadedCollectionCount = 0
    const useZipDownload = zipDownloadRoutes.includes('favorite-collection-selection')
    const time = formatExportFileTime(new Date())

    try {
      for (const collection of selectedCollections) {
        const entries = getTaskOutputImageZipEntries(collection.tasks)
        if (entries.length === 0) continue
        const name = collection.id === ALL_FAVORITES_COLLECTION_ID
          ? `favorites-all-${time}`
          : `favorites-${collection.name}-${time}`
        const result = useZipDownload
          ? await downloadImageEntriesAsZip(entries, name)
          : await downloadImageIds(entries.map((entry) => entry.imageId), name)
        successCount += result.successCount
        failCount += result.failCount
        if (result.successCount > 0) downloadedCollectionCount++
        if (selectedCollections.length > 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 100))
        }
      }

      if (successCount === 0) {
        showToast('选中的收藏夹没有图片', 'info')
      } else if (failCount > 0) {
        showToast(`部分下载失败：成功 ${successCount}，失败 ${failCount}`, 'error')
      } else {
        showToast(useZipDownload && downloadedCollectionCount > 1 ? `下载成功：${downloadedCollectionCount} 个压缩包，${successCount} 张图片` : `下载成功：${successCount} 张图片`, 'success')
      }
    } catch (err) {
      console.error(err)
      showToast('下载失败', 'error')
    }
    clearFavoriteCollectionSelection()
  }, [clearFavoriteCollectionSelection, favoriteCollectionCards, selectedFavoriteCollectionIds, showToast, zipDownloadRoutes])

  const handleDeleteSelectedFavoriteCollections = useCallback(() => {
    const selectedIds = new Set(selectedFavoriteCollectionIds)
    const selectedCollections = favoriteCollections.filter((collection) => selectedIds.has(collection.id))
    if (selectedCollections.length === 0) {
      showToast('没有可删除的收藏夹', 'info')
      return
    }
    if (favoriteCollections.length - selectedCollections.length < 1) {
      showToast('至少保留一个收藏夹', 'error')
      return
    }

    const collectionIds = new Set(selectedCollections.map((collection) => collection.id))
    const imageCount = new Set(
      tasks
        .filter((task) => getTaskFavoriteCollectionIds(task).some((id) => collectionIds.has(id)))
        .flatMap((task) => task.outputImages || []),
    ).size
    setConfirmDialog({
      title: '批量删除收藏夹',
      message: `确定要删除选中的 ${selectedCollections.length} 个收藏夹吗？`,
      checkbox: imageCount > 0
        ? {
            label: `同时删除收藏夹中的图片（${imageCount} 张）`,
            tone: 'danger',
          }
        : undefined,
      action: async (deleteImages = false) => {
        for (const collection of selectedCollections) {
          await deleteFavoriteCollection(collection.id, deleteImages)
        }
        clearFavoriteCollectionSelection()
      },
    })
  }, [clearFavoriteCollectionSelection, favoriteCollections, selectedFavoriteCollectionIds, setConfirmDialog, showToast, tasks])

  const showFavoriteCollectionBatchBar = filterFavorite && !activeFavoriteCollectionId && selectedFavoriteCollectionIds.length > 0
  const showTaskBatchBar = !showFavoriteCollectionBatchBar && selectedTaskIds.length > 0

  return (
    <InputBatchBars
      showFavoriteCollectionBatchBar={showFavoriteCollectionBatchBar}
      showTaskBatchBar={showTaskBatchBar}
      selectedTaskIds={selectedTaskIds}
      tasks={tasks}
      clearFavoriteCollectionSelection={clearFavoriteCollectionSelection}
      onSelectAllVisibleFavoriteCollections={handleSelectAllVisibleFavoriteCollections}
      onInvertVisibleFavoriteCollections={handleInvertVisibleFavoriteCollections}
      onDownloadSelectedFavoriteCollections={handleDownloadSelectedFavoriteCollections}
      onDeleteSelectedFavoriteCollections={handleDeleteSelectedFavoriteCollections}
      clearSelection={clearSelection}
      onSelectAllVisibleTasks={handleSelectAllVisibleTasks}
      onInvertVisibleTasks={handleInvertVisibleTasks}
      onToggleFavorite={() => openFavoritePicker(selectedTaskIds)}
      onDownloadSelected={handleDownloadSelected}
      onDeleteSelected={handleDeleteSelected}
    />
  )
}
