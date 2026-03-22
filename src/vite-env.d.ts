/// <reference types="vite/client" />

declare global {
  interface Window {
    __humanboard_editor?: import('tldraw').Editor | { current: import('tldraw').Editor | null }
    __humanboard_dragging_file?: string
    __humanboard_vault_path?: string
  }
}

export {}
