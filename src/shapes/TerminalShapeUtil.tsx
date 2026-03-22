import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  useEditor,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { LigaturesAddon } from '@xterm/addon-ligatures'
import { spawn } from 'tauri-pty'
import { useThemeStore } from '../lib/theme'
import { TERMINAL_THEME } from '../lib/terminalManager'
import { usePtyStore } from '../stores/ptyStore'
import { useVaultStore } from '../stores/vaultStore'
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

  override canScroll() {
    return true
  }

  override component(shape: TerminalShape) {
    return <TerminalShapeComponent shape={shape} />
  }

  override indicator(shape: TerminalShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

function TerminalShapeComponent({ shape }: { shape: TerminalShape }) {
  const editor = useEditor()
  const [focused, setFocused] = useState(false)
  const termContainerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const ptyRef = useRef<ReturnType<typeof spawn> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isCleaningUp = useRef(false)
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
      fontSize: 14,
      scrollback: 1000,
      drawBoldTextInBrightColors: false,
      theme: {
        background: editorBg,
        foreground: editorFg,
        cursor: editorFg,
        cursorAccent: editorBg,
        selectionBackground: 'rgba(255, 255, 255, 0.15)',
        ...TERMINAL_THEME,
      },
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(termContainerRef.current)

    // Ligatures — load before WebGL
    try {
      term.loadAddon(new LigaturesAddon({ fontFeatureSettings: '"calt" on, "liga" on' }))
    } catch {}

    // Use WebGL renderer for performance (falls back to DOM if unsupported)
    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => webglAddon.dispose())
      term.loadAddon(webglAddon)
    } catch {
      console.warn('WebGL renderer not available, using DOM renderer')
    }

    // Wait for font to load before fitting
    document.fonts.ready.then(() => {
      setTimeout(() => {
        try {
          fitAddon.fit()
        } catch {}
      }, 50)
    })

    termRef.current = term
    fitAddonRef.current = fitAddon

    // Spawn PTY
    const shellPath = shape.props.shell || '/bin/zsh'
    const cwd = useVaultStore.getState().vaultPath || undefined
    try {
      const pty = spawn(shellPath, [], {
        cols: term.cols,
        rows: term.rows,
        cwd: cwd || undefined,
        name: 'xterm-256color',
      })

      ptyRef.current = pty
      addSession(shape.id, shape.id, shellPath)

      // PTY data -> xterm
      pty.onData((data: any) => {
        try {
          if (typeof data === 'string') {
            term.write(data)
          } else if (data instanceof Uint8Array) {
            term.write(data)
          } else if (Array.isArray(data)) {
            term.write(new Uint8Array(data))
          } else if (data && typeof data === 'object') {
            // Could be array-like from Tauri IPC serialization
            const arr = Object.values(data) as number[]
            term.write(new Uint8Array(arr))
          } else {
            term.write(String(data))
          }
        } catch (e) {
          console.error('xterm write error:', e, 'data type:', typeof data)
        }
      })

      // xterm input -> PTY
      term.onData((data: string) => {
        try {
          pty.write(data)
        } catch (e) {
          console.error('pty write error:', e)
        }
      })

      // Handle PTY exit — close the node (only if user exited, not cleanup)
      pty.onExit(() => {
        removeSession(shape.id)
        if (!isCleaningUp.current) {
          setTimeout(() => {
            editor.deleteShape(shape.id as any)
          }, 100)
        }
      })
    } catch (err) {
      console.error('PTY spawn failed:', err)
      setError(`Failed to spawn terminal: ${err}`)
    }

    return () => {
      isCleaningUp.current = true
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
      if (termRef.current) {
        termRef.current.focus()
        setFocused(true)
      }
    },
    []
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
          backgroundColor: 'var(--hb-bg)',
          borderBottom: '1px solid var(--hb-border)',
        }}>
          <TerminalIcon size={14} strokeWidth={1.5} />
          <span style={{ flex: 1, fontSize: 12, color: 'var(--hb-text-muted)' }}>Terminal</span>
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
          backgroundColor: 'var(--hb-bg)',
          borderBottom: '1px solid var(--hb-border)',
          cursor: 'grab',
          userSelect: 'none',
          minHeight: 32,
        }}
      >
        <TerminalIcon size={14} strokeWidth={1.5} color="var(--hb-text-muted)" />
        <span style={{ flex: 1, fontSize: 12, color: 'var(--hb-text-muted)' }}>
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
            onPointerDown={(e) => { e.stopPropagation(); handleClose(e) }}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--hb-text-muted)',
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
        className="shape-content terminal-container"
        style={{
          flex: 1,
          overflow: 'hidden',
          pointerEvents: 'all',
          height: '100%',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={(e) => { if (focused) e.stopPropagation() }}
        onPointerUp={(e) => { if (focused) e.stopPropagation() }}
        onKeyDown={(e) => {
          if (!focused) return
          e.stopPropagation()
        }}
        onKeyUp={(e) => { if (focused) e.stopPropagation() }}
        onWheel={(e) => e.stopPropagation()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </HTMLContainer>
  )
}
