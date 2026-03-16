import { useState, useEffect } from 'react'
import { platform } from '@tauri-apps/plugin-os'

export function usePlatform() {
  const [os, setOs] = useState<string>('macos')

  useEffect(() => {
    try {
      setOs(platform())
    } catch {
      // Fallback to macos if not in Tauri context
    }
  }, [])

  return os
}
