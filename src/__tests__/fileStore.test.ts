import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'

// Must mock before importing the store
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const mockedInvoke = vi.mocked(invoke)

// Re-import store fresh for each test
let useFileStore: typeof import('../stores/fileStore').useFileStore

describe('fileStore', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const mod = await import('../stores/fileStore')
    useFileStore = mod.useFileStore
  })

  describe('openFile', () => {
    it('loads file content via invoke and stores it', async () => {
      mockedInvoke.mockResolvedValueOnce('hello world')

      await useFileStore.getState().openFile('/vault', 'test.ts')

      expect(mockedInvoke).toHaveBeenCalledWith('read_file', {
        vaultRoot: '/vault',
        filePath: 'test.ts',
      })

      const file = useFileStore.getState().files.get('test.ts')
      expect(file).toBeDefined()
      expect(file!.content).toBe('hello world')
      expect(file!.diskContent).toBe('hello world')
      expect(file!.isDirty).toBe(false)
    })

    it('does not re-open an already loaded file', async () => {
      mockedInvoke.mockResolvedValueOnce('content')
      await useFileStore.getState().openFile('/vault', 'test.ts')

      mockedInvoke.mockClear()
      await useFileStore.getState().openFile('/vault', 'test.ts')

      expect(mockedInvoke).not.toHaveBeenCalled()
    })

    it('propagates errors from invoke', async () => {
      mockedInvoke.mockRejectedValueOnce(new Error('File not found'))

      await expect(
        useFileStore.getState().openFile('/vault', 'missing.ts')
      ).rejects.toThrow('File not found')

      expect(useFileStore.getState().files.has('missing.ts')).toBe(false)
    })
  })

  describe('updateContent', () => {
    it('marks file as dirty when content differs from disk', async () => {
      mockedInvoke.mockResolvedValueOnce('original')
      await useFileStore.getState().openFile('/vault', 'test.ts')

      useFileStore.getState().updateContent('test.ts', 'modified')

      const file = useFileStore.getState().files.get('test.ts')
      expect(file!.content).toBe('modified')
      expect(file!.isDirty).toBe(true)
    })

    it('marks file as clean when content matches disk', async () => {
      mockedInvoke.mockResolvedValueOnce('original')
      await useFileStore.getState().openFile('/vault', 'test.ts')

      useFileStore.getState().updateContent('test.ts', 'modified')
      useFileStore.getState().updateContent('test.ts', 'original')

      const file = useFileStore.getState().files.get('test.ts')
      expect(file!.isDirty).toBe(false)
    })

    it('does nothing for unknown files', () => {
      const before = useFileStore.getState().files
      useFileStore.getState().updateContent('nonexistent.ts', 'content')
      expect(useFileStore.getState().files).toBe(before)
    })
  })

  describe('saveFile', () => {
    it('writes content via invoke and clears dirty flag', async () => {
      mockedInvoke.mockResolvedValueOnce('original')
      await useFileStore.getState().openFile('/vault', 'test.ts')
      useFileStore.getState().updateContent('test.ts', 'new content')

      mockedInvoke.mockResolvedValueOnce(undefined)
      await useFileStore.getState().saveFile('/vault', 'test.ts')

      expect(mockedInvoke).toHaveBeenCalledWith('write_file', {
        vaultRoot: '/vault',
        filePath: 'test.ts',
        content: 'new content',
      })

      const file = useFileStore.getState().files.get('test.ts')
      expect(file!.isDirty).toBe(false)
      expect(file!.diskContent).toBe('new content')
    })

    it('does nothing for unknown files', async () => {
      mockedInvoke.mockClear()
      await useFileStore.getState().saveFile('/vault', 'nonexistent.ts')
      expect(mockedInvoke).not.toHaveBeenCalled()
    })
  })

  describe('closeFile', () => {
    it('removes the file from the store', async () => {
      mockedInvoke.mockResolvedValueOnce('content')
      await useFileStore.getState().openFile('/vault', 'test.ts')

      useFileStore.getState().closeFile('test.ts')

      expect(useFileStore.getState().files.has('test.ts')).toBe(false)
    })
  })

  describe('reloadFile', () => {
    it('reloads content from disk for clean files', async () => {
      mockedInvoke.mockResolvedValueOnce('original')
      await useFileStore.getState().openFile('/vault', 'test.ts')

      mockedInvoke.mockResolvedValueOnce('updated on disk')
      await useFileStore.getState().reloadFile('/vault', 'test.ts')

      const file = useFileStore.getState().files.get('test.ts')
      expect(file!.content).toBe('updated on disk')
      expect(file!.isDirty).toBe(false)
    })

    it('does not reload dirty files', async () => {
      mockedInvoke.mockResolvedValueOnce('original')
      await useFileStore.getState().openFile('/vault', 'test.ts')
      useFileStore.getState().updateContent('test.ts', 'modified')

      mockedInvoke.mockClear()
      await useFileStore.getState().reloadFile('/vault', 'test.ts')

      expect(mockedInvoke).not.toHaveBeenCalled()
      expect(useFileStore.getState().files.get('test.ts')!.content).toBe('modified')
    })

    it('removes file from store if reload fails', async () => {
      mockedInvoke.mockResolvedValueOnce('original')
      await useFileStore.getState().openFile('/vault', 'test.ts')

      mockedInvoke.mockRejectedValueOnce(new Error('File deleted'))
      await useFileStore.getState().reloadFile('/vault', 'test.ts')

      expect(useFileStore.getState().files.has('test.ts')).toBe(false)
    })

    it('does nothing for files not in store', async () => {
      mockedInvoke.mockClear()
      await useFileStore.getState().reloadFile('/vault', 'unknown.ts')
      expect(mockedInvoke).not.toHaveBeenCalled()
    })
  })
})
