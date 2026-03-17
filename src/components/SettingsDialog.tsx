import { useState, useCallback } from 'react'
import { Settings, X, Eye, EyeOff, Check } from 'lucide-react'
import { useAgentStore, type AgentModel } from '../stores/agentStore'

const stopEvent = (e: React.SyntheticEvent) => e.stopPropagation()

const MODEL_OPTIONS: { value: AgentModel; label: string }[] = [
  { value: 'claude-sonnet-4-0', label: 'Claude Sonnet 4' },
  { value: 'claude-opus-4-0', label: 'Claude Opus 4' },
]

export function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onPointerDown={(e) => {
        e.stopPropagation()
        onClick()
      }}
      style={{
        background: 'none',
        border: 'none',
        color: '#666',
        cursor: 'pointer',
        padding: 4,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 4,
        flexShrink: 0,
      }}
      title="Agent Settings"
    >
      <Settings size={12} strokeWidth={1.5} />
    </button>
  )
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const apiKey = useAgentStore((s) => s.apiKey)
  const model = useAgentStore((s) => s.model)
  const setApiKey = useAgentStore((s) => s.setApiKey)
  const setModel = useAgentStore((s) => s.setModel)

  const [keyInput, setKeyInput] = useState(apiKey ?? '')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = useCallback(() => {
    const trimmed = keyInput.trim()
    setApiKey(trimmed || null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [keyInput, setApiKey])

  const handleClear = useCallback(() => {
    setKeyInput('')
    setApiKey(null)
  }, [setApiKey])

  return (
    <div
      onPointerDown={stopEvent}
      onPointerUp={stopEvent}
      onPointerMove={stopEvent}
      onClick={stopEvent}
      onKeyDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: '#111',
          border: '1px solid #333',
          borderRadius: 8,
          padding: 20,
          width: 340,
          maxWidth: '90%',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <span style={{ color: '#ccc', fontSize: 14, fontWeight: 600 }}>
            Agent Settings
          </span>
          <button
            onPointerDown={(e) => {
              e.stopPropagation()
              onClose()
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* API Key */}
        <div style={{ marginBottom: 16 }}>
          <label
            style={{
              color: '#999',
              fontSize: 11,
              display: 'block',
              marginBottom: 4,
            }}
          >
            Anthropic API Key
          </label>
          <div style={{ display: 'flex', gap: 4 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                onPointerDown={stopEvent}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') handleSave()
                }}
                placeholder="sk-ant-..."
                style={{
                  width: '100%',
                  background: '#0a0a0a',
                  border: '1px solid #333',
                  borderRadius: 4,
                  color: '#ccc',
                  fontSize: 12,
                  padding: '6px 30px 6px 8px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <button
                onPointerDown={(e) => {
                  e.stopPropagation()
                  setShowKey(!showKey)
                }}
                style={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#666',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                }}
              >
                {showKey ? (
                  <EyeOff size={12} />
                ) : (
                  <Eye size={12} />
                )}
              </button>
            </div>
            <button
              onPointerDown={(e) => {
                e.stopPropagation()
                handleSave()
              }}
              style={{
                background: saved ? '#1a3a1a' : '#1a1a2e',
                border: '1px solid ' + (saved ? '#2a5a2a' : '#333'),
                borderRadius: 4,
                color: saved ? '#4a9' : '#88f',
                cursor: 'pointer',
                fontSize: 11,
                padding: '4px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {saved ? <Check size={10} /> : null}
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>
          {apiKey && (
            <button
              onPointerDown={(e) => {
                e.stopPropagation()
                handleClear()
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#944',
                cursor: 'pointer',
                fontSize: 11,
                padding: '4px 0',
                marginTop: 4,
              }}
            >
              Clear API key
            </button>
          )}
        </div>

        {/* Model Selection */}
        <div>
          <label
            style={{
              color: '#999',
              fontSize: 11,
              display: 'block',
              marginBottom: 4,
            }}
          >
            Model
          </label>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as AgentModel)}
            onPointerDown={stopEvent}
            style={{
              width: '100%',
              background: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#ccc',
              fontSize: 12,
              padding: '6px 8px',
              outline: 'none',
            }}
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}
