/**
 * LSP Manager — bridges @codemirror/lsp-client with Tauri's LSP backend.
 *
 * One LSPClient per language per vault. Each client manages the connection
 * to a language server process spawned by the Rust backend.
 */
import { LSPClient, languageServerExtensions, type Transport } from '@codemirror/lsp-client'
import { invoke } from '@tauri-apps/api/core'
import { useDiagnosticStore } from '../stores/diagnosticStore'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// Map: "language:vaultPath" -> { client, serverId, unlisten }
const clients = new Map<string, {
  client: LSPClient
  serverId: number
  unlisten: UnlistenFn | null
  connecting: Promise<LSPClient> | null
}>()

// Pending connection promises — prevents duplicate concurrent getLspClient calls
const pendingConnections = new Map<string, Promise<LSPClient | null>>()

function emitLspStatus(language: string, status: string) {
  window.dispatchEvent(
    new CustomEvent('humanboard:lsp-status', { detail: { language, status } })
  )
}

function clientKey(language: string, vaultPath: string) {
  return `${language}:${vaultPath}`
}

/**
 * Get or create an LSPClient for the given language and vault.
 * Returns the client after it's connected and initialized.
 */
export async function getLspClient(language: string, vaultPath: string): Promise<LSPClient | null> {
  const key = clientKey(language, vaultPath)
  const existing = clients.get(key)

  if (existing) {
    if (existing.connecting) return existing.connecting
    if (existing.client.connected) return existing.client
  }

  // If another call is already connecting, wait for it
  const pending = pendingConnections.get(key)
  if (pending) return pending

  const promise = doConnect(language, vaultPath, key)
  pendingConnections.set(key, promise)
  promise.finally(() => pendingConnections.delete(key))
  return promise
}

async function doConnect(language: string, vaultPath: string, key: string): Promise<LSPClient | null> {

  // Start the language server via Rust
  let result: { serverId: number; isNew: boolean }
  try {
    result = await invoke<{ serverId: number; isNew: boolean }>('lsp_start', { language, vaultPath })
  } catch (err) {
    const msg = String(err)
    const installHints: Record<string, string> = {
      typescript: 'bun add -g typescript-language-server typescript',
      rust: 'rustup component add rust-analyzer',
      python: 'pip install pyright',
      css: 'bun add -g vscode-langservers-extracted',
      html: 'bun add -g vscode-langservers-extracted',
      json: 'bun add -g vscode-langservers-extracted',
    }
    const hint = installHints[language]
    const toastMsg = hint
      ? `${language} LSP not found. Install: ${hint}`
      : `${language} LSP failed: ${msg}`
    emitLspStatus(language, 'error')
    // Import dynamically to avoid circular deps
    import('../components/Toast').then(({ useToastStore }) => {
      useToastStore.getState().addToast(toastMsg, 'error')
    })
    console.warn(`LSP: failed to start ${language} server:`, msg)
    return null
  }

  const { serverId, isNew } = result

  // If server already existed and we have a client, return it
  const existingEntry = clients.get(key)
  if (!isNew && existingEntry?.client.connected) {
    return existingEntry.client
  }

  // Create transport that bridges Tauri IPC
  const handlers = new Set<(value: string) => void>()

  const transport: Transport = {
    send(message: string) {
      let finalMessage = message
      try {
        const parsed = JSON.parse(message)
        // Strip pull diagnostic capability to force rust-analyzer to use push (publishDiagnostics)
        if (parsed.method === 'initialize' && parsed.params?.capabilities?.textDocument?.diagnostic) {
          delete parsed.params.capabilities.textDocument.diagnostic
          finalMessage = JSON.stringify(parsed)
        }
      } catch {}
      invoke('lsp_send', { serverId, message: finalMessage }).catch((err) => {
        console.error('LSP send error:', err)
      })
    },
    subscribe(handler: (value: string) => void) {
      handlers.add(handler)
    },
    unsubscribe(handler: (value: string) => void) {
      handlers.delete(handler)
    },
  }

  // Server-initiated requests that @codemirror/lsp-client can't handle —
  // respond with success so the language server doesn't crash.
  const serverRequestMethods = new Set([
    'window/workDoneProgress/create',
    'client/registerCapability',
    'client/unregisterCapability',
    'workspace/configuration',
  ])

  // Listen for responses from Rust
  const eventName = `lsp_response_${serverId}`
  const unlisten = await listen<string>(eventName, (event) => {
    try {
      const parsed = JSON.parse(event.payload)

      // Intercept server-initiated requests (has both method and id) before
      // they reach @codemirror/lsp-client, which would reject with -32601
      if (parsed.method && parsed.id != null && serverRequestMethods.has(parsed.method)) {
        const response = JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: null })
        invoke('lsp_send', { serverId, message: response }).catch(() => {})
        return
      }

      if (parsed.method === 'textDocument/publishDiagnostics' && parsed.params) {
        const diags = parsed.params.diagnostics ?? []
        const errors = diags.filter((d: any) => d.severity === 1).length
        const warnings = diags.filter((d: any) => d.severity === 2).length
        useDiagnosticStore.getState().setDiagnostics(parsed.params.uri, errors, warnings)
      }
    } catch {}
    for (const handler of handlers) {
      handler(event.payload)
    }
  })

  // Create LSPClient with all extensions (diagnostics, autocomplete, hover, etc.)
  // Add workDoneProgress capability so rust-analyzer sends indexing progress
  const progressExtension = {
    clientCapabilities: {
      window: {
        workDoneProgress: true,
      },
      textDocument: {
        // IMPORTANT: disable pull diagnostics — force rust-analyzer to use
        // publishDiagnostics (push) which serverDiagnostics() handles
        diagnostic: undefined,
      },
    },
    notificationHandlers: {
      '$/progress': (_client: LSPClient, params: any) => {
        const value = params?.value
        if (!value) return true
        if (value.kind === 'begin') {
          emitLspStatus(language, value.title || 'indexing')
        } else if (value.kind === 'report') {
          const msg = value.message ?? ''
          const pct = value.percentage != null ? ` ${value.percentage}%` : ''
          emitLspStatus(language, `${msg}${pct}`.trim() || 'indexing')
        } else if (value.kind === 'end') {
          emitLspStatus(language, 'ready')
        }
        return true
      },
    },
  }

  const client = new LSPClient({
    rootUri: `file://${vaultPath}`,
    extensions: [...languageServerExtensions(), progressExtension],
  })

  emitLspStatus(language, 'connecting')

  const connectPromise = (async () => {
    client.connect(transport)
    await client.initializing
    return client
  })()

  clients.set(key, { client, serverId, unlisten, connecting: connectPromise })

  try {
    await connectPromise
    const entry = clients.get(key)
    if (entry) entry.connecting = null
    emitLspStatus(language, 'indexing')
    return client
  } catch (err) {
    console.error('LSP: initialization failed for', language, err)
    emitLspStatus(language, 'error')
    import('../components/Toast').then(({ useToastStore }) => {
      useToastStore.getState().addToast(`${language} LSP crashed during initialization`, 'error')
    })
    unlisten()
    clients.delete(key)
    return null
  }
}

