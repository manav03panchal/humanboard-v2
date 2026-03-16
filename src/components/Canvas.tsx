import { useCallback, useRef, useEffect } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { CodeShapeUtil } from '../shapes/CodeShapeUtil'
import { saveCanvasState, loadCanvasState } from '../lib/canvasPersistence'
import { useVaultStore } from '../stores/vaultStore'

const customShapeUtils = [CodeShapeUtil]

export function Canvas() {
  const editorRef = useRef<Editor | null>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor
      if (vaultPath) {
        loadCanvasState(editor, vaultPath)
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

  useEffect(() => {
    const handleOpenFile = (e: Event) => {
      const editor = editorRef.current
      if (!editor) return
      const { filePath, language } = (e as CustomEvent).detail
      // Check if shape already exists for this file
      const existing = editor.getCurrentPageShapes().find(
        (s) => s.type === 'code-shape' && (s as any).props.filePath === filePath
      )
      if (existing) {
        editor.select(existing.id)
        editor.zoomToSelection()
        return
      }
      // Create new shape at center of viewport
      const { x, y } = editor.getViewportPageBounds().center
      editor.createShape({
        type: 'code-shape',
        x: x - 300,
        y: y - 200,
        props: { filePath, language, w: 600, h: 400 },
      })
    }

    window.addEventListener('humanboard:open-file', handleOpenFile)

    return () => {
      window.removeEventListener('humanboard:open-file', handleOpenFile)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Tldraw
        shapeUtils={customShapeUtils}
        hideUi
        onMount={handleMount}
      />
    </div>
  )
}
