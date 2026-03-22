import { useEffect } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { useVaultStore } from '../stores/vaultStore'
import { useEditorStore } from '../stores/editorStore'
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

      // Cmd+Shift+N — new window
      if (meta && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault()
        e.stopImmediatePropagation()
        const label = `window-${Date.now()}`
        const w = new WebviewWindow(label, {
          url: '/',
          title: 'Humanboard',
          titleBarStyle: 'Overlay' as any,
          hiddenTitle: true,
          width: 800,
          height: 600,
        })
        w.once('tauri://error', (err) => {
          console.error('Failed to create window:', err)
        })
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

      // Cmd+W / Ctrl+W — prevent browser default (IdeLayout handles tab close via its own keydown)
      if (meta && e.key === 'w') {
        e.preventDefault()
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
            saveFile(vaultPath, path).catch(() => {})
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

    // macOS: Cmd+W / red traffic light triggers close — Rust intercepts and emits here
    // JS decides: close tab (IDE mode) or close/hide window (canvas mode)
    let closing = false
    const unlisten = getCurrentWindow().listen('close-requested', async () => {
      if (closing) return
      const currentWindow = getCurrentWindow()
      const isMain = currentWindow.label === 'main'
      const { ideMode } = useEditorStore.getState()
      const hasOpenFiles = useFileStore.getState().files.size > 0

      if (ideMode && hasOpenFiles) {
        // IDE mode with open files: close active tab
        // When last tab closes, IdeLayout calls onClose → sets ideMode=false
        // Next Cmd+W will hit the canvas/close branch below
        window.dispatchEvent(new CustomEvent('humanboard:close-tab'))
      } else if (isMain) {
        // Main window (canvas mode or IDE with no files): hide window (macOS stays in dock)
        if (ideMode) {
          // Exit IDE mode first since there's nothing open
          useEditorStore.getState().setIdeMode(false)
        }
        await currentWindow.hide()
      } else {
        // Secondary window in canvas mode: destroy it
        closing = true
        await currentWindow.destroy()
      }
    })

    return () => {
      window.removeEventListener('keydown', handler, true)
      unlisten.then((fn) => fn())
    }
  }, [toggleSidebar])
}
