import { BaseBoxShapeUtil, HTMLContainer, T, type RecordProps, type TLShape } from 'tldraw'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { useFileStore } from '../stores/fileStore'
import { getLanguageExtension } from '../lib/language'
import { NodeTitleBar } from '../components/NodeTitleBar'
import { useCallback } from 'react'

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

const oledTheme = EditorView.theme(
  {
    '&': {
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      fontSize: '13px',
      backgroundColor: '#000',
    },
    '.cm-content': { caretColor: '#fff' },
    '.cm-gutters': { backgroundColor: '#000', border: 'none', color: '#555' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.05)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255,255,255,0.05)' },
    '&.cm-focused': { outline: 'none' },
  },
  { dark: true }
)

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

  override component(shape: CodeShape) {
    return <CodeShapeComponent shape={shape} />
  }

  override indicator(shape: CodeShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

function CodeShapeComponent({ shape }: { shape: CodeShape }) {
  const file = useFileStore((s) => s.files.get(shape.props.filePath))
  const updateContent = useFileStore((s) => s.updateContent)

  const langExt = getLanguageExtension(shape.props.filePath)
  const extensions = [oledTheme, ...(langExt ? [langExt] : [])]

  const handleChange = useCallback(
    (value: string) => {
      updateContent(shape.props.filePath, value)
    },
    [shape.props.filePath, updateContent]
  )

  if (!file) {
    return (
      <HTMLContainer
        style={{
          backgroundColor: '#000',
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
        backgroundColor: '#000',
        border: '1px solid #1a1a1a',
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
        style={{ flex: 1, overflow: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <CodeMirror
          value={file.content}
          onChange={handleChange}
          extensions={extensions}
          theme="none"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            bracketMatching: true,
            autocompletion: true,
          }}
          style={{ height: '100%' }}
        />
      </div>
    </HTMLContainer>
  )
}
