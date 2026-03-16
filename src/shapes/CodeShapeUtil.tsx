import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  useIsEditing,
  useEditor,
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

function CodeShapeComponent({ shape }: { shape: CodeShape }) {
  const isEditing = useIsEditing(shape.id)
  const editor = useEditor()
  const file = useFileStore((s) => s.files.get(shape.props.filePath))
  const updateContent = useFileStore((s) => s.updateContent)
  const themeState = useThemeStore()

  const langExt = getLanguageExtension(shape.props.filePath)
  const cmTheme = useMemo(() => buildCodeMirrorTheme(themeState), [themeState.zedTheme])
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

  // Single click on code area → enter edit mode
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (!isEditing) {
        editor.setEditingShape(shape.id)
      }
    },
    [editor, shape.id, isEditing]
  )

  // Capture wheel at DOM level to prevent tldraw zoom
  const editorDivRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = editorDivRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, { passive: false })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  const editorBg = themeState.getEditorBackground()
  const borderColor = themeState.getBorderColor()

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
          overflow: 'auto',
          pointerEvents: 'all',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={(e) => { if (isEditing) e.stopPropagation() }}
        onPointerUp={(e) => { if (isEditing) e.stopPropagation() }}
        onKeyDown={(e) => {
          if (!isEditing) return
          const meta = e.metaKey || e.ctrlKey
          if (meta && e.key === 's') return
          if (e.key === 'Escape') return
          e.stopPropagation()
        }}
        onKeyUp={(e) => { if (isEditing) e.stopPropagation() }}
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
          style={{ height: '100%', cursor: 'text' }}
        />
      </div>
    </HTMLContainer>
  )
}
