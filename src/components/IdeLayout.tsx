import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { Terminal as TerminalIcon, X, Eye, Code } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { spawn } from 'tauri-pty'
import { convertFileSrc } from '@tauri-apps/api/core'
import { IMAGE_EXTENSIONS as IMAGE_EXTS, MARKDOWN_EXTENSIONS as MD_EXTS, getExt } from '../lib/fileTypes'
import { useFileStore } from '../stores/fileStore'
import { useVaultStore } from '../stores/vaultStore'
import { getLanguageExtension } from '../lib/language'
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
    if (openFiles.length === 0) { onClose(); return }
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
        }
      }
      return updated
    })
  }, [openFiles, onClose])

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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // Ctrl+\ — split pane
      if (meta && e.key === '\\') {
        e.preventDefault()
        const leaf = findFirstLeaf(rootPane)
        if (leaf) handleSplitPane(leaf.id, 'horizontal')
        return
      }

      // Ctrl+W — close active tab
      if (meta && e.key === 'w') {
        e.preventDefault()
        const leaf = findFirstLeaf(rootPane)
        if (leaf?.activeTab) handleCloseTab(leaf.id, leaf.activeTab)
        return
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
      if (meta && e.key === 'Tab') {
        e.preventDefault()
        const leaf = findFirstLeaf(rootPane)
        if (!leaf || leaf.tabs.length < 2) return
        const idx = leaf.tabs.indexOf(leaf.activeTab)
        const next = e.shiftKey
          ? (idx - 1 + leaf.tabs.length) % leaf.tabs.length
          : (idx + 1) % leaf.tabs.length
        handleActivateTab(leaf.id, leaf.tabs[next])
        return
      }

      // Ctrl+` — toggle terminal
      if (meta && e.key === '`') {
        e.preventDefault()
        setTerminalOpen((v) => !v)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [rootPane, handleSplitPane, handleCloseTab, handleActivateTab, findFirstLeaf])

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
            <div style={{
              display: 'flex', alignItems: 'center', height: 28,
              backgroundColor: 'var(--hb-surface)', borderBottom: '1px solid var(--hb-border)',
              padding: '0 8px', flexShrink: 0, gap: 8,
            }}>
              <TerminalIcon size={12} color="var(--hb-text-muted)" />
              <span style={{ fontSize: 11, color: 'var(--hb-text-muted)', fontFamily: '"JetBrains Mono", monospace' }}>Terminal</span>
              <button
                onClick={() => setTerminalOpen(false)}
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  color: 'var(--hb-text-muted)', cursor: 'pointer', padding: 2, display: 'flex',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hb-text-muted)' }}
              >
                <X size={12} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <IdeTerminal />
            </div>
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
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null)
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

function Tab({ filePath, isActive, isPreview, onTogglePreview, onClick, onClose, onDragStart, onDragOver, onDrop, showDropIndicator }: {
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
}

// ─── IDE Terminal ───

function IdeTerminal() {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const getEditorBackground = useThemeStore((s) => s.getEditorBackground)
  const getEditorForeground = useThemeStore((s) => s.getEditorForeground)
  const vaultPath = useVaultStore((s) => s.vaultPath)

  useEffect(() => {
    if (!containerRef.current) return

    const editorBg = getEditorBackground()
    const editorFg = getEditorForeground()

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", Menlo, Monaco, monospace',
      fontSize: 14,
      scrollback: 5000,
      drawBoldTextInBrightColors: false,
      theme: {
        background: editorBg,
        foreground: editorFg,
        cursor: editorFg,
        cursorAccent: editorBg,
        selectionBackground: 'rgba(255, 255, 255, 0.15)',
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)

    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => webglAddon.dispose())
      term.loadAddon(webglAddon)
    } catch {}

    termRef.current = term

    document.fonts.ready.then(() => {
      setTimeout(() => { try { fitAddon.fit() } catch {} }, 50)
    })

    // Spawn PTY
    const pty = spawn('/bin/zsh', [], {
      cols: term.cols,
      rows: term.rows,
      cwd: vaultPath || undefined,
      name: 'xterm-256color',
    })

    pty.onData((data: any) => {
      try {
        if (typeof data === 'string') term.write(data)
        else if (data instanceof Uint8Array) term.write(data)
        else if (Array.isArray(data)) term.write(new Uint8Array(data))
        else if (data && typeof data === 'object') term.write(new Uint8Array(Object.values(data) as number[]))
        else term.write(String(data))
      } catch {}
    })

    term.onData((data: string) => {
      try { pty.write(data) } catch {}
    })

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        pty.resize(term.cols, term.rows)
      } catch {}
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      try { pty.kill() } catch {}
      term.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    />
  )
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
  const zedTheme = useThemeStore((s) => s.zedTheme)
  const getEditorBackground = useThemeStore((s) => s.getEditorBackground)
  const getEditorForeground = useThemeStore((s) => s.getEditorForeground)
  const getGutterBackground = useThemeStore((s) => s.getGutterBackground)
  const getLineNumberColor = useThemeStore((s) => s.getLineNumberColor)
  const getActiveLineBackground = useThemeStore((s) => s.getActiveLineBackground)

  // LSP skipped in IDE mode — canvas shapes already hold LSP plugins for open files,
  // and @codemirror/lsp-client doesn't support multiple views on the same URI.

  const langExt = useMemo(() => getLanguageExtension(filePath), [filePath])
  const cmTheme = useMemo(
    () => buildCodeMirrorTheme({
      zedTheme, getEditorBackground, getEditorForeground,
      getGutterBackground, getLineNumberColor, getActiveLineBackground,
    }),
    [zedTheme, getEditorBackground, getEditorForeground, getGutterBackground, getLineNumberColor, getActiveLineBackground]
  )
  const extensions = useMemo(
    () => [...cmTheme, ...(langExt ? [langExt] : [])],
    [cmTheme, langExt]
  )

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
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
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
