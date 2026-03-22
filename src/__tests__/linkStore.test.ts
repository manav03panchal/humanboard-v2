import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

let useLinkStore: typeof import('../stores/linkStore').useLinkStore

describe('linkStore', () => {
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    const mod = await import('../stores/linkStore')
    useLinkStore = mod.useLinkStore
  })

  describe('parseWikilinks (via scanFile)', () => {
    const allFiles = ['world.md']

    it('parses single wikilink', () => {
      useLinkStore.getState().scanFile('test.md', 'Hello [[world]]', allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')).toEqual(new Set(['world.md']))
    })

    it('parses multiple wikilinks', () => {
      const allFiles = ['foo.md', 'bar.md']
      useLinkStore.getState().scanFile('test.md', '[[foo]] and [[bar]]', allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')).toEqual(new Set(['foo.md', 'bar.md']))
    })

    it('returns empty set for no wikilinks', () => {
      useLinkStore.getState().scanFile('test.md', 'no links here', allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')!.size).toBe(0)
    })

    it('trims whitespace in wikilink names', () => {
      useLinkStore.getState().scanFile('test.md', '[[ world ]]', allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')).toEqual(new Set(['world.md']))
    })

    it('does not match incomplete brackets', () => {
      useLinkStore.getState().scanFile('test.md', '[[incomplete', allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')!.size).toBe(0)
    })

    it('handles wikilinks in multiline content', () => {
      const allFiles = ['note-a.md', 'note-b.md', 'note-c.md']
      const content = `# Title
Some text with [[note-a]]
More text
- [[note-b]]
- [[note-c]]`
      useLinkStore.getState().scanFile('test.md', content, allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')).toEqual(new Set(['note-a.md', 'note-b.md', 'note-c.md']))
    })
  })

  describe('resolveWikilink (via scanFile)', () => {
    it('resolves exact filename match', () => {
      const allFiles = ['notes/hello.md']
      useLinkStore.getState().scanFile('test.md', '[[hello]]', allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')).toEqual(new Set(['notes/hello.md']))
    })

    it('resolves case-insensitively', () => {
      const allFiles = ['notes/hello.md']
      useLinkStore.getState().scanFile('test.md', '[[Hello]]', allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')).toEqual(new Set(['notes/hello.md']))
    })

    it('resolves nested files by filename', () => {
      const allFiles = ['deep/path/MyNote.md']
      useLinkStore.getState().scanFile('test.md', '[[MyNote]]', allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')).toEqual(new Set(['deep/path/MyNote.md']))
    })

    it('resolves case-insensitive nested files', () => {
      const allFiles = ['deep/path/MyNote.md']
      useLinkStore.getState().scanFile('test.md', '[[mynote]]', allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')).toEqual(new Set(['deep/path/MyNote.md']))
    })

    it('returns empty set for unresolvable links', () => {
      const allFiles = ['notes/hello.md']
      useLinkStore.getState().scanFile('test.md', '[[nonexistent]]', allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')!.size).toBe(0)
    })

    it('handles root-level files', () => {
      const allFiles = ['readme.md', 'notes/foo.md']
      useLinkStore.getState().scanFile('test.md', '[[readme]]', allFiles)
      const { links } = useLinkStore.getState()
      expect(links.get('test.md')).toEqual(new Set(['readme.md']))
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
