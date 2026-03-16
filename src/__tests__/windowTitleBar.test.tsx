import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const mockPlatform = vi.fn(() => 'macos')

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: mockPlatform,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  })),
}))

describe('WindowTitleBar', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('renders nothing on macOS', async () => {
    mockPlatform.mockReturnValue('macos' as any)
    const { WindowTitleBar } = await import('../components/WindowTitleBar')
    const { container } = render(<WindowTitleBar />)
    expect(container.innerHTML).toBe('')
  })

  it('renders titlebar with buttons on Windows', async () => {
    mockPlatform.mockReturnValue('windows' as any)
    const { WindowTitleBar } = await import('../components/WindowTitleBar')
    const { container } = render(<WindowTitleBar />)
    expect(container.querySelector('[data-tauri-drag-region]')).toBeTruthy()
    expect(container.querySelectorAll('button')).toHaveLength(3)
  })

  it('renders titlebar with buttons on Linux', async () => {
    mockPlatform.mockReturnValue('linux' as any)
    const { WindowTitleBar } = await import('../components/WindowTitleBar')
    const { container } = render(<WindowTitleBar />)
    expect(container.querySelector('[data-tauri-drag-region]')).toBeTruthy()
    expect(container.querySelectorAll('button')).toHaveLength(3)
  })

  it('has minimize, maximize, and close buttons with correct titles', async () => {
    mockPlatform.mockReturnValue('windows' as any)
    const { WindowTitleBar } = await import('../components/WindowTitleBar')
    const { container } = render(<WindowTitleBar />)
    const buttons = container.querySelectorAll('button')
    expect(buttons[0].title).toBe('Minimize')
    expect(buttons[1].title).toBe('Maximize')
    expect(buttons[2].title).toBe('Close')
  })
})
