import { useCallback, useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Sidebar } from './Sidebar'
import { Canvas } from './Canvas'
import { useFileStore } from '../stores/fileStore'
import { useVaultStore } from '../stores/vaultStore'
import { useToastStore } from './Toast'
import { useThemeStore } from '../lib/theme'
import { getLanguageName } from '../lib/language'

export function Workspace() {
  const vaultPath = useVaultStore((s) => s.vaultPath)!
  const openFile = useFileStore((s) => s.openFile)
  const addToast = useToastStore((s) => s.addToast)
  const loadTheme = useThemeStore((s) => s.loadTheme)

  // Load theme from .humanboard/theme.json on vault open
  useEffect(() => {
    loadTheme(vaultPath)
  }, [vaultPath, loadTheme])

  const handleFileClick = useCallback(
    async (filePath: string) => {
      try {
        await openFile(vaultPath, filePath)
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
      <Sidebar onFileClick={handleFileClick} />
      <div style={{ flex: 1, height: '100%' }}>
        <Canvas />
      </div>
    </div>
  )
}
