import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import {
  buildJsonRpcRequest,
  buildJsonRpcNotification,
  parseJsonRpcResponse,
  filePathToUri,
  languageId,
  lspServerLanguage,
  type LspPosition,
  type JsonRpcResponse,
} from '../lib/lspClient'
import { useToastStore } from '../components/Toast'

interface LspConnection {
  serverId: number
  language: string
  initialized: boolean
  capabilities: unknown
  unlisten: (() => void) | null
  /** Number of open files using this server */
  refCount: number
}

// Diagnostics callback type — set by the diagnostics extension
export type DiagnosticsCallback = (uri: string, diagnostics: LspDiagnostic[]) => void

export interface LspDiagnostic {
  range: { start: LspPosition; end: LspPosition }
  severity?: number
  message: string
  source?: string
}

interface LspStore {
  connections: Map<string, LspConnection> // key: language
  responseHandlers: Map<number, { resolve: (result: unknown) => void; reject: (err: unknown) => void }>
  nextRequestId: number
  diagnosticsCallback: DiagnosticsCallback | null

  startServer: (language: string, vaultPath: string) => Promise<number>
  sendRequest: (serverId: number, method: string, params: unknown) => Promise<unknown>
  sendNotification: (serverId: number, method: string, params: unknown) => void
  stopServer: (language: string) => void
  getConnection: (language: string) => LspConnection | undefined
  getServerId: (language: string) => number | null
  setDiagnosticsCallback: (cb: DiagnosticsCallback | null) => void

  // High-level lifecycle helpers
  openFile: (vaultPath: string, filePath: string, content: string) => Promise<void>
  changeFile: (vaultPath: string, filePath: string, content: string, version: number) => void
  closeFile: (vaultPath: string, filePath: string) => void
}

