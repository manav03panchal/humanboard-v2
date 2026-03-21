import { useState, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useVaultStore } from '../stores/vaultStore'
import { SidebarVaultDropdown } from './SidebarVaultDropdown'
import { SidebarSearch } from './SidebarSearch'
import { SidebarFileList } from './SidebarFileList'
import { SidebarContextMenu, type ContextMenuState } from './SidebarContextMenu'
import { useToastStore } from './Toast'
import { ArrowUpDown, PanelLeftClose } from 'lucide-react'
import { usePlatform } from '../hooks/usePlatform'

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
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [width, setWidth] = useState(260)
  const isResizing = useRef(false)
  const os = usePlatform()
  const titlebarSpacerHeight = os === 'macos' ? 38 : os === 'linux' ? 0 : 32

  const sidebarRef = useRef<HTMLDivElement>(null)
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = width

    const onMove = (e: PointerEvent) => {
      const newWidth = Math.max(180, Math.min(500, startWidth + (e.clientX - startX)))
      // Update DOM directly during drag — no React re-render per pixel
      if (sidebarRef.current) sidebarRef.current.style.width = `${newWidth}px`
    }

    const onUp = (e: PointerEvent) => {
      isResizing.current = false
      // Sync final width to React state once on drop
      const finalWidth = Math.max(180, Math.min(500, startWidth + (e.clientX - startX)))
      setWidth(finalWidth)
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
      ref={sidebarRef}
      style={{
        width: sidebarOpen ? width : 0,
        minWidth: sidebarOpen ? width : 0,
        height: '100%',
        backgroundColor: 'var(--hb-bg)',
        borderRight: sidebarOpen ? `1px solid ${isDragOver ? 'rgba(82, 139, 255, 0.4)' : 'var(--hb-border)'}` : 'none',
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
      <div style={{ height: titlebarSpacerHeight }} /> {/* titlebar spacer — clears traffic lights on macOS, custom titlebar on Win/Linux */}
      <div style={{ display: 'flex', alignItems: 'center', height: 36, padding: '0 6px', borderBottom: '1px solid var(--hb-border)', gap: 2, flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <SidebarVaultDropdown />
        </div>
        <button
          onClick={toggleSidebar}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--hb-text-muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            borderRadius: 4,
          }}
          title="Close sidebar (Cmd+B)"
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--hb-text-muted)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--hb-text-muted)')}
        >
          <PanelLeftClose size={13} strokeWidth={1.5} />
        </button>
      </div>
      <div style={{ padding: '5px 8px', display: 'flex', gap: 4, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <SidebarSearch value={searchQuery} onChange={setSearchQuery} />
        </div>
        <button
          onClick={() => setSidebarSort(sidebarSort === 'date' ? 'alpha' : 'date')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--hb-text-muted)',
            cursor: 'pointer',
            fontSize: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexShrink: 0,
            padding: '2px 4px',
          }}
        >
          <ArrowUpDown size={10} />
          {sidebarSort === 'date' ? '↕' : 'A-Z'}
        </button>
      </div>
      <SidebarFileList searchQuery={searchQuery} onFileClick={onFileClick} onContextMenu={setContextMenu} />
      {contextMenu && (
        <SidebarContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
      )}
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
