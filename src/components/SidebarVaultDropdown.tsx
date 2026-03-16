import { ChevronDown } from 'lucide-react'
import { useVaultStore } from '../stores/vaultStore'

export function SidebarVaultDropdown() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const display = vaultPath?.replace(/^\/Users\/[^/]+/, '~') ?? 'No vault'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        borderBottom: '1px solid #1a1a1a',
        cursor: 'pointer',
      }}
    >
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: '#999',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {display}
      </span>
      <ChevronDown size={14} strokeWidth={1.5} color="#666" />
    </div>
  )
}
