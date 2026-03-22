import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Search } from 'lucide-react'
import { useVaultStore } from '../stores/vaultStore'
import { getFileIcon } from '../lib/fileIcons'
import { getLanguageName } from '../lib/language'
import { fuzzyMatch } from '../lib/fuzzyMatch'

const MAX_RESULTS = 20

export function QuickOpen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fileTree = useVaultStore((s) => s.fileTree)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const files = useMemo(
    () => fileTree.filter((n) => !n.isDir),
    [fileTree]
  )

  const results = useMemo(() => {
    if (!query) return files.slice(0, MAX_RESULTS)
    const scored = files
      .map((f) => ({ node: f, ...fuzzyMatch(query, f.path) }))
      .filter((r) => r.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
    return scored.map((r) => ({ ...r.node, _indices: r.indices }))
  }, [query, files])

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const item = listRef.current.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const openSelected = useCallback(
    async (index: number) => {
      const item = results[index]
      if (!item) return
      const filePath = item.path
      const language = getLanguageName(filePath)
      onClose()
      // Small delay to ensure QuickOpen overlay is gone
      await new Promise((r) => setTimeout(r, 100))
      window.dispatchEvent(
        new CustomEvent('humanboard:open-file', {
          detail: { filePath, language, animate: true },
        })
      )
    },
    [results, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        openSelected(selectedIndex)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    },
    [results.length, selectedIndex, openSelected, onClose]
  )

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 80,
        backgroundColor: 'rgba(0,0,0,0.5)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 500,
          maxHeight: 400,
          backgroundColor: 'var(--hb-surface)',
          border: '1px solid var(--hb-border)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 12px',
            borderBottom: '1px solid var(--hb-border)',
            gap: 8,
          }}
        >
          <Search size={16} color="var(--hb-text-muted)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search files..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--hb-fg)',
              fontSize: 14,
              fontFamily: '"JetBrains Mono", monospace',
            }}
          />
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {results.length === 0 && query && (
            <div style={{ padding: '12px 16px', color: 'var(--hb-text-muted)', fontSize: 13 }}>
              No matching files
            </div>
          )}
          {results.map((item, i) => {
            const Icon = getFileIcon(item.path, false)
            const isSelected = i === selectedIndex
            const indices = new Set((item as any)._indices as number[] | undefined)
            return (
              <div
                key={item.path}
                onClick={() => openSelected(i)}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--hb-border)' : 'transparent',
                }}
              >
                <Icon size={14} color="var(--hb-text-muted)" />
                <span
                  style={{
                    fontSize: 13,
                    fontFamily: '"JetBrains Mono", monospace',
                    color: 'var(--hb-fg)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {query && indices.size > 0
                    ? (() => {
                        const parts: React.ReactNode[] = []
                        let i = 0
                        while (i < item.path.length) {
                          if (indices.has(i)) {
                            let end = i
                            while (end < item.path.length && indices.has(end)) end++
                            parts.push(<span key={i} style={{ color: 'var(--hb-fg)', fontWeight: 600 }}>{item.path.slice(i, end)}</span>)
                            i = end
                          } else {
                            let end = i
                            while (end < item.path.length && !indices.has(end)) end++
                            parts.push(<span key={i}>{item.path.slice(i, end)}</span>)
                            i = end
                          }
                        }
                        return parts
                      })()
                    : item.path}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
