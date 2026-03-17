import {
  BaseBoxShapeUtil,
  HTMLContainer,
  T,
  useEditor,
  type Editor,
  type RecordProps,
  type TLShape,
} from 'tldraw'
import { useCallback, useState, useRef, useEffect } from 'react'
import { Globe, ArrowLeft, ArrowRight, RotateCw, X, Bot } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { Webview } from '@tauri-apps/api/webview'
import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi'
import { AgentPanel } from '../components/AgentPanel'
import { SettingsButton, SettingsDialog } from '../components/SettingsDialog'
import { useAgentStore } from '../stores/agentStore'

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'browser-shape': { w: number; h: number; url: string }
  }
}

export type BrowserShape = TLShape<'browser-shape'>

/** Height of the browser title bar in shape-space pixels */
const TITLE_BAR_HEIGHT = 44

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

/** Sanitize tldraw shape ID into a valid webview label (alphanumeric + -/:_) */
function webviewLabel(shapeId: string): string {
  return 'browser-' + shapeId.replace(/[^a-zA-Z0-9\-/:_]/g, '_')
}

/** Compute the screen-space bounds for the webview content area (below title bar) */
function computeWebviewBounds(editor: Editor, shape: BrowserShape) {
  const zoom = editor.getZoomLevel()
  const topLeft = editor.pageToScreen({ x: shape.x, y: shape.y })

  // Content starts below the title bar
  const x = topLeft.x
  const y = topLeft.y + TITLE_BAR_HEIGHT * zoom
  const width = shape.props.w * zoom
  const height = (shape.props.h - TITLE_BAR_HEIGHT) * zoom

  return { x, y, width: Math.max(width, 1), height: Math.max(height, 1) }
}

/** Check if the shape overlaps the viewport */
function isShapeVisible(editor: Editor, shape: BrowserShape): boolean {
  const bounds = editor.getShapePageBounds(shape)
  if (!bounds) return false
  const viewport = editor.getViewportPageBounds()
  return !(
    bounds.maxX < viewport.x ||
    bounds.x > viewport.maxX ||
    bounds.maxY < viewport.y ||
    bounds.y > viewport.maxY
  )
}

function BrowserShapeComponent({ shape }: { shape: BrowserShape }) {
  const editor = useEditor()
  const [urlInput, setUrlInput] = useState(shape.props.url)
  const [agentOpen, setAgentOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const visibleRef = useRef(true)
  const creatingRef = useRef(false)
  const createdRef = useRef(false)

  // Load agent settings on mount
  useEffect(() => {
    useAgentStore.getState().loadSettings()
  }, [])

  // Sync URL input when shape prop changes externally
  useEffect(() => {
    setUrlInput(shape.props.url)
  }, [shape.props.url])

  const label = webviewLabel(shape.id)

  // Create/destroy native webview via Tauri commands
  useEffect(() => {
    let destroyed = false

    async function createNativeWebview() {
      if (creatingRef.current) return
      creatingRef.current = true

      try {
        if (destroyed) return

        const { x, y, width, height } = computeWebviewBounds(editor, shape)
        const visible = isShapeVisible(editor, shape)

        await invoke('create_webview', {
          label,
          url: shape.props.url,
          x: visible ? x : -10000,
          y: visible ? y : -10000,
          width,
          height,
        })

        if (destroyed) {
          // Component unmounted during creation
          await invoke('close_webview', { label }).catch(() => {})
          return
        }

        createdRef.current = true
        visibleRef.current = visible
      } catch (err) {
        console.error('Failed to create browser webview:', err)
      } finally {
        creatingRef.current = false
      }
    }

    createNativeWebview()

    return () => {
      destroyed = true
      if (createdRef.current) {
        invoke('close_webview', { label }).catch(() => {})
        createdRef.current = false
      }
      // Clean up per-shape agent state (stops running agent if any)
      useAgentStore.getState().removeShape(shape.id)
    }
    // Only recreate when shape.id changes (not on every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.id])

  // Handle URL changes — navigate the existing webview
  useEffect(() => {
    if (!createdRef.current) return

    invoke('navigate_webview', { label, url: shape.props.url }).catch((err) => {
      console.error('Failed to navigate webview:', err)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape.props.url])

  // Position sync: listen to store changes (camera + shape geometry)
  useEffect(() => {
    let rafId = 0

    function syncPosition() {
      if (!createdRef.current) return

      // Get latest shape data from the store
      const latestShape = editor.getShape(shape.id) as BrowserShape | undefined
      if (!latestShape) return

      const visible = isShapeVisible(editor, latestShape)
      const { x, y, width, height } = computeWebviewBounds(editor, latestShape)

      // Use Webview.getByLabel for position sync (JS API)
      Webview.getByLabel(label).then((wv) => {
        if (!wv) return

        if (!visible) {
          if (visibleRef.current) {
            visibleRef.current = false
            wv.hide().catch(() => {})
          }
          return
        }

        if (!visibleRef.current) {
          visibleRef.current = true
          wv.show().catch(() => {})
        }

        wv.setPosition(new LogicalPosition(x, y)).catch(() => {})
        wv.setSize(new LogicalSize(width, height)).catch(() => {})
      }).catch(() => {})
    }

    function scheduleSync() {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(syncPosition)
    }

    // Listen to all store changes (camera moves, shape drags, resizes)
    const unsub = editor.store.listen(scheduleSync, { scope: 'all' })

    // Initial sync after a tick (webview may not be created yet)
    const timeout = setTimeout(scheduleSync, 50)

    return () => {
      unsub()
      cancelAnimationFrame(rafId)
      clearTimeout(timeout)
    }
  }, [editor, shape.id, label])

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
      invoke('webview_go_back', { label }).catch((err) => {
        console.error('Back navigation failed:', err)
      })
    },
    [label],
  )

  const handleForward = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      invoke('webview_go_forward', { label }).catch((err) => {
        console.error('Forward navigation failed:', err)
      })
    },
    [label],
  )

  const handleRefresh = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      invoke('webview_reload', { label }).catch((err) => {
        console.error('Reload failed:', err)
      })
    },
    [label],
  )

  const handleClose = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      editor.deleteShape(shape.id)
    },
    [editor, shape.id],
  )

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
      {/* Title bar with URL input and navigation */}
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

      {/* Placeholder for native webview content area */}
      <div
        style={{
          flex: 1,
          backgroundColor: '#111',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#333',
          fontSize: 13,
          userSelect: 'none',
        }}
      >
        <Globe size={32} strokeWidth={1} color="#222" />
      </div>

      {/* Agent Panel */}
      {agentOpen && (
        <AgentPanel shapeId={shape.id} iframeRef={iframeRef} onNavigate={navigateTo} />
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
