// ─── Editor ───

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { search, searchKeymap } from '@codemirror/search'
import { indentationMarkers } from '@replit/codemirror-indentation-markers'
import { Compartment, type Extension } from '@codemirror/state'
import { vim, Vim } from '@replit/codemirror-vim'
import { useEditorStore } from '../stores/editorStore'
import CodeMirror from '@uiw/react-codemirror'
import { useFileStore } from '../stores/fileStore'
import { getLanguageExtension, loadLanguageExtension } from '../lib/language'
import { lintGutter } from '@codemirror/lint'
import { getLspClient, getServerLanguage, getLanguageId } from '../lib/lspManager'
import { buildCodeMirrorTheme, useThemeStore } from '../lib/theme'
import { BASIC_SETUP } from '../lib/editorConfig'

export function IdeEditor({ filePath, vaultPath }: { filePath: string; vaultPath: string }) {
  const file = useFileStore((s) => s.files.get(filePath))
  const updateContent = useFileStore((s) => s.updateContent)
  const saveFile = useFileStore((s) => s.saveFile)
  const vimMode = useEditorStore((s) => s.vimMode)
  const fontSize = useEditorStore((s) => s.fontSize)
  const zedTheme = useThemeStore((s) => s.zedTheme)
  const getEditorBackground = useThemeStore((s) => s.getEditorBackground)
  const getEditorForeground = useThemeStore((s) => s.getEditorForeground)
  const getGutterBackground = useThemeStore((s) => s.getGutterBackground)
  const getLineNumberColor = useThemeStore((s) => s.getLineNumberColor)
  const getActiveLineBackground = useThemeStore((s) => s.getActiveLineBackground)

  // Wire vim :w, :wq, :q commands
  useEffect(() => {
    if (!vimMode) return
    Vim.defineEx('write', 'w', () => {
      saveFile(vaultPath, filePath).catch((err) => console.error('Failed to save:', err))
    })
    Vim.defineEx('quit', 'q', () => {
      useFileStore.getState().closeFile(filePath)
      // Focus next editor after React re-renders
      setTimeout(() => {
        const cm = document.querySelector('.cm-editor .cm-content') as HTMLElement
        cm?.focus()
      }, 50)
    })
    Vim.defineEx('wquit', 'wq', () => {
      saveFile(vaultPath, filePath).then(() => {
        useFileStore.getState().closeFile(filePath)
        setTimeout(() => {
          const cm = document.querySelector('.cm-editor .cm-content') as HTMLElement
          cm?.focus()
        }, 50)
      }).catch((err) => console.error('Failed to save:', err))
    })
  }, [vimMode, vaultPath, filePath, saveFile])

  // LSP — only active in IDE mode (canvas shapes own LSP in canvas mode)
  // Delayed init: canvas LSP cleanup runs first, then IDE takes over the URI
  const ideMode = useEditorStore((s) => s.ideMode)
  const [lspExt, setLspExt] = useState<Extension[]>([])
  const lspInitialized = useRef(false)
  useEffect(() => {
    if (!vaultPath || !ideMode) return
    if (lspInitialized.current) return
    const serverLang = getServerLanguage(filePath)
    if (!serverLang) return
    // Delay so canvas shapes' LSP cleanup effect runs first
    const timer = setTimeout(() => {
      lspInitialized.current = true
      getLspClient(serverLang, vaultPath).then((client) => {
        if (!client) { lspInitialized.current = false; return }
        const fileUri = `file://${vaultPath}/${filePath}`
        const langId = getLanguageId(filePath) ?? serverLang
        const ext = client.plugin(fileUri, langId)
        setLspExt([ext, lintGutter()])
      }).catch(() => { lspInitialized.current = false })
    }, 100)
    return () => {
      clearTimeout(timer)
      lspInitialized.current = false
      setLspExt([])
    }
  }, [vaultPath, filePath, ideMode])

  const [langExt, setLangExt] = useState<Extension | null>(() => getLanguageExtension(filePath))
  useEffect(() => {
    let cancelled = false
    loadLanguageExtension(filePath).then((ext) => {
      if (!cancelled && ext) setLangExt(ext)
    })
    return () => { cancelled = true }
  }, [filePath])

  const cmTheme = useMemo(
    () => buildCodeMirrorTheme({
      zedTheme, getEditorBackground, getEditorForeground,
      getGutterBackground, getLineNumberColor, getActiveLineBackground,
    }),
    [zedTheme, getEditorBackground, getEditorForeground, getGutterBackground, getLineNumberColor, getActiveLineBackground]
  )
  const fontCompartment = useMemo(() => new Compartment(), [])
  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      fontCompartment.of(EditorView.theme({
        '&': { fontSize: `${fontSize}px` },
        '.cm-gutters': { fontSize: `${fontSize}px` },
      })),
      search(), keymap.of(searchKeymap), indentationMarkers(),
      ...(vimMode ? [vim()] : []),
      ...cmTheme,
      ...(langExt ? [langExt] : []),
      ...lspExt,
    ],
    // fontSize deliberately excluded — handled by compartment reconfigure below
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cmTheme, langExt, lspExt, vimMode, fontCompartment]
  )

  // Reconfigure only the font compartment — no full extension rebuild
  const editorWrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const wrap = editorWrapRef.current
    if (!wrap) return
    const cmEl = wrap.querySelector('.cm-editor')
    if (!cmEl) return
    const view = EditorView.findFromDOM(cmEl as HTMLElement)
    if (!view) return
    view.dispatch({
      effects: fontCompartment.reconfigure(EditorView.theme({
        '&': { fontSize: `${fontSize}px` },
        '.cm-gutters': { fontSize: `${fontSize}px` },
      })),
    })
  }, [fontSize, fontCompartment])

  // Auto-focus editor on mount (after :q switches tabs, new file opens, etc.)
  useEffect(() => {
    requestAnimationFrame(() => {
      const wrap = editorWrapRef.current
      if (!wrap) return
      const cmEl = wrap.querySelector('.cm-editor')
      if (!cmEl) return
      const view = EditorView.findFromDOM(cmEl as HTMLElement)
      view?.focus()
    })
  }, [filePath])

  const handleChange = useCallback(
    (value: string) => updateContent(filePath, value),
    [filePath, updateContent]
  )


  if (!file) {
    return (
      <div style={{ color: 'var(--hb-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        Loading...
      </div>
    )
  }

  return (
    <div ref={editorWrapRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', fontSize }}>
      <CodeMirror
        value={file.content}
        onChange={handleChange}
        extensions={extensions}
        theme="none"
        editable
        height="100%"
        basicSetup={BASIC_SETUP}
        style={{ height: '100%' }}
      />
    </div>
  )
}
