import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { search, searchKeymap } from '@codemirror/search'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'
import { Compartment, type Extension } from '@codemirror/state'
import { vim, Vim } from '@replit/codemirror-vim'
import { useEditorStore } from '../stores/editorStore'
import CodeMirror from '@uiw/react-codemirror'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { Terminal as TerminalIcon, Plus, X, Eye, Code } from 'lucide-react'
import { createTerminal, getTerminal, mountTerminal, destroyTerminal, updateTerminalTheme, refitAll } from '../lib/terminalManager'
import { convertFileSrc } from '@tauri-apps/api/core'
import { IMAGE_EXTENSIONS as IMAGE_EXTS, MARKDOWN_EXTENSIONS as MD_EXTS, getExt } from '../lib/fileTypes'
import { useFileStore } from '../stores/fileStore'
import { useVaultStore } from '../stores/vaultStore'
import { getLanguageExtension, loadLanguageExtension } from '../lib/language'
import { lintGutter } from '@codemirror/lint'
import { getLspClient, getServerLanguage, getLanguageId } from '../lib/lspManager'
import { buildCodeMirrorTheme, useThemeStore } from '../lib/theme'
import { getFileIcon } from '../lib/fileIcons'

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'style'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className', 'style'],
  },
}

const remarkPlugins = [remarkMath]
const rehypePlugins: any[] = [[rehypeSanitize, sanitizeSchema], rehypeKatex, rehypeHighlight]

const BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  bracketMatching: true,
  autocompletion: false,
} as const

// ─── Pane tree model ───

type PaneId = string
let paneCounter = 0
function nextPaneId(): PaneId { return `pane-${++paneCounter}` }

interface LeafPane {
  type: 'leaf'
  id: PaneId
  tabs: string[]
  activeTab: string
}

interface SplitPane {
  type: 'split'
  id: PaneId
  direction: 'horizontal' | 'vertical'
  children: PaneNode[]
  sizes: number[] // percentages
}

type PaneNode = LeafPane | SplitPane

function createLeaf(tabs: string[], activeTab?: string): LeafPane {
  return { type: 'leaf', id: nextPaneId(), tabs, activeTab: activeTab ?? tabs[0] ?? '' }
}

// ─── Pane tree operations ───

function findLeaf(node: PaneNode, id: PaneId): LeafPane | null {
  if (node.type === 'leaf') return node.id === id ? node : null
  for (const child of node.children) {
    const found = findLeaf(child, id)
    if (found) return found
  }
  return null
}

function findLeafWithTab(node: PaneNode, filePath: string): LeafPane | null {
  if (node.type === 'leaf') return node.tabs.includes(filePath) ? node : null
  for (const child of node.children) {
    const found = findLeafWithTab(child, filePath)
    if (found) return found
  }
  return null
}

function updateLeaf(node: PaneNode, id: PaneId, updater: (leaf: LeafPane) => LeafPane): PaneNode {
  if (node.type === 'leaf') return node.id === id ? updater(node) : node
  return {
    ...node,
    children: node.children.map((c) => updateLeaf(c, id, updater)),
  }
}

function removeTab(node: PaneNode, paneId: PaneId, filePath: string): PaneNode | null {
  if (node.type === 'leaf') {
    if (node.id !== paneId) return node
    const tabs = node.tabs.filter((t) => t !== filePath)
    if (tabs.length === 0) return null
    const activeTab = node.activeTab === filePath
      ? tabs[Math.min(node.tabs.indexOf(filePath), tabs.length - 1)]
      : node.activeTab
    return { ...node, tabs, activeTab }
  }
  const children = node.children.map((c) => removeTab(c, paneId, filePath)).filter(Boolean) as PaneNode[]
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  // Redistribute sizes if a child was removed
  if (children.length !== node.children.length) {
    const total = children.length
    return { ...node, children, sizes: children.map(() => 100 / total) }
  }
  return { ...node, children }
}

function splitLeaf(
  node: PaneNode,
  paneId: PaneId,
  direction: 'horizontal' | 'vertical',
  newTab: string,
  position: 'before' | 'after',
): PaneNode {
  if (node.type === 'leaf') {
    if (node.id !== paneId) return node
    const newLeaf = createLeaf([newTab], newTab)
    const children = position === 'before' ? [newLeaf, node] : [node, newLeaf]
    return { type: 'split', id: nextPaneId(), direction, children, sizes: [50, 50] }
  }
  return { ...node, children: node.children.map((c) => splitLeaf(c, paneId, direction, newTab, position)) }
}

