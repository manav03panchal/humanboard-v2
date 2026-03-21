import { create } from 'zustand'

interface EditorStore {
  vimMode: boolean
  toggleVimMode: () => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  vimMode: localStorage.getItem('humanboard_vim_mode') === 'true',

  toggleVimMode: () => set((state) => {
    const next = !state.vimMode
    localStorage.setItem('humanboard_vim_mode', String(next))
    return { vimMode: next }
  }),
}))
