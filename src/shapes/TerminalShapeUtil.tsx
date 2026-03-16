import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  useIsEditing,
  useEditor,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { spawn } from 'tauri-pty'
import { useThemeStore } from '../lib/theme'
import { usePtyStore } from '../stores/ptyStore'
import { useCallback, useRef, useEffect, useState } from 'react'
import { Terminal as TerminalIcon, X } from 'lucide-react'

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'terminal-shape': {
      w: number
      h: number
      shell: string
    }
  }
}

export type TerminalShape = TLShape<'terminal-shape'>

export class TerminalShapeUtil extends BaseBoxShapeUtil<TerminalShape> {
  static override type = 'terminal-shape' as const
  static override props: RecordProps<TerminalShape> = {
    w: T.number,
    h: T.number,
    shell: T.string,
  }

  override getDefaultProps(): TerminalShape['props'] {
    return { w: 700, h: 420, shell: '' }
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

  override component(shape: TerminalShape) {
    return <TerminalShapeComponent shape={shape} />
  }

  override indicator(shape: TerminalShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

function TerminalShapeComponent({ shape }: { shape: TerminalShape }) {
  const isEditing = useIsEditing(shape.id)
  const editor = useEditor()
  const termContainerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const ptyRef = useRef<ReturnType<typeof spawn> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const addSession = usePtyStore((s) => s.addSession)
  const removeSession = usePtyStore((s) => s.removeSession)
  const getEditorBackground = useThemeStore((s) => s.getEditorBackground)
  const getEditorForeground = useThemeStore((s) => s.getEditorForeground)
  const getBorderColor = useThemeStore((s) => s.getBorderColor)

  const editorBg = getEditorBackground()
  const editorFg = getEditorForeground()
  const borderColor = getBorderColor()

  // Initialize terminal and PTY
  useEffect(() => {
    if (!termContainerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono NF", "JetBrains Mono", Menlo, Monaco, monospace',
      fontSize: 13,
      theme: {
        background: editorBg,
        foreground: editorFg,
        cursor: editorFg,
        cursorAccent: editorBg,
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(termContainerRef.current)

    // Small delay to let the container size settle before fitting
    setTimeout(() => {
      try {
        fitAddon.fit()
      } catch {}
    }, 50)

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Spawn PTY
    const shellPath = shape.props.shell || '/bin/zsh'
    const decoder = new TextDecoder()
    try {
      const pty = spawn(shellPath, [], {
        cols: term.cols,
        rows: term.rows,
      })

      ptyRef.current = pty
      addSession(shape.id, shape.id, shellPath)

      // PTY data -> xterm (onData returns Uint8Array)
      pty.onData((data: Uint8Array) => {
        term.write(decoder.decode(data))
      })

      // xterm input -> PTY
      term.onData((data: string) => {
        pty.write(data)
      })

      // Handle PTY exit
      pty.onExit(() => {
        term.write('\r\n[Process exited]\r\n')
        removeSession(shape.id)
      })
    } catch (err) {
      setError(`Failed to spawn terminal: ${err}`)
    }

    return () => {
      if (ptyRef.current) {
        try {
          ptyRef.current.kill()
        } catch {}
        removeSession(shape.id)
      }
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Handle resize
  useEffect(() => {
    if (!fitAddonRef.current || !termRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddonRef.current?.fit()
        if (ptyRef.current && termRef.current) {
          ptyRef.current.resize(termRef.current.cols, termRef.current.rows)
        }
      } catch {}
    })

    if (termContainerRef.current) {
      resizeObserver.observe(termContainerRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (!isEditing) {
        editor.setEditingShape(shape.id)
      }
    },
    [editor, shape.id, isEditing]
  )

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (ptyRef.current) {
        try {
          ptyRef.current.kill()
        } catch {}
        removeSession(shape.id)
      }
      editor.deleteShape(shape.id as any)
    },
    [editor, shape.id, removeSession]
  )

  if (error) {
    return (
      <HTMLContainer
        style={{
          backgroundColor: editorBg,
          color: '#f44',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #f44',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          backgroundColor: '#0a0a0a',
          borderBottom: '1px solid #1a1a1a',
        }}>
          <TerminalIcon size={14} strokeWidth={1.5} />
          <span style={{ flex: 1, fontSize: 12, color: '#999' }}>Terminal</span>
        </div>
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {error}
        </div>
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          backgroundColor: '#0a0a0a',
          borderBottom: '1px solid #1a1a1a',
          cursor: 'grab',
          userSelect: 'none',
          minHeight: 32,
        }}
      >
        <TerminalIcon size={14} strokeWidth={1.5} color="#999" />
        <span style={{ flex: 1, fontSize: 12, color: '#999' }}>
          Terminal — {shape.props.shell || '/bin/zsh'}
        </span>
        <div
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', gap: 2, pointerEvents: 'all' }}
        >
          <button
            onPointerDown={(e) => { e.stopPropagation(); handleClose(e as any) }}
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
            title="Close terminal"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        </div>
      </div>
      <div
        ref={termContainerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          pointerEvents: 'all',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={(e) => { if (isEditing) e.stopPropagation() }}
        onPointerUp={(e) => { if (isEditing) e.stopPropagation() }}
        onKeyDown={(e) => {
          if (!isEditing) return
          e.stopPropagation()
        }}
        onKeyUp={(e) => { if (isEditing) e.stopPropagation() }}
        onWheel={(e) => e.stopPropagation()}
      />
    </HTMLContainer>
  )
}