function moveTabBetweenPanes(
  node: PaneNode,
  fromPaneId: PaneId,
  toPaneId: PaneId,
  filePath: string,
  insertIndex?: number,
): PaneNode {
  // First remove from source
  let result = removeTab(node, fromPaneId, filePath)
  if (!result) return node
  // Then add to target
  result = updateLeaf(result, toPaneId, (leaf) => {
    if (leaf.tabs.includes(filePath)) return { ...leaf, activeTab: filePath }
    const tabs = [...leaf.tabs]
    const idx = insertIndex != null ? insertIndex : tabs.length
    tabs.splice(idx, 0, filePath)
    return { ...leaf, tabs, activeTab: filePath }
  })
  return result
}

// ─── Drop zones ───

type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center'

function getDropZone(e: React.DragEvent, el: HTMLElement): DropZone {
  const rect = el.getBoundingClientRect()
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height
  const edgeThreshold = 0.25
  if (x < edgeThreshold) return 'left'
  if (x > 1 - edgeThreshold) return 'right'
  if (y < edgeThreshold) return 'top'
  if (y > 1 - edgeThreshold) return 'bottom'
  return 'center'
}

// ─── Drag context ───

let dragState: { filePath: string; sourcePaneId: PaneId } | null = null

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
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSplitPane, handleCloseTab, handleActivateTab, findFirstLeaf])

  // Terminal panel resize
  const handleTerminalResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = terminalHeight

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
  }, [terminalHeight])

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

interface PaneRendererProps {
  node: PaneNode
  onCloseTab: (paneId: PaneId, filePath: string) => void
  onActivateTab: (paneId: PaneId, filePath: string) => void
  onReorderTabs: (paneId: PaneId, tabs: string[]) => void
  onDropOnPane: (targetPaneId: PaneId, zone: DropZone, filePath: string, sourcePaneId: PaneId) => void
  onResizePanes: (splitId: PaneId, sizes: number[]) => void
  previewFiles: Set<string>
  onTogglePreview: (filePath: string) => void
}

type PaneHandlers = Omit<PaneRendererProps, 'node'>

function PaneRenderer({ node, ...handlers }: PaneRendererProps) {
  if (node.type === 'leaf') {
    return <LeafPaneView pane={node} {...handlers} />
  }

  return <SplitPaneView split={node} {...handlers} />
}

// ─── Split pane with resizable divider ───