export const useLspStore = create<LspStore>((set, get) => ({
  connections: new Map(),
  responseHandlers: new Map(),
  nextRequestId: 1,
  diagnosticsCallback: null,

  setDiagnosticsCallback: (cb) => set({ diagnosticsCallback: cb }),

  startServer: async (language, vaultPath) => {
    const existing = get().connections.get(language)
    if (existing) {
      // Increment ref count
      set((state) => {
        const connections = new Map(state.connections)
        connections.set(language, { ...existing, refCount: existing.refCount + 1 })
        return { connections }
      })
      return existing.serverId
    }

    // Prevent duplicate init — create a placeholder connection immediately
    const placeholder: LspConnection = {
      serverId: -1,
      language,
      initialized: false,
      capabilities: null,
      unlisten: null,
      refCount: 1,
    }
    set((state) => {
      const connections = new Map(state.connections)
      connections.set(language, placeholder)
      return { connections }
    })

    let serverId: number
    try {
      const result = await invoke<{ serverId: number; isNew: boolean }>('lsp_start', { language, vaultPath })
      serverId = result.serverId
      if (!result.isNew) {
        // Server already existed — don't re-initialize, just update placeholder
        set((state) => {
          const connections = new Map(state.connections)
          const existing = connections.get(language)
          if (existing) {
            connections.set(language, { ...existing, serverId, initialized: true })
          }
          return { connections }
        })
        return serverId
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      useToastStore.getState().addToast(
        `Language server for ${language} not available: ${msg}`,
        'error'
      )
      throw err
    }

    // Listen for responses from this server
    const eventName = `lsp_response_${serverId}`
    const unlisten = await listen<string>(eventName, (event) => {
      try {
        const response = parseJsonRpcResponse(event.payload)
        handleLspMessage(response)
      } catch {
        // Malformed message — ignore
      }
    })

    const connection: LspConnection = {
      serverId,
      language,
      initialized: false,
      capabilities: null,
      unlisten,
      refCount: 1,
    }

    set((state) => {
      const connections = new Map(state.connections)
      connections.set(language, connection)
      return { connections }
    })

    // Send initialize request
    try {
      const result = await get().sendRequest(serverId, 'initialize', {
        processId: null,
        rootUri: `file://${vaultPath}`,
        capabilities: {
          textDocument: {
            completion: {
              completionItem: {
                snippetSupport: false,
                labelDetailsSupport: true,
              },
            },
            hover: {
              contentFormat: ['markdown', 'plaintext'],
            },
            publishDiagnostics: {
              relatedInformation: true,
            },
            synchronization: {
              didSave: true,
              dynamicRegistration: false,
            },
          },
        },
      }) as { capabilities?: unknown }

      // Send initialized notification
      get().sendNotification(serverId, 'initialized', {})

      set((state) => {
        const connections = new Map(state.connections)
        const conn = connections.get(language)
        if (conn) {
          connections.set(language, {
            ...conn,
            initialized: true,
            capabilities: result?.capabilities ?? null,
          })
        }
        return { connections }
      })
    } catch (err) {
      console.warn('LSP initialize failed:', err)
    }

    return serverId
  },

  sendRequest: (serverId, method, params) => {
    return new Promise((resolve, reject) => {
      const id = get().nextRequestId
      set({ nextRequestId: id + 1 })

      const handlers = new Map(get().responseHandlers)
      handlers.set(id, { resolve, reject })
      set({ responseHandlers: handlers })

      const message = buildJsonRpcRequest(method, params, id)
      invoke('lsp_send', { serverId, message }).catch((err) => {
        // Remove handler on send failure
        const h = new Map(get().responseHandlers)
        h.delete(id)
        set({ responseHandlers: h })
        reject(err)
      })

      // Timeout after 10 seconds
      setTimeout(() => {
        const h = get().responseHandlers
        if (h.has(id)) {
          const updated = new Map(h)
          updated.delete(id)
          set({ responseHandlers: updated })
          reject(new Error(`LSP request timeout: ${method}`))
        }
      }, 10000)
    })
  },

  sendNotification: (serverId, method, params) => {
    const message = buildJsonRpcNotification(method, params)
    invoke('lsp_send', { serverId, message }).catch((err) => {
      console.warn(`LSP notification ${method} failed:`, err)
    })
  },

  stopServer: (language) => {
    const conn = get().connections.get(language)
    if (!conn) return

    const newRefCount = conn.refCount - 1
    if (newRefCount > 0) {
      // Other files still using this server
      set((state) => {
        const connections = new Map(state.connections)
        connections.set(language, { ...conn, refCount: newRefCount })
        return { connections }
      })
      return
    }

    // No more references — shut down
    // Send shutdown request, then exit notification
    get()
      .sendRequest(conn.serverId, 'shutdown', null)
      .catch(() => {})
      .finally(() => {
        get().sendNotification(conn.serverId, 'exit', null)
        invoke('lsp_stop', { serverId: conn.serverId }).catch(() => {})
      })

    conn.unlisten?.()

    set((state) => {
      const connections = new Map(state.connections)
      connections.delete(language)
      return { connections }
    })
  },

  getConnection: (language) => get().connections.get(language),

  getServerId: (language) => {
    const conn = get().connections.get(language)
    return conn?.serverId ?? null
  },

  // --- High-level lifecycle ---

  openFile: async (vaultPath, filePath, content) => {
    const lang = lspServerLanguage(filePath)
    if (!lang) return

    try {
      const serverId = await get().startServer(lang, vaultPath)
      const conn = get().connections.get(lang)
      if (!conn?.initialized) return

      get().sendNotification(serverId, 'textDocument/didOpen', {
        textDocument: {
          uri: filePathToUri(vaultPath, filePath),
          languageId: languageId(filePath),
          version: 1,
          text: content,
        },
      })
    } catch {
      // Server start failed — graceful degradation (toast already shown)
    }
  },

  changeFile: (vaultPath, filePath, content, version) => {
    const lang = lspServerLanguage(filePath)
    if (!lang) return
    const serverId = get().getServerId(lang)
    if (serverId === null) return

    get().sendNotification(serverId, 'textDocument/didChange', {
      textDocument: {
        uri: filePathToUri(vaultPath, filePath),
        version,
      },
      contentChanges: [{ text: content }],
    })
  },

  closeFile: (vaultPath, filePath) => {
    const lang = lspServerLanguage(filePath)
    if (!lang) return
    const serverId = get().getServerId(lang)
    if (serverId !== null) {
      get().sendNotification(serverId, 'textDocument/didClose', {
        textDocument: { uri: filePathToUri(vaultPath, filePath) },
      })
    }
    get().stopServer(lang)
  },
}))

// --- Internal: route incoming LSP messages ---

function handleLspMessage(response: JsonRpcResponse) {
  const store = useLspStore.getState()

  // Response to a request (has id)
  if (response.id != null) {
    const handler = store.responseHandlers.get(response.id)
    if (handler) {
      const handlers = new Map(store.responseHandlers)
      handlers.delete(response.id)
      useLspStore.setState({ responseHandlers: handlers })

      if (response.error) {
        handler.reject(response.error)
      } else {
        handler.resolve(response.result)
      }
    }
    return
  }

  // Server-initiated notification (no id)
  if (response.method === 'textDocument/publishDiagnostics') {
    const params = response.params as { uri: string; diagnostics: LspDiagnostic[] } | undefined
    if (params) {
      store.diagnosticsCallback?.(params.uri, params.diagnostics)
    }
  }
}
