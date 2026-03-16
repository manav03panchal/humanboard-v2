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
}

export function NodeTitleBar({ filePath, isDirty, shapeId, label, icon }: NodeTitleBarProps) {
  const editor = useEditor()
  const closeFile = useFileStore((s) => s.closeFile)
  const file = useFileStore((s) => s.files.get(filePath))

  const Icon = icon ?? getFileIcon(filePath, false)
  const displayPath = label ?? getRelativePath(filePath)

  const handleClose = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      editor.deleteShape(shapeId as any)
      closeFile(filePath)
    },
    [editor, shapeId, filePath, closeFile]
  )

  const handleCopy = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation()
      if (file) navigator.clipboard.writeText(file.content)
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
        backgroundColor: '#0a0a0a',
        borderBottom: '1px solid #1a1a1a',
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
          color: '#999',
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
            backgroundColor: '#fff',
            flexShrink: 0,
          }}
        />
      )}
      <button
        onPointerDown={handleCopy}
        style={iconButtonStyle}
        title="Copy content"
      >
        <Copy size={12} strokeWidth={1.5} />
      </button>
      <button
        onPointerDown={handleClose}
        style={iconButtonStyle}
        title="Close"
      >
        <X size={12} strokeWidth={1.5} />
      </button>
    </div>
  )
}

const iconButtonStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#666',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 4,
  flexShrink: 0,
}
