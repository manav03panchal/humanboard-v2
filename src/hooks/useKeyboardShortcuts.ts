import { useEffect } from 'react'
import { useVaultStore } from '../stores/vaultStore'
import { useFileStore } from '../stores/fileStore'
import { useThemeStore } from '../lib/theme'

export function useKeyboardShortcuts() {
  const toggleSidebar = useVaultStore((s) => s.toggleSidebar)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey

      // Cmd+B — toggle sidebar
      if (meta && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
        return
      }

      // Cmd+F — focus sidebar search
      if (meta && e.key === 'f') {
        e.preventDefault()
        const { sidebarOpen } = useVaultStore.getState()
        if (!sidebarOpen) useVaultStore.getState().toggleSidebar()
        // Focus the search input
        setTimeout(() => {
          const input = document.querySelector('[data-sidebar-search]') as HTMLInputElement
          if (input) input.focus()
        }, 50)
        return
      }

      // Cmd+S — save all dirty files
      if (meta && e.key === 's') {
        e.preventDefault()
        const vaultPath = useVaultStore.getState().vaultPath
        if (!vaultPath) return
        const { files, saveFile } = useFileStore.getState()
        for (const [path, file] of files) {
          if (file.isDirty) {
            saveFile(vaultPath, path)
          }
        }
        return
      }

      // Cmd+Shift+T — reload theme
      if (meta && e.shiftKey && e.key === 'T') {
        e.preventDefault()
        const vaultPath = useVaultStore.getState().vaultPath
        if (vaultPath) useThemeStore.getState().loadTheme(vaultPath)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggleSidebar])
}
