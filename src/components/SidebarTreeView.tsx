import { useState, useMemo, useCallback } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import { getFileIcon } from '../lib/fileIcons'
import { getLanguageName } from '../lib/language'
import { useDiagnosticStore } from '../stores/diagnosticStore'
import type { TreeNode } from '../stores/vaultStore'
import type { ContextMenuState } from './SidebarContextMenu'

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
  onContextMenu?: (state: ContextMenuState) => void
}

export function SidebarTreeView({ entries, searchQuery, onFileClick, onContextMenu }: SidebarTreeViewProps) {
  const tree = useMemo(() => buildTree(entries), [entries])

  const filtered = useMemo(() => {
    if (!searchQuery) return null
    const q = searchQuery.toLowerCase()
    return entries
      .filter((f) => !f.isDir && f.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [entries, searchQuery])

  if (filtered) {
    return (
      <div style={{ overflow: 'auto', flex: 1 }}>
        {filtered.map((f) => (
          <TreeFileItem key={f.path} name={f.name} path={f.path} depth={0} onClick={onFileClick} onContextMenu={onContextMenu} />
        ))}
        <div style={{ height: 32 }} />
      </div>
    )
  }

  return (
    <div style={{ overflow: 'auto', flex: 1 }}>
      {tree.map((node) => (
        <TreeItem key={node.path} node={node} depth={0} onFileClick={onFileClick} onContextMenu={onContextMenu} />
      ))}
      <div style={{ height: 32 }} />
    </div>
  )
}

function TreeItem({
  node,
  depth,
  onFileClick,
  onContextMenu,
}: {
  node: TreeNodeData
  depth: number
  onFileClick: (path: string) => void
  onContextMenu?: (state: ContextMenuState) => void
}) {
  const [expanded, setExpanded] = useState(depth < 1)

  if (!node.isDir) {
    return <TreeFileItem name={node.name} path={node.path} depth={depth} onClick={onFileClick} onContextMenu={onContextMenu} />
  }

  const Icon = getFileIcon(node.path, true, expanded)
  const Chevron = expanded ? ChevronDown : ChevronRight

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onContextMenu?.({ x: e.clientX, y: e.clientY, path: node.path, isDir: true })
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          paddingLeft: 8 + depth * 14,
          backgroundColor: 'transparent',
          border: 'none',
          color: 'var(--hb-fg)',
          fontSize: 14,
          cursor: 'pointer',
          width: '100%',
          textAlign: 'left',
          borderRadius: 3,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hb-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
      >
        <Chevron size={11} strokeWidth={1.5} color="var(--hb-text-muted)" />
        <Icon size={14} strokeWidth={1.5} color="var(--hb-text-muted)" />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
      </button>
      {expanded &&
        node.children.map((child) => (
          <TreeItem key={child.path} node={child} depth={depth + 1} onFileClick={onFileClick} onContextMenu={onContextMenu} />
        ))}
    </div>
  )
}

function TreeFileItem({
  name,
  path,
  depth,
  onClick,
  onContextMenu,
}: {
  name: string
  path: string
  depth: number
  onClick: (path: string) => void
  onContextMenu?: (state: ContextMenuState) => void
}) {
  const Icon = getFileIcon(path, false)
  const diag = useDiagnosticStore((s) => s.files.get(path))

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    const startX = e.clientX
    const startY = e.clientY
    let dragging = false

    const onMove = (ev: MouseEvent) => {
      if (!dragging && (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5)) {
        dragging = true
        document.body.style.cursor = 'grabbing'
      }
    }

    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      if (dragging) {
        const language = getLanguageName(path)
        window.dispatchEvent(
          new CustomEvent('humanboard:open-file', {
            detail: { filePath: path, language, dropX: ev.clientX, dropY: ev.clientY },
          })
        )
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [path])

  return (
    <button
      onClick={() => onClick(path)}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.({ x: e.clientX, y: e.clientY, path, isDir: false })
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        paddingLeft: 8 + depth * 14 + 14,
        backgroundColor: 'transparent',
        border: 'none',
        color: 'var(--hb-fg)',
        fontSize: 14,
        cursor: 'grab',
        width: '100%',
        textAlign: 'left',
        borderRadius: 3,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--hb-hover)')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      <Icon size={14} strokeWidth={1.5} color="var(--hb-text-muted)" />
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      {diag && (
        <span style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
          {diag.errors > 0 && (
            <span style={{ fontSize: 10, color: '#e06c75', fontWeight: 600 }}>{diag.errors}</span>
          )}
          {diag.warnings > 0 && (
            <span style={{ fontSize: 10, color: '#e5c07b', fontWeight: 600 }}>{diag.warnings}</span>
          )}
        </span>
      )}
    </button>
  )
}
