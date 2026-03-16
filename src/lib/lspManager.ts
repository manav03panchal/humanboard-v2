/**
 * LSP Manager — bridges @codemirror/lsp-client with Tauri's LSP backend.
 *
 * One LSPClient per language per vault. Each client manages the connection
 * to a language server process spawned by the Rust backend.
 */
import { LSPClient, type Transport } from '@codemirror/lsp-client'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// Map: "language:vaultPath" -> { client, serverId, unlisten }
const clients = new Map<string, {
  client: LSPClient
  serverId: number
  unlisten: UnlistenFn | null
  connecting: Promise<LSPClient> | null
}>()

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

  // Start the language server via Rust
  let result: { serverId: number; isNew: boolean }
  try {
    result = await invoke<{ serverId: number; isNew: boolean }>('lsp_start', { language, vaultPath })
  } catch (err) {
    console.warn(`LSP: failed to start ${language} server:`, err)
    return null
  }

  const { serverId, isNew } = result

  // If server already existed and we have a client, return it
  if (!isNew && existing?.client.connected) {
    return existing.client
  }

  // Create transport that bridges Tauri IPC
  const handlers = new Set<(value: string) => void>()

  const transport: Transport = {
    send(message: string) {
      invoke('lsp_send', { serverId, message }).catch((err) => {
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

  // Listen for responses from Rust
  const eventName = `lsp_response_${serverId}`
  const unlisten = await listen<string>(eventName, (event) => {
    for (const handler of handlers) {
      handler(event.payload)
    }
  })

  // Create LSPClient
  const client = new LSPClient({
    rootUri: `file://${vaultPath}`,
  })

  const connectPromise = (async () => {
    client.connect(transport)
    await client.initializing
    return client
  })()

  clients.set(key, { client, serverId, unlisten, connecting: connectPromise })

  try {
    await connectPromise
    // Update connecting state
    const entry = clients.get(key)
    if (entry) entry.connecting = null
    return client
  } catch (err) {
    console.error('LSP: initialization failed for', language, err)
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
    case 'css': return 'css'
    case 'html': return 'html'
    case 'json': return 'json'
    default: return null
  }
}
