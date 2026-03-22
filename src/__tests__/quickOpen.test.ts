import { describe, it, expect } from 'vitest'
import { fuzzyMatch } from '../lib/fuzzyMatch'

describe('fuzzyMatch', () => {
  it('matches exact string', () => {
    const r = fuzzyMatch('foo', 'foo')
    expect(r.match).toBe(true)
    expect(r.indices).toEqual([0, 1, 2])
  })

  it('matches characters in order across string', () => {
    const r = fuzzyMatch('abc', 'aXbXc')
    expect(r.match).toBe(true)
    expect(r.indices).toEqual([0, 2, 4])
  })

  it('returns no match when characters not present', () => {
    const r = fuzzyMatch('xyz', 'abc')
    expect(r.match).toBe(false)
    expect(r.score).toBe(0)
    expect(r.indices).toEqual([])
  })

  it('returns no match when order is wrong', () => {
    const r = fuzzyMatch('ba', 'ab')
    expect(r.match).toBe(false)
  })

  it('is case-insensitive', () => {
    const r = fuzzyMatch('ABC', 'abc')
    expect(r.match).toBe(true)
  })

  it('scores consecutive matches higher', () => {
    const consecutive = fuzzyMatch('ab', 'ab')
    const separated = fuzzyMatch('ab', 'aXb')
    expect(consecutive.score).toBeGreaterThan(separated.score)
  })

  it('gives bonus for start-of-string match', () => {
    const start = fuzzyMatch('a', 'abc')
    const middle = fuzzyMatch('b', 'abc')
    expect(start.score).toBeGreaterThan(middle.score)
  })

  it('gives bonus for match after separator', () => {
    const afterSlash = fuzzyMatch('b', 'a/b')
    const middle = fuzzyMatch('b', 'axb')
    expect(afterSlash.score).toBeGreaterThan(middle.score)
  })

  it('handles empty query', () => {
    const r = fuzzyMatch('', 'anything')
    expect(r.match).toBe(true)
    expect(r.score).toBe(0)
    expect(r.indices).toEqual([])
  })

  it('handles empty target', () => {
    const r = fuzzyMatch('a', '')
    expect(r.match).toBe(false)
  })

  it('matches file paths with directory separators', () => {
    const r = fuzzyMatch('qo', 'src/components/QuickOpen.tsx')
    expect(r.match).toBe(true)
  })

  it('matches dotfile extensions', () => {
    const r = fuzzyMatch('ts', 'file.ts')
    expect(r.match).toBe(true)
    // 't' after dot gets separator bonus
    expect(r.score).toBeGreaterThan(0)
  })

  it('provides correct indices for highlighting', () => {
    const r = fuzzyMatch('ft', 'file.ts')
    expect(r.match).toBe(true)
    expect(r.indices[0]).toBe(0) // 'f' at index 0
    expect(r.indices[1]).toBe(5) // 't' at index 5
  })
})
