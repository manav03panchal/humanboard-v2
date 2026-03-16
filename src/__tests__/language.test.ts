import { describe, it, expect } from 'vitest'
import { getLanguageName, getLanguageExtension } from '../lib/language'

describe('getLanguageName', () => {
  it('returns typescript for .ts files', () => {
    expect(getLanguageName('src/main.ts')).toBe('typescript')
  })

  it('returns tsx for .tsx files', () => {
    expect(getLanguageName('App.tsx')).toBe('tsx')
  })

  it('returns javascript for .js files', () => {
    expect(getLanguageName('index.js')).toBe('javascript')
  })

  it('returns jsx for .jsx files', () => {
    expect(getLanguageName('Component.jsx')).toBe('jsx')
  })

  it('returns rust for .rs files', () => {
    expect(getLanguageName('main.rs')).toBe('rust')
  })

  it('returns python for .py files', () => {
    expect(getLanguageName('script.py')).toBe('python')
  })

  it('returns css for .css files', () => {
    expect(getLanguageName('styles.css')).toBe('css')
  })

  it('returns html for .html files', () => {
    expect(getLanguageName('index.html')).toBe('html')
  })

  it('returns json for .json files', () => {
    expect(getLanguageName('package.json')).toBe('json')
  })

  it('returns markdown for .md files', () => {
    expect(getLanguageName('README.md')).toBe('markdown')
  })

  it('returns plaintext for unknown extensions', () => {
    expect(getLanguageName('file.xyz')).toBe('plaintext')
  })

  it('returns plaintext for files with no extension', () => {
    expect(getLanguageName('Makefile')).toBe('plaintext')
  })

  it('handles deeply nested paths', () => {
    expect(getLanguageName('src/components/deep/file.tsx')).toBe('tsx')
  })

  it('is case-insensitive for extensions', () => {
    expect(getLanguageName('FILE.TS')).toBe('typescript')
    expect(getLanguageName('file.Py')).toBe('python')
  })
})

describe('getLanguageExtension', () => {
  it('returns a non-null extension for known languages', () => {
    expect(getLanguageExtension('file.ts')).not.toBeNull()
    expect(getLanguageExtension('file.tsx')).not.toBeNull()
    expect(getLanguageExtension('file.js')).not.toBeNull()
    expect(getLanguageExtension('file.rs')).not.toBeNull()
    expect(getLanguageExtension('file.py')).not.toBeNull()
    expect(getLanguageExtension('file.css')).not.toBeNull()
    expect(getLanguageExtension('file.html')).not.toBeNull()
    expect(getLanguageExtension('file.json')).not.toBeNull()
    expect(getLanguageExtension('file.md')).not.toBeNull()
  })

  it('returns null for unknown extensions', () => {
    expect(getLanguageExtension('file.xyz')).toBeNull()
    expect(getLanguageExtension('file.toml')).toBeNull()
  })

  it('returns null for files with no extension', () => {
    expect(getLanguageExtension('Makefile')).toBeNull()
  })
})