function SplitPaneView({ split, ...handlers }: PaneHandlers & { split: SplitPane }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [sizes, setSizes] = useState(split.sizes)
  const sizesRef = useRef(sizes)
  sizesRef.current = sizes

  useEffect(() => { setSizes(split.sizes) }, [split.sizes])

  const isHorizontal = split.direction === 'horizontal'

  const handleDividerDrag = useCallback((index: number, e: React.PointerEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    const startPos = isHorizontal ? e.clientX : e.clientY
    const containerSize = isHorizontal ? container.offsetWidth : container.offsetHeight
    const startSizes = [...sizesRef.current]

    const onMove = (e: PointerEvent) => {
      const delta = ((isHorizontal ? e.clientX : e.clientY) - startPos) / containerSize * 100
      const newSizes = [...startSizes]
      newSizes[index] = Math.max(10, startSizes[index] + delta)
      newSizes[index + 1] = Math.max(10, startSizes[index + 1] - delta)
      setSizes(newSizes)
      sizesRef.current = newSizes
    }

    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      handlers.onResizePanes(split.id, sizesRef.current)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [isHorizontal, split.id, handlers])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
      }}
    >
      {split.children.map((child, i) => (
        <div key={child.id} style={{ display: 'contents' }}>
          <div style={{
            [isHorizontal ? 'width' : 'height']: `calc(${sizes[i]}% - ${i < split.children.length - 1 ? 1 : 0}px)`,
            [isHorizontal ? 'height' : 'width']: '100%',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <PaneRenderer node={child} {...handlers} />
          </div>
          {i < split.children.length - 1 && (
            <div
              onPointerDown={(e) => handleDividerDrag(i, e)}
              style={{
                [isHorizontal ? 'width' : 'height']: 1,
                [isHorizontal ? 'height' : 'width']: '100%',
                backgroundColor: 'var(--hb-border)',
                cursor: isHorizontal ? 'col-resize' : 'row-resize',
                flexShrink: 0,
                position: 'relative',
                zIndex: 10,
              }}
            >
              {/* Invisible wider hit area */}
              <div style={{
                position: 'absolute',
                [isHorizontal ? 'left' : 'top']: -3,
                [isHorizontal ? 'right' : 'bottom']: -3,
                [isHorizontal ? 'width' : 'height']: 7,
                [isHorizontal ? 'height' : 'width']: '100%',
              }} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Leaf pane (tab bar + editor) ───

function LeafPaneView({ pane, onCloseTab, onActivateTab, onReorderTabs, onDropOnPane, previewFiles, onTogglePreview }: PaneHandlers & { pane: LeafPane }) {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null)

  // Scroll active tab into view
  useEffect(() => {
    if (!tabBarRef.current || !pane.activeTab) return
    const activeEl = tabBarRef.current.querySelector('[data-active-tab="true"]') as HTMLElement | null
    activeEl?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [pane.activeTab])
  const activeExt = getExt(pane.activeTab ?? '')
  const isMarkdown = MD_EXTS.has(activeExt)
  const isImage = IMAGE_EXTS.has(activeExt)
  const mdPreview = pane.activeTab ? previewFiles.has(pane.activeTab) : false

  const handleEditorDragOver = useCallback((e: React.DragEvent) => {
    if (!dragState) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (contentRef.current) {
      setDropZone(getDropZone(e, contentRef.current))
    }
  }, [])

  const handleEditorDragLeave = useCallback(() => { setDropZone(null) }, [])

  const handleEditorDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDropZone(null)
    if (!dragState || !contentRef.current) return
    const zone = getDropZone(e, contentRef.current)
    onDropOnPane(pane.id, zone, dragState.filePath, dragState.sourcePaneId)
    dragState = null
  }, [pane.id, onDropOnPane])

  // Tab drag handlers
  const handleTabDragStart = useCallback((filePath: string, e: React.DragEvent) => {
    dragState = { filePath, sourcePaneId: pane.id }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', filePath)
  }, [pane.id])

  const handleTabDragOver = useCallback((index: number, e: React.DragEvent) => {
    if (!dragState) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverTabIndex(index)
  }, [])

  const handleTabDrop = useCallback((index: number, e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverTabIndex(null)
    if (!dragState) return

    const { filePath, sourcePaneId } = dragState
    dragState = null

    if (sourcePaneId === pane.id) {
      // Reorder within same pane
      const oldIndex = pane.tabs.indexOf(filePath)
      if (oldIndex === -1 || oldIndex === index) return
      const tabs = [...pane.tabs]
      tabs.splice(oldIndex, 1)
      const insertAt = index > oldIndex ? index - 1 : index
      tabs.splice(insertAt, 0, filePath)
      onReorderTabs(pane.id, tabs)
    } else {
      // Move between panes
      onDropOnPane(pane.id, 'center', filePath, sourcePaneId)
    }
  }, [pane.id, pane.tabs, onReorderTabs, onDropOnPane])

  const handleTabBarDragLeave = useCallback(() => { setDragOverTabIndex(null) }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
      {/* Tab bar */}
      <div
        ref={tabBarRef}
        onDragLeave={handleTabBarDragLeave}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 36,
          backgroundColor: 'var(--hb-surface)',
          borderBottom: '1px solid var(--hb-border)',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          flexShrink: 0,
        }}
      >
        {pane.tabs.map((filePath, i) => (
          <Tab
            key={filePath}
            filePath={filePath}
            isActive={filePath === pane.activeTab}
            isPreview={previewFiles.has(filePath)}
            onTogglePreview={MD_EXTS.has(getExt(filePath)) ? () => onTogglePreview(filePath) : undefined}
            onClick={() => onActivateTab(pane.id, filePath)}
            onClose={() => onCloseTab(pane.id, filePath)}
            onDragStart={(e) => handleTabDragStart(filePath, e)}
            onDragOver={(e) => handleTabDragOver(i, e)}
            onDrop={(e) => handleTabDrop(i, e)}
            showDropIndicator={dragOverTabIndex === i}
          />
        ))}
      </div>

      {/* Editor area with drop zones */}
      <div
        ref={contentRef}
        style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}
        onDragOver={handleEditorDragOver}
        onDragLeave={handleEditorDragLeave}
        onDrop={handleEditorDrop}
      >
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {pane.activeTab && vaultPath && (
            isImage ? (
              <ImageViewer key={`img-${pane.activeTab}`} filePath={pane.activeTab} />
            ) : isMarkdown && mdPreview ? (
              <MdPreview key={`preview-${pane.activeTab}`} filePath={pane.activeTab} />
            ) : (
              <IdeEditor key={pane.activeTab} filePath={pane.activeTab} vaultPath={vaultPath} />
            )
          )}
        </div>

        {/* Drop zone overlay */}
        {dropZone && dropZone !== 'center' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 20,
          }}>
            <div style={{
              position: 'absolute',
              backgroundColor: 'rgba(82, 139, 255, 0.12)',
              border: '2px solid rgba(82, 139, 255, 0.4)',
              borderRadius: 4,
              transition: 'all 100ms ease',
              ...(dropZone === 'left' ? { left: 0, top: 0, bottom: 0, width: '50%' } :
                dropZone === 'right' ? { right: 0, top: 0, bottom: 0, width: '50%' } :
                dropZone === 'top' ? { left: 0, right: 0, top: 0, height: '50%' } :
                { left: 0, right: 0, bottom: 0, height: '50%' }),
            }} />
          </div>
        )}
        {dropZone === 'center' && (
          <div style={{
            position: 'absolute',
            inset: 4,
            border: '2px solid rgba(82, 139, 255, 0.3)',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 20,
          }} />
        )}
      </div>
    </div>
  )
}

