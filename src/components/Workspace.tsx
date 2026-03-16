import { useCallback, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { PanelLeft } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { Canvas } from './Canvas'
import { WindowTitleBar } from './WindowTitleBar'
import { useFileStore } from '../stores/fileStore'
import { useVaultStore } from '../stores/vaultStore'
import { useToastStore } from './Toast'
import { useThemeStore } from '../lib/theme'
import { getLanguageName } from '../lib/language'
import { usePlatform } from '../hooks/usePlatform'

export function Workspace() {
  const vaultPath = useVaultStore((s) => s.vaultPath)!
  const openFile = useFileStore((s) => s.openFile)
  const addToast = useToastStore((s) => s.addToast)
  const loadTheme = useThemeStore((s) => s.loadTheme)
  const os = usePlatform()
  const isMac = os === 'macos'

  // On vault change: load theme, clear file store
  useEffect(() => {
    loadTheme(vaultPath)
    // Clear all open files from previous vault
    const { files, closeFile } = useFileStore.getState()
    for (const filePath of files.keys()) {
      closeFile(filePath)
    }
  }, [vaultPath, loadTheme])

  const handleFileClick = useCallback(
    async (filePath: string) => {
      try {
        const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
        const BINARY_EXTS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a']
        const isBinary = BINARY_EXTS.includes(ext)
        // Binary files (PDFs) skip the text file store — shapes load them directly
        if (!isBinary) {
          await openFile(vaultPath, filePath)
        }
        window.dispatchEvent(
          new CustomEvent('humanboard:open-file', {
            detail: { filePath, language: getLanguageName(filePath) },
          })
        )
      } catch (err) {
        addToast(String(err))
      }
    },
    [vaultPath, openFile, addToast]
  )

  const handleDrag = (e: React.MouseEvent) => {
    if (e.buttons === 1) getCurrentWindow().startDragging()
  }

  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh' }}>
      {isMac ? (
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
      ) : (
        <WindowTitleBar />
      )}
      <Sidebar onFileClick={handleFileClick} />
      <SidebarOpenTab />
      <div style={{ flex: 1, height: '100%' }}>
        <Canvas key={vaultPath} />
      </div>
    </div>
  )
}

function SidebarOpenTab() {
  const sidebarOpen = useVaultStore((s) => s.sidebarOpen)
  const toggleSidebar = useVaultStore((s) => s.toggleSidebar)

  if (sidebarOpen) return null

  return (
    <button
      onClick={toggleSidebar}
      style={{
        position: 'fixed',
        left: 0,
        top: 40,
        zIndex: 100,
        background: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderLeft: 'none',
        borderRadius: '0 6px 6px 0',
        color: '#666',
        cursor: 'pointer',
        padding: '8px 6px',
        display: 'flex',
        alignItems: 'center',
      }}
      title="Open sidebar (Cmd+B)"
    >
      <PanelLeft size={14} strokeWidth={1.5} />
    </button>
  )
}
