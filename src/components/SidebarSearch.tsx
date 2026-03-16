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
        padding: '5px 10px',
        backgroundColor: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: 6,
      }}
    >
      <Search size={14} strokeWidth={1.5} color="#555" />
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
          color: '#ccc',
          fontSize: 13,
          outline: 'none',
        }}
      />
    </div>
  )
})
