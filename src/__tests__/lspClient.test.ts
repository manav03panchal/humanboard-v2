import { describe, it, expect } from 'vitest'
import { Text } from '@codemirror/state'
import {
  buildJsonRpcRequest,
  buildJsonRpcNotification,
  parseJsonRpcResponse,
  filePathToUri,
  offsetToLspPosition,
  lspPositionToOffset,
  lspRangeToOffsets,
  languageId,
  lspServerLanguage,
  completionKindToType,
} from '../lib/lspClient'

describe('buildJsonRpcRequest', () => {
  it('builds a valid JSON-RPC 2.0 request', () => {
    const result = JSON.parse(buildJsonRpcRequest('textDocument/completion', { foo: 1 }, 42))
    expect(result).toEqual({
      jsonrpc: '2.0',
      id: 42,
      method: 'textDocument/completion',
      params: { foo: 1 },
    })
  })

  it('handles null params', () => {
    const result = JSON.parse(buildJsonRpcRequest('shutdown', null, 1))
    expect(result.params).toBeNull()
    expect(result.id).toBe(1)
  })
})

describe('buildJsonRpcNotification', () => {
  it('builds a notification without id', () => {
    const result = JSON.parse(buildJsonRpcNotification('initialized', {}))
    expect(result).toEqual({
      jsonrpc: '2.0',
      method: 'initialized',
      params: {},
    })
    expect(result.id).toBeUndefined()
  })
})

describe('parseJsonRpcResponse', () => {
  it('parses a success response', () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { capabilities: {} } })
    const parsed = parseJsonRpcResponse(raw)
    expect(parsed.id).toBe(1)
    expect(parsed.result).toEqual({ capabilities: {} })
  })

  it('parses an error response', () => {
    const raw = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32600, message: 'Invalid Request' },
    })
    const parsed = parseJsonRpcResponse(raw)
    expect(parsed.error?.code).toBe(-32600)
  })

  it('parses a notification (no id)', () => {
    const raw = JSON.stringify({
      jsonrpc: '2.0',
      method: 'textDocument/publishDiagnostics',
      params: { uri: 'file:///test', diagnostics: [] },
    })
    const parsed = parseJsonRpcResponse(raw)
    expect(parsed.id).toBeUndefined()
    expect(parsed.method).toBe('textDocument/publishDiagnostics')
  })
})

describe('filePathToUri', () => {
  it('converts vault path + relative file path to file:// URI', () => {
    expect(filePathToUri('/home/user/vault', 'src/main.ts')).toBe(
      'file:///home/user/vault/src/main.ts'
    )
  })

  it('handles vault paths without trailing slash', () => {
    expect(filePathToUri('/vault', 'file.rs')).toBe('file:///vault/file.rs')
  })
})

describe('offsetToLspPosition', () => {
  it('converts offset in single-line doc', () => {
    const doc = Text.of(['hello world'])
    const pos = offsetToLspPosition(doc, 6)
    expect(pos).toEqual({ line: 0, character: 6 })
  })

  it('converts offset in multi-line doc', () => {
    const doc = Text.of(['line one', 'line two', 'line three'])
    // "line two" starts at offset 9 (8 chars + 1 newline)
    const pos = offsetToLspPosition(doc, 14) // 't' in 'two'
    expect(pos).toEqual({ line: 1, character: 5 })
  })

  it('handles start of document', () => {
    const doc = Text.of(['abc'])
    expect(offsetToLspPosition(doc, 0)).toEqual({ line: 0, character: 0 })
  })
})

describe('lspPositionToOffset', () => {
  it('converts LSP position to offset', () => {
    const doc = Text.of(['hello world'])
    expect(lspPositionToOffset(doc, { line: 0, character: 6 })).toBe(6)
  })

  it('handles multi-line doc', () => {
    const doc = Text.of(['line one', 'line two'])
    expect(lspPositionToOffset(doc, { line: 1, character: 5 })).toBe(14)
  })

  it('clamps to end of line if character exceeds line length', () => {
    const doc = Text.of(['abc'])
    expect(lspPositionToOffset(doc, { line: 0, character: 100 })).toBe(3)
  })

  it('clamps negative line to start', () => {
    const doc = Text.of(['abc'])
    expect(lspPositionToOffset(doc, { line: -1, character: 0 })).toBe(0)
  })

  it('clamps beyond last line to doc length', () => {
    const doc = Text.of(['abc', 'def'])
    expect(lspPositionToOffset(doc, { line: 99, character: 0 })).toBe(doc.length)
  })
})

describe('lspRangeToOffsets', () => {
  it('converts an LSP range to from/to offsets', () => {
    const doc = Text.of(['hello world'])
    const { from, to } = lspRangeToOffsets(doc, {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 5 },
    })
    expect(from).toBe(0)
    expect(to).toBe(5)
  })

  it('works across lines', () => {
    const doc = Text.of(['abc', 'def'])
    const { from, to } = lspRangeToOffsets(doc, {
      start: { line: 0, character: 1 },
      end: { line: 1, character: 2 },
    })
    expect(from).toBe(1)
    expect(to).toBe(6)
  })
})

describe('languageId', () => {
  it('maps ts to typescript', () => {
    expect(languageId('main.ts')).toBe('typescript')
  })

  it('maps tsx to typescriptreact', () => {
    expect(languageId('App.tsx')).toBe('typescriptreact')
  })

  it('maps js to javascript', () => {
    expect(languageId('index.js')).toBe('javascript')
  })

  it('maps jsx to javascriptreact', () => {
    expect(languageId('Component.jsx')).toBe('javascriptreact')
  })

  it('maps rs to rust', () => {
    expect(languageId('main.rs')).toBe('rust')
  })

  it('maps py to python', () => {
    expect(languageId('script.py')).toBe('python')
  })

  it('returns plaintext for unknown', () => {
    expect(languageId('file.xyz')).toBe('plaintext')
  })
})

describe('lspServerLanguage', () => {
  it('maps ts/tsx to typescript', () => {
    expect(lspServerLanguage('file.ts')).toBe('typescript')
    expect(lspServerLanguage('file.tsx')).toBe('typescript')
  })

  it('maps js/jsx to typescript (uses typescript-language-server)', () => {
    expect(lspServerLanguage('file.js')).toBe('typescript')
    expect(lspServerLanguage('file.jsx')).toBe('typescript')
  })

  it('returns null for unsupported languages', () => {
    expect(lspServerLanguage('file.md')).toBeNull()
    expect(lspServerLanguage('file.xyz')).toBeNull()
  })

  it('maps all supported languages', () => {
    expect(lspServerLanguage('file.rs')).toBe('rust')
    expect(lspServerLanguage('file.py')).toBe('python')
    expect(lspServerLanguage('file.css')).toBe('css')
    expect(lspServerLanguage('file.html')).toBe('html')
    expect(lspServerLanguage('file.json')).toBe('json')
  })
})

describe('completionKindToType', () => {
  it('maps known kinds', () => {
    expect(completionKindToType(2)).toBe('method')
    expect(completionKindToType(3)).toBe('function')
    expect(completionKindToType(6)).toBe('variable')
    expect(completionKindToType(7)).toBe('class')
    expect(completionKindToType(14)).toBe('keyword')
  })

  it('returns text for unknown or undefined kind', () => {
    expect(completionKindToType(undefined)).toBe('text')
    expect(completionKindToType(999)).toBe('text')
  })
})
