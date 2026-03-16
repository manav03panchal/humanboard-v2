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
        margin: '0 8px 8px',
        backgroundColor: '#0a0a0a',
        border: '1px solid #1a1a1a',
        borderRadius: 6,
      }}
    >
      <Search size={14} strokeWidth={1.5} color="#555" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search..."
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
