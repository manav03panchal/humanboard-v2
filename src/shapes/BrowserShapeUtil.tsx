import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  useEditor,
  useIsEditing,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { useCallback, useState, useRef, useEffect } from 'react'
import { Globe, ArrowLeft, ArrowRight, RotateCw, X, Bot } from 'lucide-react'
import { AgentPanel } from '../components/AgentPanel'
import { SettingsButton, SettingsDialog } from '../components/SettingsDialog'
import { useAgentStore } from '../stores/agentStore'

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'browser-shape': { w: number; h: number; url: string }
  }
}

export type BrowserShape = TLShape<'browser-shape'>

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export class BrowserShapeUtil extends BaseBoxShapeUtil<BrowserShape> {
  static override type = 'browser-shape' as const
  static override props: RecordProps<BrowserShape> = {
    w: T.number,
    h: T.number,
    url: T.string,
  }

  override getDefaultProps(): BrowserShape['props'] {
    return { w: 800, h: 600, url: 'https://example.com' }
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

  override component(shape: BrowserShape) {
    return <BrowserShapeComponent shape={shape} />
  }

  override indicator(shape: BrowserShape) {
    return <rect width={shape.props.w} height={shape.props.h} />
  }
}

const stopEvent = (e: React.SyntheticEvent) => e.stopPropagation()

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 4,
  flexShrink: 0,
}

function BrowserShapeComponent({ shape }: { shape: BrowserShape }) {
  const editor = useEditor()
  const isEditing = useIsEditing(shape.id)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [urlInput, setUrlInput] = useState(shape.props.url)
  const [agentOpen, setAgentOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Load agent settings on mount
  useEffect(() => {
    useAgentStore.getState().loadSettings()
  }, [])

  // Sync URL input when shape prop changes externally
  useEffect(() => {
    setUrlInput(shape.props.url)
  }, [shape.props.url])

  const navigateTo = useCallback(
    (url: string) => {
      if (isValidUrl(url)) {
        editor.updateShape<BrowserShape>({
          id: shape.id,
          type: 'browser-shape',
          props: { url },
        })
      }
    },
    [editor, shape.id],
  )

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation()
      if (e.key === 'Enter') {
        navigateTo(urlInput)
      }
    },
    [navigateTo, urlInput],
  )

  const handleBack = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      try {
        iframeRef.current?.contentWindow?.history.back()
      } catch {
        // cross-origin restriction — silently ignore
      }
    },
    [],
  )

  const handleForward = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      try {
        iframeRef.current?.contentWindow?.history.forward()
      } catch {
        // cross-origin restriction — silently ignore
      }
    },
    [],
  )

  const handleRefresh = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (iframeRef.current) {
        iframeRef.current.src = shape.props.url
      }
    },
    [shape.props.url],
  )

  const handleClose = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      editor.deleteShape(shape.id)
    },
    [editor, shape.id],
  )

  // Stop wheel events from propagating to the canvas
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const stopWheel = (e: WheelEvent) => {
      e.stopPropagation()
    }
    el.addEventListener('wheel', stopWheel, true)
    return () => el.removeEventListener('wheel', stopWheel, true)
  }, [])

  return (
    <HTMLContainer
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: 8,
        overflow: 'hidden',
        pointerEvents: 'all',
      }}
    >
      {/* Custom title bar */}
      <div
        onPointerDown={stopEvent}
        onPointerUp={stopEvent}
        onPointerMove={stopEvent}
        onClick={stopEvent}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 8px',
          backgroundColor: '#0a0a0a',
          borderBottom: '1px solid #1a1a1a',
          userSelect: 'none',
          minHeight: 32,
          pointerEvents: 'all',
        }}
      >
        <Globe size={14} strokeWidth={1.5} color="#666" style={{ flexShrink: 0 }} />
        <button onPointerDown={handleBack} style={iconButtonStyle} title="Back">
          <ArrowLeft size={12} strokeWidth={1.5} />
        </button>
        <button onPointerDown={handleForward} style={iconButtonStyle} title="Forward">
          <ArrowRight size={12} strokeWidth={1.5} />
        </button>
        <button onPointerDown={handleRefresh} style={iconButtonStyle} title="Refresh">
          <RotateCw size={12} strokeWidth={1.5} />
        </button>
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleUrlKeyDown}
          onPointerDown={stopEvent}
          onFocus={stopEvent}
          placeholder="https://..."
          style={{
            flex: 1,
            background: '#111',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#ccc',
            fontSize: 12,
            padding: '3px 8px',
            outline: 'none',
            minWidth: 0,
          }}
        />
        <SettingsButton onClick={() => setSettingsOpen(true)} />
        <button
          onPointerDown={(e) => {
            e.stopPropagation()
            setAgentOpen(!agentOpen)
          }}
          style={{
            ...iconButtonStyle,
            color: agentOpen ? '#88f' : '#666',
          }}
          title="Toggle Agent Panel"
        >
          <Bot size={12} strokeWidth={1.5} />
        </button>
        <button onPointerDown={handleClose} style={iconButtonStyle} title="Close">
          <X size={12} strokeWidth={1.5} />
        </button>
      </div>

      {/* iframe content */}
      <div
        ref={containerRef}
        style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
      >
        <iframe
          ref={iframeRef}
          src={shape.props.url}
          sandbox="allow-scripts allow-same-origin"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            pointerEvents: isEditing ? 'auto' : 'none',
          }}
        />
      </div>

      {/* Agent Panel */}
      {agentOpen && (
        <AgentPanel iframeRef={iframeRef} onNavigate={navigateTo} />
      )}

      {/* Settings Dialog */}
      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} />
      )}

      {/* CSS for spinner animation */}
      <style>{`
        .agent-spin {
          animation: agent-spin 1s linear infinite;
        }
        @keyframes agent-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </HTMLContainer>
  )
}
