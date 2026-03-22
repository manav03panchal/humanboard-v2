import { useEffect, useState, memo } from 'react'
import { Columns2, LayoutGrid, PanelLeft } from 'lucide-react'
import { useVaultStore } from '../stores/vaultStore'
import { useThemeStore } from '../lib/theme'
import { useEditorStore } from '../stores/editorStore'

export const StatusBar = memo(function StatusBar({ ideMode }: { ideMode?: boolean }) {
  const [zoom, setZoom] = useState(100)
  const [lspStatuses, setLspStatuses] = useState<Map<string, string>>(new Map())
  const sidebarOpen = useVaultStore((s) => s.sidebarOpen)
  const toggleSidebar = useVaultStore((s) => s.toggleSidebar)
  const themeName = useThemeStore((s) => s.themeName)
  const vimMode = useEditorStore((s) => s.vimMode)
  const toggleVimMode = useEditorStore((s) => s.toggleVimMode)

  useEffect(() => {
    const zoomHandler = (e: Event) => {
      setZoom(Math.round((e as CustomEvent).detail * 100))
    }
    const lspHandler = (e: Event) => {
      const { language, status } = (e as CustomEvent).detail
      setLspStatuses((prev) => {
        const next = new Map(prev)
        next.set(language, status)
        return next
      })
    }
    window.addEventListener('humanboard:zoom-changed', zoomHandler)
    window.addEventListener('humanboard:lsp-status', lspHandler)
    return () => {
      window.removeEventListener('humanboard:zoom-changed', zoomHandler)
      window.removeEventListener('humanboard:lsp-status', lspHandler)
    }
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 24,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 12,
        padding: '0 12px',
        backgroundColor: 'var(--hb-surface)',
        borderTop: '1px solid var(--hb-border)',
        fontSize: 11,
        fontFamily: '"JetBrains Mono", monospace',
        color: 'var(--hb-text-muted)',
        userSelect: 'none',
      }}
    >
      <button
        onClick={toggleSidebar}
        title={sidebarOpen ? 'Hide sidebar (Ctrl+B)' : 'Show sidebar (Ctrl+B)'}
        style={{
          display: 'flex', alignItems: 'center',
          background: 'none', border: 'none',
          color: 'var(--hb-text-muted)',
          cursor: 'pointer', padding: '0 4px', fontSize: 11, fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hb-text-muted)' }}
      >
        <PanelLeft size={13} />
      </button>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('humanboard:toggle-ide-mode'))}
        title={ideMode ? 'Canvas mode (Ctrl+E)' : 'IDE mode (Ctrl+E)'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'none',
          border: 'none',
          color: ideMode ? '#528bff' : 'var(--hb-text-muted)',
          cursor: 'pointer',
          padding: '0 4px',
          fontSize: 11,
          fontFamily: 'inherit',
          marginRight: 'auto',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = ideMode ? '#528bff' : 'var(--hb-text-muted)' }}
      >
        {ideMode ? <LayoutGrid size={12} /> : <Columns2 size={12} />}
        <span>{ideMode ? 'Canvas' : 'IDE'}</span>
      </button>
      {Array.from(lspStatuses.entries()).map(([lang, status]) => (
        <span key={lang} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor:
                status === 'ready' ? '#98c379' :
                status === 'error' ? '#ff453a' :
                status === 'connecting' ? 'var(--hb-text-muted)' :
                '#e5c07b',
              display: 'inline-block',
              animation: status !== 'ready' && status !== 'error' ? 'pulse 1.5s infinite' : 'none',
            }}
          />
          <span style={{ color: 'var(--hb-text-muted)' }}>
            {lang}{status !== 'ready' ? `: ${status}` : ''}
          </span>
        </span>
      ))}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('humanboard:toggle-theme-picker'))}
        title="Change theme (Ctrl+K, T)"
        style={{
          display: 'flex', alignItems: 'center',
          background: 'none', border: 'none',
          color: 'var(--hb-text-muted)', cursor: 'pointer', padding: '0 4px',
          fontSize: 11, fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hb-text-muted)' }}
      >
        {themeName}
      </button>
      <button
        onClick={toggleVimMode}
        title="Toggle Vim mode"
        style={{
          display: 'flex', alignItems: 'center',
          background: 'none', border: 'none',
          color: vimMode ? '#528bff' : 'var(--hb-text-muted)',
          cursor: 'pointer', padding: '0 4px',
          fontSize: 11, fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = vimMode ? '#528bff' : 'var(--hb-text-muted)' }}
      >
        {vimMode ? 'VIM' : 'vim'}
      </button>
      <span>{zoom}%</span>
    </div>
  )
})
