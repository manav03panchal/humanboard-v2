import type { Editor } from 'tldraw'

export function getShapeFilePath(shape: { props?: unknown }): string | undefined {
  const props = shape?.props as Record<string, unknown> | undefined
  return typeof props?.filePath === 'string' ? props.filePath : undefined
}

// Find a position that doesn't overlap existing shapes
export function findNonOverlappingPosition(editor: Editor, baseX: number, baseY: number, w: number, h: number) {
  const shapes = editor.getCurrentPageShapes()
  let x = baseX
  let y = baseY
  const PAD = 20
  let attempts = 0

  while (attempts < 50) {
    const overlaps = shapes.some((s) => {
      const bounds = editor.getShapePageBounds(s)
      if (!bounds) return false
      return !(x + w + PAD < bounds.x || x > bounds.x + bounds.w + PAD ||
               y + h + PAD < bounds.y || y > bounds.y + bounds.h + PAD)
    })
    if (!overlaps) break
    // Shift right, then down
    x += w + PAD
    if (attempts % 3 === 2) {
      x = baseX
      y += h + PAD
    }
    attempts++
  }
  return { x, y }
}
