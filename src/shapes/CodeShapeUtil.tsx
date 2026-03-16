import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  useEditor,
  useIsEditing,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import CodeMirror from '@uiw/react-codemirror'
import { useFileStore } from '../stores/fileStore'
import { getLanguageExtension } from '../lib/language'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { buildCodeMirrorTheme, useThemeStore } from '../lib/theme'
import { useCallback, useRef, useEffect, useMemo } from 'react'

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'code-shape': {
      w: number
      h: number
      filePath: string
      language: string
    }
  }
}

export type CodeShape = TLShape<'code-shape'>

export class CodeShapeUtil extends BaseBoxShapeUtil<CodeShape> {
  static override type = 'code-shape' as const
  static override props: RecordProps<CodeShape> = {
    w: T.number,
    h: T.number,
    filePath: T.string,
    language: T.string,
  }

  override getDefaultProps(): CodeShape['props'] {
    return { w: 600, h: 400, filePath: '', language: 'typescript' }
  }

  // canEdit=true means tldraw will pass events through when editing
  override canEdit() {
    return true
  }

  override canResize() {
    return true
  }

  canRotate() {
    return false
  }

  override component(shape: CodeShape) {
    return <CodeShapeComponent shape={shape} />
  }

  override indicator(shape: CodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

// Stop event helper — used on the interactive content area
const stopEvent = (e: React.SyntheticEvent) => e.stopPropagation()

function CodeShapeComponent({ shape }: { shape: CodeShape }) {
  const editor = useEditor()
  const isEditing = useIsEditing(shape.id)
  const file = useFileStore((s) => s.files.get(shape.props.filePath))
  const updateContent = useFileStore((s) => s.updateContent)
  const zedTheme = useThemeStore((s) => s.zedTheme)
  const getEditorBackground = useThemeStore((s) => s.getEditorBackground)
  const getEditorForeground = useThemeStore((s) => s.getEditorForeground)
  const getGutterBackground = useThemeStore((s) => s.getGutterBackground)
  const getLineNumberColor = useThemeStore((s) => s.getLineNumberColor)
  const getActiveLineBackground = useThemeStore((s) => s.getActiveLineBackground)
  const getBorderColor = useThemeStore((s) => s.getBorderColor)

  const langExt = useMemo(
    () => getLanguageExtension(shape.props.filePath),
    [shape.props.filePath]
  )
  const cmTheme = useMemo(
    () => buildCodeMirrorTheme({
      zedTheme,
      getEditorBackground,
      getEditorForeground,
      getGutterBackground,
      getLineNumberColor,
      getActiveLineBackground,
    }),
    [zedTheme, getEditorBackground, getEditorForeground, getGutterBackground, getLineNumberColor, getActiveLineBackground]
  )
  const extensions = useMemo(
    () => [...cmTheme, ...(langExt ? [langExt] : [])],
    [cmTheme, langExt]
  )

  const handleChange = useCallback(
    (value: string) => {
      updateContent(shape.props.filePath, value)
    },
    [shape.props.filePath, updateContent]
  )

  // Click content area -> enter edit mode
  const handleContentPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (!isEditing) {
        editor.setEditingShape(shape.id)
      }
    },
    [editor, shape.id, isEditing]
  )

  // Stop wheel at DOM level — always, regardless of edit state
  const editorDivRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = editorDivRef.current
    if (!el) return
    const stopWheel = (e: WheelEvent) => {
      e.stopPropagation()
    }
    el.addEventListener('wheel', stopWheel, true)
    return () => el.removeEventListener('wheel', stopWheel, true)
  }, [])

  const editorBg = getEditorBackground()
  const borderColor = getBorderColor()

  if (!file) {
    return (
      <HTMLContainer
        style={{
          backgroundColor: editorBg,
          color: '#888',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Loading...
      </HTMLContainer>
    )
  }

  return (
    <HTMLContainer
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: editorBg,
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        overflow: 'hidden',
        // Per tldraw docs: opt into receiving pointer events
        pointerEvents: 'all',
      }}
    >
      <NodeTitleBar
        filePath={shape.props.filePath}
        isDirty={file.isDirty}
        shapeId={shape.id}
      />
      <div
        ref={editorDivRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
        // Per tldraw docs: stop propagation so canvas doesn't steal events
        onPointerDown={handleContentPointerDown}
        onTouchStart={stopEvent}
        onTouchEnd={stopEvent}
        // When editing, also stop move/up/key events
        {...(isEditing ? {
          onPointerMove: stopEvent,
          onPointerUp: stopEvent,
          onKeyDown: (e: React.KeyboardEvent) => {
            const meta = e.metaKey || e.ctrlKey
            if (meta && (e.key === 's' || e.key === 'b' || e.key === 'f')) return
            if (e.key === 'Escape') {
              editor.setEditingShape(null)
              return
            }
            e.stopPropagation()
          },
          onKeyUp: stopEvent,
        } : {})}
      >
        <CodeMirror
          value={file.content}
          onChange={handleChange}
          extensions={extensions}
          theme="none"
          editable={isEditing}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            bracketMatching: true,
            autocompletion: true,
          }}
          height="100%"
          style={{ height: '100%', cursor: isEditing ? 'text' : 'default' }}
        />
      </div>
    </HTMLContainer>
  )
}
