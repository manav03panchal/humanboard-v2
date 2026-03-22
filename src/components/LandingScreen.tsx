import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { FolderOpen, Folder, ArrowRight } from 'lucide-react'
import { useVaultStore } from '../stores/vaultStore'
import { useToastStore } from './Toast'

export function LandingScreen() {
  const setVaultPath = useVaultStore((s) => s.setVaultPath)
  const recentVaults = useVaultStore((s) => s.recentVaults)
  const addToast = useToastStore((s) => s.addToast)
  const [hoveredRecent, setHoveredRecent] = useState<string | null>(null)
  const [openHover, setOpenHover] = useState(false)

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
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--hb-bg)',
        color: 'var(--hb-fg)',
        fontFamily: '"JetBrains Mono", monospace',
      }}
    >
      {/* Drag region */}
      <div
        onMouseDown={handleDrag}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 28, zIndex: 9999 }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 48, width: 360 }}>
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            margin: 0,
            color: 'var(--hb-fg)',
          }}>
            Humanboard
          </h1>
        </div>

        {/* Open folder button */}
        <button
          onClick={handleOpenFolder}
          onMouseEnter={() => setOpenHover(true)}
          onMouseLeave={() => setOpenHover(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '14px 20px',
            backgroundColor: openHover ? 'var(--hb-hover)' : 'var(--hb-surface)',
            border: '1px solid var(--hb-border)',
            borderRadius: 10,
            color: 'var(--hb-fg)',
            fontSize: 13,
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
            transition: 'all 150ms ease',
            fontFamily: 'inherit',
          }}
        >
          <FolderOpen size={18} strokeWidth={1.5} />
          <span style={{ flex: 1 }}>Open Folder</span>
          <ArrowRight size={14} strokeWidth={1.5} style={{ color: 'var(--hb-text-muted)', opacity: openHover ? 1 : 0, transition: 'opacity 150ms ease' }} />
        </button>

        {/* Recent projects */}
        {recentVaults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{
              fontSize: 10,
              color: 'var(--hb-text-muted)',
              margin: '0 0 8px 0',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}>
              Recent
            </p>
            {recentVaults.map((vault) => {
              const isHovered = hoveredRecent === vault
              const parts = vault.replace(/^\/Users\/[^/]+/, '~').split('/')
              const name = parts.pop() ?? vault
              const dir = parts.join('/')

              return (
                <button
                  key={vault}
                  onClick={() => handleOpenRecent(vault)}
                  onMouseEnter={() => setHoveredRecent(vault)}
                  onMouseLeave={() => setHoveredRecent(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 12px',
                    backgroundColor: isHovered ? 'var(--hb-hover)' : 'transparent',
                    border: 'none',
                    borderRadius: 8,
                    color: 'var(--hb-fg)',
                    fontSize: 13,
                    cursor: 'pointer',
                    width: '100%',
                    textAlign: 'left',
                    transition: 'background 120ms ease',
                    fontFamily: 'inherit',
                  }}
                >
                  <Folder size={15} strokeWidth={1.5} style={{ color: 'var(--hb-text-muted)', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{name}</span>
                    <span style={{ fontSize: 10, color: 'var(--hb-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dir}</span>
                  </span>
                  <ArrowRight size={12} strokeWidth={1.5} style={{ color: 'var(--hb-text-muted)', opacity: isHovered ? 1 : 0, transition: 'opacity 120ms ease', flexShrink: 0 }} />
                </button>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
