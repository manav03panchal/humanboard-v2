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
import ReactMarkdown from 'react-markdown'
import { useFileStore } from '../stores/fileStore'
import { getLanguageExtension } from '../lib/language'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { buildCodeMirrorTheme, useThemeStore } from '../lib/theme'
import { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import { Eye, Code } from 'lucide-react'

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'markdown-shape': {
      w: number
      h: number
      filePath: string
    }
  }
}

export type MarkdownShape = TLShape<'markdown-shape'>

export class MarkdownShapeUtil extends BaseBoxShapeUtil<MarkdownShape> {
  static override type = 'markdown-shape' as const
  static override props: RecordProps<MarkdownShape> = {
    w: T.number,
    h: T.number,
    filePath: T.string,
  }

  override getDefaultProps(): MarkdownShape['props'] {
    return { w: 600, h: 500, filePath: '' }
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

  override component(shape: MarkdownShape) {
    return <MarkdownShapeComponent shape={shape} />
  }

  override indicator(shape: MarkdownShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

function MarkdownShapeComponent({ shape }: { shape: MarkdownShape }) {
  const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered')
  const isEditing = useIsEditing(shape.id)
  const editor = useEditor()
  const file = useFileStore((s) => s.files.get(shape.props.filePath))
  const updateContent = useFileStore((s) => s.updateContent)
  const zedTheme = useThemeStore((s) => s.zedTheme)
  const getEditorBackground = useThemeStore((s) => s.getEditorBackground)
  const getEditorForeground = useThemeStore((s) => s.getEditorForeground)
  const getGutterBackground = useThemeStore((s) => s.getGutterBackground)
  const getLineNumberColor = useThemeStore((s) => s.getLineNumberColor)
  const getActiveLineBackground = useThemeStore((s) => s.getActiveLineBackground)
  const getBorderColor = useThemeStore((s) => s.getBorderColor)

  const langExt = useMemo(() => getLanguageExtension('file.md'), [])
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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (!isEditing) {
        editor.setEditingShape(shape.id)
      }
    },
    [editor, shape.id, isEditing]
  )

  const handleToggleMode = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      setViewMode((m) => (m === 'rendered' ? 'raw' : 'rendered'))
    },
    []
  )

  const editorDivRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = editorDivRef.current
    if (!el) return
    const stop = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stop, { passive: false })
    return () => el.removeEventListener('wheel', stop)
  }, [])

  const editorBg = getEditorBackground()
  const editorFg = getEditorForeground()
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

  const ToggleIcon = viewMode === 'rendered' ? Code : Eye

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
        extraActions={
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleToggleMode(e as any) }}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              borderRadius: 4,
            }}
            title={viewMode === 'rendered' ? 'Edit raw markdown' : 'Preview rendered'}
          >
            <ToggleIcon size={14} strokeWidth={1.5} />
          </button>
        }
      />
      <div
        ref={editorDivRef}
        style={{
          flex: 1,
          overflow: 'auto',
          pointerEvents: 'all',
        }}
        onPointerDown={viewMode === 'raw' ? handlePointerDown : undefined}
        onPointerMove={(e) => { if (isEditing && viewMode === 'raw') e.stopPropagation() }}
        onPointerUp={(e) => { if (isEditing && viewMode === 'raw') e.stopPropagation() }}
        onKeyDown={(e) => {
          if (!isEditing || viewMode !== 'raw') return
          const meta = e.metaKey || e.ctrlKey
          if (meta && e.key === 's') return
          if (e.key === 'Escape') return
          e.stopPropagation()
        }}
        onKeyUp={(e) => { if (isEditing && viewMode === 'raw') e.stopPropagation() }}
      >
        {viewMode === 'rendered' ? (
          <div
            style={{
              padding: '16px 20px',
              color: editorFg,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: 14,
              lineHeight: 1.7,
            }}
            className="markdown-body"
          >
            <ReactMarkdown>{file.content}</ReactMarkdown>
          </div>
        ) : (
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
              autocompletion: false,
            }}
            style={{ height: '100%', cursor: 'text' }}
          />
        )}
      </div>
    </HTMLContainer>
  )
}
