// ─── Split pane with resizable divider ───

import { useCallback, useRef, useState } from 'react'
import type { SplitPane, PaneNode, PaneHandlers } from '../lib/paneModel'
import { LeafPaneView } from './LeafPaneView'

// Forward declaration — PaneRenderer is defined here to avoid circular deps
function PaneRendererInternal({ node, ...handlers }: PaneHandlers & { node: PaneNode }) {
  if (node.type === 'leaf') {
    return <LeafPaneView pane={node} {...handlers} />
  }
  return <SplitPaneView split={node} {...handlers} />
}

export function SplitPaneView({ split, ...handlers }: PaneHandlers & { split: SplitPane }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [draggingSizes, setDraggingSizes] = useState<number[] | null>(null)

  const isHorizontal = split.direction === 'horizontal'

  const handleDividerDrag = useCallback((index: number, e: React.PointerEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    const startPos = isHorizontal ? e.clientX : e.clientY
    const containerSize = isHorizontal ? container.offsetWidth : container.offsetHeight
    const startSizes = [...split.sizes]

    const onMove = (e: PointerEvent) => {
      const delta = ((isHorizontal ? e.clientX : e.clientY) - startPos) / containerSize * 100
      const newSizes = [...startSizes]
      newSizes[index] = Math.max(10, startSizes[index] + delta)
      newSizes[index + 1] = Math.max(10, startSizes[index + 1] - delta)
      setDraggingSizes(newSizes)
    }

    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      setDraggingSizes((current) => {
        if (current) handlers.onResizePanes(split.id, current)
        return null
      })
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [isHorizontal, split.id, split.sizes, handlers])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
      }}
    >
      {split.children.map((child, i) => {
        const sizes = draggingSizes ?? split.sizes
        return (
        <div key={child.id} style={{ display: 'contents' }}>
          <div style={{
            [isHorizontal ? 'width' : 'height']: `calc(${sizes[i]}% - ${i < split.children.length - 1 ? 1 : 0}px)`,
            [isHorizontal ? 'height' : 'width']: '100%',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <PaneRendererInternal node={child} {...handlers} />
          </div>
          {i < split.children.length - 1 && (
            <div
              onPointerDown={(e) => handleDividerDrag(i, e)}
              style={{
                [isHorizontal ? 'width' : 'height']: 1,
                [isHorizontal ? 'height' : 'width']: '100%',
                backgroundColor: 'var(--hb-border)',
                cursor: isHorizontal ? 'col-resize' : 'row-resize',
                flexShrink: 0,
                position: 'relative',
                zIndex: 10,
              }}
            >
              {/* Invisible wider hit area */}
              <div style={{
                position: 'absolute',
                [isHorizontal ? 'left' : 'top']: -3,
                [isHorizontal ? 'right' : 'bottom']: -3,
                [isHorizontal ? 'width' : 'height']: 7,
                [isHorizontal ? 'height' : 'width']: '100%',
              }} />
            </div>
          )}
        </div>
        )
      })}
    </div>
  )
}
