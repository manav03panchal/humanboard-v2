import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

export interface TreeNode {
  name: string
  path: string
  isDir: boolean
  modifiedAt: number
}

interface VaultStore {
  vaultPath: string | null
  recentVaults: string[]
  sidebarOpen: boolean
  sidebarSort: 'date' | 'alpha'
  fileTree: TreeNode[]
  setVaultPath: (path: string) => void
  addRecentVault: (path: string) => void
  toggleSidebar: () => void
  setSidebarSort: (sort: 'date' | 'alpha') => void
  loadFileTree: () => Promise<void>
  loadRecentVaults: () => void
  saveRecentVaults: () => void
}

const RECENT_VAULTS_KEY = 'humanboard_recent_vaults'

export const useVaultStore = create<VaultStore>((set, get) => ({
  vaultPath: null,
  recentVaults: [],
  sidebarOpen: true,
  sidebarSort: 'alpha',
  fileTree: [],

  setVaultPath: (path) => {
    set({ vaultPath: path, fileTree: [] })
    get().addRecentVault(path)
    get().loadFileTree()
  },

  addRecentVault: (path) => {
    set((state) => {
      const filtered = state.recentVaults.filter((v) => v !== path)
      const updated = [path, ...filtered].slice(0, 10)
      return { recentVaults: updated }
    })
    get().saveRecentVaults()
  },

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarSort: (sort) => set({ sidebarSort: sort }),

  loadFileTree: async () => {
    const vaultPath = get().vaultPath
    if (!vaultPath) return
    try {
      const entries = await invoke<TreeNode[]>('read_dir', {
        vaultRoot: vaultPath,
        dirPath: '',
      })
      set({ fileTree: entries })
    } catch (err) {
      console.error('Failed to load file tree:', err)
      set({ fileTree: [] })
    }
  },

  loadRecentVaults: () => {
    try {
      const stored = localStorage.getItem(RECENT_VAULTS_KEY)
      if (stored) set({ recentVaults: JSON.parse(stored) })
    } catch {
      // ignore
    }
  },

  saveRecentVaults: () => {
    localStorage.setItem(RECENT_VAULTS_KEY, JSON.stringify(get().recentVaults))
  },
}))
