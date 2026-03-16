import { useVaultStore } from '../stores/vaultStore'
import { SidebarFileItem } from './SidebarFileItem'
import { useMemo } from 'react'

interface SidebarFileListProps {
  searchQuery: string
  onFileClick: (path: string) => void
}

export function SidebarFileList({ searchQuery, onFileClick }: SidebarFileListProps) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const sortMode = useVaultStore((s) => s.sidebarSort)

  const files = useMemo(() => {
    let filtered = fileTree.filter((f) => !f.isDir)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((f) => f.name.toLowerCase().includes(q))
    }
    if (sortMode === 'date') {
      filtered.sort((a, b) => b.modifiedAt - a.modifiedAt)
    } else {
      filtered.sort((a, b) => a.name.localeCompare(b.name))
    }
    return filtered
  }, [fileTree, searchQuery, sortMode])

  const grouped = useMemo(() => {
    if (sortMode !== 'date') return null
    const groups = new Map<string, typeof files>()
    for (const file of files) {
      const d = new Date(file.modifiedAt * 1000)
      const key = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(file)
    }
    return groups
  }, [files, sortMode])

  if (sortMode === 'date' && grouped) {
    return (
      <div style={{ overflow: 'auto', flex: 1 }}>
        {Array.from(grouped.entries()).map(([date, items]) => (
          <div key={date}>
            <div style={{ padding: '8px 12px 4px', fontSize: 11, color: '#555', fontWeight: 600 }}>
              {date}
            </div>
            {items.map((f) => (
              <SidebarFileItem key={f.path} {...f} onClick={onFileClick} />
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {files.map((f) => (
        <SidebarFileItem key={f.path} {...f} onClick={onFileClick} />
      ))}
    </div>
  )
}
