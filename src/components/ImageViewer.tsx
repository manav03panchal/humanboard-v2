// ─── Image viewer ───

import { convertFileSrc } from '@tauri-apps/api/core'
import { useVaultStore } from '../stores/vaultStore'

export function ImageViewer({ filePath }: { filePath: string }) {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  if (!vaultPath) return null

  const src = convertFileSrc(`${vaultPath}/${filePath}`)

  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'auto', backgroundColor: 'var(--hb-bg)',
    }}>
      <img
        src={src}
        alt={filePath}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }}
      />
    </div>
  )
}