// ─── Tab ───

const Tab = memo(function Tab({ filePath, isActive, isPreview, onTogglePreview, onClick, onClose, onDragStart, onDragOver, onDrop, showDropIndicator }: {
  filePath: string
  isActive: boolean
  isPreview?: boolean
  onTogglePreview?: () => void
  onClick: () => void
  onClose: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  showDropIndicator: boolean
}) {
  const file = useFileStore((s) => s.files.get(filePath))
  const isDirty = file?.isDirty ?? false
  const fileName = filePath.split('/').pop() ?? filePath
  const Icon = getFileIcon(filePath, false)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      draggable
      data-active-tab={isActive || undefined}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 8px 0 14px',
        height: '100%',
        borderRight: '1px solid var(--hb-border)',
        background: isActive ? 'var(--hb-hover)' : hovered ? 'var(--hb-hover)' : 'transparent',
        color: isActive ? 'var(--hb-fg)' : 'var(--hb-text-muted)',
        cursor: 'grab',
        fontSize: 12,
        fontFamily: '"JetBrains Mono", monospace',
        whiteSpace: 'nowrap',
        borderBottom: isActive ? '1px solid #528bff' : '1px solid transparent',
        borderLeft: showDropIndicator ? '2px solid #528bff' : '2px solid transparent',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <Icon size={13} />
      <span>{fileName}</span>
      {onTogglePreview && (
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePreview() }}
          title={isPreview ? 'Edit' : 'Preview'}
          style={{
            display: 'flex', alignItems: 'center', background: 'none', border: 'none',
            color: isPreview ? '#528bff' : 'var(--hb-text-muted)', cursor: 'pointer', padding: 1,
            flexShrink: 0,
          }}
        >
          {isPreview ? <Code size={11} /> : <Eye size={11} />}
        </button>
      )}
      {isDirty && !hovered && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: '#e5c07b', display: 'inline-block', flexShrink: 0,
        }} />
      )}
      {(hovered || isActive) && (
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', color: 'var(--hb-text-muted)', cursor: 'pointer',
            padding: 2, borderRadius: 3, flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--hb-border)'; e.currentTarget.style.color = 'var(--hb-fg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--hb-text-muted)' }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
})

// ─── Terminal Panel (tabbed) ───

let termIdCounter = 0

interface TermPane {
  id: number
  tabs: { id: number; label: string }[]
  activeTab: number
}

