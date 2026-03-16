import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { getFileIcon } from '../lib/fileIcons'
import type { TreeNode } from '../stores/vaultStore'

interface TreeNodeData {
  name: string
  path: string
  isDir: boolean
  modifiedAt: number
  children: TreeNodeData[]
}

function buildTree(entries: TreeNode[]): TreeNodeData[] {
  const root: TreeNodeData[] = []
  const dirMap = new Map<string, TreeNodeData>()

  for (const entry of entries) {
    const node: TreeNodeData = {
      name: entry.name,
      path: entry.path,
      isDir: entry.isDir,
      modifiedAt: entry.modifiedAt,
      children: [],
    }

    if (entry.isDir) {
      dirMap.set(entry.path, node)
    }

    // Find parent by stripping last path segment
    const lastSlash = entry.path.lastIndexOf('/')
    if (lastSlash === -1) {
      // Top-level entry
      root.push(node)
    } else {
      const parentPath = entry.path.substring(0, lastSlash)
      const parent = dirMap.get(parentPath)
      if (parent) {
        parent.children.push(node)
      } else {
        // Orphan — parent wasn't in the list, put at root
        root.push(node)
      }
    }
  }

  // Sort each level: dirs first, then alphabetical
  const sortChildren = (nodes: TreeNodeData[]) => {
    nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1
      if (!a.isDir && b.isDir) return 1
      return a.name.localeCompare(b.name)
    })
    for (const node of nodes) {
      if (node.children.length > 0) sortChildren(node.children)
    }
  }
  sortChildren(root)

  return root
}

interface SidebarTreeViewProps {
  entries: TreeNode[]
  searchQuery: string
  onFileClick: (path: string) => void
}

export function SidebarTreeView({ entries, searchQuery, onFileClick }: SidebarTreeViewProps) {
  if (searchQuery) {
    const q = searchQuery.toLowerCase()
    const filtered = entries
      .filter((f) => !f.isDir && f.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))

    return (
      <div style={{ overflow: 'auto', flex: 1 }}>
        {filtered.map((f) => (
          <TreeFileItem key={f.path} name={f.name} path={f.path} depth={0} onClick={onFileClick} />
        ))}
      </div>
    )
  }

  const tree = useMemo(() => buildTree(entries), [entries])

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {tree.map((node) => (
        <TreeItem key={node.path} node={node} depth={0} onFileClick={onFileClick} />
      ))}
    </div>
  )
}

function TreeItem({
  node,
  depth,
  onFileClick,
}: {
  node: TreeNodeData
  depth: number
  onFileClick: (path: string) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)

  if (!node.isDir) {
    return <TreeFileItem name={node.name} path={node.path} depth={depth} onClick={onFileClick} />
  }

  const Icon = getFileIcon(node.path, true, expanded)
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          paddingLeft: 8 + depth * 16,
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
        <Chevron size={12} strokeWidth={1.5} color="#555" />
        <Icon size={14} strokeWidth={1.5} color="#666" />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
      </button>
      {expanded &&
        node.children.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} onFileClick={onFileClick} />
        ))}
    </div>
  )
}

function TreeFileItem({
  name,
  path,
  depth,
  onClick,
}: {
  name: string
  path: string
  depth: number
  onClick: (path: string) => void
}) {
  const Icon = getFileIcon(path, false)

  return (
    <button
      onClick={() => onClick(path)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 8px',
        paddingLeft: 8 + depth * 16 + 16,
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
    </button>
  )
}
