import { useCallback, useRef, useEffect, useState } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { customShapeUtils } from '../shapes'
import { saveCanvasState, loadCanvasState } from '../lib/canvasPersistence'
import { useVaultStore } from '../stores/vaultStore'
import { useFileStore } from '../stores/fileStore'
import { useFileWatcher } from '../hooks/useFileWatcher'
import { getLanguageName } from '../lib/language'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']
const PDF_EXTENSIONS = ['pdf']
const MARKDOWN_EXTENSIONS = ['md']

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

      if (vaultPath) {
        loadCanvasState(editor, vaultPath)
      }

      // Remove stale terminal shapes (PTY sessions don't survive restart)
      const shapes = editor.getCurrentPageShapes()
      for (const shape of shapes) {
        if (shape.type === 'terminal-shape') {
          editor.deleteShape(shape.id)
        }
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

  useEffect(() => {
    const handleOpenFile = (e: Event) => {
      const editor = editorRef.current
      if (!editor) return
      const { filePath, language } = (e as CustomEvent).detail
      const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
      const isPdf = PDF_EXTENSIONS.includes(ext)
      const isImage = IMAGE_EXTENSIONS.includes(ext)
      const isMarkdown = MARKDOWN_EXTENSIONS.includes(ext)

      // Check if shape already exists for this file
      const existing = editor.getCurrentPageShapes().find(
        (s) => ['code-shape', 'image-shape', 'markdown-shape', 'pdf-shape'].includes(s.type) &&
          (s as any).props.filePath === filePath
      )
      if (existing) {
        editor.select(existing.id)
        editor.zoomToSelection()
        return
      }

      // Create new shape at center of viewport
      const { x, y } = editor.getViewportPageBounds().center
      if (isPdf) {
        editor.createShape({
          type: 'pdf-shape',
          x: x - 325,
          y: y - 400,
          props: { filePath, w: 650, h: 800 },
        })
      } else if (isImage) {
        editor.createShape({
          type: 'image-shape',
          x: x - 250,
          y: y - 200,
          props: { filePath, w: 500, h: 400 },
        })
      } else if (isMarkdown) {
        editor.createShape({
          type: 'markdown-shape',
          x: x - 300,
          y: y - 250,
          props: { filePath, w: 600, h: 500 },
        })
      } else {
        editor.createShape({
          type: 'code-shape',
          x: x - 300,
          y: y - 200,
          props: { filePath, language, w: 600, h: 400 },
        })
      }
    }

    window.addEventListener('humanboard:open-file', handleOpenFile)

    return () => {
      window.removeEventListener('humanboard:open-file', handleOpenFile)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const editor = editorRef.current
    if (!editor || !vaultPath) return

    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return

    // Convert screen position to canvas position
    const point = editor.screenToPage({ x: e.clientX, y: e.clientY })

    let offsetX = 0
    for (const file of files) {
      // Get the file path - for Tauri, files dragged from OS have a path property
      const filePath = (file as any).path as string | undefined
      if (!filePath) continue

      // Security: ensure file is within vault root
      if (!filePath.startsWith(vaultPath)) {
        console.warn('Dropped file is outside vault root:', filePath)
        continue
      }

      // Get relative path
      const relativePath = filePath.slice(vaultPath.length + 1) // +1 for the trailing /

      const ext = relativePath.split('.').pop()?.toLowerCase() ?? ''
      const isImage = IMAGE_EXTENSIONS.includes(ext)
      const isPdf = PDF_EXTENSIONS.includes(ext)
      const isMarkdown = MARKDOWN_EXTENSIONS.includes(ext)

      // Check if already open
      const existing = editor.getCurrentPageShapes().find(
        (s) => ['code-shape', 'image-shape', 'markdown-shape', 'pdf-shape'].includes(s.type) &&
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
          type: 'image-shape',
          x,
          y,
          props: { filePath: relativePath, w: 500, h: 400 },
        })
        offsetX += 520
      } else if (isPdf) {
        editor.createShape({
          type: 'pdf-shape',
          x,
          y,
          props: { filePath: relativePath, w: 650, h: 800 },
        })
        offsetX += 670
      } else if (isMarkdown) {
        try {
          await useFileStore.getState().openFile(vaultPath, relativePath)
        } catch (err) {
          console.error('Failed to open dropped file:', err)
          continue
        }
        editor.createShape({
          type: 'markdown-shape',
          x,
          y,
          props: { filePath: relativePath, w: 600, h: 500 },
        })
        offsetX += 620
      } else {
        const language = getLanguageName(relativePath)
        try {
          await useFileStore.getState().openFile(vaultPath, relativePath)
        } catch (err) {
          console.error('Failed to open dropped file:', err)
          continue
        }
        editor.createShape({
          type: 'code-shape',
          x,
          y,
          props: { filePath: relativePath, language, w: 600, h: 400 },
        })
        offsetX += 620
      }
    }
  }, [vaultPath])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
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
      />
    </div>
  )
}
