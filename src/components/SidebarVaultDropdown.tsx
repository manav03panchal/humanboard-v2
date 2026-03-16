import { useVaultStore } from '../stores/vaultStore'

export function SidebarVaultDropdown() {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const display = vaultPath?.replace(/^\/Users\/[^/]+/, '~') ?? 'No vault'

  return (
    <div
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid #1a1a1a',
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: '#999',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'block',
        }}
      >
        {display}
      </span>
    </div>
  )
}
