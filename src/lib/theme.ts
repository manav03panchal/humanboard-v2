import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

// --- Zed Theme Types ---

interface ZedThemeFamily {
  name: string
  author: string
  themes: ZedTheme[]
}

interface ZedTheme {
  name: string
  appearance: 'dark' | 'light'
  style: ZedStyle
}

interface ZedStyle {
  background?: string
  foreground?: string
  text?: string
  border?: string
  'editor.background'?: string
  'editor.foreground'?: string
  'editor.gutter.background'?: string
  'editor.line_number'?: string
  'editor.active_line.background'?: string
  'element.background'?: string
  'element.hover'?: string
  'surface.background'?: string
  'panel.background'?: string
  'tab_bar.background'?: string
  'title_bar.background'?: string
  'status_bar.background'?: string
  'border.focused'?: string
  'border.selected'?: string
  'text.muted'?: string
  'text.accent'?: string
  syntax?: Record<string, { color?: string; font_style?: string; font_weight?: number }>
  [key: string]: any
}

// --- Theme Store ---

interface ThemeState {
  zedTheme: ZedTheme | null
  themeName: string
  loading: boolean
  loadTheme: (vaultPath: string) => Promise<void>
  getEditorBackground: () => string
  getEditorForeground: () => string
  getGutterBackground: () => string
  getLineNumberColor: () => string
  getActiveLineBackground: () => string
  getAppBackground: () => string
  getAppForeground: () => string
  getBorderColor: () => string
  getSurfaceBackground: () => string
  getPanelBackground: () => string
  getTextMuted: () => string
  getAccentColor: () => string
  getElementHover: () => string
}

// Defaults (OLED black)
const DEFAULTS = {
  background: '#000000',
  foreground: '#ffffff',
  editorBackground: '#000000',
  editorForeground: '#d4d4d4',
  gutterBackground: '#000000',
  lineNumber: '#555555',
  activeLine: 'rgba(255,255,255,0.05)',
  border: '#1a1a1a',
  surface: '#0a0a0a',
  panel: '#000000',
  textMuted: '#999999',
  accent: '#528bff',
  elementHover: '#111111',
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  zedTheme: null,
  themeName: 'Default (OLED Black)',
  loading: false,

  loadTheme: async (vaultPath: string) => {
    set({ loading: true })
    try {
      const content = await invoke<string>('read_file', {
        vaultRoot: vaultPath,
        filePath: '.humanboard/theme.json',
      })
      const family: ZedThemeFamily = JSON.parse(content)
      // Pick the first dark theme, or first theme
      const theme = family.themes.find((t) => t.appearance === 'dark') ?? family.themes[0]
      if (theme) {
        set({ zedTheme: theme, themeName: theme.name, loading: false })
        applyThemeToDOM(theme)
      }
    } catch {
      // No theme file or invalid — use defaults
      set({ zedTheme: null, themeName: 'Default (OLED Black)', loading: false })
      applyDefaultToDOM()
    }
  },

  getEditorBackground: () => {
    const t = get().zedTheme?.style
    return t?.['editor.background'] ?? t?.background ?? DEFAULTS.editorBackground
  },
  getEditorForeground: () => {
    const t = get().zedTheme?.style
    return t?.['editor.foreground'] ?? t?.foreground ?? t?.text ?? DEFAULTS.editorForeground
  },
  getGutterBackground: () => {
    const t = get().zedTheme?.style
    return t?.['editor.gutter.background'] ?? t?.['editor.background'] ?? t?.background ?? DEFAULTS.gutterBackground
  },
  getLineNumberColor: () => {
    const t = get().zedTheme?.style
    return t?.['editor.line_number'] ?? t?.['text.muted'] ?? DEFAULTS.lineNumber
  },
  getActiveLineBackground: () => {
    const t = get().zedTheme?.style
    return t?.['editor.active_line.background'] ?? DEFAULTS.activeLine
  },
  getAppBackground: () => {
    const t = get().zedTheme?.style
    return t?.background ?? DEFAULTS.background
  },
  getAppForeground: () => {
    const t = get().zedTheme?.style
    return t?.foreground ?? t?.text ?? DEFAULTS.foreground
  },
  getBorderColor: () => {
    const t = get().zedTheme?.style
    return t?.border ?? DEFAULTS.border
  },
  getSurfaceBackground: () => {
    const t = get().zedTheme?.style
    return t?.['surface.background'] ?? t?.['element.background'] ?? DEFAULTS.surface
  },
  getPanelBackground: () => {
    const t = get().zedTheme?.style
    return t?.['panel.background'] ?? t?.background ?? DEFAULTS.panel
  },
  getTextMuted: () => {
    const t = get().zedTheme?.style
    return t?.['text.muted'] ?? DEFAULTS.textMuted
  },
  getAccentColor: () => {
    const t = get().zedTheme?.style
    return t?.['text.accent'] ?? DEFAULTS.accent
  },
  getElementHover: () => {
    const t = get().zedTheme?.style
    return t?.['element.hover'] ?? DEFAULTS.elementHover
  },
}))

// --- Apply theme to DOM (CSS variables) ---