function TerminalPanel({ onClose }: { onClose: () => void }) {
  const [panes, setPanes] = useState<TermPane[]>(() => {
    const tid = ++termIdCounter
    return [{ id: 1, tabs: [{ id: tid, label: 'zsh' }], activeTab: tid }]
  })
  const [sizes, setSizes] = useState<number[]>([100])
  const paneSlotRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [dragInfo, setDragInfo] = useState<{ termId: number; paneId: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ paneId: number; zone: 'left' | 'right' | 'center' } | null>(null)

  const addTab = useCallback((paneId?: number) => {
    const tid = ++termIdCounter
    setPanes((prev) => {
      const targetId = paneId ?? prev[prev.length - 1]?.id
      return prev.map((p) => p.id !== targetId ? p : {
        ...p, tabs: [...p.tabs, { id: tid, label: 'zsh' }], activeTab: tid,
      })
    })
  }, [])

  const closeTab = useCallback((paneId: number, termId: number) => {
    destroyTerminal(termId)
    setPanes((prev) => {
      const pane = prev.find((p) => p.id === paneId)
      if (!pane) return prev
      const nextTabs = pane.tabs.filter((t) => t.id !== termId)
      if (nextTabs.length === 0) {
        const nextPanes = prev.filter((p) => p.id !== paneId)
        if (nextPanes.length === 0) { setTimeout(onClose, 0); return prev }
        setSizes(nextPanes.map(() => 100 / nextPanes.length))
        return nextPanes
      }
      const nextActive = pane.activeTab === termId ? nextTabs[nextTabs.length - 1].id : pane.activeTab
      return prev.map((p) => p.id !== paneId ? p : { ...p, tabs: nextTabs, activeTab: nextActive })
    })
  }, [onClose])

  const activateTab = useCallback((paneId: number, termId: number) => {
    setPanes((prev) => prev.map((p) => p.id !== paneId ? p : { ...p, activeTab: termId }))
  }, [])

  const handleDragStart = useCallback((termId: number, paneId: number, e: React.DragEvent) => {
    setDragInfo({ termId, paneId })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(termId))
  }, [])

  const handlePaneDragOver = useCallback((paneId: number, e: React.DragEvent) => {
    if (!dragInfo) return
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const zone = x < 0.3 ? 'left' as const : x > 0.7 ? 'right' as const : 'center' as const
    setDropTarget({ paneId, zone })
  }, [dragInfo])

  const handlePaneDrop = useCallback((paneId: number, e: React.DragEvent) => {
    e.preventDefault()
    if (!dragInfo || !dropTarget) { setDragInfo(null); setDropTarget(null); return }

    const { paneId: srcPaneId } = dragInfo
    const { zone } = dropTarget
    setDragInfo(null)
    setDropTarget(null)

    if (zone === 'center' && srcPaneId === paneId) return // no-op

    setPanes((prev) => {
      // Remove the dragged tab from its source pane
      let tab: { id: number; label: string } | undefined
      let afterRemove = prev.map((p) => {
        if (p.id !== srcPaneId) return p
        tab = p.tabs.find((t) => t.id === dragInfo.termId)
        const nextTabs = p.tabs.filter((t) => t.id !== dragInfo.termId)
        if (nextTabs.length === 0) return null
        return { ...p, tabs: nextTabs, activeTab: p.activeTab === dragInfo.termId ? nextTabs[nextTabs.length - 1].id : p.activeTab }
      }).filter(Boolean) as TermPane[]
      if (!tab) return prev

      if (zone === 'center') {
        // Move tab into existing pane
        const result = afterRemove.map((p) => p.id !== paneId ? p : {
          ...p, tabs: [...p.tabs, tab!], activeTab: tab!.id,
        })
        setSizes(result.map(() => 100 / result.length))
        return result
      } else {
        // Split — move tab into a new pane
        const newPaneId = ++termIdCounter
        const newPane: TermPane = { id: newPaneId, tabs: [tab], activeTab: tab.id }
        const idx = afterRemove.findIndex((p) => p.id === paneId)
        if (idx === -1) return prev
        const result = [...afterRemove]
        const insertAt = zone === 'left' ? idx : idx + 1
        result.splice(insertAt, 0, newPane)
        setSizes(result.map(() => 100 / result.length))
        return result
      }
    })
  }, [dragInfo, dropTarget])

  const handleDragEnd = useCallback(() => {
    setDragInfo(null)
    setDropTarget(null)
  }, [])

  // Divider resize
  const handleDividerDrag = useCallback((index: number, e: React.PointerEvent) => {
    e.preventDefault()
    const container = e.currentTarget.parentElement
    if (!container) return
    const startX = e.clientX
    const containerWidth = container.parentElement?.offsetWidth ?? container.offsetWidth
    const startSizes = [...sizes]

    const onMove = (e: PointerEvent) => {
      const delta = (e.clientX - startX) / containerWidth * 100
      const newSizes = [...startSizes]
      newSizes[index] = Math.max(15, startSizes[index] + delta)
      newSizes[index + 1] = Math.max(15, startSizes[index + 1] - delta)
      setSizes(newSizes)
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      requestAnimationFrame(() => refitAll())
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [sizes])

  return (
    <>
      {/* Split panes */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {panes.map((pane, pi) => (
          <div key={pane.id} style={{ display: 'contents' }}>
            <div
              style={{ width: `calc(${sizes[pi]}% - ${pi < panes.length - 1 ? 1 : 0}px)`, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}
              onDragOver={(e) => handlePaneDragOver(pane.id, e)}
              onDrop={(e) => handlePaneDrop(pane.id, e)}
              onDragLeave={() => setDropTarget(null)}
            >
              {/* Tab bar — terminal tabs + add/close inline */}
              <div style={{
                display: 'flex', alignItems: 'center', height: 30,
                backgroundColor: 'var(--hb-bg)', borderBottom: '1px solid var(--hb-border)',
                padding: '0 4px', flexShrink: 0, overflow: 'hidden',
              }}>
                {pane.tabs.map((tab) => (
                  <div
                    key={tab.id}
                    draggable
                    onDragStart={(e) => handleDragStart(tab.id, pane.id, e)}
                    onDragEnd={handleDragEnd}
                    onClick={() => activateTab(pane.id, tab.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '0 10px', height: '100%', cursor: 'grab',
                      fontSize: 12, fontFamily: '"JetBrains Mono", monospace',
                      color: tab.id === pane.activeTab ? 'var(--hb-fg)' : 'var(--hb-text-muted)',
                      borderBottom: tab.id === pane.activeTab ? '1px solid #528bff' : '1px solid transparent',
                      userSelect: 'none',
                    }}
                  >
                    <TerminalIcon size={11} />
                    <span>{tab.label}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); closeTab(pane.id, tab.id) }}
                      style={{ background: 'none', border: 'none', color: 'var(--hb-text-muted)', cursor: 'pointer', padding: 1, display: 'flex' }}
                    ><X size={11} /></button>
                  </div>
                ))}
                <button onClick={() => addTab(pane.id)} title="New terminal" style={{
                  background: 'none', border: 'none', color: 'var(--hb-text-muted)',
                  cursor: 'pointer', padding: '0 6px', display: 'flex', alignItems: 'center', height: '100%',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hb-text-muted)' }}
                ><Plus size={12} /></button>
                <button onClick={onClose} title="Close panel" style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  color: 'var(--hb-text-muted)', cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center', height: '100%',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hb-text-muted)' }}
                ><X size={12} /></button>
              </div>

              {/* Terminal area */}
              <div
                ref={(el) => { if (el) paneSlotRefs.current.set(pane.id, el); }}
                style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
              >
                {pane.tabs.map((tab) => {
                  const isActive = tab.id === pane.activeTab
                  return (
                    <div key={tab.id} style={{
                      position: 'absolute', inset: 0,
                      visibility: isActive ? 'visible' : 'hidden',
                      zIndex: isActive ? 1 : 0,
                    }}>
                      <SingleTerminal id={tab.id} visible={isActive} onTitle={(title) => {
                        setPanes((prev) => prev.map((p) => ({
                          ...p,
                          tabs: p.tabs.map((t) => t.id !== tab.id ? t : { ...t, label: title }),
                        })))
                      }} onExit={() => closeTab(pane.id, tab.id)} />
                    </div>
                  )
                })}

                {/* Invisible drag capture overlay — only during drag, sits above terminal canvas */}
                {dragInfo && (
                  <div
                    onDragOver={(e) => handlePaneDragOver(pane.id, e)}
                    onDrop={(e) => handlePaneDrop(pane.id, e)}
                    onDragLeave={() => setDropTarget(null)}
                    style={{
                      position: 'absolute', inset: 0, zIndex: 20,
                      backgroundColor: 'transparent',
                    }}
                  />
                )}

                {/* Drop zone overlay */}
                {dropTarget?.paneId === pane.id && dropTarget.zone !== 'center' && (
                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 25,
                  }}>
                    <div style={{
                      position: 'absolute',
                      backgroundColor: 'rgba(82, 139, 255, 0.12)',
                      border: '2px solid rgba(82, 139, 255, 0.4)',
                      borderRadius: 4,
                      ...(dropTarget.zone === 'left' ? { left: 0, top: 0, bottom: 0, width: '50%' } : { right: 0, top: 0, bottom: 0, width: '50%' }),
                    }} />
                  </div>
                )}
                {dropTarget?.paneId === pane.id && dropTarget.zone === 'center' && (
                  <div style={{
                    position: 'absolute', inset: 4, border: '2px solid rgba(82, 139, 255, 0.3)',
                    borderRadius: 4, pointerEvents: 'none', zIndex: 25,
                  }} />
                )}
              </div>
            </div>

            {/* Divider */}
            {pi < panes.length - 1 && (
              <div
                onPointerDown={(e) => handleDividerDrag(pi, e)}
                style={{
                  width: 1, height: '100%', backgroundColor: 'var(--hb-border)',
                  cursor: 'col-resize', flexShrink: 0, position: 'relative', zIndex: 5,
                }}
              >
                <div style={{ position: 'absolute', left: -3, right: -3, top: 0, bottom: 0 }} />
              </div>
            )}
          </div>
        ))}
      </div>

    </>
  )
}

