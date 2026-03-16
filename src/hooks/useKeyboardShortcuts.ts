import { useEffect } from 'react'
import { useVaultStore } from '../stores/vaultStore'
import { useFileStore } from '../stores/fileStore'

export function useKeyboardShortcuts() {
  const toggleSidebar = useVaultStore((s) => s.toggleSidebar)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const saveFile = useFileStore((s) => s.saveFile)
  const files = useFileStore((s) => s.files)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // Cmd+B — toggle sidebar
      if (meta && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
        return
      }

      // Cmd+S — save all dirty files
      if (meta && e.key === 's') {
        e.preventDefault()
        if (!vaultPath) return
        for (const [path, file] of files) {
          if (file.isDirty) {
            saveFile(vaultPath, path)
          }
        }
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleSidebar, vaultPath, saveFile, files])
}
