import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAgentStore } from '../stores/agentStore'

// Mock localStorage for test environment
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { localStorageMock.store[key] = value }),
  removeItem: vi.fn((key: string) => { delete localStorageMock.store[key] }),
  clear: vi.fn(() => { localStorageMock.store = {} }),
  get length() { return Object.keys(localStorageMock.store).length },
  key: vi.fn((_i: number) => null),
}
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('agentStore per-shape state', () => {
  beforeEach(() => {
    localStorageMock.clear()
    // Reset the store between tests
    useAgentStore.setState({ shapes: new Map(), apiKey: null, model: 'claude-sonnet-4-0' })
  })

  it('returns default state for unknown shape', () => {
    const state = useAgentStore.getState().getShapeState('shape-1')
    expect(state.status).toBe('idle')
    expect(state.messages).toEqual([])
    expect(state.currentAction).toBeNull()
    expect(state.iteration).toBe(0)
    expect(state.maxIterations).toBe(20)
    expect(state.abortController).toBeNull()
  })

  it('sets status per shape independently', () => {
    const store = useAgentStore.getState()
    store.setShapeStatus('shape-1', 'running')
    store.setShapeStatus('shape-2', 'error')

    expect(store.getShapeState('shape-1').status).toBe('running')
    expect(store.getShapeState('shape-2').status).toBe('error')
    expect(store.getShapeState('shape-3').status).toBe('idle')
  })

  it('adds messages per shape independently', () => {
    const store = useAgentStore.getState()
    store.addShapeMessage('shape-1', { role: 'user', content: 'hello' })
    store.addShapeMessage('shape-2', { role: 'user', content: 'world' })
    store.addShapeMessage('shape-1', { role: 'assistant', content: 'hi' })

    const s1 = store.getShapeState('shape-1')
    const s2 = store.getShapeState('shape-2')

    expect(s1.messages).toHaveLength(2)
    expect(s1.messages[0].content).toBe('hello')
    expect(s1.messages[1].content).toBe('hi')

    expect(s2.messages).toHaveLength(1)
    expect(s2.messages[0].content).toBe('world')
  })

  it('clears messages for a specific shape only', () => {
    const store = useAgentStore.getState()
    store.addShapeMessage('shape-1', { role: 'user', content: 'hello' })
    store.addShapeMessage('shape-2', { role: 'user', content: 'world' })

    store.clearShapeMessages('shape-1')

    expect(store.getShapeState('shape-1').messages).toHaveLength(0)
    expect(store.getShapeState('shape-2').messages).toHaveLength(1)
  })

  it('resets a specific shape to defaults', () => {
    const store = useAgentStore.getState()
    store.setShapeStatus('shape-1', 'running')
    store.addShapeMessage('shape-1', { role: 'user', content: 'test' })
    store.setShapeIteration('shape-1', 5)

    store.resetShape('shape-1')

    const state = store.getShapeState('shape-1')
    expect(state.status).toBe('idle')
    expect(state.messages).toEqual([])
    expect(state.iteration).toBe(0)
  })

  it('removes a shape and aborts its controller', () => {
    const store = useAgentStore.getState()
    const controller = new AbortController()
    store.setShapeAbortController('shape-1', controller)
    store.setShapeStatus('shape-1', 'running')

    store.removeShape('shape-1')

    expect(controller.signal.aborted).toBe(true)
    // After removal, getShapeState returns defaults
    expect(store.getShapeState('shape-1').status).toBe('idle')
  })

  it('sets current action per shape', () => {
    const store = useAgentStore.getState()
    store.setShapeCurrentAction('shape-1', 'Clicking...')
    store.setShapeCurrentAction('shape-2', 'Typing...')

    expect(store.getShapeState('shape-1').currentAction).toBe('Clicking...')
    expect(store.getShapeState('shape-2').currentAction).toBe('Typing...')
  })

  it('sets iteration per shape', () => {
    const store = useAgentStore.getState()
    store.setShapeIteration('shape-1', 3)
    store.setShapeIteration('shape-2', 7)

    expect(store.getShapeState('shape-1').iteration).toBe(3)
    expect(store.getShapeState('shape-2').iteration).toBe(7)
  })

  it('updates messages for a shape', () => {
    const store = useAgentStore.getState()
    store.addShapeMessage('shape-1', { role: 'user', content: 'original' })

    const updatedMessages = [
      { role: 'user' as const, content: 'original', timestamp: Date.now() },
      { role: 'assistant' as const, content: 'updated response', timestamp: Date.now() },
    ]
    store.updateShapeMessages('shape-1', updatedMessages)

    expect(store.getShapeState('shape-1').messages).toHaveLength(2)
    expect(store.getShapeState('shape-1').messages[1].content).toBe('updated response')
  })

  it('keeps global settings separate from per-shape state', () => {
    const store = useAgentStore.getState()
    store.setApiKey('test-key')
    store.setModel('claude-opus-4-0')
    store.setShapeStatus('shape-1', 'running')

    expect(useAgentStore.getState().apiKey).toBe('test-key')
    expect(useAgentStore.getState().model).toBe('claude-opus-4-0')
    expect(store.getShapeState('shape-1').status).toBe('running')
  })
})
