import type { Text } from '@codemirror/state'

// --- JSON-RPC 2.0 ---

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number
  method?: string
  result?: unknown
  params?: unknown
  error?: { code: number; message: string; data?: unknown }
}

export function buildJsonRpcRequest(method: string, params: unknown, id: number): string {
  const msg: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
  return JSON.stringify(msg)
}

export function buildJsonRpcNotification(method: string, params: unknown): string {
  const msg: JsonRpcNotification = { jsonrpc: '2.0', method, params }
  return JSON.stringify(msg)
}

export function parseJsonRpcResponse(raw: string): JsonRpcResponse {
  return JSON.parse(raw) as JsonRpcResponse
}

// --- URI / Path helpers ---

export function filePathToUri(vaultPath: string, filePath: string): string {
  // vaultPath is absolute, filePath is relative to vault
  const full = `${vaultPath}/${filePath}`
  return `file://${full}`
}

// --- Position conversion ---

export interface LspPosition {
  line: number
  character: number
}

export interface LspRange {
  start: LspPosition
  end: LspPosition
}

/**
 * Convert a CodeMirror absolute offset to an LSP Position (0-based line & character).
 */
export function offsetToLspPosition(doc: Text, offset: number): LspPosition {
  const line = doc.lineAt(offset)
  return {
    line: line.number - 1, // CM lines are 1-based, LSP is 0-based
    character: offset - line.from,
  }
}

/**
 * Convert an LSP Position to a CodeMirror absolute offset.
 */
export function lspPositionToOffset(doc: Text, pos: LspPosition): number {
  const lineNum = pos.line + 1 // LSP 0-based -> CM 1-based
  if (lineNum < 1) return 0
  if (lineNum > doc.lines) return doc.length
  const line = doc.line(lineNum)
  return Math.min(line.from + pos.character, line.to)
}

/**
 * Convert an LSP Range to CodeMirror from/to offsets.
 */
export function lspRangeToOffsets(doc: Text, range: LspRange): { from: number; to: number } {
  return {
    from: lspPositionToOffset(doc, range.start),
    to: lspPositionToOffset(doc, range.end),
  }
}

// --- Language ID mapping ---

const LANGUAGE_IDS: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescriptreact',
  js: 'javascript',
  jsx: 'javascriptreact',
  rs: 'rust',
  py: 'python',
  css: 'css',
  html: 'html',
  json: 'json',
  md: 'markdown',
}

/**
 * Map file extension to LSP languageId string.
 */
export function languageId(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_IDS[ext] ?? 'plaintext'
}

/**
 * Map file extension to the language name expected by the Rust LSP manager.
 * (e.g., ts/tsx/js/jsx all use "typescript" or "javascript" server)
 */
export function lspServerLanguage(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'typescript',
    jsx: 'typescript',
    mjs: 'typescript',
    cjs: 'typescript',
    rs: 'rust',
    py: 'python',
    go: 'go',
    css: 'css',
    html: 'html',
    json: 'json',
  }
  return map[ext] ?? null
}

// --- LSP CompletionItemKind to label ---

const COMPLETION_KIND_LABELS: Record<number, string> = {
  1: 'text',
  2: 'method',
  3: 'function',
  4: 'constructor',
  5: 'field',
  6: 'variable',
  7: 'class',
  8: 'interface',
  9: 'module',
  10: 'property',
  11: 'unit',
  12: 'value',
  13: 'enum',
  14: 'keyword',
  15: 'snippet',
  16: 'color',
  17: 'file',
  18: 'reference',
  19: 'folder',
  20: 'enum-member',
  21: 'constant',
  22: 'struct',
  23: 'event',
  24: 'operator',
  25: 'type-parameter',
}

export function completionKindToType(kind?: number): string {
  if (!kind) return 'text'
  return COMPLETION_KIND_LABELS[kind] ?? 'text'
}
