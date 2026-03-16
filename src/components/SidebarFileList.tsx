import { useVaultStore } from '../stores/vaultStore'
import { SidebarFileItem } from './SidebarFileItem'
import { SidebarTreeView } from './SidebarTreeView'
import { useMemo } from 'react'

interface SidebarFileListProps {
  searchQuery: string
  onFileClick: (path: string) => void
}

export function SidebarFileList({ searchQuery, onFileClick }: SidebarFileListProps) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const sortMode = useVaultStore((s) => s.sidebarSort)

  // All hooks must run before any conditional returns
  const files = useMemo(() => {
    let filtered = fileTree.filter((f) => !f.isDir)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter((f) => f.name.toLowerCase().includes(q))
    }
    filtered.sort((a, b) => b.modifiedAt - a.modifiedAt)
    return filtered
  }, [fileTree, searchQuery])

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof files>()
    for (const file of files) {
      const d = new Date(file.modifiedAt * 1000)
      const key = d
        .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        .toUpperCase()
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(file)
    }
    return groups
  }, [files])

  // Alpha mode → proper folder tree
  if (sortMode === 'alpha') {
    return <SidebarTreeView entries={fileTree} searchQuery={searchQuery} onFileClick={onFileClick} />
  }

  // Date mode → flat list grouped by date
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
