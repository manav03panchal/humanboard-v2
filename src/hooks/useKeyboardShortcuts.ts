import { useEffect } from 'react'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (_e: KeyboardEvent) => {
      // Keyboard shortcuts will be added in a future ticket
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
