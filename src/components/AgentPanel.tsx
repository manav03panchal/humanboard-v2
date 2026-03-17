import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Bot,
  Send,
  Square,
  Loader2,
  AlertCircle,
  CheckCircle,
  MousePointerClick,
  Type,
  Navigation,
  Camera,
  FileText,
  ArrowUpDown,
} from 'lucide-react'
import { useAgentStore } from '../stores/agentStore'
import { runAgentLoop, stopAgent } from '../lib/agent'
import { createIframeToolExecutor } from '../lib/agentTools'

const stopEvent = (e: React.SyntheticEvent) => e.stopPropagation()

const TOOL_ICONS: Record<string, typeof Bot> = {
  click: MousePointerClick,
  type: Type,
  navigate: Navigation,
  screenshot: Camera,
  get_text: FileText,
  scroll: ArrowUpDown,
}

function getToolIcon(content: string) {
  for (const [tool, Icon] of Object.entries(TOOL_ICONS)) {
    if (content.toLowerCase().startsWith(tool)) return Icon
    // Match action labels like "Clicking...", "Typing...", etc.
    const actionMap: Record<string, string> = {
      clicking: 'click',
      typing: 'type',
      navigating: 'navigate',
      taking: 'screenshot',
      getting: 'get_text',
      scrolling: 'scroll',
    }
    for (const [label, t] of Object.entries(actionMap)) {
      if (content.toLowerCase().startsWith(label) && t === tool) return Icon
    }
  }
  return Bot
}

export function AgentPanel({
  shapeId,
  iframeRef,
  onNavigate,
}: {
  shapeId: string
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  onNavigate: (url: string) => void
}) {
  const shapeState = useAgentStore((s) => s.getShapeState(shapeId))
  const { status, messages, currentAction, iteration, maxIterations } = shapeState
  const apiKey = useAgentStore((s) => s.apiKey)

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, currentAction])

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || status === 'running') return

    setInput('')
    const executor = createIframeToolExecutor(iframeRef, onNavigate)
    useAgentStore.getState().clearShapeMessages(shapeId)
    runAgentLoop(shapeId, trimmed, executor)
  }, [input, status, iframeRef, onNavigate, shapeId])

  const handleStop = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      stopAgent(shapeId)
    },
    [shapeId],
  )

  const isRunning = status === 'running'

  return (
    <div
      onPointerDown={stopEvent}
      onPointerUp={stopEvent}
      onPointerMove={stopEvent}
      onClick={stopEvent}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 220,
        borderTop: '1px solid #1a1a1a',
        backgroundColor: '#0a0a0a',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px',
          borderBottom: '1px solid #1a1a1a',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Bot size={12} strokeWidth={1.5} color="#88f" />
          <span style={{ color: '#888', fontSize: 11 }}>Agent</span>
          {isRunning && (
            <span style={{ color: '#666', fontSize: 10 }}>
              step {iteration}/{maxIterations}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {currentAction && (
            <span
              style={{
                color: '#88f',
                fontSize: 10,
                maxWidth: 180,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {currentAction}
            </span>
          )}
          <StatusBadge status={status} />
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '4px 8px',
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        {messages.length === 0 && !isRunning && (
          <div
            style={{
              color: '#555',
              textAlign: 'center',
              padding: 20,
              fontSize: 11,
            }}
          >
            {apiKey
              ? 'Describe a task for the agent to perform on this page.'
              : 'Set your API key in settings (gear icon) to get started.'}
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageRow key={i} message={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '6px 8px',
          borderTop: '1px solid #1a1a1a',
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPointerDown={stopEvent}
          onFocus={stopEvent}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') handleSubmit()
          }}
          placeholder={
            isRunning ? 'Agent is working...' : 'Ask the agent to do something...'
          }
          disabled={isRunning}
          style={{
            flex: 1,
            background: '#111',
            border: '1px solid #333',
            borderRadius: 4,
            color: '#ccc',
            fontSize: 12,
            padding: '5px 8px',
            outline: 'none',
            opacity: isRunning ? 0.5 : 1,
          }}
        />
        {isRunning ? (
          <button
            onPointerDown={handleStop}
            style={{
              background: '#2a1a1a',
              border: '1px solid #533',
              borderRadius: 4,
              color: '#f66',
              cursor: 'pointer',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Stop agent"
          >
            <Square size={12} strokeWidth={2} />
          </button>
        ) : (
          <button
            onPointerDown={(e) => {
              e.stopPropagation()
              handleSubmit()
            }}
            disabled={!input.trim()}
            style={{
              background: input.trim() ? '#1a1a2e' : '#111',
              border: '1px solid #333',
              borderRadius: 4,
              color: input.trim() ? '#88f' : '#555',
              cursor: input.trim() ? 'pointer' : 'default',
              padding: '4px 8px',
              display: 'flex',
              alignItems: 'center',
            }}
            title="Send"
          >
            <Send size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'running':
      return (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            color: '#88f',
            fontSize: 10,
          }}
        >
          <Loader2 size={10} className="agent-spin" />
          Running
        </span>
      )
    case 'error':
      return (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            color: '#f66',
            fontSize: 10,
          }}
        >
          <AlertCircle size={10} />
          Error
        </span>
      )
    case 'stopped':
      return (
        <span style={{ color: '#fa0', fontSize: 10 }}>Stopped</span>
      )
    case 'max_iterations':
      return (
        <span style={{ color: '#fa0', fontSize: 10 }}>Max steps</span>
      )
    default:
      return null
  }
}

function MessageRow({
  message,
}: {
  message: { role: string; content: string }
}) {
  const { role, content } = message

  switch (role) {
    case 'user':
      return (
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: '#4a9', fontWeight: 600 }}>You: </span>
          <span style={{ color: '#ccc' }}>{content}</span>
        </div>
      )
    case 'assistant':
      return (
        <div style={{ marginBottom: 6 }}>
          <span style={{ color: '#ccc', whiteSpace: 'pre-wrap' }}>{content}</span>
        </div>
      )
    case 'tool_call': {
      const Icon = getToolIcon(content)
      return (
        <div
          style={{
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: '#88f',
          }}
        >
          <Icon size={10} />
          <span style={{ fontSize: 10 }}>{content}</span>
        </div>
      )
    }
    case 'tool_result':
      return (
        <div
          style={{
            marginBottom: 4,
            color: '#777',
            fontSize: 10,
            paddingLeft: 14,
            maxHeight: 40,
            overflow: 'hidden',
          }}
        >
          {content.slice(0, 200)}
        </div>
      )
    case 'error':
      return (
        <div
          style={{
            marginBottom: 6,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 4,
            color: '#f66',
          }}
        >
          <AlertCircle size={10} style={{ marginTop: 2, flexShrink: 0 }} />
          <span style={{ fontSize: 11 }}>{content}</span>
        </div>
      )
    case 'status':
      return (
        <div
          style={{
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: '#999',
          }}
        >
          <CheckCircle size={10} />
          <span style={{ fontSize: 11 }}>{content}</span>
        </div>
      )
    default:
      return null
  }
}
