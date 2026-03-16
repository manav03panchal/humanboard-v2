import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { ChevronDown, FolderOpen, Folder } from 'lucide-react'
import { useVaultStore } from '../stores/vaultStore'
import { useToastStore } from './Toast'

export function SidebarVaultDropdown() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const recentVaults = useVaultStore((s) => s.recentVaults)
  const setVaultPath = useVaultStore((s) => s.setVaultPath)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const display = vaultPath?.replace(/^\/Users\/[^/]+/, '~') ?? 'No vault'

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        dropdownRef.current && !dropdownRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false)
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [isOpen])

  const handleOpenFolder = async () => {
    setIsOpen(false)
    const selected = await open({ directory: true, multiple: false })
    if (!selected) return
    try {
      await invoke('init_vault', { path: selected })
      setVaultPath(selected)
    } catch (err) {
      useToastStore.getState().addToast(String(err))
    }
  }

  const handleSwitchVault = async (path: string) => {
    setIsOpen(false)
    try {
      await invoke('init_vault', { path })
      setVaultPath(path)
    } catch (err) {
      useToastStore.getState().addToast(`Vault not found: ${path}`)
    }
  }

  const otherVaults = recentVaults.filter((v) => v !== vaultPath)

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 11,
            color: '#777',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {display}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={1.5}
          color="#444"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().bottom : 0,
            left: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().left : 0,
            width: dropdownRef.current ? dropdownRef.current.getBoundingClientRect().width : 260,
            backgroundColor: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: '0 0 8px 8px',
            zIndex: 9999,
            maxHeight: 300,
            overflow: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          <button onClick={handleOpenFolder} style={menuItemStyle}>
            <FolderOpen size={14} strokeWidth={1.5} color="#666" />
            <span>Open Folder...</span>
          </button>

          {otherVaults.length > 0 && (
            <>
              <div style={{ height: 1, backgroundColor: '#1a1a1a', margin: '4px 0' }} />
              <div style={{ padding: '4px 12px', fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Recent
              </div>
              {otherVaults.map((vault) => (
                <button
                  key={vault}
                  onClick={() => handleSwitchVault(vault)}
                  style={menuItemStyle}
                >
                  <Folder size={14} strokeWidth={1.5} color="#666" />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {vault.replace(/^\/Users\/[^/]+/, '~')}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  background: 'none',
  border: 'none',
  color: '#ccc',
  fontSize: 12,
  cursor: 'pointer',
  width: '100%',
  textAlign: 'left',
  borderRadius: 4,
}
