import { useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { Canvas } from './Canvas'
import { useFileStore } from '../stores/fileStore'
import { useVaultStore } from '../stores/vaultStore'
import { useToastStore } from './Toast'
import { getLanguageName } from '../lib/language'

export function Workspace() {
  const vaultPath = useVaultStore((s) => s.vaultPath)!
  const openFile = useFileStore((s) => s.openFile)
  const addToast = useToastStore((s) => s.addToast)

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

  return (
    <div style={{ display: 'flex', width: '100%', height: '100vh' }}>
      <Sidebar onFileClick={handleFileClick} />
      <div style={{ flex: 1, height: '100%' }}>
        <Canvas />
      </div>
    </div>
  )
}
