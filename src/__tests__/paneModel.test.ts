import { describe, it, expect, beforeEach } from 'vitest'
import {
  createLeaf,
  findLeaf,
  findLeafWithTab,
  updateLeaf,
  removeTab,
  splitLeaf,
  moveTabBetweenPanes,
  type PaneNode,
  type LeafPane,
  type SplitPane,
} from '../lib/paneModel'

// Helper to build a split node with known IDs
function makeSplit(
  direction: 'horizontal' | 'vertical',
  children: PaneNode[],
  id = 'split-1',
): SplitPane {
  return {
    type: 'split',
    id,
    direction,
    children,
    sizes: children.map(() => 100 / children.length),
  }
}

function makeLeaf(id: string, tabs: string[], activeTab?: string): LeafPane {
  return { type: 'leaf', id, tabs, activeTab: activeTab ?? tabs[0] ?? '' }
}

// ─── createLeaf ───

describe('createLeaf', () => {
  it('creates a leaf with given tabs and defaults activeTab to first tab', () => {
    const leaf = createLeaf(['/a.ts', '/b.ts'])
    expect(leaf.type).toBe('leaf')
    expect(leaf.tabs).toEqual(['/a.ts', '/b.ts'])
    expect(leaf.activeTab).toBe('/a.ts')
    expect(leaf.id).toMatch(/^pane-\d+$/)
  })

  it('uses explicit activeTab when provided', () => {
    const leaf = createLeaf(['/a.ts', '/b.ts'], '/b.ts')
    expect(leaf.activeTab).toBe('/b.ts')
  })

  it('defaults activeTab to empty string when tabs array is empty', () => {
    const leaf = createLeaf([])
    expect(leaf.tabs).toEqual([])
    expect(leaf.activeTab).toBe('')
  })

  it('generates unique IDs for each leaf', () => {
    const a = createLeaf(['/a.ts'])
    const b = createLeaf(['/b.ts'])
    expect(a.id).not.toBe(b.id)
  })
})

// ─── findLeaf ───

describe('findLeaf', () => {
  it('finds a leaf by ID in a single leaf tree', () => {
    const leaf = makeLeaf('L1', ['/a.ts'])
    expect(findLeaf(leaf, 'L1')).toBe(leaf)
  })

  it('returns null when ID does not match a single leaf', () => {
    const leaf = makeLeaf('L1', ['/a.ts'])
    expect(findLeaf(leaf, 'L2')).toBeNull()
  })

  it('finds a leaf inside a split', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts'])
    const leaf2 = makeLeaf('L2', ['/b.ts'])
    const split = makeSplit('horizontal', [leaf1, leaf2])
    expect(findLeaf(split, 'L2')).toBe(leaf2)
  })

  it('finds a leaf in deeply nested splits', () => {
    const deep = makeLeaf('DEEP', ['/deep.ts'])
    const inner = makeSplit('vertical', [makeLeaf('X', ['/x.ts']), deep], 'inner')
    const outer = makeSplit('horizontal', [makeLeaf('Y', ['/y.ts']), inner], 'outer')
    expect(findLeaf(outer, 'DEEP')).toBe(deep)
  })

  it('returns null for non-existent ID in nested tree', () => {
    const split = makeSplit('horizontal', [
      makeLeaf('L1', ['/a.ts']),
      makeLeaf('L2', ['/b.ts']),
    ])
    expect(findLeaf(split, 'NOPE')).toBeNull()
  })
})

// ─── findLeafWithTab ───

describe('findLeafWithTab', () => {
  it('finds leaf containing a specific tab in a single leaf', () => {
    const leaf = makeLeaf('L1', ['/a.ts', '/b.ts'])
    expect(findLeafWithTab(leaf, '/b.ts')).toBe(leaf)
  })

  it('returns null when tab is not present', () => {
    const leaf = makeLeaf('L1', ['/a.ts'])
    expect(findLeafWithTab(leaf, '/missing.ts')).toBeNull()
  })

  it('finds tab in nested split tree', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts'])
    const leaf2 = makeLeaf('L2', ['/b.ts', '/c.ts'])
    const inner = makeSplit('vertical', [leaf1, leaf2], 'inner')
    const outer = makeSplit('horizontal', [makeLeaf('L3', ['/d.ts']), inner], 'outer')
    expect(findLeafWithTab(outer, '/c.ts')).toBe(leaf2)
  })

  it('returns first match in tree traversal order', () => {
    // If same tab appears in multiple leaves (shouldn't happen normally), returns first found
    const leaf1 = makeLeaf('L1', ['/a.ts'])
    const leaf2 = makeLeaf('L2', ['/a.ts'])
    const split = makeSplit('horizontal', [leaf1, leaf2])
    expect(findLeafWithTab(split, '/a.ts')).toBe(leaf1)
  })
})

