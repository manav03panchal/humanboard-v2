import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../stores/editorStore'
import {
  type PaneId, type PaneNode, type LeafPane, type DropZone,
  createLeaf, findLeaf, findLeafWithTab, updateLeaf, removeTab, splitLeaf, moveTabBetweenPanes,
} from '../lib/paneModel'
import { pointerDrag, setPointerDrag, getDropZoneFromPointer, createDragGhost } from '../lib/pointerDrag'
import { LeafPaneView } from './LeafPaneView'
import { SplitPaneView } from './SplitPaneView'
import { TerminalPanel } from './TerminalPanel'

// ─── Main component ───

interface IdeLayoutProps {
  openFiles: string[]
  onClose: () => void
}

export function IdeLayout({ openFiles, onClose }: IdeLayoutProps) {
  const [rootPane, setRootPane] = useState<PaneNode>(() =>
    createLeaf(openFiles, openFiles[0])
  )

  // Set initial active file after mount
  useEffect(() => {
    if (openFiles[0]) useEditorStore.getState().setActiveFile(openFiles[0])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [previewFiles, setPreviewFiles] = useState<Set<string>>(new Set())
  const togglePreview = useCallback((filePath: string) => {
    setPreviewFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }, [])

  // Sync open files with pane tree — add new files, remove closed ones
  useEffect(() => {
    if (openFiles.length === 0) { setTimeout(onClose, 0); return }
    const openSet = new Set(openFiles)
    setRootPane((prev) => {
      let updated = prev

      // Remove tabs that are no longer open in the file store
      const removeStale = (node: PaneNode): PaneNode | null => {
        if (node.type === 'leaf') {
          const tabs = node.tabs.filter((t) => openSet.has(t))
          if (tabs.length === 0) return null
          const activeTab = tabs.includes(node.activeTab) ? node.activeTab : tabs[0]
          return { ...node, tabs, activeTab }
        }
        const children = node.children.map(removeStale).filter(Boolean) as PaneNode[]
        if (children.length === 0) return null
        if (children.length === 1) return children[0]
        return { ...node, children, sizes: children.map(() => 100 / children.length) }
      }
      const cleaned = removeStale(updated)
      if (!cleaned) return createLeaf(openFiles, openFiles[0])
      updated = cleaned

      // Add new files not yet in any pane
      let lastAdded: string | null = null
      for (const file of openFiles) {
        if (!findLeafWithTab(updated, file)) {
          const addToFirst = (node: PaneNode): PaneNode => {
            if (node.type === 'leaf') {
              if (node.tabs.includes(file)) return node
              return { ...node, tabs: [...node.tabs, file], activeTab: file }
            }
            return { ...node, children: [addToFirst(node.children[0]), ...node.children.slice(1)] }
          }
          updated = addToFirst(updated)
          lastAdded = file
        }
      }
      if (lastAdded) setTimeout(() => useEditorStore.getState().setActiveFile(lastAdded!), 0)
      return updated
    })
  }, [openFiles, onClose])

  // Listen for file-open events (sidebar clicks) — activate existing tab or add new one
  useEffect(() => {
    const handler = (e: Event) => {
      const { filePath } = (e as CustomEvent).detail
      if (!filePath) return
      setRootPane((prev) => {
        const leaf = findLeafWithTab(prev, filePath)
        if (leaf) {
          return updateLeaf(prev, leaf.id, (l) => ({ ...l, activeTab: filePath }))
        }
        const addToFirst = (node: PaneNode): PaneNode => {
          if (node.type === 'leaf') {
            return { ...node, tabs: [...node.tabs, filePath], activeTab: filePath }
          }
          return { ...node, children: [addToFirst(node.children[0]), ...node.children.slice(1)] }
        }
        return addToFirst(prev)
      })
      // Set active file outside of setRootPane to avoid setState-during-render
      setTimeout(() => useEditorStore.getState().setActiveFile(filePath), 0)
    }
    window.addEventListener('humanboard:open-file', handler)
    return () => window.removeEventListener('humanboard:open-file', handler)
  }, [])

  const blockZoom = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault()
  }, [])

  const handleCloseTab = useCallback((paneId: PaneId, filePath: string) => {
    setRootPane((prev) => {
      const result = removeTab(prev, paneId, filePath)
      if (!result) { onClose(); return prev }
      return result
    })
  }, [onClose])

  const handleActivateTab = useCallback((paneId: PaneId, filePath: string) => {
    setRootPane((prev) => updateLeaf(prev, paneId, (leaf) => ({ ...leaf, activeTab: filePath })))
    useEditorStore.getState().setActiveFile(filePath)
  }, [])

  const handleReorderTabs = useCallback((paneId: PaneId, tabs: string[]) => {
    setRootPane((prev) => updateLeaf(prev, paneId, (leaf) => ({ ...leaf, tabs })))
  }, [])

  const handleDropOnPane = useCallback((targetPaneId: PaneId, zone: DropZone, filePath: string, sourcePaneId: PaneId) => {
    setRootPane((prev) => {
      if (zone === 'center') {
        if (sourcePaneId === targetPaneId) return prev
        return moveTabBetweenPanes(prev, sourcePaneId, targetPaneId, filePath)
      }
      const direction: 'horizontal' | 'vertical' = (zone === 'left' || zone === 'right') ? 'horizontal' : 'vertical'
      const position: 'before' | 'after' = (zone === 'left' || zone === 'top') ? 'before' : 'after'
      if (sourcePaneId === targetPaneId) {
        // Same pane — remove from source first, then split
        const leaf = findLeaf(prev, sourcePaneId)
        if (leaf && leaf.tabs.length > 1) {
          let result = removeTab(prev, sourcePaneId, filePath)
          if (!result) return prev
          return splitLeaf(result, targetPaneId, direction, filePath, position)
        }
        // Only tab — can't remove, just split (duplicates)
        return splitLeaf(prev, targetPaneId, direction, filePath, position)
      }
      // Remove from source first, then split
      let result = removeTab(prev, sourcePaneId, filePath)
      if (!result) return prev
      result = splitLeaf(result, targetPaneId, direction, filePath, position)
      return result
    })
  }, [])

  const handleSplitPane = useCallback((paneId: PaneId, direction: 'horizontal' | 'vertical') => {
    setRootPane((prev) => {
      const leaf = findLeaf(prev, paneId)
      if (!leaf || !leaf.activeTab) return prev
      return splitLeaf(prev, paneId, direction, leaf.activeTab, 'after')
    })
  }, [])

  const handleResizePanes = useCallback((splitId: PaneId, sizes: number[]) => {
    setRootPane((prev) => {
      const update = (node: PaneNode): PaneNode => {
        if (node.type === 'split' && node.id === splitId) return { ...node, sizes }
        if (node.type === 'split') return { ...node, children: node.children.map(update) }
        return node
      }
      return update(prev)
    })
  }, [])

  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(250)
  const terminalHeightRef = useRef(terminalHeight)
  terminalHeightRef.current = terminalHeight

  // Find the first leaf for keyboard shortcuts
  const findFirstLeaf = useCallback((node: PaneNode): LeafPane | null =>
    node.type === 'leaf' ? node : findFirstLeaf(node.children[0]), [])

  // Keyboard shortcuts — use ref to avoid re-registering on every pane tree change
  const rootPaneRef = useRef(rootPane)
  rootPaneRef.current = rootPane

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      if (meta && e.key === '\\') {
        e.preventDefault()
        const leaf = findFirstLeaf(rootPaneRef.current)
        if (leaf) handleSplitPane(leaf.id, 'horizontal')
        return
      }

      if (meta && e.key === 'w') {
        e.preventDefault()
        const leaf = findFirstLeaf(rootPaneRef.current)
        if (leaf?.activeTab) handleCloseTab(leaf.id, leaf.activeTab)
        return
      }

      if (meta && e.key === 'Tab') {
        e.preventDefault()
        const leaf = findFirstLeaf(rootPaneRef.current)
        if (!leaf || leaf.tabs.length < 2) return
        const idx = leaf.tabs.indexOf(leaf.activeTab)
        const next = e.shiftKey
          ? (idx - 1 + leaf.tabs.length) % leaf.tabs.length
          : (idx + 1) % leaf.tabs.length
        handleActivateTab(leaf.id, leaf.tabs[next])
        return
      }

      if (meta && e.key === '`') {
        e.preventDefault()
        setTerminalOpen((v) => !v)
        return
      }

      // Ctrl+= / Ctrl+- / Ctrl+0 — zoom
      if (meta && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        useEditorStore.getState().zoomIn()
        return
      }
      if (meta && e.key === '-') {
        e.preventDefault()
        useEditorStore.getState().zoomOut()
        return
      }
      if (meta && e.key === '0') {
        e.preventDefault()
        useEditorStore.getState().resetZoom()
        return
      }
    }
    // macOS Cmd+W — Rust intercepts native close and emits humanboard:close-tab
    const closeTabHandler = () => {
      const leaf = findFirstLeaf(rootPaneRef.current)
      if (leaf?.activeTab) handleCloseTab(leaf.id, leaf.activeTab)
    }

    window.addEventListener('keydown', handler)
    window.addEventListener('humanboard:close-tab', closeTabHandler)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('humanboard:close-tab', closeTabHandler)
    }
  }, [handleSplitPane, handleCloseTab, handleActivateTab, findFirstLeaf])

  // Terminal panel resize
  const handleTerminalResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = terminalHeightRef.current

    const onMove = (e: PointerEvent) => {
      const delta = startY - e.clientY
      setTerminalHeight(Math.max(100, Math.min(600, startHeight + delta)))
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  // Global pointer drag handler — handles threshold, ghost, and drop resolution
  useEffect(() => {
    const THRESHOLD = 5

    const onMove = (e: PointerEvent) => {
      if (!pointerDrag) return
      const dx = e.clientX - pointerDrag.startX
      const dy = e.clientY - pointerDrag.startY

      if (!pointerDrag.dragging) {
        if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return
        pointerDrag.dragging = true
        const fileName = pointerDrag.filePath.split('/').pop() ?? pointerDrag.filePath
        pointerDrag.ghostEl = createDragGhost(fileName)
      }

      if (pointerDrag.ghostEl) {
        pointerDrag.ghostEl.style.left = `${e.clientX + 12}px`
        pointerDrag.ghostEl.style.top = `${e.clientY - 12}px`
      }
    }

    const onUp = (e: PointerEvent) => {
      if (!pointerDrag) return
      const drag = pointerDrag
      setPointerDrag(null)

      if (drag.ghostEl) drag.ghostEl.remove()
      if (!drag.dragging) return

      // Find which pane's editor area we're over (via data-pane-content)
      const contentEls = document.querySelectorAll('[data-pane-content]')
      for (const el of contentEls) {
        const rect = el.getBoundingClientRect()
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const targetPaneId = (el as HTMLElement).dataset.paneContent!
          const zone = getDropZoneFromPointer(e.clientX, e.clientY, el as HTMLElement)
          handleDropOnPane(targetPaneId, zone, drag.filePath, drag.sourcePaneId)
          return
        }
      }

      // Find which pane's tab bar we're over (via data-pane-tabbar)
      const tabBarEls = document.querySelectorAll('[data-pane-tabbar]')
      for (const el of tabBarEls) {
        const rect = el.getBoundingClientRect()
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const targetPaneId = (el as HTMLElement).dataset.paneTabbar!
          // Check if over a specific tab for reorder
          const tabEls = el.querySelectorAll('[data-tab-index]')
          for (const tabEl of tabEls) {
            const tr = tabEl.getBoundingClientRect()
            if (e.clientX >= tr.left && e.clientX <= tr.right) {
              const targetIndex = parseInt((tabEl as HTMLElement).dataset.tabIndex!, 10)
              if (drag.sourcePaneId === targetPaneId) {
                // Reorder within same pane
                setRootPane((prev) => {
                  const leaf = findLeaf(prev, targetPaneId)
                  if (!leaf) return prev
                  const oldIndex = leaf.tabs.indexOf(drag.filePath)
                  if (oldIndex === -1 || oldIndex === targetIndex) return prev
                  const tabs = [...leaf.tabs]
                  tabs.splice(oldIndex, 1)
                  const insertAt = targetIndex > oldIndex ? targetIndex - 1 : targetIndex
                  tabs.splice(insertAt, 0, drag.filePath)
                  return updateLeaf(prev, targetPaneId, () => ({ ...leaf, tabs }))
                })
              } else {
                // Move to another pane's tab bar
                handleDropOnPane(targetPaneId, 'center', drag.filePath, drag.sourcePaneId)
              }
              return
            }
          }
          // Dropped on tab bar but not on a specific tab — add to end
          handleDropOnPane(targetPaneId, 'center', drag.filePath, drag.sourcePaneId)
          return
        }
      }
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [handleDropOnPane])

  return (
    <div
      onWheel={blockZoom}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--hb-bg)',
      }}
    >
      {/* Editor panes */}
      <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
        <PaneRenderer
          node={rootPane}
          onCloseTab={handleCloseTab}
          onActivateTab={handleActivateTab}
          onReorderTabs={handleReorderTabs}
          onDropOnPane={handleDropOnPane}
          onResizePanes={handleResizePanes}
          previewFiles={previewFiles}
          onTogglePreview={togglePreview}
        />
      </div>

      {/* Terminal panel */}
      {terminalOpen && (
        <>
          <div
            onPointerDown={handleTerminalResize}
            style={{
              height: 1, backgroundColor: 'var(--hb-border)', cursor: 'row-resize',
              flexShrink: 0, position: 'relative', zIndex: 10,
            }}
          >
            <div style={{ position: 'absolute', top: -3, bottom: -3, left: 0, right: 0 }} />
          </div>
          <div style={{ height: terminalHeight, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
            <TerminalPanel onClose={() => setTerminalOpen(false)} />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Pane renderer (recursive) ───

import type { PaneHandlers } from '../lib/paneModel'

interface PaneRendererProps extends PaneHandlers {
  node: PaneNode
}

function PaneRenderer({ node, ...handlers }: PaneRendererProps) {
  if (node.type === 'leaf') {
    return <LeafPaneView pane={node} {...handlers} />
  }
  return <SplitPaneView split={node} {...handlers} />
}
