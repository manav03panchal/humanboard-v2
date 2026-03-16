import { useCallback, useRef, useEffect, useState } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { customShapeUtils } from '../shapes'
import { saveCanvasState, loadCanvasState } from '../lib/canvasPersistence'
import { useVaultStore } from '../stores/vaultStore'
import { useFileStore } from '../stores/fileStore'
import { useFileWatcher } from '../hooks/useFileWatcher'
import { getLanguageName } from '../lib/language'
import { useToastStore } from './Toast'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']
const PDF_EXTENSIONS = ['pdf']
const MARKDOWN_EXTENSIONS = ['md']
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
const ALL_SHAPE_TYPES = ['code-shape', 'image-shape', 'markdown-shape', 'pdf-shape', 'audio-shape']

function getShapeConfig(filePath: string, language: string) {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  if (PDF_EXTENSIONS.includes(ext)) return { type: 'pdf-shape' as const, w: 650, h: 800 }
  if (IMAGE_EXTENSIONS.includes(ext)) return { type: 'image-shape' as const, w: 500, h: 400 }
  if (MARKDOWN_EXTENSIONS.includes(ext)) return { type: 'markdown-shape' as const, w: 600, h: 500 }
  if (AUDIO_EXTENSIONS.includes(ext)) return { type: 'audio-shape' as const, w: 400, h: 140 }
  return { type: 'code-shape' as const, w: 600, h: 400, language }
}

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

function ZoomIndicator() {
  const [zoom, setZoom] = useState(100)

  useEffect(() => {
    const handler = (e: Event) => {
      setZoom(Math.round((e as CustomEvent).detail * 100))
    }
    window.addEventListener('humanboard:zoom-changed', handler)
    return () => window.removeEventListener('humanboard:zoom-changed', handler)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 12,
        right: 12,
        zIndex: 9998,
        padding: '4px 10px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        border: '1px solid #1a1a1a',
        borderRadius: 6,
        color: '#666',
        fontSize: 11,
        fontFamily: '"Iosevka Nerd Font Mono", "Iosevka", monospace',
        userSelect: 'none',
      }}
    >
      {zoom}%
    </div>
  )
}

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
      }

      // Enable grid (dot pattern)
      editor.updateInstanceState({ isGridMode: true })

      // Emit zoom level changes
      const emitZoom = () => {
        window.dispatchEvent(
          new CustomEvent('humanboard:zoom-changed', { detail: editor.getZoomLevel() })
        )
      }
      emitZoom()
      editor.store.listen(emitZoom, { scope: 'session' })

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
      editor.store.listen(
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
    },
    [vaultPath]
  )

  // Cmd+` shortcut to create terminal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault()
        const editor = editorRef.current
        if (!editor) return
        const { x, y } = editor.getViewportPageBounds().center
        editor.createShape({
          type: 'terminal-shape',
          x: x - 350,
          y: y - 210,
          props: { w: 700, h: 420, shell: '' },
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Cmd+N shortcut to create note
  useEffect(() => {
    const handleNoteKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        const editor = editorRef.current
        if (!editor) return
        const { x, y } = editor.getViewportPageBounds().center
        editor.createShape({
          type: 'note-shape',
          x: x - 150,
          y: y - 125,
          props: { w: 300, h: 250, content: '' },
        })
      }
    }
    window.addEventListener('keydown', handleNoteKeyDown)
    return () => window.removeEventListener('keydown', handleNoteKeyDown)
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
      const { filePath, language, dropX, dropY } = (e as CustomEvent).detail

      // Check if shape already exists
      const existing = editor.getCurrentPageShapes().find(
        (s) => ALL_SHAPE_TYPES.includes(s.type) && (s as any).props.filePath === filePath
      )
      if (existing) {
        editor.select(existing.id)
        editor.zoomToSelection()
        return
      }

      // Load file content into FileStore if it's a text file
      const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
      const BINARY_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
      if (!BINARY_EXTS.includes(ext) && vaultPath) {
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
          const isImage = IMAGE_EXTENSIONS.includes(ext)
          const isPdf = PDF_EXTENSIONS.includes(ext)
          const isMarkdown = MARKDOWN_EXTENSIONS.includes(ext)
          const isAudio = AUDIO_EXTENSIONS.includes(ext)

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
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const BINARY_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
    if (!BINARY_EXTS.includes(ext)) {
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
        hideUi
        onMount={handleMount}
        options={{ maxPages: 1 }}
        inferDarkMode
      />
      <ZoomIndicator />
    </div>
  )
}
