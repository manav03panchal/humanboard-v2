import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useVaultStore } from '../stores/vaultStore'
import { useFileStore } from '../stores/fileStore'
import { useThemeStore } from '../lib/theme'

export function useKeyboardShortcuts() {
  const toggleSidebar = useVaultStore((s) => s.toggleSidebar)

  useEffect(() => {
    let chordK = false
    let chordTimeout: ReturnType<typeof setTimeout> | null = null

    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      const inEditor = !!(e.target as HTMLElement)?.closest?.('.cm-editor')

      // Chord: Ctrl+K, T — open theme picker
      if (chordK && e.key === 't') {
        e.preventDefault()
        chordK = false
        if (chordTimeout) clearTimeout(chordTimeout)
        window.dispatchEvent(new CustomEvent('humanboard:toggle-theme-picker'))
        return
      }
      if (chordK) {
        chordK = false
        if (chordTimeout) clearTimeout(chordTimeout)
      }
      if (meta && e.key === 'k') {
        if (inEditor) return // let CM handle it
        e.preventDefault()
        chordK = true
        chordTimeout = setTimeout(() => { chordK = false }, 1000)
        return
      }

      // Cmd+E — toggle IDE mode
      if (meta && e.key === 'e') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('humanboard:toggle-ide-mode'))
        return
      }

      // Cmd+P — toggle quick open (stopImmediatePropagation to block WebKitGTK print dialog)
      if (meta && e.key === 'p') {
        e.preventDefault()
        e.stopImmediatePropagation()
        window.dispatchEvent(new CustomEvent('humanboard:toggle-quick-open'))
        return
      }

      // Cmd+A — prevent browser native select-all outside editors
      if (meta && e.key === 'a') {
        if (!inEditor) e.preventDefault()
        return
      }

      // Cmd+B — toggle sidebar
      if (meta && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
        return
      }

      // Cmd+F — if in editor, let CodeMirror handle search; otherwise sidebar search
      if (meta && e.key === 'f') {
        if (inEditor) return // let CM search handle it
        e.preventDefault()
        const { sidebarOpen } = useVaultStore.getState()
        if (!sidebarOpen) useVaultStore.getState().toggleSidebar()
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

    window.addEventListener('keydown', handler, true) // capture phase — fires before tldraw

    // macOS: Cmd+W triggers native close which Rust intercepts and emits here
    const unlisten = getCurrentWindow().listen('close-requested', () => {
      window.dispatchEvent(new CustomEvent('humanboard:close-tab'))
    })

    return () => {
      window.removeEventListener('keydown', handler, true)
      unlisten.then((fn) => fn())
    }
  }, [toggleSidebar])
}
