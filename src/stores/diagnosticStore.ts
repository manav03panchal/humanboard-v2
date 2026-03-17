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
      // Convert URI to relative path (strip file:///vault/path/)
      const path = uri.replace(/^file:\/\//, '')
      if (errors === 0 && warnings === 0) {
        files.delete(path)
      } else {
        files.set(path, { errors, warnings })
      }
      return { files }
    })
  },

  getForFile: (filePath) => {
    // Try matching by the end of the path since URIs are absolute
    for (const [uri, diag] of get().files) {
      if (uri.endsWith('/' + filePath) || uri.endsWith(filePath)) {
        return diag
      }
    }
    return undefined
  },

  clear: () => set({ files: new Map() }),
}))
