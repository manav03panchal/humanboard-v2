import { useCallback, useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invoke } from '@tauri-apps/api/core'
import { GitBranch } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { Sidebar } from './Sidebar'
import { Canvas } from './Canvas'
import { StatusBar } from './StatusBar'
import { IdeLayout } from './IdeLayout'
import { SidebarVaultDropdown } from './SidebarVaultDropdown'
import { WindowTitleBar } from './WindowTitleBar'
import { useFileStore } from '../stores/fileStore'
import { useEditorStore } from '../stores/editorStore'
import { useVaultStore } from '../stores/vaultStore'
import { useToastStore } from './Toast'
import { useThemeStore } from '../lib/theme'
import { getLanguageName } from '../lib/language'
import { isBinaryFile } from '../lib/fileTypes'
import { useLinkStore } from '../stores/linkStore'
import { disconnectAll as disconnectLsp } from '../lib/lspManager'
import { useDiagnosticStore } from '../stores/diagnosticStore'
import { usePlatform } from '../hooks/usePlatform'
import { QuickOpen } from './QuickOpen'
import { ThemePicker } from './ThemePicker'
import { ErrorBoundary } from './ErrorBoundary'

export function Workspace() {
  const vaultPath = useVaultStore((s) => s.vaultPath)!
  const openFile = useFileStore((s) => s.openFile)
  const addToast = useToastStore((s) => s.addToast)
  const loadTheme = useThemeStore((s) => s.loadTheme)
  const os = usePlatform()
  const isMac = os === 'macos'
  const sidebarOpen = useVaultStore((s) => s.sidebarOpen)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [quickOpenOpen, setQuickOpenOpen] = useState(false)
  const ideMode = useEditorStore((s) => s.ideMode)
  const setIdeMode = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    const prev = useEditorStore.getState().ideMode
    const next = typeof v === 'function' ? v(prev) : v
    useEditorStore.getState().setIdeMode(next)
  }, [])
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const openFiles = useStoreWithEqualityFn(
    useFileStore,
    useCallback((s) => Array.from(s.files.keys()), []),
    (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
  )

  useEffect(() => {
    const handler = () => setQuickOpenOpen((o) => !o)
    window.addEventListener('humanboard:toggle-quick-open', handler)
    return () => window.removeEventListener('humanboard:toggle-quick-open', handler)
  }, [])

  useEffect(() => {
    const handler = () => setThemePickerOpen((o) => !o)
    window.addEventListener('humanboard:toggle-theme-picker', handler)
    return () => window.removeEventListener('humanboard:toggle-theme-picker', handler)
  }, [])

  // Expose IDE mode toggle for StatusBar
  useEffect(() => {
    const handler = () => setIdeMode((v) => !v)
    window.addEventListener('humanboard:toggle-ide-mode', handler)
    return () => window.removeEventListener('humanboard:toggle-ide-mode', handler)
  }, [])


  useEffect(() => {
    if (!vaultPath) return
    invoke<string | null>('get_git_branch', { vaultPath }).then(setGitBranch).catch(() => setGitBranch(null))
  }, [vaultPath])

  // On vault change: load theme, clear all state, reset to canvas
  useEffect(() => {
    window.__humanboard_vault_path = vaultPath
    setIdeMode(false)
    loadTheme(vaultPath)
    const { files, closeFile } = useFileStore.getState()
    for (const filePath of files.keys()) {
      closeFile(filePath)
    }
    useLinkStore.getState().clear()
    disconnectLsp()
    useDiagnosticStore.getState().clear()
  }, [vaultPath, loadTheme])

  const handleFileClick = useCallback(
    async (filePath: string) => {
      try {
        // Binary files (PDFs) skip the text file store — shapes load them directly
        if (!isBinaryFile(filePath)) {
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

  const handleDrag = useCallback((e: React.MouseEvent) => {
    if (e.buttons === 1) getCurrentWindow().startDragging()
  }, [])

  return (
    <div style={{ display: 'flex', width: '100%', height: 'calc(100vh - 24px)' }}>
      {/* macOS drag region — only covers sidebar area; title bar handles its own drag */}
      {isMac && (
        <div
          onMouseDown={handleDrag}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: sidebarOpen ? 260 : 0,
            height: 28,
            zIndex: 9999,
            transition: 'width 0.2s ease',
          }}
        />
      )}
      <WindowTitleBar />
      <Sidebar onFileClick={handleFileClick} />
      <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* macOS title bar — clears traffic lights, shows dir + branch */}
        {isMac && (
          <div
            onMouseDown={handleDrag}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 38,
              flexShrink: 0,
              paddingLeft: sidebarOpen ? 12 : 78,
              paddingRight: sidebarOpen ? 12 : 78,
              transition: 'padding-left 0.2s ease, padding-right 0.2s ease',
              gap: 8,
              backgroundColor: 'var(--hb-surface)',
              borderBottom: '1px solid var(--hb-border)',
              fontSize: 12,
              fontFamily: '"JetBrains Mono", monospace',
              color: 'var(--hb-text-muted)',
              userSelect: 'none',
            }}
          >
            <div onMouseDown={(e) => e.stopPropagation()}>
              <SidebarVaultDropdown />
            </div>
            {gitBranch && (
              <>
                <GitBranch size={13} />
                <span>{gitBranch}</span>
              </>
            )}
          </div>
        )}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
            opacity: ideMode ? 0 : 1,
            transform: ideMode ? 'scale(1.02)' : 'scale(1)',
            transition: 'opacity 200ms ease, transform 200ms ease',
            pointerEvents: ideMode ? 'none' : 'auto',
          }}
        >
          <ErrorBoundary><Canvas key={vaultPath} /></ErrorBoundary>
        </div>
        <div
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute',
            inset: 0,
            opacity: ideMode ? 1 : 0,
            transform: ideMode ? 'translateY(0)' : 'translateY(12px)',
            transition: 'opacity 200ms ease, transform 200ms ease',
            pointerEvents: ideMode ? 'auto' : 'none',
          }}
        >
          <ErrorBoundary>
            <IdeLayout
              key={vaultPath}
              openFiles={openFiles}
              onClose={() => setIdeMode(false)}
            />
          </ErrorBoundary>
        </div>
        </div>
      </div>
      <QuickOpen open={quickOpenOpen} onClose={() => setQuickOpenOpen(false)} />
      <ThemePicker open={themePickerOpen} onClose={() => setThemePickerOpen(false)} />
      <StatusBar ideMode={ideMode} />
    </div>
  )
}
