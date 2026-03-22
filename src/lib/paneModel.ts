// ─── Pane tree model ───

export type PaneId = string
let paneCounter = 0
export function nextPaneId(): PaneId { return `pane-${++paneCounter}` }

export interface LeafPane {
  type: 'leaf'
  id: PaneId
  tabs: string[]
  activeTab: string
}

export interface SplitPane {
  type: 'split'
  id: PaneId
  direction: 'horizontal' | 'vertical'
  children: PaneNode[]
  sizes: number[] // percentages
}

export type PaneNode = LeafPane | SplitPane

export function createLeaf(tabs: string[], activeTab?: string): LeafPane {
  return { type: 'leaf', id: nextPaneId(), tabs, activeTab: activeTab ?? tabs[0] ?? '' }
}

// ─── Pane tree operations ───

export function findLeaf(node: PaneNode, id: PaneId): LeafPane | null {
  if (node.type === 'leaf') return node.id === id ? node : null
  for (const child of node.children) {
    const found = findLeaf(child, id)
    if (found) return found
  }
  return null
}

export function findLeafWithTab(node: PaneNode, filePath: string): LeafPane | null {
  if (node.type === 'leaf') return node.tabs.includes(filePath) ? node : null
  for (const child of node.children) {
    const found = findLeafWithTab(child, filePath)
    if (found) return found
  }
  return null
}

export function updateLeaf(node: PaneNode, id: PaneId, updater: (leaf: LeafPane) => LeafPane): PaneNode {
  if (node.type === 'leaf') return node.id === id ? updater(node) : node
  return {
    ...node,
    children: node.children.map((c) => updateLeaf(c, id, updater)),
  }
}

export function removeTab(node: PaneNode, paneId: PaneId, filePath: string): PaneNode | null {
  if (node.type === 'leaf') {
    if (node.id !== paneId) return node
    const tabs = node.tabs.filter((t) => t !== filePath)
    if (tabs.length === 0) return null
    const activeTab = node.activeTab === filePath
      ? tabs[Math.min(node.tabs.indexOf(filePath), tabs.length - 1)]
      : node.activeTab
    return { ...node, tabs, activeTab }
  }
  const children = node.children.map((c) => removeTab(c, paneId, filePath)).filter(Boolean) as PaneNode[]
  if (children.length === 0) return null
  if (children.length === 1) return children[0]
  // Redistribute sizes if a child was removed
  if (children.length !== node.children.length) {
    const total = children.length
    return { ...node, children, sizes: children.map(() => 100 / total) }
  }
  return { ...node, children }
}

export function splitLeaf(
  node: PaneNode,
  paneId: PaneId,
  direction: 'horizontal' | 'vertical',
  newTab: string,
  position: 'before' | 'after',
): PaneNode {
  if (node.type === 'leaf') {
    if (node.id !== paneId) return node
    const newLeaf = createLeaf([newTab], newTab)
    const children = position === 'before' ? [newLeaf, node] : [node, newLeaf]
    return { type: 'split', id: nextPaneId(), direction, children, sizes: [50, 50] }
  }
  return { ...node, children: node.children.map((c) => splitLeaf(c, paneId, direction, newTab, position)) }
}

export function moveTabBetweenPanes(
  node: PaneNode,
  fromPaneId: PaneId,
  toPaneId: PaneId,
  filePath: string,
  insertIndex?: number,
): PaneNode {
  // Add to target first (so the target pane exists even if tree collapses)
  let result = updateLeaf(node, toPaneId, (leaf) => {
    if (leaf.tabs.includes(filePath)) return { ...leaf, activeTab: filePath }
    const tabs = [...leaf.tabs]
    const idx = insertIndex != null ? insertIndex : tabs.length
    tabs.splice(idx, 0, filePath)
    return { ...leaf, tabs, activeTab: filePath }
  })
  // Then remove from source
  const removed = removeTab(result, fromPaneId, filePath)
  return removed ?? result
}

// ─── Drop zones ───

export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center'

// ─── Pane handler types ───

export interface PaneHandlers {
  onCloseTab: (paneId: PaneId, filePath: string) => void
  onActivateTab: (paneId: PaneId, filePath: string) => void
  onReorderTabs: (paneId: PaneId, tabs: string[]) => void
  onDropOnPane: (targetPaneId: PaneId, zone: DropZone, filePath: string, sourcePaneId: PaneId) => void
  onResizePanes: (splitId: PaneId, sizes: number[]) => void
  previewFiles: Set<string>
  onTogglePreview: (filePath: string) => void
}
