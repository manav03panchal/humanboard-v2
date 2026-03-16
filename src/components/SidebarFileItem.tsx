import { memo, useCallback } from 'react'
import { getFileIcon } from '../lib/fileIcons'
import { getLanguageName } from '../lib/language'
import type { ContextMenuState } from './SidebarContextMenu'

interface SidebarFileItemProps {
  name: string
  path: string
  isDir: boolean
  modifiedAt: number
  onClick: (path: string) => void
  onContextMenu?: (state: ContextMenuState) => void
}

export const SidebarFileItem = memo(function SidebarFileItem({ name, path, isDir, modifiedAt, onClick, onContextMenu }: SidebarFileItemProps) {
  const Icon = getFileIcon(path, isDir)
  const dateStr = formatDate(modifiedAt)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (isDir || e.button !== 0) return
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
        // Dropped — place at mouse position
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
  }, [path, isDir])

  return (
    <button
      onClick={() => onClick(path)}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.({ x: e.clientX, y: e.clientY, path, isDir })
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        backgroundColor: 'transparent',
        border: 'none',
        color: '#ccc',
        fontSize: 13,
        cursor: isDir ? 'pointer' : 'grab',
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
})

function formatDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
}
