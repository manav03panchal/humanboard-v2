import { useFileStore } from '../stores/fileStore'

export function Editor({ filePath }: { filePath: string | null }) {
  const files = useFileStore((s) => s.files)
  const updateContent = useFileStore((s) => s.updateContent)

  if (!filePath) {
    return (
      <div className="editor editor--empty">
        <p>Open a file from the sidebar to start editing</p>
      </div>
    )
  }

  const file = files.get(filePath)
  if (!file) {
    return (
      <div className="editor editor--empty">
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="editor">
      <div className="editor-header">
        <span className="editor-filename">
          {filePath.split('/').pop()}
          {file.isDirty && <span className="editor-dirty"> *</span>}
        </span>
      </div>
      <textarea
        className="editor-textarea"
        value={file.content}
        onChange={(e) => updateContent(filePath, e.target.value)}
        spellCheck={false}
      />
    </div>
  )
}