function SingleTerminal({ id, visible, onTitle, onExit }: { id: number; visible: boolean; onTitle?: (title: string) => void; onExit?: () => void }) {
  const slotRef = useRef<HTMLDivElement>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const zedTheme = useThemeStore((s) => s.zedTheme)
  const fontSize = useEditorStore((s) => s.fontSize)

  // Create terminal (if needed) and mount into slot
  useEffect(() => {
    const managed = createTerminal(id, vaultPath || undefined)
    if (onTitle) {
      managed.onTitleChange = (title) => {
        const short = title.split('/').pop()?.split(' ')[0] ?? title
        onTitle(short.substring(0, 20))
      }
    }
    if (onExit) {
      managed.onExit = onExit
    }
    // Don't destroy on unmount — the manager owns the lifecycle
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mount/re-mount the terminal DOM into this slot on every render
  // This is the key — when React re-parents this component, the
  // slot ref changes, and we just appendChild the existing terminal
  // container into the new slot. No unmount, no PTY reset.
  useEffect(() => {
    if (slotRef.current) mountTerminal(id, slotRef.current)
  })

  // Refit when visible
  useEffect(() => {
    if (visible) {
      const managed = getTerminal(id)
      if (managed) {
        requestAnimationFrame(() => {
          try {
            managed.fitAddon.fit()
            managed.pty.resize(managed.term.cols, managed.term.rows)
            managed.term.focus()
          } catch {}
        })
      }
    }
  }, [visible, id])

  // Theme changes
  useEffect(() => { updateTerminalTheme() }, [zedTheme])

  // Font size changes
  useEffect(() => {
    const managed = getTerminal(id)
    if (!managed) return
    managed.term.options.fontSize = fontSize
    try {
      managed.fitAddon.fit()
      managed.pty.resize(managed.term.cols, managed.term.rows)
    } catch {}
  }, [fontSize, id])

  return <div ref={slotRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
}

// File type helpers imported from '../lib/fileTypes' at top of file

// ─── Image viewer ───

function ImageViewer({ filePath }: { filePath: string }) {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  if (!vaultPath) return null

  const src = convertFileSrc(`${vaultPath}/${filePath}`)

  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'auto', backgroundColor: 'var(--hb-bg)',
    }}>
      <img
        src={src}
        alt={filePath}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }}
      />
    </div>
  )
}

