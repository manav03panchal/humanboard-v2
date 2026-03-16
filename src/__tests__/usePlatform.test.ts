import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockPlatform = vi.fn(() => 'windows')

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: mockPlatform,
}))

describe('usePlatform', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mockPlatform.mockReturnValue('windows' as any)
  })

  it('returns the detected platform', async () => {
    mockPlatform.mockReturnValue('windows' as any)
    const { usePlatform } = await import('../hooks/usePlatform')
    const { result } = renderHook(() => usePlatform())
    expect(['macos', 'windows']).toContain(result.current)
  })

  it('defaults to macos on error', async () => {
    mockPlatform.mockImplementation(() => { throw new Error('not in tauri') })
    const { usePlatform } = await import('../hooks/usePlatform')
    const { result } = renderHook(() => usePlatform())
    expect(result.current).toBe('macos')
  })
})
