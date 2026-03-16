import { getFileIcon } from '../lib/fileIcons'

interface SidebarFileItemProps {
  name: string
  path: string
  isDir: boolean
  modifiedAt: number
  onClick: (path: string) => void
}

export function SidebarFileItem({ name, path, isDir, modifiedAt, onClick }: SidebarFileItemProps) {
  const Icon = getFileIcon(path, isDir)
  const dateStr = formatDate(modifiedAt)

  return (
    <button
      onClick={() => onClick(path)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        backgroundColor: 'transparent',
        border: 'none',
        color: '#ccc',
        fontSize: 13,
        cursor: 'pointer',
        width: '100%',
        textAlign: 'left',
        borderRadius: 4,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#111')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <Icon size={14} strokeWidth={1.5} color="#666" />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <span style={{ fontSize: 11, color: '#555', flexShrink: 0 }}>{dateStr}</span>
    </button>
  )
}

function formatDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
}