// ─── Markdown preview ───

function MdPreview({ filePath }: { filePath: string }) {
  const file = useFileStore((s) => s.files.get(filePath))

  if (!file) return null

  return (
    <div
      className="markdown-body"
      style={{
        position: 'absolute',
        inset: 0,
        overflowY: 'auto',
        padding: '24px 32px',
        color: 'var(--hb-editor-fg)',
        fontSize: 14,
        lineHeight: 1.7,
      }}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {file.content}
      </ReactMarkdown>
    </div>
  )
}

// ─── Editor ───

function IdeEditor({ filePath, vaultPath }: { filePath: string; vaultPath: string }) {
  const file = useFileStore((s) => s.files.get(filePath))
  const updateContent = useFileStore((s) => s.updateContent)
  const saveFile = useFileStore((s) => s.saveFile)
  const vimMode = useEditorStore((s) => s.vimMode)
  const fontSize = useEditorStore((s) => s.fontSize)
  const zedTheme = useThemeStore((s) => s.zedTheme)
  const getEditorBackground = useThemeStore((s) => s.getEditorBackground)
  const getEditorForeground = useThemeStore((s) => s.getEditorForeground)
  const getGutterBackground = useThemeStore((s) => s.getGutterBackground)
  const getLineNumberColor = useThemeStore((s) => s.getLineNumberColor)
  const getActiveLineBackground = useThemeStore((s) => s.getActiveLineBackground)

  // Wire vim :w, :wq, :q commands
  useEffect(() => {
    if (!vimMode) return
    Vim.defineEx('write', 'w', () => {
      saveFile(vaultPath, filePath)
    })
    Vim.defineEx('quit', 'q', () => {
      useFileStore.getState().closeFile(filePath)
      // Focus next editor after React re-renders
      setTimeout(() => {
        const cm = document.querySelector('.cm-editor .cm-content') as HTMLElement
        cm?.focus()
      }, 50)
    })
    Vim.defineEx('wquit', 'wq', () => {
      saveFile(vaultPath, filePath).then(() => {
        useFileStore.getState().closeFile(filePath)
        setTimeout(() => {
          const cm = document.querySelector('.cm-editor .cm-content') as HTMLElement
          cm?.focus()
        }, 50)
      })
    })
  }, [vimMode, vaultPath, filePath, saveFile])

  // LSP — only active in IDE mode (canvas shapes own LSP in canvas mode)
  // Delayed init: canvas LSP cleanup runs first, then IDE takes over the URI
  const ideMode = useEditorStore((s) => s.ideMode)
  const [lspExt, setLspExt] = useState<Extension[]>([])
  const lspInitialized = useRef(false)
  useEffect(() => {
    if (!vaultPath || !ideMode) return
    if (lspInitialized.current) return
    const serverLang = getServerLanguage(filePath)
    if (!serverLang) return
    // Delay so canvas shapes' LSP cleanup effect runs first
    const timer = setTimeout(() => {
      lspInitialized.current = true
      getLspClient(serverLang, vaultPath).then((client) => {
        if (!client) { lspInitialized.current = false; return }
        const fileUri = `file://${vaultPath}/${filePath}`
        const langId = getLanguageId(filePath) ?? serverLang
        const ext = client.plugin(fileUri, langId)
        setLspExt([ext, lintGutter()])
      }).catch(() => { lspInitialized.current = false })
    }, 100)
    return () => {
      clearTimeout(timer)
      lspInitialized.current = false
      setLspExt([])
    }
  }, [vaultPath, filePath, ideMode])

  const [langExt, setLangExt] = useState<Extension | null>(() => getLanguageExtension(filePath))
  useEffect(() => {
    let cancelled = false
    loadLanguageExtension(filePath).then((ext) => {
      if (!cancelled && ext) setLangExt(ext)
    })
    return () => { cancelled = true }
  }, [filePath])

  const cmTheme = useMemo(
    () => buildCodeMirrorTheme({
      zedTheme, getEditorBackground, getEditorForeground,
      getGutterBackground, getLineNumberColor, getActiveLineBackground,
    }),
    [zedTheme, getEditorBackground, getEditorForeground, getGutterBackground, getLineNumberColor, getActiveLineBackground]
  )
  const fontCompartment = useMemo(() => new Compartment(), [])
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      fontCompartment.of(EditorView.theme({
        '&': { fontSize: `${fontSize}px` },
        '.cm-gutters': { fontSize: `${fontSize}px` },
      })),
      search(), keymap.of(searchKeymap), indentationMarkers(),
      ...(vimMode ? [vim()] : []),
      ...cmTheme,
      ...(langExt ? [langExt] : []),
      ...lspExt,
    ],
    // fontSize deliberately excluded — handled by compartment reconfigure below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cmTheme, langExt, lspExt, vimMode, fontCompartment]
  )

  // Reconfigure only the font compartment — no full extension rebuild
  const editorWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const wrap = editorWrapRef.current
    if (!wrap) return
    const cmEl = wrap.querySelector('.cm-editor')
    if (!cmEl) return
    const view = EditorView.findFromDOM(cmEl as HTMLElement)
    if (!view) return
    view.dispatch({
      effects: fontCompartment.reconfigure(EditorView.theme({
        '&': { fontSize: `${fontSize}px` },
        '.cm-gutters': { fontSize: `${fontSize}px` },
      })),
    })
  }, [fontSize, fontCompartment])

  // Auto-focus editor on mount (after :q switches tabs, new file opens, etc.)
  useEffect(() => {
    requestAnimationFrame(() => {
      const wrap = editorWrapRef.current
      if (!wrap) return
      const cmEl = wrap.querySelector('.cm-editor')
      if (!cmEl) return
      const view = EditorView.findFromDOM(cmEl as HTMLElement)
      view?.focus()
    })
  }, [filePath])

  const handleChange = useCallback(
    (value: string) => updateContent(filePath, value),
    [filePath, updateContent]
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveFile(vaultPath, filePath)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [vaultPath, filePath, saveFile])

  if (!file) {
    return (
      <div style={{ color: 'var(--hb-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        Loading...
      </div>
    )
  }

  return (
    <div ref={editorWrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontSize }}>
      <CodeMirror
        value={file.content}
        onChange={handleChange}
        extensions={extensions}
        theme="none"
        editable
        height="100%"
        basicSetup={BASIC_SETUP}
        style={{ height: '100%' }}
      />
    </div>
  )
}
