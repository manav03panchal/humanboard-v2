import { useEffect, useState, useCallback } from 'react'
import type { Editor } from 'tldraw'
import { getFileIcon } from '../lib/fileIcons'
import { getShapeFilePath } from '../lib/canvasUtils'

interface HomingDot {
  id: string
  x: number
  y: number
  label: string
  filePath: string
}

export function ShapeHoming({ editor }: { editor: Editor | null }) {
  const [dots, setDots] = useState<HomingDot[]>([])
  const [hovered, setHovered] = useState<string | null>(null)

  const updateDots = useCallback(() => {
    if (!editor) return

    const viewport = editor.getViewportScreenBounds()
    const shapes = editor.getCurrentPageShapes()
    const result: HomingDot[] = []
    const MARGIN = 20

    for (const shape of shapes) {
      const bounds = editor.getShapePageBounds(shape.id)
      if (!bounds) continue

      // Convert shape center to screen coordinates
      const center = editor.pageToScreen({ x: bounds.midX, y: bounds.midY })

      // Check if shape is visible in viewport (with some padding)
      if (
        center.x >= -50 && center.x <= viewport.w + 50 &&
        center.y >= -50 && center.y <= viewport.h + 50
      ) continue

      // Calculate direction from viewport center to shape
      const vcx = viewport.w / 2
      const vcy = viewport.h / 2
      const dx = center.x - vcx
      const dy = center.y - vcy

      // Find intersection with viewport edge
      let edgeX: number, edgeY: number
      const absRatio = Math.abs(dx / dy)
      const vpRatio = (viewport.w / 2) / (viewport.h / 2)

      if (absRatio > vpRatio) {
        // Hits left or right edge
        edgeX = dx > 0 ? viewport.w - MARGIN : MARGIN
        edgeY = vcy + dy * ((edgeX - vcx) / dx)
      } else {
        // Hits top or bottom edge
        edgeY = dy > 0 ? viewport.h - MARGIN : MARGIN
        edgeX = vcx + dx * ((edgeY - vcy) / dy)
      }

      // Clamp to viewport with margin
      edgeX = Math.max(MARGIN, Math.min(viewport.w - MARGIN, edgeX))
      edgeY = Math.max(MARGIN + 40, Math.min(viewport.h - MARGIN - 30, edgeY)) // account for title bar + status bar

      const filePath = getShapeFilePath(shape) ?? ''
      const label = filePath ? filePath.split('/').pop() ?? shape.type : shape.type

      result.push({ id: shape.id, x: edgeX, y: edgeY, label, filePath })
    }

    setDots(result)
  }, [editor])

  useEffect(() => {
    if (!editor) return

    // Throttle updates to once per animation frame
    let rafId: number | null = null
    const scheduleUpdate = () => {
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null
          updateDots()
        })
      }
    }

    // Update on camera changes and shape changes
    const unsub = editor.store.listen(scheduleUpdate, { scope: 'session' })
    const unsub2 = editor.store.listen(scheduleUpdate, { scope: 'document' })
    updateDots()

    return () => {
      unsub()
      unsub2()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [editor, updateDots])

  if (dots.length === 0) return null

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 500 }}>
      {dots.map((dot) => {
        const isHovered = hovered === dot.id
        const Icon = dot.filePath ? getFileIcon(dot.filePath, false) : null

        return (
          <div
            key={dot.id}
            onMouseEnter={() => setHovered(dot.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => {
              if (!editor) return
              const bounds = editor.getShapePageBounds(dot.id as any)
              if (bounds) editor.zoomToBounds(bounds, { animation: { duration: 300 }, inset: 100 })
            }}
            style={{
              position: 'absolute',
              left: dot.x,
              top: dot.y,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'auto',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {/* The dot */}
            <div
              style={{
                width: isHovered ? 10 : 7,
                height: isHovered ? 10 : 7,
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.6)',
                boxShadow: isHovered
                  ? '0 0 8px rgba(255, 255, 255, 0.5)'
                  : '0 0 4px rgba(255, 255, 255, 0.2)',
                transition: 'all 150ms ease',
              }}
            />

            {/* Tooltip on hover */}
            {isHovered && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  borderRadius: 6,
                  backgroundColor: 'var(--hb-surface)',
                  border: '1px solid var(--hb-border)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  fontSize: 11,
                  fontFamily: '"JetBrains Mono", monospace',
                  color: 'var(--hb-fg)',
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {Icon && <Icon size={12} />}
                <span>{dot.label}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
