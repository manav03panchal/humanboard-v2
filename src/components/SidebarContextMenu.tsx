import { useState, useEffect, useRef, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react'
import { useVaultStore } from '../stores/vaultStore'
import { useToastStore } from './Toast'

export interface ContextMenuState {
  x: number
  y: number
  path: string
  isDir: boolean
}

interface SidebarContextMenuProps {
  menu: ContextMenuState
  onClose: () => void
}

type InputMode = 'new-file' | 'new-folder' | 'rename' | null

export function SidebarContextMenu({ menu, onClose }: SidebarContextMenuProps) {
  const [inputMode, setInputMode] = useState<InputMode>(null)
  const [inputValue, setInputValue] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (inputMode || showDeleteConfirm) {
          setInputMode(null)
          setShowDeleteConfirm(false)
        } else {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, inputMode, showDeleteConfirm])

  // Focus input when mode changes
  useEffect(() => {
    if (inputMode && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [inputMode])

  // Position: clamp to viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(menu.y, window.innerHeight - 220),
    left: Math.min(menu.x, window.innerWidth - 200),
    zIndex: 10000,
    backgroundColor: 'var(--hb-border)',
    border: '1px solid var(--hb-border)',
    borderRadius: 6,
    padding: 4,
    minWidth: 180,
    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
  }

  const getTargetDir = () => {
    if (menu.isDir) return menu.path
    const lastSlash = menu.path.lastIndexOf('/')
    return lastSlash === -1 ? '' : menu.path.substring(0, lastSlash)
  }

  const refreshTree = useCallback(() => {
    useVaultStore.getState().loadFileTree()
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!vaultPath || !inputValue.trim()) return
    const name = inputValue.trim()
    const targetDir = getTargetDir()
    const filePath = targetDir ? `${targetDir}/${name}` : name

    try {
      if (inputMode === 'new-file') {
        await invoke('create_file', { vaultRoot: vaultPath, filePath })
      } else if (inputMode === 'new-folder') {
        await invoke('create_dir', { vaultRoot: vaultPath, dirPath: filePath })
      } else if (inputMode === 'rename') {
        const lastSlash = menu.path.lastIndexOf('/')
        const parentDir = lastSlash === -1 ? '' : menu.path.substring(0, lastSlash)
        const newPath = parentDir ? `${parentDir}/${name}` : name
        await invoke('rename_entry', { vaultRoot: vaultPath, oldPath: menu.path, newPath })
      }
      refreshTree()
      onClose()
    } catch (err) {
      useToastStore.getState().addToast(String(err))
    }
  }, [vaultPath, inputValue, inputMode, menu.path, refreshTree, onClose])

  const handleDelete = useCallback(async () => {
    if (!vaultPath) return
    try {
      await invoke('delete_entry', { vaultRoot: vaultPath, entryPath: menu.path })
      refreshTree()
      onClose()
    } catch (err) {
      useToastStore.getState().addToast(String(err))
    }
  }, [vaultPath, menu.path, refreshTree, onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
    }
  }

  const menuItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--hb-fg)',
    fontSize: 13,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    borderRadius: 4,
  }

  const fileName = menu.path.split('/').pop() ?? menu.path

  if (showDeleteConfirm) {
    return (
      <div ref={menuRef} style={style}>
        <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--hb-text-muted)' }}>
          Delete "{fileName}"?
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '4px 8px 8px' }}>
          <button
            onClick={() => { setShowDeleteConfirm(false) }}
            style={{
              ...menuItemStyle,
              justifyContent: 'center',
              backgroundColor: '#222',
              borderRadius: 4,
              flex: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hb-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#222')}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            style={{
              ...menuItemStyle,
              justifyContent: 'center',
              backgroundColor: '#331111',
              color: '#ff6666',
              borderRadius: 4,
              flex: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#441818')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#331111')}
          >
            Delete
          </button>
        </div>
      </div>
    )
  }

  if (inputMode) {
    const label = inputMode === 'new-file' ? 'New file name' : inputMode === 'new-folder' ? 'New folder name' : 'Rename to'
    return (
      <div ref={menuRef} style={style}>
        <div style={{ padding: '4px 8px', fontSize: 12, color: 'var(--hb-text-muted)' }}>{label}</div>
        <div style={{ padding: '4px 8px 8px' }}>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              backgroundColor: 'var(--hb-hover)',
              border: '1px solid var(--hb-border)',
              borderRadius: 4,
              padding: '4px 8px',
              color: 'var(--hb-fg)',
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--hb-text-muted)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--hb-border)')}
          />
        </div>
      </div>
    )
  }

  return (
    <div ref={menuRef} style={style}>
      <button
        style={menuItemStyle}
        onClick={() => { setInputMode('new-file'); setInputValue('') }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hb-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <FilePlus size={14} strokeWidth={1.5} color="var(--hb-text-muted)" />
        New File
      </button>
      <button
        style={menuItemStyle}
        onClick={() => { setInputMode('new-folder'); setInputValue('') }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hb-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <FolderPlus size={14} strokeWidth={1.5} color="var(--hb-text-muted)" />
        New Folder
      </button>
      <div style={{ height: 1, backgroundColor: 'var(--hb-border)', margin: '4px 0' }} />
      <button
        style={menuItemStyle}
        onClick={() => { setInputMode('rename'); setInputValue(fileName) }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hb-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <Pencil size={14} strokeWidth={1.5} color="var(--hb-text-muted)" />
        Rename
      </button>
      <button
        style={{ ...menuItemStyle, color: '#ff6666' }}
        onClick={() => setShowDeleteConfirm(true)}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hb-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <Trash2 size={14} strokeWidth={1.5} color="#ff6666" />
        Delete
      </button>
    </div>
  )
}