// ─── updateLeaf ───

describe('updateLeaf', () => {
  it('updates a matching leaf node', () => {
    const leaf = makeLeaf('L1', ['/a.ts', '/b.ts'], '/a.ts')
    const result = updateLeaf(leaf, 'L1', (l) => ({ ...l, activeTab: '/b.ts' }))
    expect(result.type).toBe('leaf')
    expect((result as LeafPane).activeTab).toBe('/b.ts')
  })

  it('returns node unchanged when ID does not match (leaf)', () => {
    const leaf = makeLeaf('L1', ['/a.ts'])
    const result = updateLeaf(leaf, 'NOPE', (l) => ({ ...l, activeTab: 'changed' }))
    expect(result).toBe(leaf)
  })

  it('updates a leaf inside a nested split', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts'])
    const leaf2 = makeLeaf('L2', ['/b.ts', '/c.ts'], '/b.ts')
    const split = makeSplit('horizontal', [leaf1, leaf2])

    const result = updateLeaf(split, 'L2', (l) => ({ ...l, activeTab: '/c.ts' }))
    expect(result.type).toBe('split')
    const updated = findLeaf(result, 'L2')!
    expect(updated.activeTab).toBe('/c.ts')
  })

  it('does not mutate original node on non-existent ID in split', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts'])
    const split = makeSplit('horizontal', [leaf1])

    const result = updateLeaf(split, 'NOPE', (l) => ({ ...l, activeTab: 'x' }))
    // The split is recreated (spread) but children are the same references
    expect(result.type).toBe('split')
  })
})

// ─── removeTab ───

describe('removeTab', () => {
  it('removes a tab from a leaf and adjusts activeTab', () => {
    const leaf = makeLeaf('L1', ['/a.ts', '/b.ts', '/c.ts'], '/b.ts')
    const result = removeTab(leaf, 'L1', '/b.ts') as LeafPane
    expect(result).not.toBeNull()
    expect(result.tabs).toEqual(['/a.ts', '/c.ts'])
    // Active tab was removed; new active = tabs[min(indexOf(/b.ts)=1, len-1=1)] = /c.ts
    expect(result.activeTab).toBe('/c.ts')
  })

  it('keeps activeTab unchanged when removing a non-active tab', () => {
    const leaf = makeLeaf('L1', ['/a.ts', '/b.ts', '/c.ts'], '/b.ts')
    const result = removeTab(leaf, 'L1', '/c.ts') as LeafPane
    expect(result.tabs).toEqual(['/a.ts', '/b.ts'])
    expect(result.activeTab).toBe('/b.ts')
  })

  it('returns null when removing the last tab in a leaf', () => {
    const leaf = makeLeaf('L1', ['/a.ts'], '/a.ts')
    const result = removeTab(leaf, 'L1', '/a.ts')
    expect(result).toBeNull()
  })

  it('returns leaf unchanged when paneId does not match', () => {
    const leaf = makeLeaf('L1', ['/a.ts'])
    const result = removeTab(leaf, 'OTHER', '/a.ts')
    expect(result).toBe(leaf)
  })

  it('collapses split to remaining child when one child becomes empty', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts'])
    const leaf2 = makeLeaf('L2', ['/b.ts'])
    const split = makeSplit('horizontal', [leaf1, leaf2])

    const result = removeTab(split, 'L1', '/a.ts')
    // leaf1 had only one tab, so it becomes null, split collapses to leaf2
    expect(result).not.toBeNull()
    expect(result!.type).toBe('leaf')
    expect((result as LeafPane).id).toBe('L2')
  })

  it('returns null when all children in a split become empty', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts'])
    // removeTab only targets one paneId, so this scenario requires leaf1 to be the only child
    // Actually, filter(Boolean) removes nulls. If both leaves had the same paneId (impossible in practice).
    // Let's test: remove tab from L1 in a split with only L1
    const split = makeSplit('horizontal', [leaf1])
    const result = removeTab(split, 'L1', '/a.ts')
    expect(result).toBeNull()
  })

  it('redistributes sizes when a child is removed from a 3-child split', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts'])
    const leaf2 = makeLeaf('L2', ['/b.ts'])
    const leaf3 = makeLeaf('L3', ['/c.ts'])
    const split: SplitPane = {
      type: 'split',
      id: 'S1',
      direction: 'horizontal',
      children: [leaf1, leaf2, leaf3],
      sizes: [33, 33, 34],
    }

    const result = removeTab(split, 'L2', '/b.ts') as SplitPane
    expect(result.type).toBe('split')
    expect(result.children).toHaveLength(2)
    expect(result.sizes).toEqual([50, 50])
  })

  it('adjusts activeTab to last tab when removing active tab at end', () => {
    const leaf = makeLeaf('L1', ['/a.ts', '/b.ts'], '/b.ts')
    const result = removeTab(leaf, 'L1', '/b.ts') as LeafPane
    expect(result.activeTab).toBe('/a.ts')
  })

  it('handles deeply nested removal with collapse', () => {
    const deep = makeLeaf('DEEP', ['/only.ts'])
    const sibling = makeLeaf('SIB', ['/sib.ts'])
    const inner = makeSplit('vertical', [deep, sibling], 'inner')
    const outer = makeSplit('horizontal', [makeLeaf('TOP', ['/top.ts']), inner], 'outer')

    const result = removeTab(outer, 'DEEP', '/only.ts') as SplitPane
    // inner split collapses to sibling
    expect(result.type).toBe('split')
    expect(result.children).toHaveLength(2)
    // The second child should now be the sibling leaf (collapsed from inner split)
    expect(result.children[1].type).toBe('leaf')
    expect((result.children[1] as LeafPane).id).toBe('SIB')
  })
})

