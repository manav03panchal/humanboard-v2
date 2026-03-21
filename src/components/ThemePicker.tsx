import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { BUNDLED_THEMES, type BundledTheme } from '../lib/themes'
import { useThemeStore } from '../lib/theme'
import { useVaultStore } from '../stores/vaultStore'

interface ThemePickerProps {
  open: boolean
  onClose: () => void
}

export function ThemePicker({ open, onClose }: ThemePickerProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const activeThemeId = useThemeStore((s) => s.activeThemeId)
  const setTheme = useThemeStore((s) => s.setTheme)
  const previewThemeById = useThemeStore((s) => s.previewThemeById)
  const cancelPreview = useThemeStore((s) => s.cancelPreview)
  const vaultPath = useVaultStore((s) => s.vaultPath)

  const filtered = query
    ? BUNDLED_THEMES.filter((t) => t.label.toLowerCase().includes(query.toLowerCase()))
    : BUNDLED_THEMES

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Preview on selection change
  useEffect(() => {
    if (!open || filtered.length === 0) return
    const theme = filtered[selectedIndex]
    if (theme) previewThemeById(theme.id)
  }, [selectedIndex, open, filtered, previewThemeById])

  const handleSelect = useCallback((theme: BundledTheme) => {
    if (vaultPath) setTheme(vaultPath, theme.id)
    onClose()
  }, [vaultPath, setTheme, onClose])

  const handleCancel = useCallback(() => {
    cancelPreview()
    onClose()
  }, [cancelPreview, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) handleSelect(filtered[selectedIndex])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }, [filtered, selectedIndex, handleSelect, handleCancel])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement
    if (item) item.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  return (
    <div
      onClick={handleCancel}
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
        onKeyDown={handleKeyDown}
        style={{
          width: 400,
          maxHeight: 400,
          backgroundColor: 'var(--hb-surface)',
          border: '1px solid var(--hb-border)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
          placeholder="Select Color Theme..."
          style={{
            padding: '10px 14px',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--hb-border)',
            outline: 'none',
            color: 'var(--hb-fg)',
            fontSize: 14,
            fontFamily: '"JetBrains Mono", monospace',
          }}
        />
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {filtered.map((theme, i) => {
            const isActive = theme.id === activeThemeId
            const isSelected = i === selectedIndex
            const darkTheme = theme.family.themes.find((t) => t.appearance === 'dark') ?? theme.family.themes[0]
            const bg = darkTheme?.style?.background ?? '#000'

            return (
              <div
                key={theme.id}
                onClick={() => handleSelect(theme)}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 14px',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--hb-border)' : 'transparent',
                  color: isSelected ? 'var(--hb-fg)' : 'var(--hb-text-muted)',
                  fontSize: 13,
                  fontFamily: '"JetBrains Mono", monospace',
                }}
              >
                <span style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  backgroundColor: bg, border: '1px solid var(--hb-border)',
                }} />
                <span style={{ flex: 1 }}>{theme.label}</span>
                {isActive && <Check size={14} color="#528bff" />}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ padding: '12px 14px', color: 'var(--hb-text-muted)', fontSize: 13 }}>
              No matching themes
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
