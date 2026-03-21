import { useCallback, useRef, useEffect, useState, memo } from 'react'
import { Columns2, LayoutGrid, PanelLeft } from 'lucide-react'
import {
  Tldraw,
  DefaultToolbar,
  DefaultToolbarContent,
  DefaultStylePanel,
  DefaultStylePanelContent,
  type TLComponents,
  type Editor,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { customShapeUtils } from '../shapes'
import { saveCanvasState, loadCanvasState } from '../lib/canvasPersistence'
import { useVaultStore } from '../stores/vaultStore'
import { useThemeStore } from '../lib/theme'
import { useEditorStore } from '../stores/editorStore'
import { useFileStore } from '../stores/fileStore'
import { useFileWatcher } from '../hooks/useFileWatcher'
import { getLanguageName } from '../lib/language'
import { useToastStore } from './Toast'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'

const TLDRAW_OPTIONS = {
  maxPages: 1,
  // Debounced zoom: use cached rendering during camera movement.
  // Our shapes (CodeMirror, xterm) are heavy — rendering them at every
  // zoom frame kills perf. Low threshold since each shape is expensive.
  debouncedZoom: true,
  debouncedZoomThreshold: 50,
  // Snappier animations (default ~500ms feels sluggish)
  animationMediumMs: 200,
  animationShortMs: 100,
  // Disable text shadows at low zoom (saves GPU compositing)
  textShadowLod: 0.5,
} as const

const tldrawComponents: TLComponents = {
  // Default toolbar + style panel (no wrapper overhead)
  Toolbar: (props) => (
    <DefaultToolbar {...props}>
      <DefaultToolbarContent />
    </DefaultToolbar>
  ),
  StylePanel: (props) => (
    <DefaultStylePanel {...props}>
      <DefaultStylePanelContent />
    </DefaultStylePanel>
  ),
  // Kill unused UI — less DOM, less rendering
  MainMenu: null,
  PageMenu: null,
  NavigationPanel: null,
  HelpMenu: null,
  DebugMenu: null,
  DebugPanel: null,
  SharePanel: null,
}

import { IMAGE_EXTENSIONS, PDF_EXTENSIONS, AUDIO_EXTENSIONS, MARKDOWN_EXTENSIONS, ALL_SHAPE_TYPES, isBinaryFile, getShapeConfig } from '../lib/fileTypes'

// Find a position that doesn't overlap existing shapes
function findNonOverlappingPosition(editor: Editor, baseX: number, baseY: number, w: number, h: number) {
  const shapes = editor.getCurrentPageShapes()
  let x = baseX
  let y = baseY
  const PAD = 20
  let attempts = 0

  while (attempts < 50) {
    const overlaps = shapes.some((s) => {
      const bounds = editor.getShapePageBounds(s)
      if (!bounds) return false
      return !(x + w + PAD < bounds.x || x > bounds.x + bounds.w + PAD ||
               y + h + PAD < bounds.y || y > bounds.y + bounds.h + PAD)
    })
    if (!overlaps) break
    // Shift right, then down
    x += w + PAD
    if (attempts % 3 === 2) {
      x = baseX
      y += h + PAD
    }
    attempts++
  }
  return { x, y }
}

export const StatusBar = memo(function StatusBar({ ideMode }: { ideMode?: boolean }) {
  const [zoom, setZoom] = useState(100)
  const [lspStatuses, setLspStatuses] = useState<Map<string, string>>(new Map())
  const sidebarOpen = useVaultStore((s) => s.sidebarOpen)
  const toggleSidebar = useVaultStore((s) => s.toggleSidebar)
  const themeName = useThemeStore((s) => s.themeName)
  const vimMode = useEditorStore((s) => s.vimMode)
  const toggleVimMode = useEditorStore((s) => s.toggleVimMode)

  useEffect(() => {
    const zoomHandler = (e: Event) => {
      setZoom(Math.round((e as CustomEvent).detail * 100))
    }
    const lspHandler = (e: Event) => {
      const { language, status } = (e as CustomEvent).detail
      setLspStatuses((prev) => {
        const next = new Map(prev)
        next.set(language, status)
        return next
      })
    }
    window.addEventListener('humanboard:zoom-changed', zoomHandler)
    window.addEventListener('humanboard:lsp-status', lspHandler)
    return () => {
      window.removeEventListener('humanboard:zoom-changed', zoomHandler)
      window.removeEventListener('humanboard:lsp-status', lspHandler)
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 24,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 12,
        padding: '0 12px',
        backgroundColor: 'var(--hb-surface)',
        borderTop: '1px solid var(--hb-border)',
        fontSize: 11,
        fontFamily: '"JetBrains Mono", monospace',
        color: 'var(--hb-text-muted)',
        userSelect: 'none',
      }}
    >
      <button
        onClick={toggleSidebar}
        title={sidebarOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
        style={{
          display: 'flex', alignItems: 'center',
          background: 'none', border: 'none',
          color: 'var(--hb-text-muted)',
          cursor: 'pointer', padding: '0 4px', fontSize: 11, fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hb-text-muted)' }}
      >
        <PanelLeft size={13} />
      </button>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('humanboard:toggle-ide-mode'))}
        title={ideMode ? 'Canvas mode (Ctrl+E)' : 'IDE mode (Ctrl+E)'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'none',
          border: 'none',
          color: ideMode ? '#528bff' : 'var(--hb-text-muted)',
          cursor: 'pointer',
          padding: '0 4px',
          fontSize: 11,
          fontFamily: 'inherit',
          marginRight: 'auto',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = ideMode ? '#528bff' : 'var(--hb-text-muted)' }}
      >
        {ideMode ? <LayoutGrid size={12} /> : <Columns2 size={12} />}
        <span>{ideMode ? 'Canvas' : 'IDE'}</span>
      </button>
      {Array.from(lspStatuses.entries()).map(([lang, status]) => (
        <span key={lang} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor:
                status === 'ready' ? '#98c379' :
                status === 'error' ? '#e06c75' :
                status === 'connecting' ? 'var(--hb-text-muted)' :
                '#e5c07b',
              display: 'inline-block',
              animation: status !== 'ready' && status !== 'error' ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <span style={{ color: 'var(--hb-text-muted)' }}>
            {lang}{status !== 'ready' ? `: ${status}` : ''}
          </span>
        </span>
      ))}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('humanboard:toggle-theme-picker'))}
        title="Change theme (Ctrl+K, T)"
        style={{
          display: 'flex', alignItems: 'center',
          background: 'none', border: 'none',
          color: 'var(--hb-text-muted)', cursor: 'pointer', padding: '0 4px',
          fontSize: 11, fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hb-text-muted)' }}
      >
        {themeName}
      </button>
      <button
        onClick={toggleVimMode}
        title="Toggle Vim mode"
        style={{
          display: 'flex', alignItems: 'center',
          background: 'none', border: 'none',
          color: vimMode ? '#528bff' : 'var(--hb-text-muted)',
          cursor: 'pointer', padding: '0 4px',
          fontSize: 11, fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = vimMode ? '#528bff' : 'var(--hb-text-muted)' }}
      >
        {vimMode ? 'VIM' : 'vim'}
      </button>
      <span>{zoom}%</span>
    </div>
  )
})

