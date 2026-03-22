// ─── Terminal Panel (tabbed) ───

import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal as TerminalIcon, Plus, X } from 'lucide-react'
import { createTerminal, getTerminal, mountTerminal, destroyTerminal, updateTerminalTheme, refitAll } from '../lib/terminalManager'
import { useVaultStore } from '../stores/vaultStore'
import { useEditorStore } from '../stores/editorStore'
import { useThemeStore } from '../lib/theme'
import { createDragGhost } from '../lib/pointerDrag'

export let termIdCounter = 0

export interface TermPane {
  id: number
  tabs: { id: number; label: string }[]
  activeTab: number
}

export function TerminalPanel({ onClose }: { onClose: () => void }) {
  const [panes, setPanes] = useState<TermPane[]>(() => {
    const tid = ++termIdCounter
    return [{ id: 1, tabs: [{ id: tid, label: 'zsh' }], activeTab: tid }]
  })
  const [sizes, setSizes] = useState<number[]>([100])
  const paneSlotRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [dragInfo, setDragInfo] = useState<{ termId: number; paneId: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ paneId: number; zone: 'left' | 'right' | 'center' } | null>(null)
  const panesRef = useRef(panes)
  panesRef.current = panes
  const sizesRef = useRef(sizes)
  sizesRef.current = sizes

  const addTab = useCallback((paneId?: number) => {
    const tid = ++termIdCounter
    setPanes((prev) => {
      const targetId = paneId ?? prev[prev.length - 1]?.id
      return prev.map((p) => p.id !== targetId ? p : {
        ...p, tabs: [...p.tabs, { id: tid, label: 'zsh' }], activeTab: tid,
      })
    })
  }, [])

  const closeTab = useCallback((paneId: number, termId: number) => {
    destroyTerminal(termId)
    setPanes((prev) => {
      const pane = prev.find((p) => p.id === paneId)
      if (!pane) return prev
      const nextTabs = pane.tabs.filter((t) => t.id !== termId)
      if (nextTabs.length === 0) {
        const nextPanes = prev.filter((p) => p.id !== paneId)
        if (nextPanes.length === 0) { setTimeout(onClose, 0); return prev }
        setSizes(nextPanes.map(() => 100 / nextPanes.length))
        return nextPanes
      }
      const nextActive = pane.activeTab === termId ? nextTabs[nextTabs.length - 1].id : pane.activeTab
      return prev.map((p) => p.id !== paneId ? p : { ...p, tabs: nextTabs, activeTab: nextActive })
    })
  }, [onClose])

  const activateTab = useCallback((paneId: number, termId: number) => {
    setPanes((prev) => prev.map((p) => p.id !== paneId ? p : { ...p, activeTab: termId }))
  }, [])

  // Pointer-based terminal tab drag
  const termDragRef = useRef<{ termId: number; paneId: number; startX: number; startY: number; dragging: boolean; ghostEl: HTMLDivElement | null } | null>(null)

  const handleTermPointerDown = useCallback((termId: number, paneId: number, e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    termDragRef.current = { termId, paneId, startX: e.clientX, startY: e.clientY, dragging: false, ghostEl: null }
  }, [])

  useEffect(() => {
    const THRESHOLD = 5

    const onMove = (e: PointerEvent) => {
      const drag = termDragRef.current
      if (!drag) return

      if (!drag.dragging) {
        if (Math.abs(e.clientX - drag.startX) < THRESHOLD && Math.abs(e.clientY - drag.startY) < THRESHOLD) return
        drag.dragging = true
        setDragInfo({ termId: drag.termId, paneId: drag.paneId })
        const pane = panesRef.current.find((p) => p.id === drag.paneId)
        const tab = pane?.tabs.find((t) => t.id === drag.termId)
        drag.ghostEl = createDragGhost(tab?.label ?? 'terminal')
      }

      if (drag.ghostEl) {
        drag.ghostEl.style.left = `${e.clientX + 12}px`
        drag.ghostEl.style.top = `${e.clientY - 12}px`
      }

      // Detect drop target pane + zone
      const paneEls = document.querySelectorAll('[data-term-pane]')
      let found = false
      for (const el of paneEls) {
        const rect = el.getBoundingClientRect()
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          const pid = parseInt((el as HTMLElement).dataset.termPane!, 10)
          const x = (e.clientX - rect.left) / rect.width
          const zone = x < 0.3 ? 'left' as const : x > 0.7 ? 'right' as const : 'center' as const
          setDropTarget({ paneId: pid, zone })
          found = true
          break
        }
      }
      if (!found) setDropTarget(null)
    }

    const onUp = () => {
      const drag = termDragRef.current
      termDragRef.current = null
      if (!drag) return
      if (drag.ghostEl) drag.ghostEl.remove()
      if (!drag.dragging) return

      setDragInfo(null)

      // Use dropTarget from state via a ref-like approach
      setDropTarget((currentTarget) => {
        if (!currentTarget) return null

        const { paneId: targetPaneId, zone } = currentTarget
        if (zone === 'center' && drag.paneId === targetPaneId) return null

        setPanes((prev) => {
          let tab: { id: number; label: string } | undefined
          let afterRemove = prev.map((p) => {
            if (p.id !== drag.paneId) return p
            tab = p.tabs.find((t) => t.id === drag.termId)
            const nextTabs = p.tabs.filter((t) => t.id !== drag.termId)
            if (nextTabs.length === 0) return null
            return { ...p, tabs: nextTabs, activeTab: p.activeTab === drag.termId ? nextTabs[nextTabs.length - 1].id : p.activeTab }
          }).filter(Boolean) as TermPane[]
          if (!tab) return prev

          if (zone === 'center') {
            const result = afterRemove.map((p) => p.id !== targetPaneId ? p : {
              ...p, tabs: [...p.tabs, tab!], activeTab: tab!.id,
            })
            setSizes(result.map(() => 100 / result.length))
            return result
          } else {
            const newPaneId = ++termIdCounter
            const newPane: TermPane = { id: newPaneId, tabs: [tab], activeTab: tab.id }
            const idx = afterRemove.findIndex((p) => p.id === targetPaneId)
            if (idx === -1) return prev
            const result = [...afterRemove]
            result.splice(zone === 'left' ? idx : idx + 1, 0, newPane)
            setSizes(result.map(() => 100 / result.length))
            return result
          }
        })

        return null
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Divider resize
  const handleDividerDrag = useCallback((index: number, e: React.PointerEvent) => {
    e.preventDefault()
    const container = e.currentTarget.parentElement
    if (!container) return
    const startX = e.clientX
    const containerWidth = container.parentElement?.offsetWidth ?? container.offsetWidth
    const startSizes = [...sizesRef.current]

    const onMove = (e: PointerEvent) => {
      const delta = (e.clientX - startX) / containerWidth * 100
      const newSizes = [...startSizes]
      newSizes[index] = Math.max(15, startSizes[index] + delta)
      newSizes[index + 1] = Math.max(15, startSizes[index + 1] - delta)
      setSizes(newSizes)
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      requestAnimationFrame(() => refitAll())
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [])

  return (
    <>
      {/* Split panes */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {panes.map((pane, pi) => (
          <div key={pane.id} style={{ display: 'contents' }}>
            <div
              data-term-pane={pane.id}
              style={{ width: `calc(${sizes[pi]}% - ${pi < panes.length - 1 ? 1 : 0}px)`, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}
            >
              {/* Tab bar — terminal tabs + add/close inline */}
              <div style={{
                display: 'flex', alignItems: 'center', height: 30,
                backgroundColor: 'var(--hb-bg)', borderBottom: '1px solid var(--hb-border)',
                padding: '0 4px', flexShrink: 0, overflow: 'hidden',
              }}>
                {pane.tabs.map((tab) => (
                  <div
                    key={tab.id}
                    onPointerDown={(e) => handleTermPointerDown(tab.id, pane.id, e)}
                    onClick={() => activateTab(pane.id, tab.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '0 10px', height: '100%', cursor: 'grab',
                      fontSize: 12, fontFamily: '"JetBrains Mono", monospace',
                      color: tab.id === pane.activeTab ? 'var(--hb-fg)' : 'var(--hb-text-muted)',
                      borderBottom: tab.id === pane.activeTab ? '1px solid #528bff' : '1px solid transparent',
                    }}
                  >
                    <TerminalIcon size={11} />
                    <span>{tab.label}</span>
                    <button
                      aria-label="Close terminal"
                      onClick={(e) => { e.stopPropagation(); closeTab(pane.id, tab.id) }}
                      style={{ background: 'none', border: 'none', color: 'var(--hb-text-muted)', cursor: 'pointer', padding: 1, display: 'flex' }}
                    ><X size={11} /></button>
                  </div>
                ))}
                <button onClick={() => addTab(pane.id)} title="New terminal" style={{
                  background: 'none', border: 'none', color: 'var(--hb-text-muted)',
                  cursor: 'pointer', padding: '0 6px', display: 'flex', alignItems: 'center', height: '100%',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hb-text-muted)' }}
                ><Plus size={12} /></button>
                <button onClick={onClose} title="Close panel" style={{
                  marginLeft: 'auto', background: 'none', border: 'none',
                  color: 'var(--hb-text-muted)', cursor: 'pointer', padding: '0 4px', display: 'flex', alignItems: 'center', height: '100%',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--hb-fg)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--hb-text-muted)' }}
                ><X size={12} /></button>
              </div>

              {/* Terminal area */}
              <div
                ref={(el) => { if (el) paneSlotRefs.current.set(pane.id, el); }}
                style={{ flex: 1, overflow: 'hidden', position: 'relative' }}
              >
                {pane.tabs.map((tab) => {
                  const isActive = tab.id === pane.activeTab
                  return (
                    <div key={tab.id} style={{
                      position: 'absolute', inset: 0,
                      visibility: isActive ? 'visible' : 'hidden',
                      zIndex: isActive ? 1 : 0,
                    }}>
                      <SingleTerminal id={tab.id} visible={isActive} onTitle={(title) => {
                        setPanes((prev) => prev.map((p) => ({
                          ...p,
                          tabs: p.tabs.map((t) => t.id !== tab.id ? t : { ...t, label: title }),
                        })))
                      }} onExit={() => closeTab(pane.id, tab.id)} />
                    </div>
                  )
                })}

                {/* Pointer drag capture overlay — only during drag, sits above terminal canvas */}
                {dragInfo && (
                  <div
                    style={{
                      position: 'absolute', inset: 0, zIndex: 20,
                      backgroundColor: 'transparent',
                    }}
                  />
                )}

                {/* Drop zone overlay */}
                {dropTarget?.paneId === pane.id && dropTarget.zone !== 'center' && (
                  <div style={{
                    position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 25,
                  }}>
                    <div style={{
                      position: 'absolute',
                      backgroundColor: 'rgba(82, 139, 255, 0.12)',
                      border: '2px solid rgba(82, 139, 255, 0.4)',
                      borderRadius: 4,
                      ...(dropTarget.zone === 'left' ? { left: 0, top: 0, bottom: 0, width: '50%' } : { right: 0, top: 0, bottom: 0, width: '50%' }),
                    }} />
                  </div>
                )}
                {dropTarget?.paneId === pane.id && dropTarget.zone === 'center' && (
                  <div style={{
                    position: 'absolute', inset: 4, border: '2px solid rgba(82, 139, 255, 0.3)',
                    borderRadius: 4, pointerEvents: 'none', zIndex: 25,
                  }} />
                )}
              </div>
            </div>

            {/* Divider */}
            {pi < panes.length - 1 && (
              <div
                onPointerDown={(e) => handleDividerDrag(pi, e)}
                style={{
                  width: 1, height: '100%', backgroundColor: 'var(--hb-border)',
                  cursor: 'col-resize', flexShrink: 0, position: 'relative', zIndex: 5,
                }}
              >
                <div style={{ position: 'absolute', left: -3, right: -3, top: 0, bottom: 0 }} />
              </div>
            )}
          </div>
        ))}
      </div>

    </>
  )
}

export function SingleTerminal({ id, visible, onTitle, onExit }: { id: number; visible: boolean; onTitle?: (title: string) => void; onExit?: () => void }) {
  const slotRef = useRef<HTMLDivElement>(null)
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const zedTheme = useThemeStore((s) => s.zedTheme)
  const fontSize = useEditorStore((s) => s.fontSize)

  // Create terminal (if needed) and mount into slot
  useEffect(() => {
    const managed = createTerminal(id, vaultPath || undefined)
    if (onTitle) {
      managed.onTitleChange = (title) => {
        const short = title.split('/').pop()?.split(' ')[0] ?? title
        onTitle(short.substring(0, 20))
      }
    }
    if (onExit) {
      managed.onExit = onExit
    }
    // Don't destroy on unmount — the manager owns the lifecycle
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mount/re-mount the terminal DOM into this slot on every render
  // This is the key — when React re-parents this component, the
  // slot ref changes, and we just appendChild the existing terminal
  // container into the new slot. No unmount, no PTY reset.
  useEffect(() => {
    if (slotRef.current) mountTerminal(id, slotRef.current)
  }, [id])

  // Refit when visible
  useEffect(() => {
    if (visible) {
      const managed = getTerminal(id)
      if (managed) {
        requestAnimationFrame(() => {
          try {
            managed.fitAddon.fit()
            managed.pty.resize(managed.term.cols, managed.term.rows)
            managed.term.focus()
          } catch {}
        })
      }
    }
  }, [visible, id])

  // Theme changes
  useEffect(() => { updateTerminalTheme() }, [zedTheme])

  // Font size changes
  useEffect(() => {
    const managed = getTerminal(id)
    if (!managed) return
    managed.term.options.fontSize = fontSize
    try {
      managed.fitAddon.fit()
      managed.pty.resize(managed.term.cols, managed.term.rows)
    } catch {}
  }, [fontSize, id])

  return <div ref={slotRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
}
