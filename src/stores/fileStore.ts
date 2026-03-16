import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import { useLinkStore } from './linkStore'
import { useVaultStore } from './vaultStore'

function triggerLinkScan(filePath: string, content: string) {
  if (!filePath.endsWith('.md')) return
  const allMd = useVaultStore
    .getState()
    .fileTree.filter((f) => !f.isDir && f.path.endsWith('.md'))
    .map((f) => f.path)
  useLinkStore.getState().scanFile(filePath, content, allMd)
}

interface FileEntry {
  content: string
  diskContent: string
  isDirty: boolean
}

interface FileStore {
  files: Map<string, FileEntry>
  openFile: (vaultRoot: string, filePath: string) => Promise<void>
  updateContent: (filePath: string, content: string) => void
  saveFile: (vaultRoot: string, filePath: string) => Promise<void>
  closeFile: (filePath: string) => void
  getFile: (filePath: string) => FileEntry | undefined
  reloadFile: (vaultRoot: string, filePath: string) => Promise<void>
}

export const useFileStore = create<FileStore>((set, get) => ({
  files: new Map(),

  openFile: async (vaultRoot, filePath) => {
    if (get().files.has(filePath)) return
    const content = await invoke<string>('read_file', {
      vaultRoot,
      filePath,
    })
    set((state) => {
      const files = new Map(state.files)
      files.set(filePath, { content, diskContent: content, isDirty: false })
      return { files }
    })
    triggerLinkScan(filePath, content)
  },

  updateContent: (filePath, content) => {
    set((state) => {
      const files = new Map(state.files)
      const existing = files.get(filePath)
      if (!existing) return state
      files.set(filePath, {
        ...existing,
        content,
        isDirty: content !== existing.diskContent,
      })
      return { files }
    })
  },

  saveFile: async (vaultRoot, filePath) => {
    const file = get().files.get(filePath)
    if (!file) return
    await invoke('write_file', {
      vaultRoot,
      filePath,
      content: file.content,
    })
    set((state) => {
      const files = new Map(state.files)
      files.set(filePath, {
        content: file.content,
        diskContent: file.content,
        isDirty: false,
      })
      return { files }
    })
    triggerLinkScan(filePath, file.content)
  },

  closeFile: (filePath) => {
    set((state) => {
      const files = new Map(state.files)
      files.delete(filePath)
      return { files }
    })
  },

  getFile: (filePath) => get().files.get(filePath),

  reloadFile: async (vaultRoot, filePath) => {
    const existing = get().files.get(filePath)
    if (!existing) return
    if (existing.isDirty) return

    try {
      const content = await invoke<string>('read_file', {
        vaultRoot,
        filePath,
      })
      set((state) => {
        const files = new Map(state.files)
        files.set(filePath, { content, diskContent: content, isDirty: false })
        return { files }
      })
    } catch {
      set((state) => {
        const files = new Map(state.files)
        files.delete(filePath)
        return { files }
      })
    }
  },
}))
