import { create } from 'zustand'

export type AgentModel = 'claude-sonnet-4-0' | 'claude-opus-4-0'

export type AgentStatus = 'idle' | 'running' | 'error' | 'stopped' | 'max_iterations'

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'status' | 'error'
  content: string
  timestamp: number
}

interface AgentStore {
  // Settings
  apiKey: string | null
  model: AgentModel
  setApiKey: (key: string | null) => void
  setModel: (model: AgentModel) => void
  loadSettings: () => void

  // Agent state
  status: AgentStatus
  messages: AgentMessage[]
  currentAction: string | null
  iteration: number
  maxIterations: number
  abortController: AbortController | null

  // Actions
  setStatus: (status: AgentStatus) => void
  addMessage: (msg: Omit<AgentMessage, 'timestamp'>) => void
  setCurrentAction: (action: string | null) => void
  setIteration: (n: number) => void
  setAbortController: (controller: AbortController | null) => void
  clearMessages: () => void
  reset: () => void
}

const SETTINGS_KEY = 'humanboard_agent_settings'

export const useAgentStore = create<AgentStore>((set, get) => ({
  apiKey: null,
  model: 'claude-sonnet-4-0',
  status: 'idle',
  messages: [],
  currentAction: null,
  iteration: 0,
  maxIterations: 20,
  abortController: null,

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

  setStatus: (status) => set({ status }),

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, { ...msg, timestamp: Date.now() }],
    })),

  setCurrentAction: (action) => set({ currentAction: action }),

  setIteration: (n) => set({ iteration: n }),

  setAbortController: (controller) => set({ abortController: controller }),

  clearMessages: () => set({ messages: [], iteration: 0, currentAction: null }),

  reset: () =>
    set({
      status: 'idle',
      messages: [],
      currentAction: null,
      iteration: 0,
      abortController: null,
    }),
}))

function saveSettings(get: () => AgentStore) {
  const { apiKey, model } = get()
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiKey, model }))
}