/**
 * Get an existing LSPClient if one is connected for this language.
 * Does NOT start a new server — use getLspClient() for that.
 */
export function getConnectedClient(language: string, vaultPath: string): LSPClient | null {
  const entry = clients.get(clientKey(language, vaultPath))
  return entry?.client.connected ? entry.client : null
}

/**
 * Disconnect and clean up all LSP clients (e.g. on vault switch).
 */
export function disconnectAll() {
  for (const [, entry] of clients) {
    entry.client.disconnect()
    entry.unlisten?.()
    invoke('lsp_stop', { serverId: entry.serverId }).catch(() => {})
  }
  clients.clear()
}

/**
 * Disconnect a specific language server.
 */
export function disconnectLanguage(language: string, vaultPath: string) {
  const key = clientKey(language, vaultPath)
  const entry = clients.get(key)
  if (!entry) return
  entry.client.disconnect()
  entry.unlisten?.()
  invoke('lsp_stop', { serverId: entry.serverId }).catch(() => {})
  clients.delete(key)
}

/**
 * Map file extension to LSP language ID.
 */
export function getLanguageId(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts': case 'tsx': return 'typescript'
    case 'js': case 'jsx': return 'javascript'
    case 'rs': return 'rust'
    case 'py': return 'python'
    case 'go': return 'go'
    case 'css': return 'css'
    case 'html': return 'html'
    case 'json': return 'json'
    default: return null
  }
}

/**
 * Map language ID to the server language name used by our Rust backend.
 */
export function getServerLanguage(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts': case 'tsx': case 'js': case 'jsx': return 'typescript'
    case 'rs': return 'rust'
    case 'py': return 'python'
    case 'go': return 'go'
    case 'css': return 'css'
    case 'html': return 'html'
    case 'json': return 'json'
    default: return null
  }
}