function applyThemeToDOM(theme: ZedTheme) {
  const s = theme.style
  const root = document.documentElement
  root.style.setProperty('--hb-bg', s.background ?? DEFAULTS.background)
  root.style.setProperty('--hb-fg', s.foreground ?? s.text ?? DEFAULTS.foreground)
  root.style.setProperty('--hb-border', s.border ?? DEFAULTS.border)
  root.style.setProperty('--hb-surface', s['surface.background'] ?? s['element.background'] ?? DEFAULTS.surface)
  root.style.setProperty('--hb-panel', s['panel.background'] ?? s.background ?? DEFAULTS.panel)
  root.style.setProperty('--hb-text-muted', s['text.muted'] ?? DEFAULTS.textMuted)
  root.style.setProperty('--hb-editor-bg', s['editor.background'] ?? s.background ?? DEFAULTS.editorBackground)
  root.style.setProperty('--hb-editor-fg', s['editor.foreground'] ?? s.foreground ?? DEFAULTS.editorForeground)
  root.style.setProperty('--hb-hover', s['element.hover'] ?? DEFAULTS.elementHover)

  document.body.style.backgroundColor = s.background ?? DEFAULTS.background
  document.body.style.color = s.foreground ?? s.text ?? DEFAULTS.foreground
}

function applyDefaultToDOM() {
  const root = document.documentElement
  root.style.setProperty('--hb-bg', DEFAULTS.background)
  root.style.setProperty('--hb-fg', DEFAULTS.foreground)
  root.style.setProperty('--hb-border', DEFAULTS.border)
  root.style.setProperty('--hb-surface', DEFAULTS.surface)
  root.style.setProperty('--hb-panel', DEFAULTS.panel)
  root.style.setProperty('--hb-text-muted', DEFAULTS.textMuted)
  root.style.setProperty('--hb-editor-bg', DEFAULTS.editorBackground)
  root.style.setProperty('--hb-editor-fg', DEFAULTS.editorForeground)
  root.style.setProperty('--hb-hover', DEFAULTS.elementHover)

  document.body.style.backgroundColor = DEFAULTS.background
  document.body.style.color = DEFAULTS.foreground
}

// --- Build CodeMirror theme from Zed theme ---

export function buildCodeMirrorTheme(theme: ThemeState): Extension[] {
  const bg = theme.getEditorBackground()
  const fg = theme.getEditorForeground()
  const gutterBg = theme.getGutterBackground()
  const lineNum = theme.getLineNumberColor()
  const activeLine = theme.getActiveLineBackground()

  const editorTheme = EditorView.theme(
    {
      '&': {
        fontFamily: '"JetBrains Mono NF", "JetBrains Mono", Menlo, Monaco, monospace',
        fontSize: '13px',
        backgroundColor: bg,
        color: fg,
      },
      '.cm-content': { caretColor: fg },
      '.cm-gutters': { backgroundColor: gutterBg, border: 'none', color: lineNum },
      '.cm-activeLine': { backgroundColor: activeLine },
      '.cm-activeLineGutter': { backgroundColor: activeLine },
      '&.cm-focused': { outline: 'none' },
    },
    { dark: true }
  )

  // Build syntax highlighting from Zed syntax tokens
  const syntax = theme.zedTheme?.style?.syntax
  const highlightStyles: any[] = []

  if (syntax) {
    const map: [string, any][] = [
      ['keyword', tags.keyword],
      ['string', tags.string],
      ['comment', tags.comment],
      ['function', tags.function(tags.variableName)],
      ['type', tags.typeName],
      ['variable', tags.variableName],
      ['constant', tags.constant(tags.variableName)],
      ['number', tags.number],
      ['boolean', tags.bool],
      ['operator', tags.operator],
      ['property', tags.propertyName],
      ['attribute', tags.attributeName],
      ['tag', tags.tagName],
      ['punctuation', tags.punctuation],
      ['punctuation.bracket', tags.bracket],
      ['punctuation.delimiter', tags.separator],
      ['enum', tags.constant(tags.typeName)],
      ['constructor', tags.className],
      ['embedded', tags.special(tags.string)],
      ['label', tags.labelName],
      ['link_text', tags.link],
      ['link_uri', tags.url],
      ['title', tags.heading],
    ]

    for (const [zedToken, cmTag] of map) {
      const style = syntax[zedToken]
      if (!style?.color) continue
      const entry: any = { tag: cmTag, color: style.color }
      if (style.font_style === 'italic') entry.fontStyle = 'italic'
      if (style.font_weight && style.font_weight >= 700) entry.fontWeight = 'bold'
      highlightStyles.push(entry)
    }
  }

  if (highlightStyles.length === 0) {
    // Fallback highlighting when no Zed theme
    highlightStyles.push(
      { tag: tags.keyword, color: '#c678dd' },
      { tag: tags.string, color: '#98c379' },
      { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
      { tag: tags.function(tags.variableName), color: '#61afef' },
      { tag: tags.typeName, color: '#e5c07b' },
      { tag: tags.number, color: '#d19a66' },
      { tag: tags.operator, color: '#56b6c2' },
      { tag: tags.propertyName, color: '#e06c75' },
      { tag: tags.bool, color: '#d19a66' },
      { tag: tags.variableName, color: '#abb2bf' },
    )
  }

  const highlighting = syntaxHighlighting(HighlightStyle.define(highlightStyles))

  return [editorTheme, highlighting]
}
