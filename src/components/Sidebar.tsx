import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useVaultStore } from '../stores/vaultStore'
import { SidebarVaultDropdown } from './SidebarVaultDropdown'
import { SidebarSearch } from './SidebarSearch'
import { SidebarFileList } from './SidebarFileList'
import { useToastStore } from './Toast'
import { ArrowUpDown, PanelLeftClose } from 'lucide-react'

interface SidebarProps {
  onFileClick: (path: string) => void
}

export function Sidebar({ onFileClick }: SidebarProps) {
  const sidebarOpen = useVaultStore((s) => s.sidebarOpen)
  const sidebarSort = useVaultStore((s) => s.sidebarSort)
  const setSidebarSort = useVaultStore((s) => s.setSidebarSort)
  const toggleSidebar = useVaultStore((s) => s.toggleSidebar)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const loadFileTree = useVaultStore((s) => s.loadFileTree)
  const [searchQuery, setSearchQuery] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [width, setWidth] = useState(260)
  const isResizing = useRef(false)

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = width

    const onMove = (e: PointerEvent) => {
      const newWidth = Math.max(180, Math.min(500, startWidth + (e.clientX - startX)))
      setWidth(newWidth)
    }

    const onUp = () => {
      isResizing.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [width])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    if (!vaultPath) return

    const files = Array.from(e.dataTransfer.files)
    for (const file of files) {
      const filePath = (file as any).path as string | undefined
      if (!filePath) continue
      if (filePath.startsWith(vaultPath)) continue

      try {
        const fileName = filePath.split('/').pop() ?? 'file'
        await invoke('copy_file_into_vault', {
          sourcePath: filePath,
          vaultRoot: vaultPath,
          destRelative: fileName,
        })
      } catch (err) {
        useToastStore.getState().addToast(`Failed to copy: ${err}`)
      }
    }
    loadFileTree()
  }, [vaultPath, loadFileTree])

  return (
    <div
      style={{
        width: sidebarOpen ? width : 0,
        minWidth: sidebarOpen ? width : 0,
        height: '100%',
        backgroundColor: '#000',
        borderRight: sidebarOpen ? `1px solid ${isDragOver ? 'rgba(82, 139, 255, 0.4)' : '#1a1a1a'}` : 'none',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 50,
        position: 'relative',
        overflow: 'hidden',
        transition: 'width 0.2s ease, min-width 0.2s ease',
      }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true) }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false) }}
      onDrop={handleDrop}
    >
      <div style={{ height: 38 }} /> {/* titlebar spacer — clears traffic lights */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '4px 6px 4px 4px', borderBottom: '1px solid #1a1a1a', gap: 2 }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <SidebarVaultDropdown />
        </div>
        <button
          onClick={toggleSidebar}
          style={{
            background: 'none',
            border: 'none',
            color: '#444',
            cursor: 'pointer',
            padding: 6,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            borderRadius: 4,
          }}
          title="Close sidebar (Cmd+B)"
          onMouseEnter={(e) => (e.currentTarget.style.color = '#999')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#444')}
        >
          <PanelLeftClose size={13} strokeWidth={1.5} />
        </button>
      </div>
      <div style={{ padding: '6px 8px' }}>
        <SidebarSearch value={searchQuery} onChange={setSearchQuery} />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 12px 4px',
        }}
      >
        <button
          onClick={() => setSidebarSort(sidebarSort === 'date' ? 'alpha' : 'date')}
          style={{
            background: 'none',
            border: 'none',
            color: '#555',
            cursor: 'pointer',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <ArrowUpDown size={12} />
          {sidebarSort === 'date' ? 'Created' : 'A-Z'}
        </button>
      </div>
      <SidebarFileList searchQuery={searchQuery} onFileClick={onFileClick} />
      {/* Resize handle */}
      <div
        onPointerDown={handleResizeStart}
        style={{
          position: 'absolute',
          top: 0,
          right: -3,
          bottom: 0,
          width: 6,
          cursor: 'col-resize',
          zIndex: 100,
        }}
      />
    </div>
  )
}
