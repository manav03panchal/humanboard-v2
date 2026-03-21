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
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github-dark.min.css'

// Allow KaTeX and highlight.js class names through sanitization
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'style'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    span: [...(defaultSchema.attributes?.span ?? []), 'className', 'style'],
    div: [...(defaultSchema.attributes?.div ?? []), 'className', 'style'],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), 'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon'],
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
import { convertFileSrc } from '@tauri-apps/api/core'
import { useVaultStore } from '../stores/vaultStore'
import { useFileStore } from '../stores/fileStore'
import { getLanguageExtension } from '../lib/language'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { buildCodeMirrorTheme, useThemeStore } from '../lib/theme'
import { EditorView } from '@codemirror/view'
import { vim } from '@replit/codemirror-vim'
import { useEditorStore } from '../stores/editorStore'
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

  override canScroll() {
    return true
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
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const vimMode = useEditorStore((s) => s.vimMode)
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
    () => [EditorView.lineWrapping, ...(vimMode ? [vim()] : []), ...cmTheme, ...(langExt ? [langExt] : [])],
    [cmTheme, langExt, vimMode]
  )

  // Split content into text chunks and image references
  const contentParts = useMemo(() => {
    if (!file?.content) return [{ type: 'text' as const, content: '' }]
    const parts: { type: 'text' | 'image'; content: string }[] = []
    const regex = /!\[\[([^\]]+)\]\]/g
    let lastIndex = 0
    let match
    while ((match = regex.exec(file.content)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: file.content.slice(lastIndex, match.index) })
      }
      parts.push({ type: 'image', content: match[1] })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < file.content.length) {
      parts.push({ type: 'text', content: file.content.slice(lastIndex) })
    }
    if (parts.length === 0) parts.push({ type: 'text', content: file.content })
    return parts
  }, [file?.content])

  // Resolve image path to asset URL
  const resolveImagePath = useCallback((filename: string) => {
    if (!vaultPath) return ''
    const dir = shape.props.filePath.includes('/')
      ? shape.props.filePath.substring(0, shape.props.filePath.lastIndexOf('/'))
      : ''
    const imagePath = dir ? `${dir}/${filename}` : filename
    return convertFileSrc(`${vaultPath}/${imagePath}`)
  }, [vaultPath, shape.props.filePath])

  // Custom components for ReactMarkdown — resolve relative image paths
  const mdComponents = useMemo(() => ({
    img: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => {
      if (!src) return null
      // Already resolved URLs (from our preprocessor or absolute URLs) — use as-is
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('asset:')) {
        return <img src={src} alt={alt ?? ''} style={{ maxWidth: '100%', borderRadius: 4, margin: '8px 0', display: 'block' }} {...props} />
      }
      // Relative path — resolve via convertFileSrc
      if (!vaultPath) return null
      const dir = shape.props.filePath.includes('/')
        ? shape.props.filePath.substring(0, shape.props.filePath.lastIndexOf('/'))
        : ''
      const imagePath = dir ? `${dir}/${src}` : src
      const fullPath = convertFileSrc(`${vaultPath}/${imagePath}`)
      return (
        <img
          src={fullPath}
          alt={alt ?? ''}
          style={{ maxWidth: '100%', borderRadius: 4, margin: '8px 0', display: 'block' }}
          onError={(e) => {
            const target = e.currentTarget
            if (!target.dataset.retried) {
              target.dataset.retried = 'true'
              target.src = convertFileSrc(`${vaultPath}/${src}`)
            }
          }}
          {...props}
        />
      )
    },
  }), [vaultPath, shape.props.filePath])

  const handleChange = useCallback(
    (value: string) => {
      updateContent(shape.props.filePath, value)
    },
    [shape.props.filePath, updateContent]
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
    el.addEventListener('wheel', stop, true)
    return () => el.removeEventListener('wheel', stop, true)
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
        className="shape-content" ref={editorDivRef}
        style={{
          flex: 1,
          overflow: 'auto',
          pointerEvents: 'all',
        }}
        onPointerDown={(e) => {
          e.stopPropagation()
          if (viewMode === 'raw' && !isEditing) {
            editor.setEditingShape(shape.id)
          }
        }}
        onTouchStart={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        onPointerMove={(e) => { if (isEditing || viewMode === 'rendered') e.stopPropagation() }}
        onPointerUp={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (!isEditing || viewMode !== 'raw') return
          const meta = e.metaKey || e.ctrlKey
          if (meta && (e.key === 's' || e.key === 'c')) return
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
              userSelect: 'text',
              cursor: 'text',
            }}
            className="markdown-body"
          >
            {contentParts.map((part, i) =>
              part.type === 'image' ? (
                <img
                  key={i}
                  src={resolveImagePath(part.content)}
                  alt={part.content}
                  style={{ maxWidth: '100%', borderRadius: 4, margin: '8px 0', display: 'block' }}
                  onError={(e) => {
                    const target = e.currentTarget
                    if (!target.dataset.retried && vaultPath) {
                      target.dataset.retried = 'true'
                      target.src = convertFileSrc(`${vaultPath}/${part.content}`)
                    }
                  }}
                />
              ) : (
                <ReactMarkdown
                  key={i}
                  components={mdComponents}
                  remarkPlugins={remarkPlugins}
                  rehypePlugins={rehypePlugins}
                >
                  {part.content}
                </ReactMarkdown>
              )
            )}
          </div>
        ) : (
          <CodeMirror
            value={file.content}
            onChange={handleChange}
            extensions={extensions}
            theme="none"
            editable={isEditing}
            basicSetup={BASIC_SETUP}
            style={{ height: '100%', cursor: 'text' }}
          />
        )}
      </div>
    </HTMLContainer>
  )
}
