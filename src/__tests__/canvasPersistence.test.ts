import { describe, it, expect, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('tldraw', () => ({
  getSnapshot: vi.fn(() => ({
    document: { store: {}, schema: {} },
    session: { version: 1 },
  })),
  loadSnapshot: vi.fn(),
}))

const mockedInvoke = vi.mocked(invoke)

describe('canvasPersistence', () => {
  describe('saveCanvasState', () => {
    it('serializes and saves via invoke', async () => {
      const { saveCanvasState } = await import('../lib/canvasPersistence')

      mockedInvoke.mockResolvedValueOnce(undefined)
      const mockEditor = { store: {} } as any

      await saveCanvasState(mockEditor, '/vault')

      expect(mockedInvoke).toHaveBeenCalledWith('save_canvas', {
        vaultPath: '/vault',
        snapshot: expect.stringContaining('"humanboardVersion":1'),
      })
    })

    it('includes document and session in the snapshot', async () => {
      const { saveCanvasState } = await import('../lib/canvasPersistence')

      mockedInvoke.mockResolvedValueOnce(undefined)
      const mockEditor = { store: {} } as any

      await saveCanvasState(mockEditor, '/vault')

      const call = mockedInvoke.mock.calls.find(c => c[0] === 'save_canvas')
      expect(call).toBeDefined()
      const snapshot = JSON.parse((call![1] as any).snapshot)
      expect(snapshot).toHaveProperty('document')
      expect(snapshot).toHaveProperty('session')
      expect(snapshot.humanboardVersion).toBe(1)
    })
  })

  describe('loadCanvasState', () => {
    it('returns false when no saved state exists', async () => {
      const { loadCanvasState } = await import('../lib/canvasPersistence')

      mockedInvoke.mockResolvedValueOnce(null)
      const mockEditor = { store: {} } as any

      const result = await loadCanvasState(mockEditor, '/vault')
      expect(result).toBe(false)
    })

    it('returns false for invalid version', async () => {
      const { loadCanvasState } = await import('../lib/canvasPersistence')

      mockedInvoke.mockResolvedValueOnce(JSON.stringify({
        humanboardVersion: 999,
        document: {},
        session: {},
      }))
      const mockEditor = { store: {} } as any

      const result = await loadCanvasState(mockEditor, '/vault')
      expect(result).toBe(false)
    })

    it('returns false for invalid JSON', async () => {
      const { loadCanvasState } = await import('../lib/canvasPersistence')

      mockedInvoke.mockResolvedValueOnce('not json')
      const mockEditor = { store: {} } as any

      const result = await loadCanvasState(mockEditor, '/vault')
      expect(result).toBe(false)
    })
  })
})
