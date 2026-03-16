import { useVaultStore, TreeNode } from '../stores/vaultStore'

function FileTreeItem({ node, onSelect, selectedPath }: {
  node: TreeNode
  onSelect: (path: string) => void
  selectedPath: string | null
}) {
  const isSelected = node.path === selectedPath

  if (node.isDir) {
    return (
      <div className="tree-folder">
        <div className="tree-item tree-folder-name">{node.name}</div>
      </div>
    )
  }

  return (
    <div
      className={`tree-item tree-file ${isSelected ? 'tree-file--selected' : ''}`}
      onClick={() => onSelect(node.path)}
    >
      {node.name}
    </div>
  )
}

export function Sidebar({ selectedFile, onSelectFile }: {
  selectedFile: string | null
  onSelectFile: (path: string) => void
}) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const sidebarOpen = useVaultStore((s) => s.sidebarOpen)
  const sidebarSort = useVaultStore((s) => s.sidebarSort)
  const setSidebarSort = useVaultStore((s) => s.setSidebarSort)

  if (!sidebarOpen) return null

  const sorted = [...fileTree].sort((a, b) => {
    if (sidebarSort === 'date') return b.modifiedAt - a.modifiedAt
    return a.name.localeCompare(b.name)
  })

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Files</span>
        <button
          className="sidebar-sort-btn"
          onClick={() => setSidebarSort(sidebarSort === 'date' ? 'alpha' : 'date')}
          title={`Sort by ${sidebarSort === 'date' ? 'name' : 'date'}`}
        >
          {sidebarSort === 'date' ? 'A→Z' : '🕐'}
        </button>
      </div>
      <div className="sidebar-tree">
        {sorted.map((node) => (
          <FileTreeItem
            key={node.path}
            node={node}
            onSelect={onSelectFile}
            selectedPath={selectedFile}
          />
        ))}
        {sorted.length === 0 && (
          <div className="sidebar-empty">No files yet</div>
        )}
      </div>
    </aside>
  )
}
