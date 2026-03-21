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
import { getLanguageExtension, loadLanguageExtension } from '../lib/language'
import { buildCodeMirrorTheme, useThemeStore } from '../lib/theme'
import { useVaultStore } from '../stores/vaultStore'
import { getLspClient, getServerLanguage, getLanguageId } from '../lib/lspManager'
import { lintGutter } from '@codemirror/lint'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { EditorView } from '@codemirror/view'
import { vim } from '@replit/codemirror-vim'
import { useEditorStore } from '../stores/editorStore'
import { useCallback, useRef, useEffect, useMemo, useState } from 'react'
import type { Extension } from '@codemirror/state'

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

  override canScroll() {
    return true
  }

  override component(shape: CodeShape) {
    return <CodeShapeComponent shape={shape} />
  }

  override indicator(shape: CodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

const BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: true,
  highlightActiveLine: true,
  bracketMatching: true,
  autocompletion: false,
} as const

const stopEvent = (e: React.SyntheticEvent) => e.stopPropagation()

function CodeShapeComponent({ shape }: { shape: CodeShape }) {
  const editor = useEditor()
  const isEditing = useIsEditing(shape.id)
  const file = useFileStore((s) => s.files.get(shape.props.filePath))
  const updateContent = useFileStore((s) => s.updateContent)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const vimMode = useEditorStore((s) => s.vimMode)
  const ideMode = useEditorStore((s) => s.ideMode)
  const zedTheme = useThemeStore((s) => s.zedTheme)
  const getEditorBackground = useThemeStore((s) => s.getEditorBackground)
  const getEditorForeground = useThemeStore((s) => s.getEditorForeground)
  const getGutterBackground = useThemeStore((s) => s.getGutterBackground)
  const getLineNumberColor = useThemeStore((s) => s.getLineNumberColor)
  const getActiveLineBackground = useThemeStore((s) => s.getActiveLineBackground)
  const getBorderColor = useThemeStore((s) => s.getBorderColor)

  const filePath = shape.props.filePath

  // --- LSP: get client and create plugin extension ---
  const [lspExt, setLspExt] = useState<Extension[]>([])
  const lspInitialized = useRef(false)

  useEffect(() => {
    // Skip LSP when IDE mode is active — IDE editors own LSP in that mode
    if (!vaultPath || ideMode) return
    if (lspInitialized.current) return
    const serverLang = getServerLanguage(filePath)
    if (!serverLang) return

    lspInitialized.current = true

    getLspClient(serverLang, vaultPath).then((client) => {
      if (!client) {
        lspInitialized.current = false
        return
      }
      const fileUri = `file://${vaultPath}/${filePath}`
      const langId = getLanguageId(filePath) ?? serverLang
      const ext = client.plugin(fileUri, langId)
      setLspExt([ext, lintGutter()])
    }).catch(() => {
      lspInitialized.current = false
    })
    return () => {
      // Tear down canvas LSP when ideMode changes or component unmounts
      lspInitialized.current = false
      setLspExt([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultPath, filePath, ideMode])

  const [langExt, setLangExt] = useState<Extension | null>(() => getLanguageExtension(filePath))
  useEffect(() => {
    let cancelled = false
    loadLanguageExtension(filePath).then((ext) => {
      if (!cancelled && ext) setLangExt(ext)
    })
    return () => { cancelled = true }
  }, [filePath])

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
    () => [EditorView.lineWrapping, ...(vimMode ? [vim()] : []), ...cmTheme, ...(langExt ? [langExt] : []), ...lspExt],
    [cmTheme, langExt, lspExt, vimMode]
  )

  const handleChange = useCallback(
    (value: string) => {
      updateContent(shape.props.filePath, value)
    },
    [shape.props.filePath, updateContent]
  )

  const handleContentPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (!isEditing) {
        editor.setEditingShape(shape.id)
      }
    },
    [editor, shape.id, isEditing]
  )

  // Stop wheel at DOM level
  const editorDivRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = editorDivRef.current
    if (!el) return
    const stopWheel = (e: WheelEvent) => e.stopPropagation()
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
        className="shape-content"
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
        onPointerDown={handleContentPointerDown}
        onTouchStart={stopEvent}
        onTouchEnd={stopEvent}
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
          height="100%"
          basicSetup={BASIC_SETUP}
          style={{ height: '100%', cursor: isEditing ? 'text' : 'default' }}
        />
      </div>
    </HTMLContainer>
  )
}
