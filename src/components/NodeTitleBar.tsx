import type { TLShapeId } from 'tldraw'
import { getFileName } from '../lib/pathUtils'
import { getFileIcon } from '../lib/fileIcons'
import { getLanguageName } from '../lib/language'

interface NodeTitleBarProps {
  filePath: string
  isDirty: boolean
  shapeId: TLShapeId
}

export function NodeTitleBar({ filePath, isDirty }: NodeTitleBarProps) {
  const fileName = getFileName(filePath)
  const Icon = getFileIcon(filePath, false)
  const lang = getLanguageName(filePath)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        backgroundColor: '#0a0a0a',
        borderBottom: '1px solid #1a1a1a',
        fontSize: 12,
        color: '#aaa',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <Icon size={14} style={{ flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {fileName}
        {isDirty && <span style={{ color: '#f59e0b', marginLeft: 4 }}>●</span>}
      </span>
      <span style={{ marginLeft: 'auto', color: '#555', fontSize: 11 }}>{lang}</span>
    </div>
  )
}