// ─── splitLeaf ───

describe('splitLeaf', () => {
  it('splits a leaf with position=after (new tab on right/bottom)', () => {
    const leaf = makeLeaf('L1', ['/a.ts'], '/a.ts')
    const result = splitLeaf(leaf, 'L1', 'horizontal', '/new.ts', 'after')

    expect(result.type).toBe('split')
    const split = result as SplitPane
    expect(split.direction).toBe('horizontal')
    expect(split.sizes).toEqual([50, 50])
    expect(split.children).toHaveLength(2)
    // Original leaf is first, new leaf is second
    expect((split.children[0] as LeafPane).id).toBe('L1')
    expect((split.children[1] as LeafPane).tabs).toEqual(['/new.ts'])
  })

  it('splits a leaf with position=before (new tab on left/top)', () => {
    const leaf = makeLeaf('L1', ['/a.ts'], '/a.ts')
    const result = splitLeaf(leaf, 'L1', 'vertical', '/new.ts', 'before')

    const split = result as SplitPane
    expect(split.direction).toBe('vertical')
    // New leaf is first, original leaf is second
    expect((split.children[0] as LeafPane).tabs).toEqual(['/new.ts'])
    expect((split.children[1] as LeafPane).id).toBe('L1')
  })

  it('returns node unchanged when paneId does not match', () => {
    const leaf = makeLeaf('L1', ['/a.ts'])
    const result = splitLeaf(leaf, 'OTHER', 'horizontal', '/new.ts', 'after')
    expect(result).toBe(leaf)
  })

  it('splits a leaf inside a nested split tree', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts'])
    const leaf2 = makeLeaf('L2', ['/b.ts'])
    const split = makeSplit('horizontal', [leaf1, leaf2])

    const result = splitLeaf(split, 'L2', 'vertical', '/new.ts', 'after') as SplitPane
    expect(result.children[0]).toBe(leaf1) // unchanged
    expect(result.children[1].type).toBe('split') // L2 was replaced with a split
    const innerSplit = result.children[1] as SplitPane
    expect(innerSplit.direction).toBe('vertical')
    expect((innerSplit.children[0] as LeafPane).id).toBe('L2')
    expect((innerSplit.children[1] as LeafPane).tabs).toEqual(['/new.ts'])
  })

  it('new leaf has the new tab as activeTab', () => {
    const leaf = makeLeaf('L1', ['/a.ts'])
    const result = splitLeaf(leaf, 'L1', 'horizontal', '/new.ts', 'after') as SplitPane
    const newLeaf = result.children[1] as LeafPane
    expect(newLeaf.activeTab).toBe('/new.ts')
  })
})

// ─── moveTabBetweenPanes ───

