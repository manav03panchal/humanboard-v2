// Mock Tauri APIs for test environment
import { vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    startDragging: vi.fn(),
    label: 'main',
  })),
  Window: vi.fn(),
}))

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: vi.fn(() => ({
    onDragDropEvent: vi.fn(() => Promise.resolve(() => {})),
  })),
  Webview: vi.fn(() => ({
    setPosition: vi.fn(() => Promise.resolve()),
    setSize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    hide: vi.fn(() => Promise.resolve()),
    show: vi.fn(() => Promise.resolve()),
    once: vi.fn(),
  })),
}))

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalPosition: vi.fn((x: number, y: number) => ({ x, y })),
  LogicalSize: vi.fn((w: number, h: number) => ({ width: w, height: h })),
  PhysicalPosition: vi.fn(),
  PhysicalSize: vi.fn(),
  Position: vi.fn(),
  Size: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}))
