import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'

const WIKILINK_REGEX = /\[\[([^\]]+)\]\]/g

interface GraphData {
  nodes: string[]
  edges: [string, string][]
}

interface LinkStore {
  links: Map<string, Set<string>>
  backlinks: Map<string, Set<string>>
  graphData: GraphData

  scanFile: (filePath: string, content: string, allMdFiles: string[]) => void
  removeFile: (filePath: string) => void
  scanAllFiles: (vaultPath: string) => Promise<void>
  getGraph: () => GraphData
  clear: () => void
}

export function resolveWikilink(
  name: string,
  allMdFiles: string[]
): string | null {
  const lower = name.toLowerCase()
  const exact = allMdFiles.find(
    (f) =>
      f.toLowerCase() === `${lower}.md` ||
      f.toLowerCase().endsWith(`/${lower}.md`)
  )
  if (exact) return exact
  const byName = allMdFiles.find((f) => {
    const fname = f.split('/').pop()?.replace('.md', '').toLowerCase()
    return fname === lower
  })
  return byName ?? null
}

export function parseWikilinks(content: string): string[] {
  const matches: string[] = []
  let match
  const regex = new RegExp(WIKILINK_REGEX.source, WIKILINK_REGEX.flags)
  while ((match = regex.exec(content)) !== null) {
    matches.push(match[1].trim())
  }
  return matches
}

function buildGraphData(links: Map<string, Set<string>>): GraphData {
  const nodeSet = new Set<string>()
  const edges: [string, string][] = []
  for (const [source, targets] of links) {
    nodeSet.add(source)
    for (const target of targets) {
      nodeSet.add(target)
      edges.push([source, target])
    }
  }
  return { nodes: Array.from(nodeSet), edges }
}

export const useLinkStore = create<LinkStore>((set, get) => ({
  links: new Map(),
  backlinks: new Map(),
  graphData: { nodes: [], edges: [] },

  scanFile: (filePath, content, allMdFiles) => {
    if (!filePath.endsWith('.md')) return

    set((state) => {
      const links = new Map(state.links)
      const backlinks = new Map(state.backlinks)

      // Remove old links for this file
      const oldTargets = links.get(filePath)
      if (oldTargets) {
        for (const target of oldTargets) {
          const bl = backlinks.get(target)
          if (bl) {
            const newBl = new Set(bl)
            newBl.delete(filePath)
            if (newBl.size === 0) backlinks.delete(target)
            else backlinks.set(target, newBl)
          }
        }
      }

      // Parse new links
      const wikilinkNames = parseWikilinks(content)
      const newTargets = new Set<string>()

      for (const name of wikilinkNames) {
        const resolved = resolveWikilink(name, allMdFiles)
        if (resolved && resolved !== filePath) {
          newTargets.add(resolved)
          const existing = backlinks.get(resolved)
          const newBl = existing ? new Set(existing) : new Set<string>()
          newBl.add(filePath)
          backlinks.set(resolved, newBl)
        }
      }

      links.set(filePath, newTargets)
      return { links, backlinks, graphData: buildGraphData(links) }
    })
  },

  removeFile: (filePath) => {
    set((state) => {
      const links = new Map(state.links)
      const backlinks = new Map(state.backlinks)

      // Remove outgoing links
      const targets = links.get(filePath)
      if (targets) {
        for (const target of targets) {
          const bl = backlinks.get(target)
          if (bl) {
            const newBl = new Set(bl)
            newBl.delete(filePath)
            if (newBl.size === 0) backlinks.delete(target)
            else backlinks.set(target, newBl)
          }
        }
      }
      links.delete(filePath)

      // Remove as backlink target
      const sources = backlinks.get(filePath)
      if (sources) {
        for (const source of sources) {
          const sl = links.get(source)
          if (sl) {
            const newSl = new Set(sl)
            newSl.delete(filePath)
            links.set(source, newSl)
          }
        }
      }
      backlinks.delete(filePath)

      return { links, backlinks, graphData: buildGraphData(links) }
    })
  },

  scanAllFiles: async (vaultPath) => {
    const { useVaultStore } = await import('./vaultStore')
    const fileTree = useVaultStore.getState().fileTree
    const mdFiles = fileTree.filter((f) => !f.isDir && f.path.endsWith('.md'))
    const allMdPaths = mdFiles.map((f) => f.path)

    for (const file of mdFiles) {
      try {
        const content = await invoke<string>('read_file', {
          vaultRoot: vaultPath,
          filePath: file.path,
        })
        get().scanFile(file.path, content, allMdPaths)
      } catch {
        // Skip files that can't be read
      }
    }
  },

  getGraph: () => get().graphData,

  clear: () => {
    set({ links: new Map(), backlinks: new Map(), graphData: { nodes: [], edges: [] } })
  },
}))