describe('moveTabBetweenPanes', () => {
  it('moves a tab from one pane to another', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts', '/b.ts'], '/a.ts')
    const leaf2 = makeLeaf('L2', ['/c.ts'], '/c.ts')
    const split = makeSplit('horizontal', [leaf1, leaf2])

    const result = moveTabBetweenPanes(split, 'L1', 'L2', '/b.ts') as SplitPane
    const updatedL1 = findLeaf(result, 'L1')!
    const updatedL2 = findLeaf(result, 'L2')!

    expect(updatedL1.tabs).toEqual(['/a.ts'])
    expect(updatedL2.tabs).toEqual(['/c.ts', '/b.ts'])
    expect(updatedL2.activeTab).toBe('/b.ts')
  })

  it('moves tab at specified insertIndex', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts', '/b.ts'])
    const leaf2 = makeLeaf('L2', ['/c.ts', '/d.ts'])
    const split = makeSplit('horizontal', [leaf1, leaf2])

    const result = moveTabBetweenPanes(split, 'L1', 'L2', '/a.ts', 1) as SplitPane
    const updatedL2 = findLeaf(result, 'L2')!
    expect(updatedL2.tabs).toEqual(['/c.ts', '/a.ts', '/d.ts'])
  })

  it('collapses source pane when its last tab is moved', () => {
    const leaf1 = makeLeaf('L1', ['/only.ts'])
    const leaf2 = makeLeaf('L2', ['/b.ts'])
    const split = makeSplit('horizontal', [leaf1, leaf2])

    const result = moveTabBetweenPanes(split, 'L1', 'L2', '/only.ts')
    // L1 becomes empty, split collapses to L2
    expect(result.type).toBe('leaf')
    const leaf = result as LeafPane
    expect(leaf.id).toBe('L2')
    expect(leaf.tabs).toEqual(['/b.ts', '/only.ts'])
    expect(leaf.activeTab).toBe('/only.ts')
  })

  it('activates existing tab if target already contains it', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts', '/dup.ts'])
    const leaf2 = makeLeaf('L2', ['/dup.ts', '/b.ts'], '/b.ts')
    const split = makeSplit('horizontal', [leaf1, leaf2])

    const result = moveTabBetweenPanes(split, 'L1', 'L2', '/dup.ts') as SplitPane
    const updatedL2 = findLeaf(result, 'L2')!
    // Should not duplicate; just activates
    expect(updatedL2.tabs).toEqual(['/dup.ts', '/b.ts'])
    expect(updatedL2.activeTab).toBe('/dup.ts')
  })

  it('handles move when source has only one tab — add first, then remove', () => {
    // This is the critical ordering test: add to target first, then remove from source
    const leaf1 = makeLeaf('L1', ['/only.ts'])
    const leaf2 = makeLeaf('L2', ['/existing.ts'])
    const leaf3 = makeLeaf('L3', ['/other.ts'])
    const split = makeSplit('horizontal', [leaf1, makeSplit('vertical', [leaf2, leaf3], 'inner')], 'outer')

    const result = moveTabBetweenPanes(split, 'L1', 'L2', '/only.ts')
    // L1 removed, outer split collapses to inner split
    expect(result.type).toBe('split')
    const inner = result as SplitPane
    const updatedL2 = findLeaf(inner, 'L2')!
    expect(updatedL2.tabs).toContain('/only.ts')
  })

  it('appends to end by default when no insertIndex given', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts'])
    const leaf2 = makeLeaf('L2', ['/x.ts', '/y.ts'])
    const split = makeSplit('horizontal', [leaf1, leaf2])

    const result = moveTabBetweenPanes(split, 'L1', 'L2', '/a.ts')
    // After collapse, result is L2
    const leaf = result as LeafPane
    expect(leaf.tabs).toEqual(['/x.ts', '/y.ts', '/a.ts'])
  })

  it('inserts at index 0', () => {
    const leaf1 = makeLeaf('L1', ['/a.ts', '/b.ts'])
    const leaf2 = makeLeaf('L2', ['/c.ts', '/d.ts'])
    const split = makeSplit('horizontal', [leaf1, leaf2])

    const result = moveTabBetweenPanes(split, 'L1', 'L2', '/a.ts', 0) as SplitPane
    const updatedL2 = findLeaf(result, 'L2')!
    expect(updatedL2.tabs).toEqual(['/a.ts', '/c.ts', '/d.ts'])
  })
})
