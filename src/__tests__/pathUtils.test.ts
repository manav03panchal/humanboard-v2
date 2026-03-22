import { describe, it, expect } from 'vitest'
import { getRelativePath } from '../lib/pathUtils'

describe('getRelativePath', () => {
  it('returns the path as-is (identity function)', () => {
    expect(getRelativePath('src/main.tsx')).toBe('src/main.tsx')
  })

  it('returns empty string for empty input', () => {
    expect(getRelativePath('')).toBe('')
  })
})
