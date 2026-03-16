import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

let useLinkStore: typeof import('../stores/linkStore').useLinkStore
let parseWikilinks: typeof import('../stores/linkStore').parseWikilinks
let resolveWikilink: typeof import('../stores/linkStore').resolveWikilink

describe('linkStore', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const mod = await import('../stores/linkStore')
    useLinkStore = mod.useLinkStore
    parseWikilinks = mod.parseWikilinks
    resolveWikilink = mod.resolveWikilink
  })

  describe('parseWikilinks', () => {
    it('parses single wikilink', () => {
      expect(parseWikilinks('Hello [[world]]')).toEqual(['world'])
    })

    it('parses multiple wikilinks', () => {
      expect(parseWikilinks('[[foo]] and [[bar]]')).toEqual(['foo', 'bar'])
    })

    it('returns empty array for no wikilinks', () => {
      expect(parseWikilinks('no links here')).toEqual([])
    })

    it('trims whitespace in wikilink names', () => {
      expect(parseWikilinks('[[ hello ]]')).toEqual(['hello'])
    })

    it('handles wikilinks with special characters', () => {
      expect(parseWikilinks('[[my-note]]')).toEqual(['my-note'])
      expect(parseWikilinks('[[my note]]')).toEqual(['my note'])
    })

    it('does not match incomplete brackets', () => {
      expect(parseWikilinks('[[incomplete')).toEqual([])
      expect(parseWikilinks('incomplete]]')).toEqual([])
    })

    it('handles wikilinks in multiline content', () => {
      const content = `# Title
Some text with [[note-a]]
More text
- [[note-b]]
- [[note-c]]`
      expect(parseWikilinks(content)).toEqual(['note-a', 'note-b', 'note-c'])
    })
  })

  describe('resolveWikilink', () => {
    const allFiles = [
      'notes/hello.md',
      'notes/world.md',
      'deep/path/MyNote.md',
    ]

    it('resolves exact filename match', () => {
      expect(resolveWikilink('hello', allFiles)).toBe('notes/hello.md')
    })

    it('resolves case-insensitively', () => {
      expect(resolveWikilink('Hello', allFiles)).toBe('notes/hello.md')
      expect(resolveWikilink('WORLD', allFiles)).toBe('notes/world.md')
    })

    it('resolves nested files by filename', () => {
      expect(resolveWikilink('MyNote', allFiles)).toBe('deep/path/MyNote.md')
    })

    it('resolves case-insensitive nested files', () => {
      expect(resolveWikilink('mynote', allFiles)).toBe('deep/path/MyNote.md')
    })

    it('returns null for unresolvable links', () => {
      expect(resolveWikilink('nonexistent', allFiles)).toBeNull()
    })

    it('handles root-level files', () => {
      const files = ['readme.md', 'notes/foo.md']
      expect(resolveWikilink('readme', files)).toBe('readme.md')
    })
  })

  describe('scanFile', () => {
    const allFiles = ['note-a.md', 'note-b.md', 'note-c.md']

    it('populates links and backlinks for a file with wikilinks', () => {
      useLinkStore
        .getState()
        .scanFile('note-a.md', 'Link to [[note-b]]', allFiles)

      const { links, backlinks } = useLinkStore.getState()
      expect(links.get('note-a.md')).toEqual(new Set(['note-b.md']))
      expect(backlinks.get('note-b.md')).toEqual(new Set(['note-a.md']))
    })

    it('handles multiple outgoing links', () => {
      useLinkStore
        .getState()
        .scanFile(
          'note-a.md',
          '[[note-b]] and [[note-c]]',
          allFiles
        )

      const { links } = useLinkStore.getState()
      expect(links.get('note-a.md')).toEqual(
        new Set(['note-b.md', 'note-c.md'])
      )
    })

    it('updates links when file content changes', () => {
      const store = useLinkStore.getState()
      store.scanFile('note-a.md', '[[note-b]]', allFiles)
      store.scanFile('note-a.md', '[[note-c]]', allFiles)

      const { links, backlinks } = useLinkStore.getState()
      expect(links.get('note-a.md')).toEqual(new Set(['note-c.md']))
      expect(backlinks.get('note-b.md')).toBeUndefined()
      expect(backlinks.get('note-c.md')).toEqual(new Set(['note-a.md']))
    })

    it('ignores non-md files', () => {
      useLinkStore
        .getState()
        .scanFile('readme.txt', '[[note-b]]', allFiles)

      const { links } = useLinkStore.getState()
      expect(links.size).toBe(0)
    })

    it('ignores self-links', () => {
      useLinkStore
        .getState()
        .scanFile('note-a.md', '[[note-a]]', allFiles)

      const { links } = useLinkStore.getState()
      expect(links.get('note-a.md')!.size).toBe(0)
    })

    it('ignores unresolvable wikilinks', () => {
      useLinkStore
        .getState()
        .scanFile('note-a.md', '[[nonexistent]]', allFiles)

      const { links } = useLinkStore.getState()
      expect(links.get('note-a.md')!.size).toBe(0)
    })
  })

  describe('getGraph', () => {
    const allFiles = ['note-a.md', 'note-b.md']

    it('returns correct nodes and edges', () => {
      const store = useLinkStore.getState()
      store.scanFile('note-a.md', '[[note-b]]', allFiles)
      store.scanFile('note-b.md', '[[note-a]]', allFiles)

      const graph = useLinkStore.getState().getGraph()
      expect(graph.nodes.sort()).toEqual(['note-a.md', 'note-b.md'])
      expect(graph.edges).toHaveLength(2)
      expect(graph.edges).toContainEqual(['note-a.md', 'note-b.md'])
      expect(graph.edges).toContainEqual(['note-b.md', 'note-a.md'])
    })

    it('returns empty graph when no files scanned', () => {
      const graph = useLinkStore.getState().getGraph()
      expect(graph.nodes).toEqual([])
      expect(graph.edges).toEqual([])
    })

    it('includes target-only nodes', () => {
      useLinkStore
        .getState()
        .scanFile('note-a.md', '[[note-b]]', allFiles)

      const graph = useLinkStore.getState().getGraph()
      expect(graph.nodes).toContain('note-b.md')
    })
  })

  describe('removeFile', () => {
    const allFiles = ['note-a.md', 'note-b.md', 'note-c.md']

    it('removes file from links and cleans up backlinks', () => {
      const store = useLinkStore.getState()
      store.scanFile('note-a.md', '[[note-b]]', allFiles)
      store.scanFile('note-b.md', '[[note-a]]', allFiles)

      useLinkStore.getState().removeFile('note-a.md')

      const { links, backlinks } = useLinkStore.getState()
      expect(links.has('note-a.md')).toBe(false)
      expect(backlinks.get('note-b.md')).toBeUndefined()
      // note-b's outgoing link to note-a should also be cleaned
      expect(backlinks.has('note-a.md')).toBe(false)
    })

    it('handles removing file with no links', () => {
      useLinkStore.getState().removeFile('nonexistent.md')
      // Should not throw
      expect(useLinkStore.getState().links.size).toBe(0)
    })

    it('cleans up correctly in a chain: a->b->c, remove b', () => {
      const store = useLinkStore.getState()
      store.scanFile('note-a.md', '[[note-b]]', allFiles)
      store.scanFile('note-b.md', '[[note-c]]', allFiles)

      useLinkStore.getState().removeFile('note-b.md')

      const { links, backlinks } = useLinkStore.getState()
      // note-b removed entirely
      expect(links.has('note-b.md')).toBe(false)
      expect(backlinks.has('note-b.md')).toBe(false)
      // note-a's outgoing link to note-b is cleaned up
      expect(links.get('note-a.md')).toEqual(new Set())
      // note-c no longer has note-b as backlink
      expect(backlinks.get('note-c.md')).toBeUndefined()
    })
  })

  describe('scanAllFiles', () => {
    it('scans all md files from vault', async () => {
      const { invoke } = await import('@tauri-apps/api/core')
      const mockedInvoke = vi.mocked(invoke)

      // Mock vaultStore
      vi.doMock('../stores/vaultStore', () => ({
        useVaultStore: {
          getState: () => ({
            fileTree: [
              { name: 'note-a.md', path: 'note-a.md', isDir: false, modifiedAt: 0 },
              { name: 'note-b.md', path: 'note-b.md', isDir: false, modifiedAt: 0 },
              { name: 'image.png', path: 'image.png', isDir: false, modifiedAt: 0 },
              { name: 'folder', path: 'folder', isDir: true, modifiedAt: 0 },
            ],
          }),
        },
      }))

      // Re-import to pick up the mock
      vi.resetModules()
      const linkMod = await import('../stores/linkStore')
      const store = linkMod.useLinkStore

      mockedInvoke.mockImplementation(async (cmd: string, args?: unknown) => {
        const a = args as { filePath: string }
        if (cmd === 'read_file' && a.filePath === 'note-a.md') {
          return '[[note-b]]'
        }
        if (cmd === 'read_file' && a.filePath === 'note-b.md') {
          return '[[note-a]]'
        }
        return ''
      })

      await store.getState().scanAllFiles('/vault')

      const graph = store.getState().getGraph()
      expect(graph.nodes.sort()).toEqual(['note-a.md', 'note-b.md'])
      expect(graph.edges).toHaveLength(2)
    })
  })
})
