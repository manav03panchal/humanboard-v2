import { describe, it, expect } from 'vitest'
import { getFileName, getRelativePath, getFileExtension } from '../lib/pathUtils'

describe('getFileName', () => {
  it('extracts filename from a path', () => {
    expect(getFileName('src/components/App.tsx')).toBe('App.tsx')
  })

  it('returns the input when there is no slash', () => {
    expect(getFileName('App.tsx')).toBe('App.tsx')
  })

  it('handles deeply nested paths', () => {
    expect(getFileName('a/b/c/d/file.rs')).toBe('file.rs')
  })

  it('returns the string itself for empty input', () => {
    expect(getFileName('')).toBe('')
  })
})

describe('getRelativePath', () => {
  it('returns the path as-is (identity function)', () => {
    expect(getRelativePath('src/main.tsx')).toBe('src/main.tsx')
  })

  it('returns empty string for empty input', () => {
    expect(getRelativePath('')).toBe('')
  })
})

describe('getFileExtension', () => {
  it('returns the file extension in lowercase', () => {
    expect(getFileExtension('file.ts')).toBe('ts')
    expect(getFileExtension('file.TSX')).toBe('tsx')
  })

  it('returns the last extension for multiple dots', () => {
    expect(getFileExtension('file.test.ts')).toBe('ts')
  })

  it('returns empty string for files with no extension', () => {
    expect(getFileExtension('Makefile')).toBe('makefile')
  })

  it('handles paths with directories', () => {
    expect(getFileExtension('src/lib/theme.ts')).toBe('ts')
  })
})
