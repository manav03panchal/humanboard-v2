import { create } from 'zustand'

interface PtySession {
  shapeId: string
  shell: string
}

interface PtyStore {
  sessions: Map<string, PtySession>
  addSession: (ptyId: string, shapeId: string, shell: string) => void
  removeSession: (ptyId: string) => void
}

export const usePtyStore = create<PtyStore>((set) => ({
  sessions: new Map(),

  addSession: (ptyId, shapeId, shell) => {
    set((state) => {
      const sessions = new Map(state.sessions)
      sessions.set(ptyId, { shapeId, shell })
      return { sessions }
    })
  },

  removeSession: (ptyId) => {
    set((state) => {
      const sessions = new Map(state.sessions)
      sessions.delete(ptyId)
      return { sessions }
    })
  },
}))
