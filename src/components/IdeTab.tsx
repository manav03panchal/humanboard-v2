// ─── Tab ───

import { memo, useState } from 'react'
import { Eye, Code, X } from 'lucide-react'
import { useFileStore } from '../stores/fileStore'
import { getFileIcon } from '../lib/fileIcons'

export const Tab = memo(function Tab({ filePath, isActive, isPreview, onTogglePreview, onClick, onClose, onPointerDown, tabIndex, showDropIndicator }: {
  filePath: string
  isActive: boolean
  isPreview?: boolean
  onTogglePreview?: () => void
  onClick: () => void
  onClose: () => void
  onPointerDown: (e: React.PointerEvent) => void
  tabIndex: number
  showDropIndicator: boolean
}) {
  const file = useFileStore((s) => s.files.get(filePath))
  const isDirty = file?.isDirty ?? false
  const fileName = filePath.split('/').pop() ?? filePath
  const Icon = getFileIcon(filePath, false)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      data-active-tab={isActive || undefined}
      data-tab-index={tabIndex}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '0 8px 0 14px',
        height: '100%',
        borderRight: '1px solid var(--hb-border)',
        background: isActive ? 'var(--hb-hover)' : hovered ? 'var(--hb-hover)' : 'transparent',
        color: isActive ? 'var(--hb-fg)' : 'var(--hb-text-muted)',
        cursor: 'grab',
        fontSize: 12,
        fontFamily: '"JetBrains Mono", monospace',
        whiteSpace: 'nowrap',
        borderBottom: isActive ? '1px solid #528bff' : '1px solid transparent',
        borderLeft: showDropIndicator ? '2px solid #528bff' : '2px solid transparent',
        position: 'relative',
      }}
    >
      <Icon size={13} />
      <span>{fileName}</span>
      {onTogglePreview && (
        <button
          onClick={(e) => { e.stopPropagation(); onTogglePreview() }}
          title={isPreview ? 'Edit' : 'Preview'}
          style={{
            display: 'flex', alignItems: 'center', background: 'none', border: 'none',
            color: isPreview ? '#528bff' : 'var(--hb-text-muted)', cursor: 'pointer', padding: 1,
            flexShrink: 0,
          }}
        >
          {isPreview ? <Code size={11} /> : <Eye size={11} />}
        </button>
      )}
      {isDirty && !hovered && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          backgroundColor: '#e5c07b', display: 'inline-block', flexShrink: 0,
        }} />
      )}
      {(hovered || isActive) && (
        <button
          aria-label="Close tab"
          onClick={(e) => { e.stopPropagation(); onClose() }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', color: 'var(--hb-text-muted)', cursor: 'pointer',
            padding: 2, borderRadius: 3, flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--hb-border)'; e.currentTarget.style.color = 'var(--hb-fg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--hb-text-muted)' }}
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
})
