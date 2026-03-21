import { memo } from 'react'
import { Search } from 'lucide-react'

interface SidebarSearchProps {
  value: string
  onChange: (value: string) => void
}

export const SidebarSearch = memo(function SidebarSearch({ value, onChange }: SidebarSearchProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        backgroundColor: 'var(--hb-surface)',
        border: '1px solid var(--hb-border)',
        borderRadius: 5,
      }}
    >
      <Search size={13} strokeWidth={1.5} color="var(--hb-text-muted)" />
      <input
        data-sidebar-search
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search..."
        onKeyDown={(e) => { if (e.key === 'Escape') { onChange(''); (e.target as HTMLInputElement).blur() } }}
        style={{
          flex: 1,
          backgroundColor: 'transparent',
          border: 'none',
          color: 'var(--hb-fg)',
          fontSize: 13,
          outline: 'none',
        }}
      />
    </div>
  )
})
