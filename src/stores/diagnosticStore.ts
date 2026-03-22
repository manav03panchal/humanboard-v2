import { create } from 'zustand'

interface FileDiagnostics {
  errors: number
  warnings: number
}

interface DiagnosticStore {
  files: Map<string, FileDiagnostics>
  setDiagnostics: (uri: string, errors: number, warnings: number) => void
  getForFile: (filePath: string) => FileDiagnostics | undefined
  clear: () => void
}

export const useDiagnosticStore = create<DiagnosticStore>((set, get) => ({
  files: new Map(),

  setDiagnostics: (uri, errors, warnings) => {
    set((state) => {
      const files = new Map(state.files)
      // Normalize to relative path for O(1) sidebar lookups
      let path = uri.replace(/^file:\/\//, '')
      // Strip vault root prefix if present
      const vaultPath = window.__humanboard_vault_path
      if (vaultPath && path.startsWith(vaultPath + '/')) {
        path = path.slice(vaultPath.length + 1)
      }
      if (errors === 0 && warnings === 0) {
        files.delete(path)
      } else {
        files.set(path, { errors, warnings })
      }
      return { files }
    })
  },

  getForFile: (filePath) => {
    return get().files.get(filePath)
  },

  clear: () => set({ files: new Map() }),
}))
