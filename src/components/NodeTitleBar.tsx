import { useEditor } from 'tldraw'
import { X, Copy } from 'lucide-react'
import { getFileIcon } from '../lib/fileIcons'
import { getRelativePath } from '../lib/pathUtils'
import { useFileStore } from '../stores/fileStore'
import { useCallback } from 'react'

interface NodeTitleBarProps {
  filePath: string
  isDirty: boolean
  shapeId: string
  label?: string
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>
  extraActions?: React.ReactNode
}

export function NodeTitleBar({ filePath, isDirty, shapeId, label, icon, extraActions }: NodeTitleBarProps) {
  const editor = useEditor()
  const closeFile = useFileStore((s) => s.closeFile)
  const file = useFileStore((s) => s.files.get(filePath))

  const Icon = icon ?? getFileIcon(filePath, false)
  const displayPath = label ?? getRelativePath(filePath)

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      editor.deleteShape(shapeId as any)
      closeFile(filePath)
    },
    [editor, shapeId, filePath, closeFile]
  )

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (file) {
        navigator.clipboard.writeText(file.content).catch((err) => {
          console.error('Failed to copy to clipboard:', err)
        })
      }
    },
    [file]
  )

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        backgroundColor: 'var(--hb-surface)',
        borderBottom: '1px solid var(--hb-border)',
        cursor: 'grab',
        userSelect: 'none',
        minHeight: 32,
      }}
    >
      <Icon size={14} strokeWidth={1.5} />
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: 'var(--hb-text-muted)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {displayPath}
      </span>
      {isDirty && (
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: 'var(--hb-fg)',
            flexShrink: 0,
          }}
        />
      )}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', gap: 2, pointerEvents: 'all' }}
      >
        {extraActions}
        <button
          onPointerDown={(e) => { e.stopPropagation(); handleCopy(e as any) }}
          style={iconButtonStyle}
          title="Copy content"
        >
          <Copy size={12} strokeWidth={1.5} />
        </button>
        <button
          onPointerDown={(e) => { e.stopPropagation(); handleClose(e as any) }}
          style={iconButtonStyle}
          title="Close"
        >
          <X size={12} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--hb-text-muted)',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 4,
  flexShrink: 0,
}
