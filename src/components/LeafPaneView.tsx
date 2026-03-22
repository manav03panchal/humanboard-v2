// ─── Leaf pane (tab bar + editor) ───

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LeafPane, DropZone, PaneHandlers } from '../lib/paneModel'
import { pointerDrag, setPointerDrag, getDropZoneFromPointer } from '../lib/pointerDrag'
import { MARKDOWN_EXTENSIONS as MD_EXTS, IMAGE_EXTENSIONS as IMAGE_EXTS, getExt } from '../lib/fileTypes'
import { useVaultStore } from '../stores/vaultStore'
import { Tab } from './IdeTab'
import { IdeEditor } from './IdeEditor'
import { ImageViewer } from './ImageViewer'
import { MdPreview } from './MdPreview'

export function LeafPaneView({ pane, onCloseTab, onActivateTab, onReorderTabs: _onReorderTabs, onDropOnPane: _onDropOnPane, previewFiles, onTogglePreview }: PaneHandlers & { pane: LeafPane }) {
  const vaultPath = useVaultStore((s) => s.vaultPath)
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null)

  // Scroll active tab into view
  useEffect(() => {
    if (!tabBarRef.current || !pane.activeTab) return
    const activeEl = tabBarRef.current.querySelector('[data-active-tab="true"]') as HTMLElement | null
    activeEl?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [pane.activeTab])
  const activeExt = getExt(pane.activeTab ?? '')
  const isMarkdown = MD_EXTS.has(activeExt)
  const isImage = IMAGE_EXTS.has(activeExt)
  const mdPreview = pane.activeTab ? previewFiles.has(pane.activeTab) : false

  // Pointer-based tab drag (replaces HTML5 drag/drop for macOS WebKit compat)
  const handleTabPointerDown = useCallback((filePath: string, e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    setPointerDrag({
      filePath,
      sourcePaneId: pane.id,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      ghostEl: null,
    })
  }, [pane.id])

  // Listen for global drag events — each pane updates its OWN visual state
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!pointerDrag || !pointerDrag.dragging) return

      // Update this pane's drop zone if pointer is over our editor area
      if (contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect()
        if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
          setDropZone(getDropZoneFromPointer(e.clientX, e.clientY, contentRef.current))
        } else {
          setDropZone(null)
        }
      }

      // Update this pane's tab indicator if pointer is over our tabs
      if (tabBarRef.current) {
        const tabEls = tabBarRef.current.querySelectorAll('[data-tab-index]')
        let found = false
        tabEls.forEach((el) => {
          const r = el.getBoundingClientRect()
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            setDragOverTabIndex(parseInt((el as HTMLElement).dataset.tabIndex!, 10))
            found = true
          }
        })
        if (!found) setDragOverTabIndex(null)
      }
    }

    const onUp = () => {
      // Clean up our visual state when any drag ends
      setDropZone(null)
      setDragOverTabIndex(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [pane.id])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
      {/* Tab bar */}
      <div
        ref={tabBarRef}
        data-pane-tabbar={pane.id}
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 36,
          backgroundColor: 'var(--hb-surface)',
          borderBottom: '1px solid var(--hb-border)',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          flexShrink: 0,
        }}
      >
        {pane.tabs.map((filePath, i) => (
          <Tab
            key={filePath}
            filePath={filePath}
            isActive={filePath === pane.activeTab}
            isPreview={previewFiles.has(filePath)}
            onTogglePreview={MD_EXTS.has(getExt(filePath)) ? () => onTogglePreview(filePath) : undefined}
            onClick={() => onActivateTab(pane.id, filePath)}
            onClose={() => onCloseTab(pane.id, filePath)}
            onPointerDown={(e) => handleTabPointerDown(filePath, e)}
            tabIndex={i}
            showDropIndicator={dragOverTabIndex === i}
          />
        ))}
      </div>

      {/* Editor area with drop zones */}
      <div
        ref={contentRef}
        data-pane-content={pane.id}
        style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}
      >
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {pane.activeTab && vaultPath && (
            isImage ? (
              <ImageViewer key={`img-${pane.activeTab}`} filePath={pane.activeTab} />
            ) : isMarkdown && mdPreview ? (
              <MdPreview key={`preview-${pane.activeTab}`} filePath={pane.activeTab} />
            ) : (
              <IdeEditor key={pane.activeTab} filePath={pane.activeTab} vaultPath={vaultPath} />
            )
          )}
        </div>

        {/* Drop zone overlay */}
        {dropZone && dropZone !== 'center' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 20,
          }}>
            <div style={{
              position: 'absolute',
              backgroundColor: 'rgba(82, 139, 255, 0.12)',
              border: '2px solid rgba(82, 139, 255, 0.4)',
              borderRadius: 4,
              transition: 'all 100ms ease',
              ...(dropZone === 'left' ? { left: 0, top: 0, bottom: 0, width: '50%' } :
                dropZone === 'right' ? { right: 0, top: 0, bottom: 0, width: '50%' } :
                dropZone === 'top' ? { left: 0, right: 0, top: 0, height: '50%' } :
                { left: 0, right: 0, bottom: 0, height: '50%' }),
            }} />
          </div>
        )}
        {dropZone === 'center' && (
          <div style={{
            position: 'absolute',
            inset: 4,
            border: '2px solid rgba(82, 139, 255, 0.3)',
            borderRadius: 4,
            pointerEvents: 'none',
            zIndex: 20,
          }} />
        )}
      </div>
    </div>
  )
}
