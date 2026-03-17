import { create } from 'zustand'

export type AgentModel = 'claude-sonnet-4-0' | 'claude-opus-4-0'

export type AgentStatus = 'idle' | 'running' | 'error' | 'stopped' | 'max_iterations'

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'status' | 'error'
  content: string
  timestamp: number
}

/** Per-shape runtime state for an agent session */
export interface ShapeAgentState {
  status: AgentStatus
  messages: AgentMessage[]
  currentAction: string | null
  iteration: number
  maxIterations: number
  abortController: AbortController | null
}

function createDefaultShapeState(): ShapeAgentState {
  return {
    status: 'idle',
    messages: [],
    currentAction: null,
    iteration: 0,
    maxIterations: 20,
    abortController: null,
  }
}

interface AgentStore {
  // Global settings (shared across all shapes)
  apiKey: string | null
  model: AgentModel
  setApiKey: (key: string | null) => void
  setModel: (model: AgentModel) => void
  loadSettings: () => void

  // Per-shape agent state
  shapes: Map<string, ShapeAgentState>

  // Per-shape accessors
  getShapeState: (shapeId: string) => ShapeAgentState
  setShapeStatus: (shapeId: string, status: AgentStatus) => void
  addShapeMessage: (shapeId: string, msg: Omit<AgentMessage, 'timestamp'>) => void
  setShapeCurrentAction: (shapeId: string, action: string | null) => void
  setShapeIteration: (shapeId: string, n: number) => void
  setShapeAbortController: (shapeId: string, controller: AbortController | null) => void
  clearShapeMessages: (shapeId: string) => void
  resetShape: (shapeId: string) => void
  removeShape: (shapeId: string) => void
  updateShapeMessages: (shapeId: string, messages: AgentMessage[]) => void
}

const SETTINGS_KEY = 'humanboard_agent_settings'

export const useAgentStore = create<AgentStore>((set, get) => ({
  apiKey: null,
  model: 'claude-sonnet-4-0',
  shapes: new Map(),

  setApiKey: (key) => {
    set({ apiKey: key })
    saveSettings(get)
  },

  setModel: (model) => {
    set({ model })
    saveSettings(get)
  },

  loadSettings: () => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        set({
          apiKey: parsed.apiKey ?? null,
          model: parsed.model ?? 'claude-sonnet-4-0',
        })
      }
    } catch {
      // ignore
    }
  },

  getShapeState: (shapeId) => {
    const shapes = get().shapes
    return shapes.get(shapeId) ?? createDefaultShapeState()
  },

  setShapeStatus: (shapeId, status) => {
    set((state) => {
      const shapes = new Map(state.shapes)
      const current = shapes.get(shapeId) ?? createDefaultShapeState()
      shapes.set(shapeId, { ...current, status })
      return { shapes }
    })
  },

  addShapeMessage: (shapeId, msg) => {
    set((state) => {
      const shapes = new Map(state.shapes)
      const current = shapes.get(shapeId) ?? createDefaultShapeState()
      shapes.set(shapeId, {
        ...current,
        messages: [...current.messages, { ...msg, timestamp: Date.now() }],
      })
      return { shapes }
    })
  },

  setShapeCurrentAction: (shapeId, action) => {
    set((state) => {
      const shapes = new Map(state.shapes)
      const current = shapes.get(shapeId) ?? createDefaultShapeState()
      shapes.set(shapeId, { ...current, currentAction: action })
      return { shapes }
    })
  },

  setShapeIteration: (shapeId, n) => {
    set((state) => {
      const shapes = new Map(state.shapes)
      const current = shapes.get(shapeId) ?? createDefaultShapeState()
      shapes.set(shapeId, { ...current, iteration: n })
      return { shapes }
    })
  },

  setShapeAbortController: (shapeId, controller) => {
    set((state) => {
      const shapes = new Map(state.shapes)
      const current = shapes.get(shapeId) ?? createDefaultShapeState()
      shapes.set(shapeId, { ...current, abortController: controller })
      return { shapes }
    })
  },

  clearShapeMessages: (shapeId) => {
    set((state) => {
      const shapes = new Map(state.shapes)
      const current = shapes.get(shapeId) ?? createDefaultShapeState()
      shapes.set(shapeId, {
        ...current,
        messages: [],
        iteration: 0,
        currentAction: null,
      })
      return { shapes }
    })
  },

  resetShape: (shapeId) => {
    set((state) => {
      const shapes = new Map(state.shapes)
      shapes.set(shapeId, createDefaultShapeState())
      return { shapes }
    })
  },

  removeShape: (shapeId) => {
    set((state) => {
      const shapes = new Map(state.shapes)
      const shapeState = shapes.get(shapeId)
      if (shapeState?.abortController) {
        shapeState.abortController.abort()
      }
      shapes.delete(shapeId)
      return { shapes }
    })
  },

  updateShapeMessages: (shapeId, messages) => {
    set((state) => {
      const shapes = new Map(state.shapes)
      const current = shapes.get(shapeId) ?? createDefaultShapeState()
      shapes.set(shapeId, { ...current, messages })
      return { shapes }
    })
  },
}))

function saveSettings(get: () => AgentStore) {
  const { apiKey, model } = get()
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiKey, model }))
}
