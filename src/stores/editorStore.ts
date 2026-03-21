import { create } from 'zustand'

const DEFAULT_FONT_SIZE = 14
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 32

interface EditorStore {
  vimMode: boolean
  activeFile: string | null
  fontSize: number
  toggleVimMode: () => void
  setActiveFile: (path: string | null) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  vimMode: localStorage.getItem('humanboard_vim_mode') === 'true',
  activeFile: null,
  fontSize: Number(localStorage.getItem('humanboard_font_size')) || DEFAULT_FONT_SIZE,

  toggleVimMode: () => set((state) => {
    const next = !state.vimMode
    localStorage.setItem('humanboard_vim_mode', String(next))
    return { vimMode: next }
  }),

  setActiveFile: (path) => set({ activeFile: path }),

  zoomIn: () => set((state) => {
    const next = Math.min(MAX_FONT_SIZE, state.fontSize + 1)
    localStorage.setItem('humanboard_font_size', String(next))
    return { fontSize: next }
  }),

  zoomOut: () => set((state) => {
    const next = Math.max(MIN_FONT_SIZE, state.fontSize - 1)
    localStorage.setItem('humanboard_font_size', String(next))
    return { fontSize: next }
  }),

  resetZoom: () => {
    localStorage.setItem('humanboard_font_size', String(DEFAULT_FONT_SIZE))
    return set({ fontSize: DEFAULT_FONT_SIZE })
  },
}))
