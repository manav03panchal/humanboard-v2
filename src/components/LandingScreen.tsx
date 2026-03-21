import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { FolderOpen, Folder } from 'lucide-react'
import { useVaultStore } from '../stores/vaultStore'
import { useToastStore } from './Toast'

export function LandingScreen() {
  const setVaultPath = useVaultStore((s) => s.setVaultPath)
  const recentVaults = useVaultStore((s) => s.recentVaults)
  const addToast = useToastStore((s) => s.addToast)

  const handleOpenFolder = async () => {
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return
    try {
      await invoke('init_vault', { path: selected })
      setVaultPath(selected)
    } catch (err) {
      addToast(String(err))
    }
  }

  const handleOpenRecent = async (path: string) => {
    try {
      await invoke('init_vault', { path })
      setVaultPath(path)
    } catch (err) {
      addToast(`Vault directory not found: ${path}`)
    }
  }

  const handleDrag = (e: React.MouseEvent) => {
    if (e.buttons === 1) getCurrentWindow().startDragging()
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--hb-bg)',
        color: 'var(--hb-fg)',
        gap: 32,
      }}
    >
      <div
        onMouseDown={handleDrag}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 28,
          zIndex: 9999,
        }}
      />
      <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', marginTop: -48 }}>
        Humanboard
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
        <button onClick={handleOpenFolder} style={actionButtonStyle}>
          <FolderOpen size={18} strokeWidth={1.5} />
          Open Folder / Codebase
        </button>
      </div>

      {recentVaults.length > 0 && (
        <div style={{ width: 280 }}>
          <p style={{ fontSize: 12, color: 'var(--hb-text-muted)', marginBottom: 8 }}>Recent</p>
          {recentVaults.map((vault) => (
            <button
              key={vault}
              onClick={() => handleOpenRecent(vault)}
              style={recentButtonStyle}
            >
              <Folder size={14} strokeWidth={1.5} color="var(--hb-text-muted)" />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {vault.replace(/^\/Users\/[^/]+/, '~')}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const actionButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 16px',
  backgroundColor: 'var(--hb-surface)',
  border: '1px solid var(--hb-border)',
  borderRadius: 8,
  color: 'var(--hb-fg)',
  fontSize: 14,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
}

const recentButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  backgroundColor: 'transparent',
  border: 'none',
  borderRadius: 6,
  color: 'var(--hb-text-muted)',
  fontSize: 13,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
}
