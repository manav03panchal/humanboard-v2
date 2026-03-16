import { describe, it, expect, beforeEach, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const mockedInvoke = vi.mocked(invoke)

let useVaultStore: typeof import('../stores/vaultStore').useVaultStore

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('vaultStore', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    localStorageMock.clear()
    const mod = await import('../stores/vaultStore')
    useVaultStore = mod.useVaultStore
  })

  describe('setVaultPath', () => {
    it('sets the vault path and clears file tree', () => {
      mockedInvoke.mockResolvedValueOnce([])
      useVaultStore.getState().setVaultPath('/test/vault')
      expect(useVaultStore.getState().vaultPath).toBe('/test/vault')
    })

    it('adds to recent vaults', () => {
      mockedInvoke.mockResolvedValueOnce([])
      useVaultStore.getState().setVaultPath('/test/vault')
      expect(useVaultStore.getState().recentVaults).toContain('/test/vault')
    })

    it('triggers file tree loading', () => {
      mockedInvoke.mockResolvedValueOnce([])
      useVaultStore.getState().setVaultPath('/test/vault')
      expect(mockedInvoke).toHaveBeenCalledWith('read_dir', {
        vaultRoot: '/test/vault',
        dirPath: '',
      })
    })
  })

  describe('addRecentVault', () => {
    it('adds a vault to the front of the list', () => {
      useVaultStore.getState().addRecentVault('/first')
      useVaultStore.getState().addRecentVault('/second')
      expect(useVaultStore.getState().recentVaults[0]).toBe('/second')
    })

    it('deduplicates vaults', () => {
      useVaultStore.getState().addRecentVault('/first')
      useVaultStore.getState().addRecentVault('/second')
      useVaultStore.getState().addRecentVault('/first')
      const vaults = useVaultStore.getState().recentVaults
      expect(vaults.filter((v) => v === '/first')).toHaveLength(1)
      expect(vaults[0]).toBe('/first')
    })

    it('limits to 10 recent vaults', () => {
      for (let i = 0; i < 15; i++) {
        useVaultStore.getState().addRecentVault(`/vault${i}`)
      }
      expect(useVaultStore.getState().recentVaults).toHaveLength(10)
    })

    it('saves to localStorage', () => {
      useVaultStore.getState().addRecentVault('/test')
      expect(localStorageMock.setItem).toHaveBeenCalled()
    })
  })

  describe('toggleSidebar', () => {
    it('toggles sidebar open state', () => {
      const initial = useVaultStore.getState().sidebarOpen
      useVaultStore.getState().toggleSidebar()
      expect(useVaultStore.getState().sidebarOpen).toBe(!initial)
      useVaultStore.getState().toggleSidebar()
      expect(useVaultStore.getState().sidebarOpen).toBe(initial)
    })
  })

  describe('setSidebarSort', () => {
    it('sets sort mode', () => {
      useVaultStore.getState().setSidebarSort('date')
      expect(useVaultStore.getState().sidebarSort).toBe('date')
      useVaultStore.getState().setSidebarSort('alpha')
      expect(useVaultStore.getState().sidebarSort).toBe('alpha')
    })
  })

  describe('loadRecentVaults', () => {
    it('loads from localStorage', () => {
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(['/saved/vault']))
      useVaultStore.getState().loadRecentVaults()
      expect(useVaultStore.getState().recentVaults).toEqual(['/saved/vault'])
    })

    it('handles missing localStorage gracefully', () => {
      localStorageMock.getItem.mockReturnValueOnce(null as unknown as string)
      useVaultStore.getState().loadRecentVaults()
      expect(useVaultStore.getState().recentVaults).toEqual([])
    })

    it('handles invalid JSON gracefully', () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid json')
      expect(() => useVaultStore.getState().loadRecentVaults()).not.toThrow()
    })
  })

  describe('loadFileTree', () => {
    it('loads file tree from invoke', async () => {
      const entries = [
        { name: 'main.ts', path: 'main.ts', isDir: false, modifiedAt: 1000 },
      ]
      mockedInvoke.mockResolvedValueOnce(entries)
      useVaultStore.setState({ vaultPath: '/vault' })
      await useVaultStore.getState().loadFileTree()
      expect(useVaultStore.getState().fileTree).toEqual(entries)
    })

    it('does nothing without a vault path', async () => {
      mockedInvoke.mockClear()
      await useVaultStore.getState().loadFileTree()
      expect(mockedInvoke).not.toHaveBeenCalled()
    })

    it('sets empty tree on error', async () => {
      mockedInvoke.mockRejectedValueOnce(new Error('fail'))
      useVaultStore.setState({ vaultPath: '/vault' })
      await useVaultStore.getState().loadFileTree()
      expect(useVaultStore.getState().fileTree).toEqual([])
    })
  })
})
