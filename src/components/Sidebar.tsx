import { useState } from 'react'
import { useVaultStore } from '../stores/vaultStore'
import { SidebarVaultDropdown } from './SidebarVaultDropdown'
import { SidebarSearch } from './SidebarSearch'
import { SidebarFileList } from './SidebarFileList'
import { ArrowUpDown } from 'lucide-react'

interface SidebarProps {
  onFileClick: (path: string) => void
}

export function Sidebar({ onFileClick }: SidebarProps) {
  const sidebarOpen = useVaultStore((s) => s.sidebarOpen)
  const sidebarSort = useVaultStore((s) => s.sidebarSort)
  const setSidebarSort = useVaultStore((s) => s.setSidebarSort)
  const [searchQuery, setSearchQuery] = useState('')

  if (!sidebarOpen) return null

  return (
    <div
      style={{
        width: 260,
        height: '100%',
        backgroundColor: '#000',
        borderRight: '1px solid #1a1a1a',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 50,
      }}
    >
      <div style={{ height: 28 }} /> {/* titlebar spacer */}
      <SidebarVaultDropdown />
      <SidebarSearch value={searchQuery} onChange={setSearchQuery} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 12px 4px',
        }}
      >
        <button
          onClick={() => setSidebarSort(sidebarSort === 'date' ? 'alpha' : 'date')}
          style={{
            background: 'none',
            border: 'none',
            color: '#555',
            cursor: 'pointer',
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <ArrowUpDown size={12} />
          {sidebarSort === 'date' ? 'Created' : 'A-Z'}
        </button>
      </div>
      <SidebarFileList searchQuery={searchQuery} onFileClick={onFileClick} />
    </div>
  )
}
