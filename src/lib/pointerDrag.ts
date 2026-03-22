// ─── Pointer-based drag context (replaces HTML5 drag/drop for macOS WebKit compat) ───

import type { PaneId } from './paneModel'

export interface PointerDragState {
  filePath: string
  sourcePaneId: PaneId
  startX: number
  startY: number
  dragging: boolean // true once past threshold
  ghostEl: HTMLDivElement | null
}

export let pointerDrag: PointerDragState | null = null

export function setPointerDrag(value: PointerDragState | null) {
  pointerDrag = value
}

export function getDropZoneFromPointer(x: number, y: number, el: HTMLElement): 'left' | 'right' | 'top' | 'bottom' | 'center' {
  const rect = el.getBoundingClientRect()
  const rx = (x - rect.left) / rect.width
  const ry = (y - rect.top) / rect.height
  const edge = 0.25
  if (rx < edge) return 'left'
  if (rx > 1 - edge) return 'right'
  if (ry < edge) return 'top'
  if (ry > 1 - edge) return 'bottom'
  return 'center'
}

export function createDragGhost(text: string): HTMLDivElement {
  const el = document.createElement('div')
  el.textContent = text
  Object.assign(el.style, {
    position: 'fixed',
    zIndex: '99999',
    padding: '4px 12px',
    borderRadius: '4px',
    backgroundColor: 'var(--hb-surface)',
    border: '1px solid var(--hb-border)',
    color: 'var(--hb-fg)',
    fontSize: '12px',
    fontFamily: '"JetBrains Mono", monospace',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    opacity: '0.9',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  })
  document.body.appendChild(el)
  return el
}
