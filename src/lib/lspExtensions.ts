import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import { setDiagnostics, type Diagnostic } from '@codemirror/lint'
import { EditorView, hoverTooltip, type Tooltip, ViewPlugin } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { useLspStore, type LspDiagnostic } from '../stores/lspStore'
import {
  offsetToLspPosition,
  lspRangeToOffsets,
  filePathToUri,
  completionKindToType,
  lspServerLanguage,
} from './lspClient'

// --- Autocomplete ---

interface CompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: string | { kind: string; value: string }
  insertText?: string
  insertTextFormat?: number
}

function createLspCompletionSource(vaultPath: string, filePath: string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const lang = lspServerLanguage(filePath)
    if (!lang) return null

    const store = useLspStore.getState()
    const serverId = store.getServerId(lang)
    if (serverId === null) return null

    const conn = store.getConnection(lang)
    if (!conn?.initialized) return null

    const pos = offsetToLspPosition(context.state.doc, context.pos)

    try {
      const result = await store.sendRequest(serverId, 'textDocument/completion', {
        textDocument: { uri: filePathToUri(vaultPath, filePath) },
        position: pos,
      }) as { items?: CompletionItem[] } | CompletionItem[] | null

      if (!result) return null

      const items = Array.isArray(result) ? result : (result.items ?? [])
      if (items.length === 0) return null

      // Find the start of the current word for `from`
      const line = context.state.doc.lineAt(context.pos)
      const textBefore = line.text.slice(0, context.pos - line.from)
      const wordMatch = textBefore.match(/[\w$]*$/)
      const from = context.pos - (wordMatch?.[0]?.length ?? 0)

      return {
        from,
        options: items.map((item) => ({
          label: item.label,
          detail: item.detail,
          info: item.documentation
            ? typeof item.documentation === 'string'
              ? item.documentation
              : (item.documentation as { value: string }).value
            : undefined,
          type: completionKindToType(item.kind),
        })),
      }
    } catch {
      return null
    }
  }
}

export function lspAutocompletion(vaultPath: string, filePath: string): Extension {
  return autocompletion({
    override: [createLspCompletionSource(vaultPath, filePath)],
    activateOnTyping: true,
  })
}

// --- Diagnostics ---

function mapSeverity(severity?: number): 'error' | 'warning' | 'info' | 'hint' {
  switch (severity) {
    case 1: return 'error'
    case 2: return 'warning'
    case 3: return 'info'
    case 4: return 'hint'
    default: return 'warning'
  }
}

function lspDiagnosticsToCm(view: EditorView, diagnostics: LspDiagnostic[]): Diagnostic[] {
  const doc = view.state.doc
  const result: Diagnostic[] = []
  for (const d of diagnostics) {
    try {
      const { from, to } = lspRangeToOffsets(doc, d.range)
      result.push({
        from,
        to: Math.max(to, from + 1),
        severity: mapSeverity(d.severity),
        message: d.message,
        source: d.source,
      })
    } catch {
      // Invalid range — skip
    }
  }
  return result
}

/**
 * Creates a ViewPlugin that subscribes to LSP diagnostics for a specific file
 * and dispatches them to the CodeMirror lint layer.
 */
export function lspDiagnosticsPlugin(vaultPath: string, filePath: string): Extension {
  const uri = filePathToUri(vaultPath, filePath)

  return ViewPlugin.define((view) => {
    const store = useLspStore.getState()
    const prevCallback = store.diagnosticsCallback

    const callback = (diagUri: string, diagnostics: LspDiagnostic[]) => {
      if (diagUri !== uri) {
        prevCallback?.(diagUri, diagnostics)
        return
      }
      const cmDiags = lspDiagnosticsToCm(view, diagnostics)
      view.dispatch(setDiagnostics(view.state, cmDiags))
      prevCallback?.(diagUri, diagnostics)
    }

    useLspStore.getState().setDiagnosticsCallback(callback)

    return {
      destroy() {
        useLspStore.getState().setDiagnosticsCallback(prevCallback)
      },
    }
  })
}

/**
 * Theme for diagnostic underlines and tooltips.
 */
export function lspDiagnosticsTheme(colors: { error: string; warning: string; info: string }): Extension {
  return EditorView.theme({
    '.cm-diagnostic-error': { borderBottom: `2px wavy ${colors.error}` },
    '.cm-diagnostic-warning': { borderBottom: `2px wavy ${colors.warning}` },
    '.cm-diagnostic-info': { borderBottom: `2px wavy ${colors.info}` },
    '.cm-diagnostic': { padding: '2px 0' },
    '.cm-tooltip-lint': {
      backgroundColor: 'var(--hb-surface, #0a0a0a)',
      border: '1px solid var(--hb-border, #1a1a1a)',
      borderRadius: '6px',
      color: 'var(--hb-fg, #fff)',
      fontSize: '13px',
      padding: '6px 10px',
    },
  })
}

// --- Hover ---

interface HoverResult {
  contents: string | { kind: string; value: string } | { language: string; value: string } | Array<string | { language: string; value: string }>
}

function extractHoverContent(
  contents: HoverResult['contents']
): string | null {
  if (typeof contents === 'string') return contents || null
  if (Array.isArray(contents)) {
    return contents
      .map((c) => (typeof c === 'string' ? c : c.value))
      .filter(Boolean)
      .join('\n\n') || null
  }
  if ('value' in contents) return contents.value || null
  return null
}

export function lspHoverExtension(vaultPath: string, filePath: string): Extension {
  return hoverTooltip(async (view, pos): Promise<Tooltip | null> => {
    const lang = lspServerLanguage(filePath)
    if (!lang) return null

    const store = useLspStore.getState()
    const serverId = store.getServerId(lang)
    if (serverId === null) return null

    const conn = store.getConnection(lang)
    if (!conn?.initialized) return null

    const lspPos = offsetToLspPosition(view.state.doc, pos)

    try {
      const result = await store.sendRequest(serverId, 'textDocument/hover', {
        textDocument: { uri: filePathToUri(vaultPath, filePath) },
        position: lspPos,
      }) as HoverResult | null

      if (!result?.contents) return null

      const content = extractHoverContent(result.contents)
      if (!content) return null

      return {
        pos,
        above: true,
        create() {
          const dom = document.createElement('div')
          dom.className = 'cm-lsp-hover'
          dom.style.cssText = `
            max-width: 480px;
            max-height: 300px;
            overflow: auto;
            padding: 8px 12px;
            font-family: "JetBrains Mono", Menlo, Monaco, monospace;
            font-size: 13px;
            white-space: pre-wrap;
            line-height: 1.5;
          `
          dom.textContent = content
          return { dom }
        },
      }
    } catch {
      return null
    }
  }, { hoverTime: 300 })
}

/**
 * Theme for hover tooltips.
 */
export function lspTooltipTheme(): Extension {
  return EditorView.theme({
    '.cm-tooltip': {
      backgroundColor: 'var(--hb-surface, #0a0a0a)',
      border: '1px solid var(--hb-border, #1a1a1a)',
      borderRadius: '6px',
      color: 'var(--hb-fg, #fff)',
    },
    '.cm-tooltip-hover': {
      backgroundColor: 'var(--hb-surface, #0a0a0a)',
      border: '1px solid var(--hb-border, #1a1a1a)',
      borderRadius: '6px',
    },
  })
}
