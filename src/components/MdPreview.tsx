// ─── Markdown preview ───

import ReactMarkdown from 'react-markdown'
import { useFileStore } from '../stores/fileStore'
import { remarkPlugins, rehypePlugins } from '../lib/editorConfig'

export function MdPreview({ filePath }: { filePath: string }) {
  const file = useFileStore((s) => s.files.get(filePath))

  if (!file) return null

  return (
    <div
      className="markdown-body"
      style={{
        position: 'absolute',
        inset: 0,
        overflowY: 'auto',
        padding: '24px 32px',
        color: 'var(--hb-editor-fg)',
        fontSize: 14,
        lineHeight: 1.7,
      }}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {file.content}
      </ReactMarkdown>
    </div>
  )
}