export function Canvas() {
  useFileWatcher()
  const editorRef = useRef<Editor | null>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor

      // Force override tldraw selection colors — kill the blue
      const container = document.querySelector('.tl-container') as HTMLElement
      if (container) {
        container.style.setProperty('--tl-color-selection-stroke', 'rgba(255,255,255,0.2)')
        container.style.setProperty('--tl-color-selection-fill', 'rgba(255,255,255,0.03)')
        container.style.setProperty('--tl-color-selected', 'rgba(255,255,255,0.3)')
        container.style.setProperty('--tl-color-primary', 'rgba(255,255,255,0.3)')

        // NUCLEAR FIX: intercept ALL wheel events on the container in capture phase.
        // If the event target is inside a shape's content area, stop it from reaching
        // tldraw's gesture handler so the shape can scroll normally.
        container.addEventListener('wheel', (e) => {
          const target = e.target as HTMLElement
          // Check if we're inside a shape's scrollable content
          if (target.closest('.shape-content')) {
            e.stopPropagation()
          }
        }, true) // capture phase — fires BEFORE tldraw's handler
      }

      // Enable grid (dot pattern)
      editor.updateInstanceState({ isGridMode: true })

      // Emit zoom level changes (throttled — smooth zoom fires 60+/sec)
      let lastZoom = -1
      const emitZoom = () => {
        const z = editor.getZoomLevel()
        if (z === lastZoom) return
        lastZoom = z
        window.dispatchEvent(
          new CustomEvent('humanboard:zoom-changed', { detail: z })
        )
      }
      emitZoom()
      const unlistenZoom = editor.store.listen(emitZoom, { scope: 'session' })

      if (vaultPath) {
        loadCanvasState(editor, vaultPath).then(() => {
          const shapes = editor.getCurrentPageShapes()
          for (const shape of shapes) {
            // Remove stale terminal shapes (PTY sessions don't survive restart)
            if (shape.type === 'terminal-shape') {
              editor.deleteShape(shape.id)
              continue
            }
            // Rehydrate file content for code/markdown shapes
            if (shape.type === 'code-shape' || shape.type === 'markdown-shape') {
              const filePath = (shape as any).props.filePath
              if (filePath) {
                useFileStore.getState().openFile(vaultPath, filePath).catch(() => {
                  editor.deleteShape(shape.id)
                })
              }
            }
            // Image shapes load via convertFileSrc, no rehydration needed
            // PDF shapes load their own content, no rehydration needed
          }
        })
      }
      // Auto-save on changes (debounced 2s)
      const unlistenSave = editor.store.listen(
        () => {
          if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
          if (!vaultPath) return
          saveTimeoutRef.current = setTimeout(() => {
            if (editorRef.current && vaultPath) {
              saveCanvasState(editorRef.current, vaultPath)
            }
          }, 2000)
        },
        { scope: 'document' }
      )

      // Cleanup store listeners on unmount
      return () => {
        unlistenZoom()
        unlistenSave()
      }
    },
    [vaultPath]
  )

  // Canvas keyboard shortcuts (Cmd+` terminal, Cmd+N note, Cmd+G graph)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const editor = editorRef.current
      if (!editor) return

      if (e.key === '`') {
        e.preventDefault()
        const { x, y } = editor.getViewportPageBounds().center
        editor.createShape({ type: 'terminal-shape', x: x - 350, y: y - 210, props: { w: 700, h: 420, shell: '' } })
      } else if (e.key === 'n') {
        e.preventDefault()
        const { x, y } = editor.getViewportPageBounds().center
        editor.createShape({ type: 'note-shape', x: x - 150, y: y - 125, props: { w: 300, h: 250, content: '' } })
      } else if (e.key === 'g') {
        e.preventDefault()
        const { x, y } = editor.getViewportPageBounds().center
        editor.createShape({ type: 'graph-shape', x: x - 300, y: y - 250, props: { w: 600, h: 500 } })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])



  // Expose editor ref for sidebar drag-drop
  useEffect(() => {
    (window as any).__humanboard_editor = editorRef
    return () => { delete (window as any).__humanboard_editor }
  }, [])

  useEffect(() => {
    const handleOpenFile = async (e: Event) => {
      const editor = editorRef.current
      if (!editor) return
      const { filePath, language, dropX, dropY, animate } = (e as CustomEvent).detail

      // Check if shape already exists
      const existing = editor.getCurrentPageShapes().find(
        (s) => (ALL_SHAPE_TYPES as readonly string[]).includes(s.type) && (s as any).props.filePath === filePath
      )
      if (existing) {
        editor.select(existing.id)
        const bounds = editor.getShapePageBounds(existing)
        if (bounds) {
          editor.zoomToBounds(bounds, {
            animation: { duration: animate ? 500 : 250 },
            inset: 100,
          })
        }
        return
      }

      // Load file content into FileStore if it's a text file
      if (!isBinaryFile(filePath) && vaultPath) {
        try {
          await useFileStore.getState().openFile(vaultPath, filePath)
        } catch (err) {
          useToastStore.getState().addToast(String(err))
          return
        }
      }

      const config = getShapeConfig(filePath, language)
      let x: number, y: number

      if (dropX !== undefined && dropY !== undefined) {
        // Dragged from sidebar — use drop coordinates
        const point = editor.screenToPage({ x: dropX, y: dropY })
        x = point.x - config.w / 2
        y = point.y - config.h / 2
      } else {
        // Clicked in sidebar — place at center, avoid overlap
        const center = editor.getViewportPageBounds().center
        const pos = findNonOverlappingPosition(editor, center.x - config.w / 2, center.y - config.h / 2, config.w, config.h)
        x = pos.x
        y = pos.y
      }

      const props: any = { filePath, w: config.w, h: config.h }
      if ('language' in config) props.language = config.language

      editor.createShape({ type: config.type, x, y, props })
      // If opened from QuickOpen (animate=true), zoom to the new shape
      if (animate) {
        // Small delay to let the shape render
        setTimeout(() => {
          const shapes = editor.getCurrentPageShapes()
          const created = shapes.find(
            (s) => (ALL_SHAPE_TYPES as readonly string[]).includes(s.type) && (s as any).props.filePath === filePath
          )
          if (created) {
            editor.select(created.id)
            const bounds = editor.getShapePageBounds(created)
            if (bounds) {
              editor.zoomToBounds(bounds, {
                animation: { duration: 400 },
                inset: 100,
              })
            }
          }
        }, 100)
      }
    }

    window.addEventListener('humanboard:open-file', handleOpenFile)

    return () => {
      window.removeEventListener('humanboard:open-file', handleOpenFile)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [vaultPath])

  // Tauri native drag-and-drop
  useEffect(() => {
    let unlisten: (() => void) | null = null

    getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type === 'enter' || event.payload.type === 'over') {
        setIsDragging(true)
      } else if (event.payload.type === 'leave') {
        setIsDragging(false)
      } else if (event.payload.type === 'drop') {
        setIsDragging(false)
        const editor = editorRef.current
        if (!editor || !vaultPath) return

        const paths = event.payload.paths
        if (!paths || paths.length === 0) return

        const dropPos = event.payload.position
        const point = editor.screenToPage({ x: dropPos.x, y: dropPos.y })

        let offsetX = 0
        for (const filePath of paths) {
          let relativePath: string

          if (filePath.startsWith(vaultPath)) {
            relativePath = filePath.slice(vaultPath.length + 1)
          } else {
            // Copy external file into vault
            try {
              const fileName = filePath.split('/').pop() ?? 'file'
              relativePath = await invoke<string>('copy_file_into_vault', {
                sourcePath: filePath,
                vaultRoot: vaultPath,
                destRelative: fileName,
              })
              useVaultStore.getState().loadFileTree()
            } catch (err) {
              useToastStore.getState().addToast(`Failed to copy: ${err}`)
              continue
            }
          }

          const ext = relativePath.split('.').pop()?.toLowerCase() ?? ''
          const isImage = IMAGE_EXTENSIONS.has(ext)
          const isPdf = PDF_EXTENSIONS.has(ext)
          const isMarkdown = MARKDOWN_EXTENSIONS.has(ext)
          const isAudio = AUDIO_EXTENSIONS.has(ext)

          // Check if already open
          const existing = editor.getCurrentPageShapes().find(
            (s) => ['code-shape', 'image-shape', 'markdown-shape', 'pdf-shape', 'audio-shape'].includes(s.type) &&
              (s as any).props.filePath === relativePath
          )
          if (existing) {
            editor.select(existing.id)
            editor.zoomToSelection()
            continue
          }

          const x = point.x + offsetX
          const y = point.y

          if (isImage) {
            editor.createShape({
              type: 'image-shape', x, y,
              props: { filePath: relativePath, w: 500, h: 400 },
            })
            offsetX += 520
          } else if (isPdf) {
            editor.createShape({
              type: 'pdf-shape', x, y,
              props: { filePath: relativePath, w: 650, h: 800 },
            })
            offsetX += 670
          } else if (isMarkdown) {
            try { await useFileStore.getState().openFile(vaultPath, relativePath) }
            catch { continue }
            editor.createShape({
              type: 'markdown-shape', x, y,
              props: { filePath: relativePath, w: 600, h: 500 },
            })
            offsetX += 620
          } else if (isAudio) {
            editor.createShape({
              type: 'audio-shape', x, y,
              props: { filePath: relativePath, w: 400, h: 140 },
            })
            offsetX += 420
          } else {
            const language = getLanguageName(relativePath)
            try { await useFileStore.getState().openFile(vaultPath, relativePath) }
            catch { continue }
            editor.createShape({
              type: 'code-shape', x, y,
              props: { filePath: relativePath, language, w: 600, h: 400 },
            })
            offsetX += 620
          }
        }
      }
    }).then((fn) => { unlisten = fn })

    return () => { if (unlisten) unlisten() }
  }, [vaultPath])

  // Handle sidebar file drag-drop (React drag, not Tauri native)
  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    if ((window as any).__humanboard_dragging_file) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleCanvasDrop = useCallback(async (e: React.DragEvent) => {
    const filePath = (window as any).__humanboard_dragging_file as string | undefined
    if (!filePath) return
    e.preventDefault()
    delete (window as any).__humanboard_dragging_file

    const editor = editorRef.current
    if (!editor || !vaultPath) return

    const language = getLanguageName(filePath)

    // Load file if needed
    if (!isBinaryFile(filePath)) {
      try { await useFileStore.getState().openFile(vaultPath, filePath) }
      catch { return }
    }

    window.dispatchEvent(
      new CustomEvent('humanboard:open-file', {
        detail: { filePath, language, dropX: e.clientX, dropY: e.clientY },
      })
    )
  }, [vaultPath])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
      onDragOver={handleCanvasDragOver}
      onDrop={handleCanvasDrop}
    >
      {isDragging && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(82, 139, 255, 0.08)',
            border: '2px dashed rgba(82, 139, 255, 0.4)',
            borderRadius: 8,
            pointerEvents: 'none',
          }}
        >
          <span style={{ color: '#528bff', fontSize: 16, fontWeight: 500 }}>
            Drop files to open on canvas
          </span>
        </div>
      )}
      <Tldraw
        shapeUtils={customShapeUtils}
        onMount={handleMount}
        options={TLDRAW_OPTIONS}
        components={tldrawComponents}
        inferDarkMode
      />
      {/* StatusBar moved to Workspace for visibility in IDE mode */}
    </div>
  )
}
