import { useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useFileStore } from '../stores/fileStore'
import { useVaultStore } from '../stores/vaultStore'
import { useThemeStore } from '../lib/theme'

interface FileChangeEvent {
  path: string
  kind: 'create' | 'modify' | 'remove'
}

export function useFileWatcher() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const loadFileTree = useVaultStore((s) => s.loadFileTree)
  const reloadFile = useFileStore((s) => s.reloadFile)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const themeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!vaultPath) return

    invoke('watch_vault', { vaultPath }).catch((err) => {
      console.error('Failed to start file watcher:', err)
    })

    const unlisten = listen<FileChangeEvent>('vault:file-changed', (event) => {
      const { path, kind } = event.payload

      if (kind === 'modify' && vaultPath) {
        reloadFile(vaultPath, path)
      }

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        loadFileTree()
      }, 500)
    })

    const unlistenTheme = listen('theme:changed', () => {
      if (themeDebounceRef.current) clearTimeout(themeDebounceRef.current)
      themeDebounceRef.current = setTimeout(() => {
        if (vaultPath) {
          useThemeStore.getState().loadTheme(vaultPath)
        }
      }, 500)
    })

    return () => {
      invoke('unwatch_vault').catch(() => {})
      unlisten.then((fn) => fn())
      unlistenTheme.then((fn) => fn())
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (themeDebounceRef.current) clearTimeout(themeDebounceRef.current)
    }
  }, [vaultPath, loadFileTree, reloadFile])
}
