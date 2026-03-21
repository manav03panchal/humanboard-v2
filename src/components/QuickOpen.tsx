import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { Search } from 'lucide-react'
import { useVaultStore } from '../stores/vaultStore'
import { getFileIcon } from '../lib/fileIcons'
import { getLanguageName } from '../lib/language'

export interface FuzzyResult {
  match: boolean
  score: number
  indices: number[]
}

export function fuzzyMatch(query: string, target: string): FuzzyResult {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const indices: number[] = []
  let score = 0
  let qi = 0

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti)
      // Consecutive match bonus
      if (indices.length > 1 && indices[indices.length - 2] === ti - 1) {
        score += 2
      } else {
        score += 1
      }
      // Start-of-string or after separator bonus
      if (ti === 0 || t[ti - 1] === '/' || t[ti - 1] === '.' || t[ti - 1] === '-' || t[ti - 1] === '_') {
        score += 3
      }
      qi++
    }
  }

  if (qi < q.length) {
    return { match: false, score: 0, indices: [] }
  }
  return { match: true, score, indices }
}

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
          backgroundColor: '#0a0a0a',
          border: '1px solid #1a1a1a',
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
            borderBottom: '1px solid #1a1a1a',
            gap: 8,
          }}
        >
          <Search size={16} color="#666" />
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
              color: '#e0e0e0',
              fontSize: 14,
              fontFamily: '"JetBrains Mono", monospace',
            }}
          />
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {results.length === 0 && query && (
            <div style={{ padding: '12px 16px', color: '#666', fontSize: 13 }}>
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
                  backgroundColor: isSelected ? '#1a1a1a' : 'transparent',
                }}
              >
                <Icon size={14} color="#666" />
                <span
                  style={{
                    fontSize: 13,
                    fontFamily: '"JetBrains Mono", monospace',
                    color: '#ccc',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {query && indices.size > 0
                    ? item.path.split('').map((ch, ci) => (
                        <span
                          key={ci}
                          style={indices.has(ci) ? { color: '#fff', fontWeight: 600 } : undefined}
                        >
                          {ch}
                        </span>
                      ))
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
