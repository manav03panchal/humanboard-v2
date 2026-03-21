import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  useEditor,
  useIsEditing,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { useThemeStore } from '../lib/theme'
import { useCallback, useRef, useEffect } from 'react'
import { StickyNote } from 'lucide-react'

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'note-shape': { w: number; h: number; content: string }
  }
}

export type NoteShape = TLShape<'note-shape'>

export class NoteShapeUtil extends BaseBoxShapeUtil<NoteShape> {
  static override type = 'note-shape' as const
  static override props: RecordProps<NoteShape> = {
    w: T.number,
    h: T.number,
    content: T.string,
  }

  override getDefaultProps(): NoteShape['props'] {
    return { w: 300, h: 250, content: '' }
  }

  override canEdit() {
    return true
  }

  override canResize() {
    return true
  }

  canRotate() {
    return false
  }

  override component(shape: NoteShape) {
    return <NoteShapeComponent shape={shape} />
  }

  override indicator(shape: NoteShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

const stopEvent = (e: React.SyntheticEvent) => e.stopPropagation()

function NoteShapeComponent({ shape }: { shape: NoteShape }) {
  const editor = useEditor()
  const isEditing = useIsEditing(shape.id)
  const getSurfaceBackground = useThemeStore((s) => s.getSurfaceBackground)
  const getEditorForeground = useThemeStore((s) => s.getEditorForeground)
  const getBorderColor = useThemeStore((s) => s.getBorderColor)
  const contentRef = useRef<HTMLDivElement>(null)

  // Sync shape content into the contenteditable div (only when NOT focused)
  useEffect(() => {
    const el = contentRef.current
    if (el && document.activeElement !== el && el.textContent !== shape.props.content) {
      el.textContent = shape.props.content
    }
  }, [shape.props.content])

  // Focus the contenteditable when entering edit mode
  useEffect(() => {
    if (isEditing && contentRef.current) {
      contentRef.current.focus()
      // Place cursor at end
      const sel = window.getSelection()
      if (sel && contentRef.current.childNodes.length > 0) {
        sel.selectAllChildren(contentRef.current)
        sel.collapseToEnd()
      }
    }
  }, [isEditing])

  // Stop wheel propagation so canvas doesn't pan while scrolling note
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const stopWheel = (e: WheelEvent) => {
      e.stopPropagation()
    }
    el.addEventListener('wheel', stopWheel, true)
    return () => el.removeEventListener('wheel', stopWheel, true)
  }, [])

  const handleContentPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (!isEditing) {
        editor.setEditingShape(shape.id)
      }
    },
    [editor, shape.id, isEditing],
  )



  const surfaceBg = getSurfaceBackground()
  const fg = getEditorForeground()
  const borderColor = getBorderColor()

  return (
    <HTMLContainer
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: surfaceBg,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        overflow: 'hidden',
        pointerEvents: 'all',
      }}
    >
      <NodeTitleBar
        filePath=""
        isDirty={false}
        shapeId={shape.id as string}
        label="Note"
        icon={StickyNote}
      />
      <textarea
        ref={contentRef as any}
        value={shape.props.content}
        onChange={(e) => {
          editor.updateShape<NoteShape>({
            id: shape.id,
            type: 'note-shape',
            props: { content: e.target.value },
          })
        }}
        readOnly={!isEditing}
        onPointerDown={handleContentPointerDown}
        onTouchStart={stopEvent}
        onTouchEnd={stopEvent}
        {...(isEditing
          ? {
              onPointerMove: stopEvent,
              onPointerUp: stopEvent,
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Escape') {
                  editor.setEditingShape(null)
                  return
                }
                e.stopPropagation()
              },
              onKeyUp: stopEvent,
            }
          : {})}
        style={{
          flex: 1,
          padding: 12,
          color: fg,
          fontFamily: '"JetBrains Mono", Menlo, Monaco, monospace',
          fontSize: 14,
          lineHeight: 1.5,
          overflowY: 'auto',
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          cursor: isEditing ? 'text' : 'default',
          background: 'transparent',
          border: 'none',
          resize: 'none',
          width: '100%',
        }}
        placeholder="Type your note..."
      />
    </HTMLContainer>
  )
}
